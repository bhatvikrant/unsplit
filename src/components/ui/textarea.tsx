import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[10px] bg-surface px-3 py-2 text-base shadow-ring transition-[box-shadow] duration-150 outline-none placeholder:text-text-faint focus-visible:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:shadow-[0_0_0_1px_var(--danger)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
