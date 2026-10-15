import type { ReactNode } from "react";
import {
  Armchair, ArrowLeftRight, Baby, BedDouble, Bike, Car, CarTaxiFront, CircleDashed, CircleParking, Clapperboard, Coffee, Droplets, FileText, Film, Flame, Fuel,
  Gamepad2, Gift, GraduationCap, Hammer, Heart, House, KeyRound, Landmark, Music, PawPrint, Plane, Receipt, Shirt, ShieldCheck, ShoppingBasket, Smartphone,
  Sparkles, SprayCan, Stethoscope, TrainFront, Trash2, Trophy, Tv, UtensilsCrossed, Wifi, Wine, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { categoryBySlug } from "@convex/lib/categories";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { tint } from "./Avatars";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("card flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {Icon ? (
        <div className="bg-brand-soft text-brand mb-4 flex size-12 items-center justify-center rounded-full">
          <Icon className="size-5" />
        </div>
      ) : null}
      <h3 className="text-text text-base font-semibold">{title}</h3>
      {description ? <p className="text-text-muted mt-1 max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, leading, actions, className }: { title: ReactNode; subtitle?: ReactNode; leading?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-center gap-3.5">
        {leading}
        <div className="min-w-0">
          <h1 className="text-text truncate text-2xl leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle ? <div className="text-text-muted mt-0.5 text-sm">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** One hue per top-level category so a list of expenses reads as a gentle, varied palette. */
const CATEGORY_HUES: Record<string, number> = {
  home: 40,
  transportation: 230,
  food: 20,
  entertainment: 330,
  utilities: 90,
  life: 150,
  general: 270,
  uncategorized: 60,
};

/**
 * Every icon a category can name (convex/lib/categories.ts), imported
 * statically: one bundle instead of a lazy chunk per icon, so the app shell
 * the service worker precaches stays small and no icon is missing offline.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Armchair, ArrowLeftRight, Baby, BedDouble, Bike, Car, CarTaxiFront, CircleDashed, CircleParking, Clapperboard, Coffee, Droplets, FileText, Film, Flame, Fuel,
  Gamepad2, Gift, GraduationCap, Hammer, Heart, House, KeyRound, Landmark, Music, PawPrint, Plane, Receipt, Shirt, ShieldCheck, ShoppingBasket, Smartphone,
  Sparkles, SprayCan, Stethoscope, TrainFront, Trash2, Trophy, Tv, UtensilsCrossed, Wifi, Wine, Wrench, Zap,
};

export function CategoryIcon({ slug, className, size = "md" }: { slug: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const sz = { sm: "size-7 rounded-lg [&>svg]:size-3.5", md: "size-10 rounded-xl [&>svg]:size-[18px]", lg: "size-12 rounded-[14px] [&>svg]:size-[22px]" }[size];
  if (slug === "payment") {
    return (
      <div className={cn("flex shrink-0 items-center justify-center", sz, className)} style={tint(160)} title="Payment" aria-label="Payment">
        <ArrowLeftRight strokeWidth={1.75} />
      </div>
    );
  }
  const cat = categoryBySlug(slug);
  const Icon = CATEGORY_ICONS[cat.icon] ?? Receipt;
  return (
    <div className={cn("flex shrink-0 items-center justify-center", sz, className)} style={tint(CATEGORY_HUES[cat.parent] ?? 60)} title={cat.name} aria-label={cat.name}>
      <Icon strokeWidth={1.75} />
    </div>
  );
}

export function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="card divide-y px-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function Section({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn("card", className)}>
      {title ? (
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-text text-[13px] font-semibold">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-text block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-danger text-xs">{error}</p> : hint ? <p className="text-text-faint text-xs">{hint}</p> : null}
    </div>
  );
}
