import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "bg-surface text-text shadow-ring h-9 w-full min-w-0 rounded-[10px] px-3 py-1 text-base transition-[box-shadow,background-color] duration-150 outline-none selection:bg-brand selection:text-on-brand file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text placeholder:text-text-faint disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--ring)]",
        "aria-invalid:shadow-[0_0_0_1px_var(--danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
