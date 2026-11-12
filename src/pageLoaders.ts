/**
 * Every page is its own chunk, fetched the first time it is opened (App.tsx), so a phone on a slow
 * network gets to the landing page or the dashboard sooner. The service worker precaches every
 * chunk, so they all open offline once it is installed; until then preloadPages() fetches the
 * signed-in ones in the background (AppShell), so a page opened later, or offline, does not wait.
 */
export const pageLoaders = {
  // The signed-in frame and the page a signed-in visit lands on. index.html modulepreloads both
  // when this device has a session (vite.config.ts, lazyRoots), so they arrive with the first
  // bundle instead of a round trip after it, and a signed-out visit never downloads them.
  shell: () => import("@/components/layout/AppShell"),
  dashboard: () => import("@/pages/Dashboard"),

  account: () => import("@/pages/Account"),
  activity: () => import("@/pages/ActivityPage"),
  auth: () => import("@/pages/Auth"),
  charts: () => import("@/pages/Charts"),
  expenseDetail: () => import("@/pages/ExpenseDetail"),
  expenses: () => import("@/pages/Expenses"),
  friend: () => import("@/pages/Friend"),
  group: () => import("@/pages/Group"),
  join: () => import("@/pages/Join"),
  landing: () => import("@/pages/Landing"),
  privacy: () => import("@/pages/Privacy"),
};

/** The pages a signed-in visit can open, minus Charts: recharts is big and the page rarely opened. */
const signedInPages = [pageLoaders.account, pageLoaders.activity, pageLoaders.expenseDetail, pageLoaders.expenses, pageLoaders.friend, pageLoaders.group];

/** Fetches the signed-in pages' chunks ahead of use. Safe to call more than once: imports are cached. */
export function preloadPages() {
  for (const load of signedInPages) void load().catch(() => {});
}

/** A session is stored on this device (@convex-dev/auth keeps its refresh token in localStorage). */
export function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("__convexAuthRefreshToken"));
  } catch {
    return false;
  }
}
