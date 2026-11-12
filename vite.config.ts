import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * What the More page shows as the version: when this build was made, in Indian time, as
 * YYYY.MM.DD-HH:MM. Each deploy builds once, so it is when that deploy went out. Same scheme as UnMoney.
 */
function appVersion(at = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}.${p.month}.${p.day}-${p.hour}:${p.minute}`;
}

/**
 * First load on a slow phone network (src/pageLoaders.ts has the lazy pages). Every request there
 * costs a round trip of a second or two, so the aim is the fewest bytes in the fewest files:
 *
 * - Chunks: everything the first bundle runs is one file; everything the signed-in shell and the
 *   dashboard add on top is a second ("app"); what those share with the signed-out pages (framer-motion
 *   above all) is a third ("shared"). The other pages and the dialogs keep their own chunks.
 * - Preload: index.html gets a few lines that add a modulepreload for the chunks the visit is about
 *   to need, so they download alongside the first bundle instead of a round trip after it: the
 *   shell and the dashboard when this device holds a session, else the page for the address.
 */
const lazyRoots = {
  signedIn: ["src/components/layout/AppShell.tsx", "src/pages/Dashboard.tsx"],
  signedOut: { "/": "src/pages/Landing.tsx", "/login": "src/pages/Auth.tsx" } as Record<string, string>,
  // reachable signed out; what they share with the shell goes in "shared", not "app"
  public: ["src/pages/Landing.tsx", "src/pages/Auth.tsx", "src/pages/Join.tsx", "src/pages/Privacy.tsx"],
};

const srcFile = (file: string) => path.resolve(import.meta.dirname, file);

type ModuleGraph = { getModuleInfo(id: string): { importedIds: string[] } | null };
/** Every module `roots` import statically, themselves included. */
function staticClosure(roots: string[], graph: ModuleGraph) {
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    // radix-ui re-exports every primitive; following it would count the select, tabs and the rest
    // the dialogs use as needed by the shell. The primitives the shell does use still come along.
    if (/\/node_modules\/radix-ui\//.test(id)) return;
    for (const dep of graph.getModuleInfo(id)?.importedIds ?? []) visit(dep);
  };
  roots.forEach(visit);
  return seen;
}

let closures: { app: Set<string>; pub: Set<string> } | undefined;
/** "app" or "shared" for a module the signed-in first load needs (see above); null leaves it be. */
function appChunk(id: string, graph: ModuleGraph) {
  closures ??= { app: staticClosure(lazyRoots.signedIn.map(srcFile), graph), pub: staticClosure(lazyRoots.public.map(srcFile), graph) };
  if (!closures.app.has(id)) return null;
  return closures.pub.has(id) ? "shared" : "app";
}

function preloadFirstPage(): Plugin {
  let base = "/";
  return {
    name: "unsplit:preload-first-page",
    apply: "build",
    buildStart() {
      closures = undefined;
    },
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, { bundle }) {
        if (!bundle) return;
        const graph = (file: string, seen = new Set<string>()) => {
          const chunk = bundle[file];
          if (seen.has(file) || chunk?.type !== "chunk") return seen;
          seen.add(file);
          for (const dep of chunk.imports) graph(dep, seen);
          return seen;
        };
        const chunks = Object.values(bundle).flatMap((c) => (c.type === "chunk" ? [c] : []));
        const first = new Set(chunks.filter((c) => c.isEntry).flatMap((c) => [...graph(c.fileName)]));
        /** The files a lazy module's chunk needs beyond the first bundle. */
        const urlsFor = (files: string[]) => {
          const roots = files.map((f) => {
            const chunk = chunks.find((c) => c.moduleIds.includes(srcFile(f)));
            if (!chunk) throw new Error(`preloadFirstPage: ${f} is in no chunk`);
            return chunk;
          });
          return [...new Set(roots.flatMap((c) => [...graph(c.fileName)]))].filter((f) => !first.has(f)).map((f) => base + f);
        };
        const plan = {
          signedIn: urlsFor(lazyRoots.signedIn),
          signedOut: Object.fromEntries(Object.entries(lazyRoots.signedOut).map(([route, file]) => [route, urlsFor([file])])),
        };
        // @convex-dev/auth keeps its refresh token in localStorage (src/pageLoaders.ts, hasStoredSession)
        const script = `(function(p){var u;try{u=Object.keys(localStorage).some(function(k){return k.indexOf("__convexAuthRefreshToken")===0})?p.signedIn:p.signedOut[location.pathname]}catch(e){}(u||[]).forEach(function(h){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=h;document.head.appendChild(l)})})(${JSON.stringify(plan)})`;
        // First in <head>: an inline script after the stylesheet would wait for it to download.
        return [{ tag: "script", children: script, injectTo: "head-prepend" }];
      },
    },
  };
}

const icon192 = { src: "/icon-192.png", sizes: "192x192", type: "image/png" };

export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion()) },
  plugins: [
    react(),
    tailwindcss(),
    preloadFirstPage(),
    // Installable app: the manifest makes phones offer "Add to Home Screen",
    // the service worker precaches the shell so it opens with no network.
    // Data comes from the offline cache in src/offline; the Convex socket is
    // a different origin and is never intercepted.
    VitePWA({
      // A new build waits until the user taps "Update" in the toast
      // (src/main.tsx) instead of reloading under them mid-edit.
      registerType: "prompt",
      includeAssets: ["*.svg", "*.png"],
      manifest: {
        id: "/",
        name: "UnSplit",
        short_name: "UnSplit",
        description: "Split shared expenses with friends, flatmates and travel groups.",
        theme_color: "#f6f5f1",
        background_color: "#f6f5f1",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        start_url: "/dashboard",
        scope: "/",
        // A link into our scope from elsewhere (UnMoney's "Split on UnSplit", a group invite)
        // lands in the app window that is already open, not a second one, where the browser
        // captures links into installed apps (desktop Chrome 139+; not iOS, which opens every
        // out-of-scope link in its in-app browser).
        launch_handler: { client_mode: "navigate-existing" },
        lang: "en",
        categories: ["finance", "productivity"],
        icons: [
          icon192,
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          // Android crops these into its own shape; the mark sits in the safe zone.
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Long-press on the Android icon.
        shortcuts: [
          { name: "Add expense", url: "/dashboard?add=expense", icons: [icon192] },
          { name: "Activity", url: "/activity", icons: [icon192] },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // Receipts, avatars and covers served by Convex file storage.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/storage/"),
            handler: "CacheFirst",
            options: { cacheName: "convex-files", expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Higher priority claims a module first; each group also takes what its modules import.
            { name: "index", tags: ["$initial"], priority: 3 },
            { name: (id, ctx) => (appChunk(id, ctx) === "shared" ? "shared" : null), priority: 2 },
            { name: (id, ctx) => (appChunk(id, ctx) === "app" ? "app" : null), priority: 1 },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@convex": path.resolve(import.meta.dirname, "./convex"),
    },
  },
});
