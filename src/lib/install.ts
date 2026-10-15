import { useState, useSyncExternalStore } from "react";

/**
 * Install state for the "Add to Home Screen" flow.
 *
 * Chrome, Edge and Samsung Internet (Android and desktop) fire
 * `beforeinstallprompt` once the site qualifies as an app; we hold on to it
 * so our own Install button can open the browser's dialog. Safari on iOS has
 * no such event: the user adds the app from the Share menu, so there we show
 * the steps instead. Once the app runs from the home screen there is nothing
 * to offer.
 */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { standalone?: boolean });

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

/** Running from the home screen: Android/desktop PWA window, or iOS web app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || nav?.standalone === true;
}

/** iPhone or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(): boolean {
  if (!nav) return false;
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export type InstallState = {
  /** Already running as an installed app; nothing to offer. */
  installed: boolean;
  /** The browser will open its install dialog from `install()`. */
  canPrompt: boolean;
  /** No install API here (iOS): show the Share → Add to Home Screen steps. */
  manual: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function useInstall(): InstallState {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const installed = installedNow || isStandalone();
  return {
    installed,
    canPrompt: !installed && deferred !== null,
    manual: !installed && deferred === null && isIOS(),
    install: async () => {
      const ev = deferred;
      if (!ev) return "unavailable";
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      // The event can only be used once; a dismissed prompt comes back on the next visit.
      deferred = null;
      emit();
      return outcome;
    },
  };
}

const NUDGE_KEY = "unsplit.installNudgeDismissedAt";
const NUDGE_AGAIN_AFTER = 30 * 24 * 3600 * 1000;

/** Whether the install banner was waved away recently, and a way to wave it away. */
export function useInstallNudge(): [dismissed: boolean, dismiss: () => void] {
  const [dismissed, setDismissed] = useState(() => {
    try {
      const at = Number(localStorage.getItem(NUDGE_KEY));
      return at > 0 && Date.now() - at < NUDGE_AGAIN_AFTER;
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    try {
      localStorage.setItem(NUDGE_KEY, String(Date.now()));
    } catch {
      // Private mode: the banner just comes back next launch.
    }
    setDismissed(true);
  };
  return [dismissed, dismiss];
}
