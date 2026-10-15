import { cn } from "@/lib/utils";

/**
 * Unsplit mark: a bold "S" on a rounded tile, the same family as unmoney's "M".
 * Tile and glyph follow the foreground/background tokens so it inverts in dark mode.
 * public/icon.svg is the fixed-colour version used for the favicon and app icons.
 */
export function Logo({ className, size = 24, wordmark = true }: { className?: string; size?: number; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" className="fill-foreground" />
        <path d="M320 192a64 64 0 1 0-64 64a64 64 0 1 1-64 64" fill="none" className="stroke-background" strokeWidth="48" />
      </svg>
      {wordmark ? <span className="text-foreground text-[17px] font-semibold tracking-tight">unsplit</span> : null}
    </span>
  );
}
