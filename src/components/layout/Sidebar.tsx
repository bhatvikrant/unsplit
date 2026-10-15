import { useQuery } from "@/lib/convex";
import { Activity, LayoutDashboard, Plus, ReceiptText } from "lucide-react";
import { Link, NavLink } from "react-router";
import { api } from "@convex/_generated/api";
import { GroupAvatar, UserAvatar } from "@/components/common/Avatars";
import { BalanceChip } from "@/components/common/Money";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "pressable flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
    isActive ? "bg-surface text-text shadow-card [&>svg]:text-brand" : "text-text-muted hover:bg-surface-2 hover:text-text",
  );

const rowClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "pressable flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
    isActive ? "bg-surface text-text shadow-card" : "text-text hover:bg-surface-2",
  );

function SectionHeading({ label, action, onAction }: { label: string; action: string; onAction: () => void }) {
  return (
    <div className="mb-1 flex items-center justify-between pr-1 pl-2.5">
      <span className="text-text-faint text-[11px] font-semibold tracking-[0.06em] uppercase">{label}</span>
      <button
        type="button"
        aria-label={action}
        onClick={onAction}
        className="pressable text-text-faint hover:bg-surface-2 hover:text-text flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useQuery(api.groups.list);
  const friends = useQuery(api.friends.list);
  const unread = useQuery(api.activity.unreadCount);
  const dialogs = useDialogs();

  return (
    <nav className="flex flex-col gap-5 text-sm" aria-label="Main">
      <div className="flex flex-col gap-0.5">
        <NavLink to="/dashboard" className={linkClass} onClick={onNavigate}>
          <LayoutDashboard className="size-4" /> Dashboard
        </NavLink>
        <NavLink to="/activity" className={linkClass} onClick={onNavigate}>
          <Activity className="size-4" /> Recent activity
          {unread ? <span className="bg-brand text-on-brand ml-auto rounded-full px-1.5 text-[11px] leading-4 font-semibold">{unread}</span> : null}
        </NavLink>
        <NavLink to="/expenses" className={linkClass} end onClick={onNavigate}>
          <ReceiptText className="size-4" /> All expenses
        </NavLink>
      </div>

      <div>
        <SectionHeading label="Groups" action="Create a group" onAction={() => dialogs.createGroup()} />
        <div className="flex flex-col gap-0.5">
          {groups === undefined ? (
            <div className="text-text-faint px-2.5 py-1 text-xs">Loading…</div>
          ) : groups.length === 0 ? (
            <button type="button" className="text-text-faint hover:text-text px-2.5 py-1 text-left text-xs" onClick={() => dialogs.createGroup()}>
              No groups yet. Create one.
            </button>
          ) : (
            groups.map((g) => (
              <NavLink key={g._id} to={`/groups/${g._id}`} className={rowClass} onClick={onNavigate}>
                <GroupAvatar group={g} size="xs" />
                <span className="truncate">{g.name}</span>
                <BalanceChip balances={g.myBalance} className="ml-auto" />
              </NavLink>
            ))
          )}
        </div>
      </div>

      <div>
        <SectionHeading label="Friends" action="Add a friend" onAction={() => dialogs.addFriend()} />
        <div className="flex flex-col gap-0.5">
          {friends === undefined ? (
            <div className="text-text-faint px-2.5 py-1 text-xs">Loading…</div>
          ) : friends.length === 0 ? (
            <button type="button" className="text-text-faint hover:text-text px-2.5 py-1 text-left text-xs" onClick={() => dialogs.addFriend()}>
              No friends yet. Add one.
            </button>
          ) : (
            friends.map((f) => (
              <NavLink key={f.user._id} to={`/friends/${f.user._id}`} className={rowClass} onClick={onNavigate}>
                <UserAvatar user={f.user} size="xs" />
                <span className="truncate">{f.user.name}</span>
                <BalanceChip balances={f.balances} plain className="ml-auto" />
              </NavLink>
            ))
          )}
        </div>
      </div>
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-4 overflow-y-auto border-r px-3 pt-3 pb-3 lg:flex">
      <Link to="/dashboard" className="mb-1 inline-flex w-fit rounded-lg px-2 py-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring" aria-label="UnSplit home">
        <Logo />
      </Link>
      <SidebarContent />
      <div className="mt-auto pt-4">
        <UserMenu />
      </div>
    </aside>
  );
}
