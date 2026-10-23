import { useQuery } from "@/lib/convex";
import { useCallback, useState } from "react";
import { api } from "@convex/_generated/api";
import { formatMoney } from "@convex/lib/money";

export function useMe() {
  return useQuery(api.users.me);
}

/** Formats money in the browser's locale. No subscriptions: every amount on screen uses this. */
export function useFormatMoney() {
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  return useCallback(
    (minor: number, currency: string, opts?: { signDisplay?: "auto" | "never" | "always" | "exceptZero" }) =>
      formatMoney(minor, currency, { locale, signDisplay: opts?.signDisplay }),
    [locale],
  );
}

export function useDefaultCurrency(): string {
  const me = useMe();
  return me?.defaultCurrency ?? "USD";
}

/**
 * The last defined value: when a query's arguments change (a new search, another month) the new
 * result is `undefined` for a moment, and showing the previous one is better than a skeleton flash.
 */
export function useLastDefined<T>(value: T | undefined): T | undefined {
  // State set during render: React re-runs this component at once, before rendering children.
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}
