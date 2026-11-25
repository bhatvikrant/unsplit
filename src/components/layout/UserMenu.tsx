import { useAuthActions } from "@convex-dev/auth/react";
import { BarChart3, ChevronsUpDown, LogOut, Repeat, Settings, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common/Avatars";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useOffline } from "@/offline/context";
import { errorMessage } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Logs out and returns to the landing page, after a warning when offline changes would be lost. */
export function useLogOut() {
  const { signOut } = useAuthActions();
  const { store } = useOffline();
  const confirm = useConfirm();
  const navigate = useNavigate();
  return async () => {
    // Counted from the database, so changes queued in another tab of this browser are not thrown away unasked.
    const pending = await store.pendingOnDisk();
    if (pending > 0 && !(await confirm({ title: "Log out anyway?", description: `${pending} change${pending === 1 ? "" : "s"} haven't synced yet and would be lost.`, action: "Log out" }))) return;
    try {
      await signOut();
    } catch (e) {
      toast.error(errorMessage(e));
      return;
    }
    navigate("/");
  };
}

/** Account switcher at the foot of the sidebar: name, email and the account-level pages. */
export function UserMenu({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const me = useMe();
  const logOut = useLogOut();
  const navigate = useNavigate();
  const go = (to: string) => {
    onNavigate?.();
    navigate(to);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "pressable hover:bg-surface-2 focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none focus-visible:ring-[3px]",
            className,
          )}
        >
          {me ? <UserAvatar user={me} size="sm" /> : <span className="bg-surface-2 size-8 shrink-0 rounded-full" />}
          <span className="min-w-0 flex-1">
            <span className="text-text block truncate text-sm leading-tight font-medium">{me?.name ?? "…"}</span>
            <span className="text-text-faint block truncate text-xs">{me?.email}</span>
          </span>
          <ChevronsUpDown className="text-text-faint size-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-text truncate font-medium">{me?.name}</div>
          <div className="text-text-muted truncate text-xs">{me?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go("/account")}>
          <Settings /> Account settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/charts")}>
          <BarChart3 /> Spending charts
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/expenses/recurring")}>
          <Repeat /> Recurring expenses
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/trash")}>
          <Trash2 /> Deleted items
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logOut()}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
