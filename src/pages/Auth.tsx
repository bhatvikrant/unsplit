import { useAuthActions } from "@convex-dev/auth/react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Field } from "@/components/common/Misc";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/format";

function Shell({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo size={30} />
      </Link>
      <div className="bg-bg w-full max-w-sm rounded-lg border p-6 shadow-card">
        <h1 className="text-text mb-5 text-lg font-semibold">{title}</h1>
        {children}
      </div>
      {footer ? <div className="text-text-muted mt-5 text-sm">{footer}</div> : null}
    </div>
  );
}

function GoogleButton({ label }: { label: string }) {
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn("google", { redirectTo: "/dashboard" }).catch(() => setBusy(false));
      }}
    >
      <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
        <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" />
        <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z" />
      </svg>
      {label}
    </Button>
  );
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 border-t" />
      <span className="text-text-faint text-xs">or</span>
      <div className="h-px flex-1 border-t" />
    </div>
  );
}

export function Login() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow: "signIn" });
      navigate(location.state?.from ?? "/dashboard", { replace: true });
    } catch (err) {
      const msg = errorMessage(err);
      setError(/InvalidSecret|InvalidAccountId|Invalid/i.test(msg) ? "Wrong email or password" : msg);
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Welcome back"
      footer={
        <>
          New here? <Link to="/signup" className="text-brand font-medium">Create an account</Link>
        </>
      }
    >
      <GoogleButton label="Continue with Google" />
      <Divider />
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" error={error}>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
        <div className="text-center">
          <Link to="/forgot" className="text-text-muted hover:text-text text-sm">
            Forgot your password?
          </Link>
        </div>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const redirect = params.get("redirect") ?? "/dashboard";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, name, flow: "signUp" });
      navigate(redirect, { replace: true });
    } catch (err) {
      const msg = errorMessage(err);
      setError(/already exists|AccountExists/i.test(msg) ? "An account with this email already exists. Log in instead." : msg);
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Create your account"
      footer={
        <>
          Already have one? <Link to="/login" className="text-brand font-medium">Log in</Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />
      <Divider />
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name" htmlFor="name">
          <Input id="name" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters" error={error}>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </Button>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, flow: "reset" });
      setStep("code");
    } catch (err) {
      setError(errorMessage(err).includes("RESEND") ? "Password reset email isn't set up on this deployment yet." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, code, newPassword: password, flow: "reset-verification" });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(/Invalid|expired/i.test(errorMessage(err)) ? "That code is wrong or expired" : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Shell
      title={step === "email" ? "Reset your password" : "Check your email"}
      footer={
        <Link to="/login" className="text-brand font-medium">
          Back to log in
        </Link>
      }
    >
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <p className="text-text-muted text-sm">We'll email you an 8-digit code.</p>
          <Field label="Email" htmlFor="email" error={error}>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-3">
          <p className="text-text-muted text-sm">Enter the code we sent to {email} and choose a new password.</p>
          <Field label="Code" htmlFor="code">
            <Input id="code" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="password" error={error}>
            <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </form>
      )}
    </Shell>
  );
}
