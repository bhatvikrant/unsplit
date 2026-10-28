import { useQuery } from "@/lib/convex";
import { Command as CommandPrimitive } from "cmdk";
import { Activity, ArrowRight, BarChart3, HandCoins, LayoutDashboard, Plus, ReceiptText, Repeat, Search, Settings, Trash2, UserPlus, Users } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { api } from "@convex/_generated/api";
import { GroupAvatar, UserAvatar } from "@/components/common/Avatars";
import { BalanceChip } from "@/components/common/Money";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { IS_MAC } from "@/lib/platform";
import { useQuickActions } from "./quickActions";

const PAGES = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview balances" },
  { to: "/activity", label: "Recent activity", icon: Activity, keywords: "feed history" },
  { to: "/expenses", label: "All expenses", icon: ReceiptText, keywords: "list" },
  { to: "/charts", label: "Spending charts", icon: BarChart3, keywords: "stats totals category" },
  { to: "/expenses/recurring", label: "Recurring expenses", icon: Repeat, keywords: "repeat subscription monthly" },
  { to: "/trash", label: "Deleted items", icon: Trash2, keywords: "trash restore" },
  { to: "/account", label: "Account settings", icon: Settings, keywords: "profile currency name" },
];

/** Case-insensitive substring match against every text, or everything when there is no query. */
function matcher(term: string) {
  return (...texts: (string | undefined)[]) => !term || texts.some((t) => t?.toLowerCase().includes(term));
}

const itemClass =
  "relative flex cursor-default items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-text outline-none select-none data-[selected=true]:bg-surface-2 [&_svg]:pointer-events-none [&_svg]:shrink-0";

function Item({ value, onSelect, children, hint }: { value: string; onSelect: () => void; children: ReactNode; hint?: string }) {
  return (
    <CommandPrimitive.Item value={value} onSelect={onSelect} className={itemClass}>
      {children}
      {hint ? <span className="text-text-faint ml-auto text-xs">{hint}</span> : null}
    </CommandPrimitive.Item>
  );
}

function IconTile({ icon: Icon, accent }: { icon: ComponentType<{ className?: string }>; accent?: boolean }) {
  return (
    <span className={accent ? "bg-brand-soft text-brand-ink flex size-7 items-center justify-center rounded-md" : "bg-surface-2 text-text-muted flex size-7 items-center justify-center rounded-md"}>
      <Icon className="size-4" />
    </span>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <CommandPrimitive.Group heading={heading} className="p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-text-faint">
      {children}
    </CommandPrimitive.Group>
  );
}

/** Only mounted while the palette is open, so the group and friend lists are read only then. */
function PaletteBody({ close }: { close: () => void }) {
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const quick = useQuickActions();
  const groups = useQuery(api.groups.list);
  const friends = useQuery(api.friends.list);
  const [q, setQ] = useState("");
  const query = q.trim();
  const matches = matcher(query.toLowerCase());
  const run = (fn: () => void) => {
    close();
    fn();
  };

  const actions = [
    { id: "add-expense", label: "Add expense", icon: Plus, keywords: "new cost bill split", run: quick.addExpense },
    { id: "settle-up", label: "Settle up", icon: HandCoins, keywords: "pay payment record transfer", run: quick.settleUp },
    { id: "create-group", label: "Create a group", icon: Users, keywords: "new trip flat house", run: dialogs.createGroup },
    { id: "add-friend", label: "Add a friend", icon: UserPlus, keywords: "invite person", run: dialogs.addFriend },
  ].filter((a) => matches(a.label, a.keywords));
  const pages = PAGES.filter((p) => matches(p.label, p.keywords));
  // Browsing with no query shows a handful of each; a query shows every hit.
  const limit = query ? Infinity : 5;
  const groupHits = (groups ?? []).filter((g) => matches(g.name)).slice(0, limit);
  const friendHits = (friends ?? []).filter((f) => matches(f.user.name, f.user.email)).slice(0, limit);

  return (
    <CommandPrimitive label="Search expenses" shouldFilter={false} loop className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b px-4">
        <Search className="text-text-faint size-4 shrink-0" />
        <CommandPrimitive.Input
          value={q}
          onValueChange={setQ}
          placeholder="Search expenses, groups, friends…"
          className="placeholder:text-text-faint h-12 w-full bg-transparent text-base outline-none sm:text-sm"
        />
        <kbd className="text-text-faint bg-surface-2 hidden rounded px-1.5 py-0.5 font-sans text-[11px] font-medium sm:block">esc</kbd>
      </div>
      <CommandPrimitive.List className="max-h-[min(60dvh,420px)] scroll-py-1 overflow-y-auto">
        {query ? (
          <Group heading="Expenses">
            <Item value={`search:${query}`} onSelect={() => run(() => navigate(`/expenses?q=${encodeURIComponent(query)}`))} hint="enter">
              <IconTile icon={Search} accent />
              <span className="truncate">
                Search expenses for <span className="font-medium">“{query}”</span>
              </span>
            </Item>
          </Group>
        ) : null}

        {actions.length ? (
          <Group heading="Actions">
            {actions.map((a) => (
              <Item key={a.id} value={`action:${a.id}`} onSelect={() => run(a.run)}>
                <IconTile icon={a.icon} accent />
                {a.label}
              </Item>
            ))}
          </Group>
        ) : null}

        {groupHits.length ? (
          <Group heading="Groups">
            {groupHits.map((g) => (
              <Item key={g._id} value={`group:${g._id}`} onSelect={() => run(() => navigate(`/groups/${g._id}`))}>
                <GroupAvatar group={g} size="xs" />
                <span className="truncate">{g.name}</span>
                <BalanceChip balances={g.myBalance} className="ml-auto" />
              </Item>
            ))}
          </Group>
        ) : null}

        {friendHits.length ? (
          <Group heading="Friends">
            {friendHits.map((f) => (
              <Item key={f.user._id} value={`friend:${f.user._id}`} onSelect={() => run(() => navigate(`/friends/${f.user._id}`))}>
                <UserAvatar user={f.user} size="xs" />
                <span className="truncate">{f.user.name}</span>
                <BalanceChip balances={f.balances} plain className="ml-auto" />
              </Item>
            ))}
          </Group>
        ) : null}

        {pages.length ? (
          <Group heading="Go to">
            {pages.map((p) => (
              <Item key={p.to} value={`page:${p.to}`} onSelect={() => run(() => navigate(p.to))}>
                <IconTile icon={p.icon} />
                {p.label}
                <ArrowRight className="text-text-faint ml-auto size-3.5" />
              </Item>
            ))}
          </Group>
        ) : null}
      </CommandPrimitive.List>
      <div className="text-text-faint hidden items-center gap-3 border-t px-4 py-2 text-[11px] sm:flex">
        <span>
          <kbd className="bg-surface-2 rounded px-1 font-sans">↑↓</kbd> move
        </span>
        <span>
          <kbd className="bg-surface-2 rounded px-1 font-sans">↵</kbd> open
        </span>
        <span className="ml-auto">
          <kbd className="bg-surface-2 rounded px-1 font-sans">{IS_MAC ? "⌘" : "Ctrl"} K</kbd> anywhere
        </span>
      </div>
    </CommandPrimitive>
  );
}

/**
 * The app's one search box: type to search expenses, or jump straight to a
 * group, a friend, a page, or an action. Opened from the top bar or with ⌘K.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[max(4rem,env(safe-area-inset-top))] max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[18%] sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search expenses, jump to a group, friend or page, or run an action.</DialogDescription>
        <PaletteBody close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
