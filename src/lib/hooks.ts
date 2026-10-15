import { useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "@convex/_generated/api";
import { formatMoney } from "@convex/lib/money";

export function useMe() {
  return useQuery(api.users.me);
}

export function useFormatMoney() {
  const me = useMe();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  void me;
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
