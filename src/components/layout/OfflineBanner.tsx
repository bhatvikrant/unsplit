import { CloudUpload, WifiOff } from "lucide-react";
import { useOfflineStatus } from "@/offline/context";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One line above the page: tells the user they're offline (and that their
 * changes are safe on this device), or that queued changes are syncing.
 */
export function OfflineBanner() {
  const s = useOfflineStatus();
  if (!s.offline && s.pending === 0) return null;
  const offline = s.offline;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className={cn(
        "mb-4 flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px]",
        offline ? "bg-warning-soft text-warning-ink" : "bg-brand-soft text-brand-ink",
      )}
    >
      {offline ? <WifiOff className="size-4 shrink-0" /> : <CloudUpload className="size-4 shrink-0 animate-pulse" />}
      <span className="min-w-0 flex-1">
        {offline ? (
          <>
            <span className="font-medium">You're offline.</span> Changes are saved on this device and will sync when you're back online.
            {s.pending > 0 ? <span className="opacity-80"> {pluralize(s.pending, "change")} waiting.</span> : null}
          </>
        ) : (
          <>
            <span className="font-medium">Syncing</span> {pluralize(s.pending, "change")}…
          </>
        )}
      </span>
    </div>
  );
}
