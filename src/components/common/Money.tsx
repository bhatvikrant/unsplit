import { cn } from "@/lib/utils";
import { useFormatMoney } from "@/lib/hooks";

type Tone = "auto" | "neutral" | "positive" | "negative" | "muted";

export function Money({
  minor,
  currency,
  tone = "neutral",
  className,
  signDisplay,
  abs,
}: {
  minor: number;
  currency: string;
  tone?: Tone;
  className?: string;
  signDisplay?: "auto" | "never" | "always" | "exceptZero";
  abs?: boolean;
}) {
  const fmt = useFormatMoney();
  const value = abs ? Math.abs(minor) : minor;
  const t: Tone = tone === "auto" ? (minor > 0 ? "positive" : minor < 0 ? "negative" : "muted") : tone;
  return (
    <span
      className={cn(
        "tnum",
        t === "positive" && "text-positive",
        t === "negative" && "text-negative",
        t === "muted" && "text-text-muted",
        className,
      )}
    >
      {fmt(value, currency, { signDisplay })}
    </span>
  );
}

/**
 * Multi-currency balance line. Positive = owed to you, negative = you owe.
 * Shows "settled up" when everything is zero.
 */
export function BalanceSummary({
  balances,
  subjectName,
  className,
  compact,
}: {
  balances: Record<string, number>;
  /** "you" (default) or a third person's name for "X owes you". */
  subjectName?: string;
  className?: string;
  compact?: boolean;
}) {
  const entries = Object.entries(balances).filter(([, v]) => v !== 0);
  if (entries.length === 0) {
    return <span className={cn("text-text-faint text-sm", className)}>settled up</span>;
  }
  const who = subjectName ?? "you";
  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5 text-sm", className)}>
      {entries.map(([currency, amount]) => (
        <span key={currency} className={cn("whitespace-nowrap", amount > 0 ? "text-positive" : "text-negative")}>
          {!compact && (
            <span className="text-text-muted">
              {amount > 0 ? (subjectName ? `${who} owes you` : "you are owed") : subjectName ? `you owe ${who}` : "you owe"}{" "}
            </span>
          )}
          <Money minor={amount} currency={currency} abs className="font-medium" />
        </span>
      ))}
    </span>
  );
}
