import { useConvexAuth as useTokenAuth } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
import { useOfflineStatus } from "@/offline/context";
import { Logo } from "./Logo";

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="animate-pulse">
        <Logo size={32} />
      </div>
    </div>
  );
}

/**
 * Two views of "signed in": the token stored on this device, and the server
 * having accepted it. Online we wait for the server. Offline the stored token
 * is all there is, so it decides; if it turns out to be stale, the refresh on
 * reconnect fails, the token is cleared and this redirects to login.
 */
function useAuthDecision(): "loading" | "in" | "out" {
  const token = useTokenAuth();
  const server = useConvexAuth();
  const { offline } = useOfflineStatus();
  if (server.isAuthenticated) return "in";
  if (!token.isLoading && !token.isAuthenticated) return "out";
  if (token.isAuthenticated && offline) return "in";
  return "loading";
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const state = useAuthDecision();
  if (state === "loading") return <FullPageLoader />;
  if (state === "out") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const state = useAuthDecision();
  if (state === "loading") return <FullPageLoader />;
  if (state === "in") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
