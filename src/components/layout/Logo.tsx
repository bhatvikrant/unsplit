import { cn } from "@/lib/utils";

/** Unsplit mark: two offset squares sharing a seam. Original artwork. */
export function Logo({ className, size = 24, wordmark = true }: { className?: string; size?: number; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="2" width="13" height="13" rx="3.5" className="fill-brand" />
        <rect x="9" y="9" width="13" height="13" rx="3.5" className="fill-brand" opacity="0.55" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" className="fill-on-brand" opacity="0.9" />
      </svg>
      {wordmark ? <span className="text-text text-[17px] font-semibold tracking-tight">unsplit</span> : null}
    </span>
  );
}
