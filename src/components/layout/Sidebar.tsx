import { useQuery } from "convex/react";
import { Activity, LayoutDashboard, Plus, ReceiptText } from "lucide-react";
import { NavLink } from "react-router";
import { api } from "@convex/_generated/api";
import { GroupAvatar, UserAvatar } from "@/components/common/Avatars";
import { BalanceSummary } from "@/components/common/Money";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
    isActive ? "bg-brand-soft text-brand font-medium" : "text-text-muted hover:bg-surface hover:text-text",
  );

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
          {unread ? <span className="bg-brand text-on-brand ml-auto rounded-full px-1.5 text-[11px] font-semibold leading-4">{unread}</span> : null}
        </NavLink>
        <NavLink to="/expenses" className={linkClass} end onClick={onNavigate}>
          <ReceiptText className="size-4" /> All expenses
        </NavLink>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between px-2.5">
          <span className="text-text-faint text-xs font-semibold tracking-wide uppercase">Groups</span>
          <Button variant="ghost" size="icon-xs" aria-label="Create a group" onClick={() => dialogs.createGroup()}>
            <Plus />
          </Button>
        </div>
        <div className="flex flex-col gap-0.5">
          {groups === undefined ? (
            <div className="text-text-faint px-2.5 py-1 text-xs">Loading…</div>
          ) : groups.length === 0 ? (
            <button type="button" className="text-text-faint hover:text-text px-2.5 py-1 text-left text-xs" onClick={() => dialogs.createGroup()}>
              No groups yet. Create one.
            </button>
          ) : (
            groups.map((g) => (
              <NavLink key={g._id} to={`/groups/${g._id}`} className={linkClass} onClick={onNavigate}>
                <GroupAvatar group={g} size="xs" />
                <span className="truncate">{g.name}</span>
                <BalanceSummary balances={g.myBalance} compact className="ml-auto text-xs" />
              </NavLink>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between px-2.5">
          <span className="text-text-faint text-xs font-semibold tracking-wide uppercase">Friends</span>
          <Button variant="ghost" size="icon-xs" aria-label="Add a friend" onClick={() => dialogs.addFriend()}>
            <Plus />
          </Button>
        </div>
        <div className="flex flex-col gap-0.5">
          {friends === undefined ? (
            <div className="text-text-faint px-2.5 py-1 text-xs">Loading…</div>
          ) : friends.length === 0 ? (
            <button type="button" className="text-text-faint hover:text-text px-2.5 py-1 text-left text-xs" onClick={() => dialogs.addFriend()}>
              No friends yet. Add one.
            </button>
          ) : (
            friends.map((f) => (
              <NavLink key={f.user._id} to={`/friends/${f.user._id}`} className={linkClass} onClick={onNavigate}>
                <UserAvatar user={f.user} size="xs" />
                <span className="truncate">{f.user.name}</span>
                <BalanceSummary balances={f.balances} compact className="ml-auto text-xs" />
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
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[248px] shrink-0 overflow-y-auto border-r px-3 py-5 lg:block">
      <SidebarContent />
    </aside>
  );
}
