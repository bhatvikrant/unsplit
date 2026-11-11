import { Check, ChevronRight } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { PickerItem, PickerSheet } from "@/components/ui/picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePhone } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * Grouped rows, the way iOS Settings lays out a form: a rounded card of 48px rows, each with an
 * icon tile, a label, its value on the right and a chevron. Dividers start after the icon.
 */
export function FormCard({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section>
      {title ? <h3 className="text-text-faint mb-1.5 px-3.5 text-xs font-medium tracking-wide uppercase">{title}</h3> : null}
      <div className={cn("bg-surface shadow-ring overflow-hidden rounded-2xl", className)}>{children}</div>
    </section>
  );
}

export function RowIcon({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("bg-surface-2 text-text-muted flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-[18px]", className)}>{children}</span>;
}

/** The row body: everything right of the icon, with the divider under it. */
export function RowBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-12 min-w-0 flex-1 items-center gap-2 pr-3 [[data-row]:not(:last-child)>&]:border-b", className)}>{children}</div>;
}

type RowContentProps = { icon?: ReactNode; label: ReactNode; value?: ReactNode; chevron?: boolean; strong?: boolean };

function RowContent({ icon, label, value, chevron = true, strong }: RowContentProps) {
  return (
    <>
      {icon ? <RowIcon>{icon}</RowIcon> : null}
      <RowBody>
        <span className="flex-1 truncate text-[15px] sm:text-sm">{label}</span>
        {value !== undefined ? <span className={cn("flex min-w-0 shrink-0 items-center gap-2 truncate text-[15px] sm:text-sm", strong ? "text-text font-medium" : "text-text-muted")}>{value}</span> : null}
        {chevron ? <ChevronRight className="text-text-faint size-4 shrink-0" /> : null}
      </RowBody>
    </>
  );
}

const rowClass = "flex w-full items-center gap-3 pl-3.5 text-left outline-none select-none";

/** A tappable row. Extra props (from a trigger's asChild) land on the button. */
export function RowButton({ icon, label, value, chevron, strong, className, ...props }: RowContentProps & Omit<ComponentProps<"button">, "value">) {
  return (
    <button type="button" data-row="" className={cn(rowClass, "active:bg-surface-2 hover:bg-surface-2/50 focus-visible:bg-surface-2 disabled:opacity-50", className)} {...props}>
      <RowContent icon={icon} label={label} value={value} chevron={chevron} strong={strong} />
    </button>
  );
}

/** A plain row container for custom content (inputs, a note). */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-row="" className={cn(rowClass, className)}>
      {children}
    </div>
  );
}

export type RowOption = { value: string; label: ReactNode; description?: ReactNode; icon?: ReactNode };

/**
 * A row that opens a choice: a bottom sheet on phones, a popover on larger screens.
 * `footer` sits under the options in both (the repeat reminder).
 */
export function RowPicker({
  icon,
  label,
  value,
  display,
  title,
  options,
  onValueChange,
  footer,
  closeOnSelect = true,
  strong,
  "aria-label": ariaLabel,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value: string;
  /** What the row shows on the right; defaults to the chosen option's label. */
  display?: ReactNode;
  title: string;
  options: RowOption[];
  onValueChange: (value: string) => void;
  footer?: ReactNode;
  closeOnSelect?: boolean;
  strong?: boolean;
  "aria-label"?: string;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  const trigger = <RowButton icon={icon} label={label} value={display ?? chosen?.label} strong={strong} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} />;

  if (phone) {
    return (
      <PickerSheet open={open} onOpenChange={setOpen} title={title} value={value} onValueChange={onValueChange} closeOnSelect={closeOnSelect} footer={footer} trigger={trigger}>
        {options.map((o) => (
          <PickerItem key={o.value} value={o.value} icon={o.icon} className={o.description ? "min-h-15 py-2" : undefined}>
            {o.description ? (
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{o.label}</span>
                <span className="text-text-muted truncate text-[13px] font-normal">{o.description}</span>
              </span>
            ) : (
              o.label
            )}
          </PickerItem>
        ))}
      </PickerSheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-1.5" align="end">
        <div role="listbox" aria-label={title}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onValueChange(o.value);
                if (closeOnSelect) setOpen(false);
              }}
              className={cn("hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm", o.value === value && "font-medium")}
            >
              {o.icon}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.description ? <span className="text-text-muted block truncate text-xs font-normal">{o.description}</span> : null}
              </span>
              {o.value === value ? <Check className="text-brand size-4 shrink-0" /> : null}
            </button>
          ))}
        </div>
        {footer ? <div className="mt-1.5 border-t px-2 pt-2 pb-1">{footer}</div> : null}
      </PopoverContent>
    </Popover>
  );
}
