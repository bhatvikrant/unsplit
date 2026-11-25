import { lazy } from "react";
import { warm } from "@/lib/lazy";

// The heavier pages are not in the app shell's chunk. Charts pulls in recharts, a third of the
// bundle, and loads on first visit; the others are fetched once the shell is idle (lib/lazy.ts).
// AppShell's Suspense boundary sits above the outlet, so a navigation keeps the current page until
// a chunk still loading is in, instead of flashing a skeleton.
export const ChartsPage = lazy(() => import("@/pages/Charts").then((m) => ({ default: m.ChartsPage })));
export const ActivityPage = lazy(warm(() => import("@/pages/ActivityPage").then((m) => ({ default: m.ActivityPage }))));
export const ExpenseDetail = lazy(warm(() => import("@/pages/ExpenseDetail").then((m) => ({ default: m.ExpenseDetail }))));
export const GroupPage = lazy(warm(() => import("@/pages/Group").then((m) => ({ default: m.GroupPage }))));
export const GroupSettings = lazy(warm(() => import("@/pages/Group").then((m) => ({ default: m.GroupSettings }))));
export const GroupTotals = lazy(warm(() => import("@/pages/Group").then((m) => ({ default: m.GroupTotals }))));
export const AccountPage = lazy(warm(() => import("@/pages/Account").then((m) => ({ default: m.AccountPage }))));
export const ProfileSettings = lazy(warm(() => import("@/pages/Account").then((m) => ({ default: m.ProfileSettings }))));
export const PreferencesSettings = lazy(warm(() => import("@/pages/Account").then((m) => ({ default: m.PreferencesSettings }))));
export const NotificationSettings = lazy(warm(() => import("@/pages/Account").then((m) => ({ default: m.NotificationSettings }))));
export const BackupSettings = lazy(warm(() => import("@/pages/Account").then((m) => ({ default: m.BackupSettings }))));
