import { Activity, LayoutDashboard, Plus, ReceiptText, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useMatch, useSearchParams } from "react-router";
import type { Id } from "@convex/_generated/dataModel";
import { DialogProvider, useDialogs } from "@/components/dialogs/DialogProvider";
import { takeHandoff } from "@/lib/handoff";
import { cn } from "@/lib/utils";
import { InstallBanner } from "./InstallPrompt";
import { OfflineBanner } from "./OfflineBanner";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn("flex flex-col items-center gap-0.5 py-1 text-[10.5px] font-medium", isActive ? "text-brand" : "text-text-faint");

/** Phone-only bottom navigation with the add-expense button in the middle. */
function MobileTabBar() {
  const dialogs = useDialogs();
  // On a group or friend page, the + button starts an expense in that context.
  const group = useMatch("/groups/:id/*");
  const friend = useMatch("/friends/:id");
  const addExpense = () => {
    if (group?.params.id) dialogs.addExpense({ groupId: group.params.id as Id<"groups"> });
    else if (friend?.params.id) dialogs.addExpense({ friendId: friend.params.id as Id<"users"> });
    else dialogs.addExpense();
  };
  return (
    <nav
      aria-label="Primary"
      className="bg-surface/85 fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 items-center border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <NavLink to="/dashboard" className={tabClass}>
        <LayoutDashboard className="size-5" /> Home
      </NavLink>
      <NavLink to="/activity" className={tabClass}>
        <Activity className="size-5" /> Activity
      </NavLink>
      <div className="flex justify-center">
        <button
          type="button"
          aria-label="Add expense"
          onClick={addExpense}
          className="pressable bg-brand shadow-btn -mt-6 flex size-12 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <Plus className="text-on-brand size-6" strokeWidth={2.25} />
        </button>
      </div>
      <NavLink to="/expenses" end className={tabClass}>
        <ReceiptText className="size-5" /> Expenses
      </NavLink>
      <NavLink to="/account" className={tabClass}>
        <UserRound className="size-5" /> Account
      </NavLink>
    </nav>
  );
}

/**
 * `?add=expense` (the home-screen shortcut) opens the add-expense dialog once, then clears itself.
 * So does a handoff from UnMoney waiting since /expenses/new (src/lib/handoff.ts).
 */
function ShortcutActions() {
  const dialogs = useDialogs();
  const [params, setParams] = useSearchParams();
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current) return;
    const h = takeHandoff();
    if (!h) return;
    handedOff.current = true;
    dialogs.addExpense({ handoff: h });
  }, [dialogs]);
  useEffect(() => {
    if (params.get("add") !== "expense") return;
    dialogs.addExpense();
    const next = new URLSearchParams(params);
    next.delete("add");
    setParams(next, { replace: true });
  }, [params, setParams, dialogs]);
  return null;
}

export function AppShell() {
  return (
    <DialogProvider>
      <ShortcutActions />
      <div className="flex min-h-dvh">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pt-5 lg:pb-12" id="main">
          <div className="mx-auto w-full max-w-[1040px]">
            <TopBar />
            <OfflineBanner />
            <InstallBanner />
            <Outlet />
          </div>
        </main>
      </div>
      <MobileTabBar />
    </DialogProvider>
  );
}
