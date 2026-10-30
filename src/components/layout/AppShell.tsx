import { motion, useReducedMotion } from "framer-motion";
import { Activity, LayoutDashboard, Plus, ReceiptText, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useSearchParams, type NavLinkProps } from "react-router";
import { DialogProvider, useDialogs } from "@/components/dialogs/DialogProvider";
import { CommandPaletteContext } from "@/lib/commandPalette";
import { takeHandoff } from "@/lib/handoff";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { InstallBanner } from "./InstallPrompt";
import { OfflineBanner } from "./OfflineBanner";
import { useQuickActions } from "./quickActions";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn("flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px]", isActive ? "text-brand font-semibold" : "text-text-faint font-medium");

/** A tab bar item fills its cell; tapping the tab already open scrolls its page back to the top. */
function Tab({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  const { pathname } = useLocation();
  const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const onClick: NavLinkProps["onClick"] = (e) => {
    if (!active) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <NavLink to={to} end={end} className={tabClass} onClick={onClick}>
      {children}
    </NavLink>
  );
}

/** Phone-only bottom navigation with the add-expense button in the middle. */
function MobileTabBar() {
  // On a group or friend page, the + button starts an expense in that context.
  const { addExpense } = useQuickActions();
  return (
    <nav aria-label="Primary" className="bg-surface/85 safe-bottom fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl lg:hidden">
      <div className="grid h-14 grid-cols-5 items-center">
        <Tab to="/dashboard">
          <LayoutDashboard className="size-5" /> Home
        </Tab>
        <Tab to="/activity">
          <Activity className="size-5" /> Activity
        </Tab>
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="Add expense"
            onClick={addExpense}
            className="bg-brand shadow-btn ease-out-strong -mt-6 flex size-12 items-center justify-center rounded-full outline-none transition-transform duration-150 focus-visible:ring-[3px] focus-visible:ring-ring active:scale-95"
          >
            <Plus className="text-on-brand size-6" strokeWidth={2.25} />
          </button>
        </div>
        <Tab to="/expenses" end>
          <ReceiptText className="size-5" /> Expenses
        </Tab>
        <Tab to="/account">
          <UserRound className="size-5" /> Account
        </Tab>
      </div>
    </nav>
  );
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * Owns the search palette: the top bar's search box and every page header's search button open
 * it through CommandPaletteContext. ⌘K / Ctrl+K toggles it from anywhere; "/" opens it outside a
 * text field.
 */
function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (k === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
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

/**
 * Each page settles in with a short rise and fade; none under reduced motion. Keyed by section
 * (/groups/:id), not the full path, so the tabs of one group swap in place instead of fading the
 * shared header out and back in on every click.
 */
function PageTransition() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  if (reduce) return <Outlet />;
  const section = pathname.split("/").slice(0, 3).join("/");
  return (
    <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
      <Outlet />
    </motion.div>
  );
}

export function AppShell() {
  return (
    <DialogProvider>
      <CommandPaletteProvider>
        <ShortcutActions />
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="min-w-0 flex-1">
            {/* Pinned to the top of every page, just below the status bar (the strip behind the
                status bar is body::before in src/index.css): solid page colour, no blur. */}
            <header className="bg-background sticky top-[env(safe-area-inset-top)] z-20 border-b">
              <TopBar />
            </header>
            <main className="px-4 pt-4 pb-[calc(var(--tabbar-h)+1.5rem)] sm:px-6 lg:px-8 lg:pt-5 lg:pb-12" id="main">
              <div className="mx-auto w-full max-w-[1040px]">
                <OfflineBanner />
                <InstallBanner />
                <PageTransition />
              </div>
            </main>
          </div>
        </div>
        <MobileTabBar />
      </CommandPaletteProvider>
    </DialogProvider>
  );
}
