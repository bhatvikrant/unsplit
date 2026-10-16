import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { RedirectIfAuthed, RequireAuth } from "@/components/layout/RequireAuth";
import { AccountPage, NotificationSettings } from "@/pages/Account";
import { ActivityPage } from "@/pages/ActivityPage";
import { Login } from "@/pages/Auth";
import { ChartsPage } from "@/pages/Charts";
import { Dashboard } from "@/pages/Dashboard";
import { ExpenseDetail } from "@/pages/ExpenseDetail";
import { AllExpenses, RecurringExpenses, TrashPage } from "@/pages/Expenses";
import { FriendPage } from "@/pages/Friend";
import { GroupPage, GroupSettings, GroupTotals } from "@/pages/Group";
import { Join } from "@/pages/Join";
import { Landing } from "@/pages/Landing";
import { NotFound } from "@/pages/NotFound";
import { Privacy } from "@/pages/Privacy";

export const router = createBrowserRouter([
  { path: "/", element: <RedirectIfAuthed><Landing /></RedirectIfAuthed> },
  { path: "/login", element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
  { path: "/signup", element: <Navigate to="/login" replace /> },
  { path: "/privacy", element: <Privacy /> },
  { path: "/join/:code", element: <Join /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
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
      { path: "/groups/:id/charts", element: <ChartsPage /> },
      { path: "/friends/:id", element: <FriendPage /> },
      { path: "/charts", element: <ChartsPage /> },
      { path: "/account", element: <AccountPage /> },
      { path: "/account/notifications", element: <NotificationSettings /> },
      { path: "/trash", element: <TrashPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
