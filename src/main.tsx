import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { registerSW } from "virtual:pwa-register";
import { FullPageLoader } from "@/components/layout/RequireAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineProvider } from "@/offline/context";
import { OfflineStore } from "@/offline/store";
import { SyncEngine } from "@/offline/sync";
import { router } from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Offline layer: last known data in IndexedDB, writes queued until the server takes them.
const store = new OfflineStore();
const engine = new SyncEngine(convex, store);

// App shell served by the service worker when there is no network.
registerSW({ immediate: true });

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
          <RouterProvider router={router} />
          <Toaster position="bottom-center" richColors closeButton />
        </TooltipProvider>
      </OfflineProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
