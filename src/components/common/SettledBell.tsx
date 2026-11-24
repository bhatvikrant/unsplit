import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { settledBellDelay } from "@/lib/settled";
import { play } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** A bell beside "settled up". It wobbles once if a payment just settled things (lib/settled.ts); tapping rings it. */
export function SettledBell({ className }: { className?: string }) {
  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    const delay = settledBellDelay();
    if (delay === null) return;
    const t = window.setTimeout(() => setRinging(true), delay);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setRinging(false);
        requestAnimationFrame(() => setRinging(true));
        play("bell");
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center align-[-0.15em]",
        className,
      )}
    >
      <BellRing
        className={cn("size-[1em]", ringing && "bell-ring")}
        onAnimationEnd={() => setRinging(false)}
        aria-hidden
      />
    </button>
  );
}
