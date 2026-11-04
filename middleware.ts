/**
 * Vercel Routing Middleware, run only for /sw.js (see `config.matcher`).
 *
 * UnSplit moved from unsplit.vercel.app to unsplit.vikrantbhat.com. vercel.json redirects
 * every other path on the old host, but a browser that opened the app there before keeps
 * a service worker that answers navigations from its cache, so it never sees that redirect.
 * That worker can't update itself either: browsers refuse a service worker script that
 * comes back as a redirect.
 *
 * So the old host still serves /sw.js, but with a stand-in worker that clears the caches,
 * unregisters itself and sends every open tab to the same path on the new host. The app
 * looks for a new worker whenever it is opened or refocused (src/main.tsx), so this takes
 * effect on the next visit. Every other host gets the real /sw.js.
 */
import { next } from "@vercel/functions";

export const OLD_HOST = "unsplit.vercel.app";
export const NEW_ORIGIN = "https://unsplit.vikrantbhat.com";

export const config = { matcher: "/sw.js", runtime: "nodejs" };

export function retiringWorker(newOrigin: string): string {
  return `// UnSplit moved to ${newOrigin}. This worker clears the old one and sends you there.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(tabs.map((tab) => {
      const url = new URL(tab.url);
      return tab.navigate(${JSON.stringify(newOrigin)} + url.pathname + url.search + url.hash).catch(() => {});
    }));
  })());
});
`;
}

export default function middleware(request: Request): Response {
  const host = (request.headers.get("host") ?? new URL(request.url).host).split(":")[0];
  if (host !== OLD_HOST) return next();
  return new Response(retiringWorker(NEW_ORIGIN), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
