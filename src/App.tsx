import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate, ScrollRestoration } from "react-router";
import { RowSkeleton } from "@/components/common/Misc";
import { FullPageLoader, RedirectIfAuthed, RequireAuth } from "@/components/layout/RequireAuth";
import { hasStoredSession, pageLoaders as load } from "@/pageLoaders";
// Both tiny: a chunk of their own would only add a round trip before the redirect or the message.
import { HandoffLanding } from "@/pages/Handoff";
import { NotFound } from "@/pages/NotFound";

function page<M, K extends keyof M>(loader: () => Promise<M>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}

// Signed in: start on the shell and the dashboard now, while the session is still being checked,
// instead of once RequireAuth lets them render.
if (hasStoredSession()) {
  void load.shell().catch(() => {});
  void load.dashboard().catch(() => {});
}

const AppShell = page(load.shell, "AppShell");
const Dashboard = page(load.dashboard, "Dashboard");
const AccountPage = page(load.account, "AccountPage");
const BackupSettings = page(load.account, "BackupSettings");
const NotificationSettings = page(load.account, "NotificationSettings");
const PreferencesSettings = page(load.account, "PreferencesSettings");
const ProfileSettings = page(load.account, "ProfileSettings");
const ActivityPage = page(load.activity, "ActivityPage");
const Login = page(load.auth, "Login");
// Charts pull in recharts, a third of the old bundle, for a page most visits never open.
const ChartsPage = page(load.charts, "ChartsPage");
const ExpenseDetail = page(load.expenseDetail, "ExpenseDetail");
const AllExpenses = page(load.expenses, "AllExpenses");
const RecurringExpenses = page(load.expenses, "RecurringExpenses");
const TrashPage = page(load.expenses, "TrashPage");
const FriendPage = page(load.friend, "FriendPage");
const GroupPage = page(load.group, "GroupPage");
const GroupSettings = page(load.group, "GroupSettings");
const GroupTotals = page(load.group, "GroupTotals");
const Join = page(load.join, "Join");
const Landing = page(load.landing, "Landing");
const Privacy = page(load.privacy, "Privacy");

/** Outside the shell the page is the whole screen, so the logo loader stands in for it. */
const full = (node: ReactNode) => <Suspense fallback={<FullPageLoader />}>{node}</Suspense>;
/** Inside the shell the sidebar and top bar stay put, and rows stand in for the page. */
const inShell = (node: ReactNode) => <Suspense fallback={<RowSkeleton />}>{node}</Suspense>;

export const router = createBrowserRouter([
  { path: "/", element: <RedirectIfAuthed>{full(<Landing />)}</RedirectIfAuthed> },
  { path: "/login", element: <RedirectIfAuthed>{full(<Login />)}</RedirectIfAuthed> },
  { path: "/signup", element: <Navigate to="/login" replace /> },
  { path: "/privacy", element: full(<Privacy />) },
  { path: "/join/:code", element: full(<Join />) },
  // entries sent over by UnMoney, to become one expense (src/lib/handoff.ts)
  { path: "/expenses/new", element: <HandoffLanding /> },
  {
    element: (
      <RequireAuth>
        {full(<AppShell />)}
        {/* Back to a long list lands where it was left; a new page starts at the top. */}
        <ScrollRestoration />
      </RequireAuth>
    ),
    children: [
      { path: "/dashboard", element: inShell(<Dashboard />) },
      { path: "/activity", element: inShell(<ActivityPage />) },
      { path: "/expenses", element: inShell(<AllExpenses />) },
      { path: "/expenses/recurring", element: inShell(<RecurringExpenses />) },
      { path: "/expenses/:id", element: inShell(<ExpenseDetail />) },
      { path: "/groups/:id", element: inShell(<GroupPage />) },
      { path: "/groups/:id/settings", element: inShell(<GroupSettings />) },
      { path: "/groups/:id/totals", element: inShell(<GroupTotals />) },
      { path: "/groups/:id/charts", element: inShell(<ChartsPage />) },
      { path: "/friends/:id", element: inShell(<FriendPage />) },
      { path: "/charts", element: inShell(<ChartsPage />) },
      { path: "/account", element: inShell(<AccountPage />) },
      { path: "/account/profile", element: inShell(<ProfileSettings />) },
      { path: "/account/preferences", element: inShell(<PreferencesSettings />) },
      { path: "/account/notifications", element: inShell(<NotificationSettings />) },
      { path: "/account/backup", element: inShell(<BackupSettings />) },
      { path: "/trash", element: inShell(<TrashPage />) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
