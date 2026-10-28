import { HandCoins, Menu, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { IS_MAC } from "@/lib/platform";
import { CommandPalette } from "./CommandPalette";
import { Logo } from "./Logo";
import { useQuickActions } from "./quickActions";
import { SidebarContent } from "./Sidebar";
import { UserMenu } from "./UserMenu";

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * Top row of the main column.
 *
 * Phones: menu button (opens the navigation sheet), the brand, and a search button.
 * Desktop: a search box that opens the command palette, plus the two actions
 * people reach for most, Settle up and Add expense, always one click away.
 * ⌘K / Ctrl+K opens the palette from anywhere; "/" does too outside a text field.
 */
export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const quick = useQuickActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (k === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="mb-5 flex h-9 items-center gap-2.5">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[288px] flex-col gap-4 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="px-2 py-1.5">
            <Logo />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </div>
          <UserMenu onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <Link
        to="/dashboard"
        className="flex h-9 shrink-0 items-center rounded-lg pr-1.5 pl-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring lg:hidden"
        aria-label="UnSplit home"
      >
        <Logo size={28} className="gap-2" />
      </Link>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search"
        aria-keyshortcuts={IS_MAC ? "Meta+K" : "Control+K"}
        className="pressable bg-surface shadow-card text-text-faint hover:text-text-muted focus-visible:ring-ring hidden h-9 w-full max-w-xs items-center gap-2.5 rounded-[10px] pr-2 pl-3 text-left text-sm outline-none focus-visible:ring-[3px] sm:flex lg:max-w-sm"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Search expenses, groups, friends…</span>
        <kbd className="bg-surface-2 text-text-faint rounded-md px-1.5 py-0.5 font-sans text-[11px] font-medium">{IS_MAC ? "⌘" : "Ctrl"} K</kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button variant="outline" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
          <Search />
        </Button>
        <Button variant="outline" className="hidden lg:inline-flex" onClick={quick.settleUp}>
          <HandCoins /> Settle up
        </Button>
        <Button className="hidden lg:inline-flex" onClick={quick.addExpense}>
          <Plus /> Add expense
        </Button>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
