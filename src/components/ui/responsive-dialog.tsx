import * as React from "react"
import { Drawer } from "vaul"
import { cn } from "@/lib/utils"

import * as Desktop from "@/components/ui/dialog"

/**
 * A modal that is the centred Dialog from Tailwind's `sm` breakpoint up and a bottom sheet (vaul)
 * below it. Same component names as ui/dialog, so a caller changes its import and gets:
 *
 * - a sheet that slides up, with a grab handle, top corners rounded, swipe down to dismiss, the
 *   app's scrim, safe-area padding at the bottom, and no × button;
 * - a top bar in place of the × and the footer: Cancel on the left, the title centred, and the
 *   primary action on the right in bold, given as `action` on DialogContent. It is in the bar so
 *   it stays reachable with the keyboard up. DialogFooter renders nothing on phones once an
 *   `action` is given (and a sticky bottom bar otherwise, so no caller loses its buttons);
 * - `size="full"` for forms (94% of the viewport) and `size="fit"` for content-sized sheets.
 *
 * `className` on DialogContent only applies to the desktop dialog; `sheetClassName` styles the
 * sheet's scroll area. Header classes apply on both, so phone-sensitive ones take `sm:`.
 */

/** Tailwind's `sm` breakpoint. Below it, dialogs open as sheets. */
const DESKTOP_QUERY = "(min-width: 40rem)"

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** True where dialogs open as bottom sheets (phone widths). */
function useIsPhoneDialog() {
  return React.useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  )
}

export type SheetAction = {
  label: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  /** Submit this form (by id) instead of running onClick. Not needed when the header is inside the form. */
  form?: string
  type?: "button" | "submit"
}

type SheetConfig = { action?: SheetAction; cancelLabel: string }

const PhoneContext = React.createContext(false)
const SheetContext = React.createContext<SheetConfig>({ cancelLabel: "Cancel" })

/** vaul's slide-out takes this long; the caller hears about the close only after it (see Dialog). */
const EXIT_MS = 500

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  modal,
  children,
}: React.ComponentProps<typeof Desktop.Dialog>) {
  const phone = useIsPhoneDialog()
  // Every caller unmounts the dialog as soon as it hears `onOpenChange(false)`, which would cut the
  // sheet's slide-out short. So on phones the sheet is held open until vaul's exit animation has
  // run, and the caller is told then.
  const [closing, setClosing] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!phone) {
    return (
      <PhoneContext value={false}>
        <Desktop.Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={modal}>
          {children}
        </Desktop.Dialog>
      </PhoneContext>
    )
  }
  return (
    <PhoneContext value={true}>
      <Drawer.Root
        open={open === undefined ? undefined : open && !closing}
        defaultOpen={defaultOpen}
        modal={modal}
        shouldScaleBackground={false}
        onOpenChange={(o) => {
          if (o || open === undefined) {
            setClosing(false)
            onOpenChange?.(o)
            return
          }
          setClosing(true)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            setClosing(false)
            onOpenChange?.(false)
          }, EXIT_MS)
        }}
      >
        {children}
      </Drawer.Root>
    </PhoneContext>
  )
}

function DialogTrigger(props: React.ComponentProps<typeof Desktop.DialogTrigger>) {
  const phone = React.use(PhoneContext)
  return phone ? <Drawer.Trigger data-slot="dialog-trigger" {...props} /> : <Desktop.DialogTrigger {...props} />
}

function DialogPortal(props: React.ComponentProps<typeof Desktop.DialogPortal>) {
  const phone = React.use(PhoneContext)
  return phone ? <Drawer.Portal {...props} /> : <Desktop.DialogPortal {...props} />
}

function DialogClose(props: React.ComponentProps<typeof Desktop.DialogClose>) {
  const phone = React.use(PhoneContext)
  return phone ? <Drawer.Close data-slot="dialog-close" {...props} /> : <Desktop.DialogClose {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof Desktop.DialogOverlay>) {
  const phone = React.use(PhoneContext)
  if (!phone) return <Desktop.DialogOverlay className={className} {...props} />
  return (
    <Drawer.Overlay
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[2px]", className)}
      {...props}
    />
  )
}

/**
 * vaul fits the sheet above the keyboard on a visualViewport "resize": it sets an inline height
 * from the sheet's top as getBoundingClientRect reports it, which includes the slide-in
 * transform. A field that autofocuses (the amount in Add expense) brings the keyboard up while the
 * sheet is still sliding, so that first measurement can be mid-slide and leave the sheet a few
 * lines tall; re-measuring then only confirms the short height, since the sheet now really is that
 * short. So once the slide has ended, with the keyboard still up, give the sheet its full height
 * back and ask vaul to measure again.
 */
function fitAboveKeyboardAfterSlide(e: React.AnimationEvent<HTMLDivElement>) {
  const el = e.currentTarget
  const viewport = window.visualViewport
  if (e.target !== el || !viewport || el.getAttribute("data-state") !== "open") return
  if (viewport.height >= window.innerHeight - 60) return
  el.style.height = ""
  el.style.bottom = ""
  viewport.dispatchEvent(new Event("resize"))
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  action,
  cancelLabel = "Cancel",
  size = "fit",
  sheetClassName,
  ...props
}: React.ComponentProps<typeof Desktop.DialogContent> & {
  /** Phones: the primary action, shown bold on the right of the sheet's top bar. */
  action?: SheetAction
  /** Phones: the text of the top bar's left button. */
  cancelLabel?: string
  /** Phones: a full-height sheet for forms, or one sized to its content. */
  size?: "full" | "fit"
  /** Phones: classes for the sheet's scroll area (set `[--sheet-px:0px]` for edge-to-edge content). */
  sheetClassName?: string
}) {
  const phone = React.use(PhoneContext)
  const config = React.useMemo<SheetConfig>(() => ({ action, cancelLabel }), [action, cancelLabel])
  if (!phone) {
    return (
      <Desktop.DialogContent className={className} showCloseButton={showCloseButton} {...props}>
        {children}
      </Desktop.DialogContent>
    )
  }
  return (
    <Drawer.Portal>
      <DialogOverlay />
      <Drawer.Content
        data-slot="sheet-content"
        onAnimationEnd={fitAboveKeyboardAfterSlide}
        data-size={size}
        className={cn(
          "safe-bottom fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-surface shadow-pop outline-none",
          size === "full" ? "h-[94dvh]" : "max-h-[94dvh]"
        )}
        {...props}
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1" aria-hidden="true">
          <div className="bg-line-strong h-1.5 w-10 rounded-full" />
        </div>
        <SheetContext value={config}>
          <div
            data-slot="sheet-body"
            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-(--sheet-px) pb-4 [--sheet-px:1rem]", sheetClassName)}
          >
            {children}
          </div>
        </SheetContext>
      </Drawer.Content>
    </Drawer.Portal>
  )
}

const barButtonClass =
  "pressable text-brand flex min-h-11 items-center rounded-lg px-2 text-[15px] whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"

/**
 * Desktop: the title block. Phones: the sheet's top bar, stuck to the top of the scroll area, with
 * Cancel on the left, the title centred, the action on the right, and the description (or any
 * other child placed in `row-start-2`) across the full width below.
 */
function DialogHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  const phone = React.use(PhoneContext)
  const { action, cancelLabel } = React.use(SheetContext)
  if (!phone) {
    return (
      <Desktop.DialogHeader className={className} {...props}>
        {children}
      </Desktop.DialogHeader>
    )
  }
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "bg-surface sticky top-0 z-10 -mx-(--sheet-px) grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-2 pb-1",
        className
      )}
      {...props}
    >
      <Drawer.Close asChild>
        <button type="button" className={cn(barButtonClass, "col-start-1 row-start-1 justify-self-start")}>
          {cancelLabel}
        </button>
      </Drawer.Close>
      {children}
      {action ? (
        <button
          type={action.form || action.type === "submit" ? "submit" : "button"}
          form={action.form}
          disabled={action.disabled}
          onClick={action.onClick}
          className={cn(barButtonClass, "col-start-3 row-start-1 justify-self-end font-semibold")}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}

function DialogFooter({
  className,
  showCloseButton,
  children,
  ...props
}: React.ComponentProps<typeof Desktop.DialogFooter>) {
  const phone = React.use(PhoneContext)
  const { action } = React.use(SheetContext)
  if (!phone) {
    return (
      <Desktop.DialogFooter className={className} showCloseButton={showCloseButton} {...props}>
        {children}
      </Desktop.DialogFooter>
    )
  }
  // The primary action lives in the top bar; the rest of the footer (Cancel) is covered too.
  if (action) return null
  return (
    <div
      data-slot="sheet-footer"
      className={cn("bg-surface sticky bottom-0 z-10 -mx-(--sheet-px) mt-auto flex justify-end gap-2 border-t px-4 py-3", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof Desktop.DialogTitle>) {
  const phone = React.use(PhoneContext)
  if (!phone) return <Desktop.DialogTitle className={className} {...props} />
  return (
    <Drawer.Title
      data-slot="dialog-title"
      className={cn("col-start-2 row-start-1 min-w-0 truncate text-center text-[17px] font-semibold tracking-[-0.015em]", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof Desktop.DialogDescription>) {
  const phone = React.use(PhoneContext)
  if (!phone) return <Desktop.DialogDescription className={className} {...props} />
  return (
    <Drawer.Description
      data-slot="dialog-description"
      className={cn("col-span-full row-start-2 px-2 pb-2 text-center text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  useIsPhoneDialog,
}
