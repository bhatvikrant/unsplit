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
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast("A new version of UnSplit is ready", {
      id: "sw-update",
      duration: Infinity,
      action: { label: "Update", onClick: () => void updateSW(true) },
    });
  },
  onRegisteredSW(_url, registration) {
    // An installed app can stay open for days; look for a new build hourly.
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
});

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
