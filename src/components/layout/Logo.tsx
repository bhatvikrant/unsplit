import { cn } from "@/lib/utils";

/**
 * UnSplit mark: a bold "S" stroke on a rounded brand-green tile.
 * public/icon.svg is the fixed-colour version used for the favicon and app icons.
 */
export function Logo({ className, size = 26, wordmark = true }: { className?: string; size?: number; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]">
        <rect width="512" height="512" rx="150" className="fill-brand" />
        <path d="M320 192a64 64 0 1 0-64 64a64 64 0 1 1-64 64" fill="none" className="stroke-on-brand" strokeWidth="52" strokeLinecap="round" />
      </svg>
      {wordmark ? <span className="text-text text-[17px] font-semibold tracking-tight">unsplit</span> : null}
    </span>
  );
}
