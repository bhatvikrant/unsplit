import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/format";

export function Login() {
  const { signIn } = useAuthActions();
  const location = useLocation() as { state?: { from?: string } };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo size={30} />
      </Link>
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-text mb-1 text-lg font-semibold">Welcome to UnSplit</h1>
        <p className="text-text-muted mb-5 text-sm">Log in or create an account with Google.</p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            signIn("google", { redirectTo: location.state?.from ?? "/dashboard" }).catch((err) => {
              setError(errorMessage(err));
              setBusy(false);
            });
          }}
        >
          <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
            <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
            <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" />
            <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z" />
          </svg>
          {busy ? "Redirecting…" : "Continue with Google"}
        </Button>
        {error ? <p role="alert" className="text-danger mt-3 text-sm">{error}</p> : null}
      </div>
      <p className="text-text-faint mt-5 max-w-sm text-center text-xs">
        By continuing you agree to how UnSplit handles your data: see the{" "}
        <Link to="/privacy" className="underline">
          privacy page
        </Link>
        .
      </p>
    </div>
  );
}
