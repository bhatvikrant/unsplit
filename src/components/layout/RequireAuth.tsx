import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
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

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <>
      <AuthLoading>
        <FullPageLoader />
      </AuthLoading>
      <Unauthenticated>
        <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <FullPageLoader />
      </AuthLoading>
      <Authenticated>
        <Navigate to="/dashboard" replace />
      </Authenticated>
      <Unauthenticated>{children}</Unauthenticated>
    </>
  );
}
