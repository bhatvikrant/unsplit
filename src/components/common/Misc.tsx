import type { ReactNode } from "react";
import { icons, type LucideIcon } from "lucide-react";
import { categoryBySlug } from "@convex/lib/categories";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center", className)}>
      {Icon ? (
        <div className="bg-surface text-text-muted mb-4 flex size-12 items-center justify-center rounded-full">
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
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="text-text truncate text-xl font-semibold leading-tight">{title}</h1>
          {subtitle ? <div className="text-text-muted mt-0.5 text-sm">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CategoryIcon({ slug, className, size = "md" }: { slug: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const cat = categoryBySlug(slug);
  const Icon = (icons as Record<string, LucideIcon>)[cat.icon] ?? icons.Receipt;
  const sz = { sm: "size-7 [&>svg]:size-3.5", md: "size-9 [&>svg]:size-4", lg: "size-11 [&>svg]:size-5" }[size];
  return (
    <div className={cn("bg-surface-2 text-text-muted flex shrink-0 items-center justify-center rounded-md", sz, className)} title={cat.name} aria-label={cat.name}>
      <Icon />
    </div>
  );
}

export function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-3">
          <Skeleton className="size-9 rounded-md" />
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
    <section className={cn("rounded-lg border bg-bg", className)}>
      {title ? (
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">{title}</h2>
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
      <label htmlFor={htmlFor} className="text-text text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-danger text-xs">{error}</p> : hint ? <p className="text-text-faint text-xs">{hint}</p> : null}
    </div>
  );
}
