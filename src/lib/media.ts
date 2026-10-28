import { useCallback, useSyncExternalStore } from "react";

/** Tracks a CSS media query; re-renders when it flips. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    () => false,
  );
}

/** Tailwind's `sm` breakpoint (40rem). */
const SM = "(min-width: 40rem)";

/** True below Tailwind's `sm` breakpoint: the phone layer, where popovers become sheets. */
export function usePhone(): boolean {
  return !useMediaQuery(SM);
}
