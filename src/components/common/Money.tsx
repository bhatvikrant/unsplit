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

/**
 * Compact signed balance for list rows and the sidebar: "+$42.00" in green,
 * "−$96.00" in terracotta, "settled" when zero. `plain` drops the pill
 * background for denser lists.
 */
export function BalanceChip({ balances, className, plain }: { balances: Record<string, number>; className?: string; plain?: boolean }) {
  const entries = Object.entries(balances).filter(([, v]) => v !== 0);
  if (entries.length === 0) {
    return <span className={cn("text-text-faint text-[11.5px] font-medium", !plain && "bg-surface-2 rounded-full px-2 py-0.5", className)}>settled</span>;
  }
  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5", className)}>
      {entries.map(([currency, amount]) => (
        <span
          key={currency}
          className={cn(
            "tnum text-[12px] leading-4 font-semibold whitespace-nowrap",
            amount > 0 ? "text-positive" : "text-negative",
            !plain && "rounded-full px-2 py-0.5",
            !plain && (amount > 0 ? "bg-positive-soft" : "bg-negative-soft"),
          )}
        >
          <Money minor={amount} currency={currency} signDisplay="always" />
        </span>
      ))}
    </span>
  );
}
