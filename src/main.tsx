import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { toast, Toaster } from "sonner";
import { registerSW } from "virtual:pwa-register";
import { ConfirmProvider } from "@/components/common/ConfirmDialog";
import { FullPageLoader } from "@/components/layout/RequireAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineProvider } from "@/offline/context";
import { OfflineStore } from "@/offline/store";
import { SyncEngine } from "@/offline/sync";
import { router } from "./App";
import "./index.css";
// Catches the browser's install event before React mounts (see useInstall).
import "@/lib/install";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Offline layer: last known data in IndexedDB, writes queued until the server takes them.
const store = new OfflineStore();
const engine = new SyncEngine(convex, store);

// App shell served by the service worker when there is no network. A new
// build is offered, not forced: the queue in IndexedDB survives the reload.
const offerUpdate = () =>
  toast("A new version of UnSplit is ready", {
    id: "sw-update",
    duration: Infinity,
    action: { label: "Update", onClick: () => void updateSW(true) },
  });

let swRegistration: ServiceWorkerRegistration | undefined;
let lastUpdateCheck = 0;

// The browser only looks for a new sw.js on a full page load, which an
// installed app never does: it is suspended in the background and resumed
// in place. So check ourselves whenever the app comes back to the front
// (and hourly while it stays there), throttled so a quick app switch does
// not refetch sw.js every time.
const checkForUpdate = () => {
  if (!swRegistration || !navigator.onLine) return;
  const now = Date.now();
  if (now - lastUpdateCheck < 60 * 1000) return;
  lastUpdateCheck = now;
  // A build found earlier but dismissed is still waiting; offer it again.
  if (swRegistration.waiting) offerUpdate();
  void swRegistration.update().catch(() => {});
};

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: offerUpdate,
  onRegisteredSW(_url, registration) {
    swRegistration = registration;
    if (!registration) return;
    // An installed app can stay open for days; look for a new build hourly.
    setInterval(checkForUpdate, 60 * 60 * 1000);
  },
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate();
});
window.addEventListener("focus", checkForUpdate);
window.addEventListener("online", checkForUpdate);

// Follow the system colour scheme. Tokens for both modes live in index.css.
const scheme = window.matchMedia("(prefers-color-scheme: dark)");
const applyScheme = () => document.documentElement.classList.toggle("dark", scheme.matches);
applyScheme();
scheme.addEventListener("change", applyScheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <OfflineProvider store={store} engine={engine} fallback={<FullPageLoader />}>
        <TooltipProvider delayDuration={300}>
          <ConfirmProvider>
            <RouterProvider router={router} />
            {/* On phones, sit above the tab bar and the home indicator. */}
            <Toaster position="bottom-center" richColors closeButton mobileOffset={{ bottom: "calc(var(--tabbar-h) + 1rem)" }} />
          </ConfirmProvider>
        </TooltipProvider>
      </OfflineProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
