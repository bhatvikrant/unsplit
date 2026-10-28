import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand shadow-btn hover:bg-brand-hover",
        destructive:
          "bg-destructive text-white shadow-btn hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline:
          "bg-surface text-text shadow-card hover:bg-surface-2",
        secondary:
          "bg-surface-2 text-text hover:bg-surface-3",
        ghost:
          "text-text-muted hover:bg-surface-2 hover:text-text",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 coarse:min-h-11",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3 coarse:min-h-11 coarse:px-3",
        sm: "h-8 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5 coarse:min-h-11",
        lg: "h-10 rounded-xl px-6 has-[>svg]:px-4 coarse:min-h-11",
        icon: "size-9 coarse:size-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3 coarse:size-11",
        "icon-sm": "size-8 rounded-lg coarse:size-11",
        "icon-lg": "size-10 coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
