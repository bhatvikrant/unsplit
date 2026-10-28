import { HandCoins, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/lib/commandPalette";
import { IS_MAC } from "@/lib/platform";
import { useQuickActions } from "./quickActions";

/**
 * Top row of the main column on desktop (`lg` and up, beside the sidebar): a search box that
 * opens the command palette, plus the two actions people reach for most, Settle up and Add
 * expense, always one click away. Phones and tablets have no top bar: each page's header is the
 * navigation bar (PageHeader in src/components/common/Misc.tsx), with search in it, the tab bar
 * below for the sections, and Groups and Friends on the Home tab.
 */
export function TopBar() {
  const palette = useCommandPalette();
  const quick = useQuickActions();

  return (
    <header className="mb-5 hidden h-9 items-center gap-2.5 lg:flex">
      <button
        type="button"
        onClick={palette.open}
        aria-label="Search"
        aria-keyshortcuts={IS_MAC ? "Meta+K" : "Control+K"}
        className="pressable bg-surface shadow-card text-text-faint hover:text-text-muted focus-visible:ring-ring flex h-9 w-full max-w-sm items-center gap-2.5 rounded-[10px] pr-2 pl-3 text-left text-sm outline-none focus-visible:ring-[3px]"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Search expenses, groups, friends…</span>
        <kbd className="bg-surface-2 text-text-faint rounded-md px-1.5 py-0.5 font-sans text-[11px] font-medium">{IS_MAC ? "⌘" : "Ctrl"} K</kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button variant="outline" onClick={quick.settleUp}>
          <HandCoins /> Settle up
        </Button>
        <Button onClick={quick.addExpense}>
          <Plus /> Add expense
        </Button>
      </div>
    </header>
  );
}
