import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, ScrollRestoration } from "react-router";
import { RowSkeleton } from "@/components/common/Misc";
import { AppShell } from "@/components/layout/AppShell";
import { RedirectIfAuthed, RequireAuth } from "@/components/layout/RequireAuth";
import { AccountPage, NotificationSettings } from "@/pages/Account";
import { ActivityPage } from "@/pages/ActivityPage";
import { Login } from "@/pages/Auth";
import { Dashboard } from "@/pages/Dashboard";
import { ExpenseDetail } from "@/pages/ExpenseDetail";
import { AllExpenses, RecurringExpenses, TrashPage } from "@/pages/Expenses";
import { FriendPage } from "@/pages/Friend";
import { GroupPage, GroupSettings, GroupTotals } from "@/pages/Group";
import { HandoffLanding } from "@/pages/Handoff";
import { Join } from "@/pages/Join";
import { Landing } from "@/pages/Landing";
import { NotFound } from "@/pages/NotFound";
import { Privacy } from "@/pages/Privacy";

// Charts pull in recharts, a third of the bundle, for a page most visits never open. It loads on
// first use; the service worker precaches the chunk, so it is still there offline.
const ChartsPage = lazy(() => import("@/pages/Charts").then((m) => ({ default: m.ChartsPage })));
const charts = (
  <Suspense fallback={<RowSkeleton />}>
    <ChartsPage />
  </Suspense>
);

export const router = createBrowserRouter([
  { path: "/", element: <RedirectIfAuthed><Landing /></RedirectIfAuthed> },
  { path: "/login", element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
  { path: "/signup", element: <Navigate to="/login" replace /> },
  { path: "/privacy", element: <Privacy /> },
  { path: "/join/:code", element: <Join /> },
  // entries sent over by UnMoney, to become one expense (src/lib/handoff.ts)
  { path: "/expenses/new", element: <HandoffLanding /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
        {/* Back to a long list lands where it was left; a new page starts at the top. */}
        <ScrollRestoration />
      </RequireAuth>
    ),
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/activity", element: <ActivityPage /> },
      { path: "/expenses", element: <AllExpenses /> },
      { path: "/expenses/recurring", element: <RecurringExpenses /> },
      { path: "/expenses/:id", element: <ExpenseDetail /> },
      { path: "/groups/:id", element: <GroupPage /> },
      { path: "/groups/:id/settings", element: <GroupSettings /> },
      { path: "/groups/:id/totals", element: <GroupTotals /> },
      { path: "/groups/:id/charts", element: charts },
      { path: "/friends/:id", element: <FriendPage /> },
      { path: "/charts", element: charts },
      { path: "/account", element: <AccountPage /> },
      { path: "/account/notifications", element: <NotificationSettings /> },
      { path: "/trash", element: <TrashPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
