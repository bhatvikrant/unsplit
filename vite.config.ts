import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const icon192 = { src: "/icon-192.png", sizes: "192x192", type: "image/png" };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@convex": path.resolve(import.meta.dirname, "./convex"),
    },
  },
});
