import { useAuthActions } from "@convex-dev/auth/react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type Transition } from "framer-motion";
import { CloudOff, HandCoins, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { GroupAvatar, tint } from "@/components/common/Avatars";
import { Logo } from "@/components/layout/Logo";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

const points = [
  { icon: Receipt, label: "Split any bill" },
  { icon: HandCoins, label: "Settle up fast" },
  { icon: CloudOff, label: "Works offline" },
];

/** One strong ease-out for every entrance, so the pieces settle together. */
const ease: Transition = { duration: 0.6, ease: [0.23, 1, 0.32, 1] };

export function Login() {
  const { signIn } = useAuthActions();
  const location = useLocation() as { state?: { from?: string } };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const still = useReducedMotion();
  const rise = (delay: number, y = 12) => ({
    initial: still ? false : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { ...ease, delay },
  });

  function google() {
    setBusy(true);
    setError(null);
    signIn("google", { redirectTo: location.state?.from ?? "/dashboard" }).catch((err) => {
      setError(errorMessage(err));
      setBusy(false);
    });
  }

  return (
    <div className="bg-bg relative min-h-dvh overflow-hidden">
      {/* a faint wash of the app's two money colours, income green and expense terracotta, behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] opacity-70 dark:opacity-40"
        style={{
          background:
            "radial-gradient(42rem 22rem at 18% -10%, color-mix(in oklch, var(--income) 14%, transparent), transparent 70%), radial-gradient(38rem 20rem at 85% -5%, color-mix(in oklch, var(--expense) 12%, transparent), transparent 70%)",
        }}
      />

      <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <motion.div {...rise(0, 8)} className="relative z-10 mb-[12rem]">
          <Link to="/" className="focus-visible:ring-ring inline-flex rounded-lg outline-none focus-visible:ring-[3px]">
            <Logo size={34} />
          </Link>
        </motion.div>

        <div className="relative w-full max-w-sm">
          <GroupPeek delay={0.35} />

          <motion.div {...rise(0.1)} className="card shadow-pop relative p-6">
            <h1 className="text-text text-lg font-semibold tracking-tight">Welcome to UnSplit</h1>
            <p className="text-text-muted mt-1 text-sm">Sign in with Google to split bills with your groups and keep balances in step on every device.</p>

            <motion.button
              type="button"
              disabled={busy}
              onClick={google}
              whileTap={still ? undefined : { scale: 0.98 }}
              className={cn(
                "bg-surface text-text shadow-card mt-5 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-medium",
                "transition-[background-color,box-shadow] duration-150 ease-out",
                "hover:bg-surface-2 focus-visible:ring-ring outline-none focus-visible:ring-[3px]",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {busy ? (
                <span className="border-text-faint/40 border-t-text size-4 animate-spin rounded-full border-2" aria-hidden="true" />
              ) : (
                <svg className="size-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
                  <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
                  <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" />
                  <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z" />
                </svg>
              )}
              {busy ? "Opening Google…" : "Continue with Google"}
            </motion.button>
            {error ? (
              <p role="alert" className="text-danger mt-3 text-sm">
                {error}
              </p>
            ) : null}

            <ul className="mt-6 grid grid-cols-3 gap-2 border-t pt-5">
              {points.map((p, i) => (
                <motion.li key={p.label} {...rise(0.3 + i * 0.07, 6)} className="flex flex-col items-center gap-1.5 text-center">
                  <span className="bg-surface-2 text-text/80 flex size-8 items-center justify-center rounded-lg">
                    <p.icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="text-text-muted text-[11px] leading-tight">{p.label}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>

        <motion.p {...rise(0.5, 6)} className="text-text-faint mt-5 max-w-sm text-center text-xs">
          By continuing you agree to UnSplit&apos;s{" "}
          <Link to="/privacy" className="hover:text-text-muted underline underline-offset-2">
            privacy policy
          </Link>
          .
        </motion.p>
      </div>
    </div>
  );
}

/** Sample expenses that arrive one by one in the peek. Amounts in minor units; the hue tints the initial tile the way categories do. */
const SAMPLE: { title: string; payer: string; minor: number; hue: number }[] = [
  { title: "Dinner at Cervejaria", payer: "Maya", minor: 8640, hue: 20 },
  { title: "Taxi to the airport", payer: "You", minor: 3200, hue: 230 },
  { title: "Groceries", payer: "Sam", minor: 5410, hue: 40 },
  { title: "Museum tickets", payer: "Priya", minor: 4800, hue: 330 },
  { title: "Coffee and pastéis", payer: "You", minor: 1260, hue: 20 },
  { title: "Surf lessons", payer: "Maya", minor: 12000, hue: 150 },
];

const MEMBERS = 4;

const money = (minor: number) => "$" + (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A number that rolls to its new value instead of jumping. */
function Ticker({ minor, className }: { minor: number; className?: string }) {
  const still = useReducedMotion();
  const mv = useMotionValue(minor);
  const text = useTransform(mv, (v) => money(v));
  useEffect(() => {
    if (still) {
      mv.set(minor);
      return;
    }
    const c = animate(mv, minor, { duration: 0.7, ease: [0.23, 1, 0.32, 1] });
    return () => c.stop();
  }, [minor, mv, still]);
  return <motion.span className={className}>{text}</motion.span>;
}

/**
 * The top of a group screen, rising from behind the sign-in card: a glimpse of
 * the app rather than a list of features. Sample data only.
 */
function GroupPeek({ delay }: { delay: number }) {
  const still = useReducedMotion();
  // today's rows, newest first; each gets a fresh id so a repeated sample is still a new row
  const [rows, setRows] = useState(() => [{ id: 0, ...SAMPLE[0] }]);
  const [balance, setBalance] = useState({ owed: 4240, owe: 1810 + SAMPLE[0].minor / MEMBERS });

  useEffect(() => {
    if (still) return;
    let next = 1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = SAMPLE[next % SAMPLE.length];
      const id = next++;
      // keep three rows: the visible one, the one slipping behind the card, and one more so the shift reads as a list
      setRows((r) => [{ id, ...t }, ...r].slice(0, 3));
      // an equal split: paying for the group means the others owe you their shares, otherwise you owe yours
      setBalance((b) =>
        t.payer === "You" ? { owed: b.owed + (t.minor * (MEMBERS - 1)) / MEMBERS, owe: b.owe } : { owed: b.owed, owe: b.owe + t.minor / MEMBERS },
      );
      timer = setTimeout(tick, 3200);
    };
    timer = setTimeout(tick, (delay + 1.8) * 1000);
    return () => clearTimeout(timer);
  }, [still, delay]);

  return (
    <motion.div
      aria-hidden="true"
      // rises out from behind the card once the card has landed
      initial={still ? false : { opacity: 0, y: 56 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1], delay }}
      // tall enough for the group header, the balance line, today's label and its newest row, with the next row slipping under the card
      className="pointer-events-none absolute bottom-[calc(100%-3.5rem)] left-1/2 h-[264px] w-full origin-bottom overflow-hidden rounded-t-2xl select-none"
      style={{
        x: "-50%",
        scale: 0.9,
        maskImage: "linear-gradient(to bottom, transparent 0, #000 64px)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 64px)",
      }}
    >
      <div className="bg-surface ring-text/6 rounded-t-2xl text-[13px] ring-1 dark:ring-white/8">
        <div className="flex items-center gap-2.5 px-3.5 pt-5 pb-2.5">
          <GroupAvatar group={{ name: "Lisbon trip", type: "trip" }} size="sm" />
          <div className="min-w-0">
            <div className="text-text truncate text-sm font-semibold tracking-[-0.01em]">Lisbon trip</div>
            <div className="text-text-muted text-[11px]">Trip · {MEMBERS} members</div>
          </div>
        </div>
        <div className="tabular flex items-center justify-between border-y px-3.5 py-2 text-xs">
          <span className="text-text-muted">
            you are owed <Ticker minor={balance.owed} className="text-positive font-medium" />
          </span>
          <span className="text-text-muted">
            you owe <Ticker minor={balance.owe} className="text-negative font-medium" />
          </span>
        </div>
        <div className="text-text-faint px-3.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] uppercase">Today</div>
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <motion.div
                // a soft brand highlight that settles, the way a just-saved expense does
                initial={{ backgroundColor: "color-mix(in oklch, var(--brand) 10%, transparent)" }}
                animate={{ backgroundColor: "color-mix(in oklch, var(--brand) 0%, transparent)" }}
                transition={{ duration: 1.5, delay: 0.3 }}
                className="flex items-center gap-2.5 px-3.5 py-1.5"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold" style={tint(r.hue)}>
                  {r.title[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-text block truncate font-medium">{r.title}</span>
                  <span className="text-text-faint block text-[11px]">paid by {r.payer}</span>
                </span>
                <span className="text-text tabular font-medium">{money(r.minor)}</span>
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
