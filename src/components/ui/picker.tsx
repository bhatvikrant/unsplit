"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePhone } from "@/lib/media"
import { cn } from "@/lib/utils"

/**
 * A select that is Radix `Select` from `sm:` up and a native-style picker sheet below it: a
 * 44px trigger showing the chosen value, then a bottom sheet with a scrim, a title, 48px rows,
 * the selected row ticked, section headings, and (with `searchable`) a search field for long lists.
 *
 * Children are `PickerGroup` / `PickerLabel` / `PickerSeparator` / `PickerItem`, which render as
 * the matching Select parts on desktop and as sheet rows on phones.
 */

type Mode = "select" | "sheet"
const ModeContext = React.createContext<Mode>("select")

type SheetState = {
  value: string
  select: (value: string) => void
}
const SheetContext = React.createContext<SheetState | null>(null)

export type PickerItemProps = {
  value: string
  /** The label; also what the trigger shows once chosen. */
  children: React.ReactNode
  /** Faint text at the row's right (a count, a symbol); not part of the chosen value in the trigger. */
  meta?: React.ReactNode
  /** Icon or avatar at the row's left; shown in the trigger too. */
  icon?: React.ReactNode
  /** Extra words the search field matches on top of the label text. */
  keywords?: string
  disabled?: boolean
  className?: string
}

function PickerItem({ value, children, meta, icon, disabled, className }: PickerItemProps) {
  const mode = React.useContext(ModeContext)
  const sheet = React.useContext(SheetContext)
  const selected = sheet?.value === value

  if (mode === "select") {
    return (
      <SelectItem value={value} meta={meta} disabled={disabled} className={className}>
        {icon ? (
          <span className="flex items-center gap-2">
            {icon}
            {children}
          </span>
        ) : (
          children
        )}
      </SelectItem>
    )
  }
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      data-slot="picker-item"
      data-selected={selected || undefined}
      onClick={() => sheet?.select(value)}
      className={cn(
        "text-text active:bg-surface-2 flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] outline-none select-none disabled:opacity-50",
        "border-line border-b last:border-b-0",
        selected && "font-medium",
        className,
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-text-muted">{children}</span>
      {meta !== undefined && meta !== null ? <span className="tnum text-text-faint shrink-0 text-sm">{meta}</span> : null}
      <span className="flex size-5 shrink-0 items-center justify-center">{selected ? <CheckIcon className="text-brand size-5" strokeWidth={2.5} /> : null}</span>
    </button>
  )
}

function PickerGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  const mode = React.useContext(ModeContext)
  if (mode === "select") return <SelectGroup className={className}>{children}</SelectGroup>
  return (
    <div role="group" data-slot="picker-group" className={cn("border-line border-b last:border-b-0", className)}>
      {children}
    </div>
  )
}

function PickerLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  const mode = React.useContext(ModeContext)
  if (mode === "select") return <SelectLabel className={className}>{children}</SelectLabel>
  return (
    <div data-slot="picker-label" className={cn("text-text-muted bg-surface sticky top-0 z-10 px-4 pt-3 pb-1.5 text-xs font-semibold", className)}>
      {children}
    </div>
  )
}

function PickerSeparator({ className }: { className?: string }) {
  const mode = React.useContext(ModeContext)
  if (mode === "select") return <SelectSeparator className={className} />
  return <div role="separator" data-slot="picker-separator" className={cn("bg-surface-2 h-2", className)} />
}

/* ---------- walking the children: the trigger label, and the flat list a search filters ---------- */

type Entry = { value: string; label: React.ReactNode; icon?: React.ReactNode; meta?: React.ReactNode; text: string; disabled?: boolean; className?: string }

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(" ")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function collect(node: React.ReactNode, out: Entry[]) {
  if (node == null || typeof node === "boolean") return
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out)
    return
  }
  if (!React.isValidElement(node)) return
  if (node.type === PickerItem) {
    const p = node.props as PickerItemProps
    out.push({ value: p.value, label: p.children, icon: p.icon, meta: p.meta, disabled: p.disabled, className: p.className, text: `${textOf(p.children)} ${p.keywords ?? ""}` })
    return
  }
  collect((node.props as { children?: React.ReactNode }).children, out)
}

function matches(text: string, query: string) {
  const hay = text.toLowerCase().replace(/[_/]/g, " ")
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

/* ---------- the sheet ---------- */

export type PickerSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The button that opens the sheet; rendered as-is with the open handler attached. */
  trigger: React.ReactElement
  title: React.ReactNode
  value?: string
  onValueChange: (value: string) => void
  /** Adds a search field at the top for long lists; matching rows show as one flat list. */
  searchable?: boolean
  searchPlaceholder?: string
  /** Default true: choosing a row closes the sheet. False keeps it open with a Done button (the repeat picker). */
  closeOnSelect?: boolean
  /** Below the list, inside the sheet (the repeat picker's reminder checkbox). */
  footer?: React.ReactNode
  children: React.ReactNode
}

function PickerSheet({ open, onOpenChange, trigger, title, value = "", onValueChange, searchable, searchPlaceholder = "Search", closeOnSelect = true, footer, children }: PickerSheetProps) {
  const [query, setQuery] = React.useState("")
  const state = React.useMemo<SheetState>(
    () => ({
      value,
      select: (v) => {
        onValueChange(v)
        if (closeOnSelect) onOpenChange(false)
      },
    }),
    [value, onValueChange, closeOnSelect, onOpenChange],
  )
  // Centre the chosen row when the list mounts, i.e. the sheet opens (the time-zone list is 400+
  // rows), scrolling the list only, never the page. A callback ref: the portal's DOM exists by then.
  const listRef = React.useCallback((list: HTMLDivElement | null) => {
    const el = list?.querySelector<HTMLElement>("[data-selected]")
    if (!list || !el) return
    const top = el.offsetTop - list.offsetTop
    if (top + el.offsetHeight > list.clientHeight) list.scrollTop = top - list.clientHeight / 2 + el.offsetHeight / 2
  }, [])
  const q = query.trim()
  const filtered = React.useMemo(() => {
    if (!q) return null
    const all: Entry[] = []
    collect(children, all)
    return all.filter((e) => matches(e.text, q))
  }, [children, q])

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery("")
        onOpenChange(o)
      }}
    >
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className={cn(searchable && "h-[88dvh]")}>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {closeOnSelect ? null : (
            <DrawerClose asChild>
              <button type="button" className="text-brand -mr-2 min-h-11 px-2 text-[15px] font-semibold select-none">
                Done
              </button>
            </DrawerClose>
          )}
        </DrawerHeader>
        <DrawerDescription className="sr-only">Choose one.</DrawerDescription>
        {searchable ? (
          <div className="px-4 pb-2">
            <div className="bg-surface-2 flex h-11 items-center gap-2 rounded-[10px] px-3">
              <SearchIcon className="text-text-faint size-4 shrink-0" />
              <input
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="text-text placeholder:text-text-faint h-full min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </div>
          </div>
        ) : null}
        <ModeContext.Provider value="sheet">
          <SheetContext.Provider value={state}>
            <div ref={listRef} role="listbox" aria-label={typeof title === "string" ? title : undefined} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", !footer && "safe-bottom pb-2")}>
              {filtered ? (
                filtered.length === 0 ? (
                  <p className="text-text-muted px-4 py-8 text-center text-sm">No match.</p>
                ) : (
                  filtered.map((e) => (
                    <PickerItem key={e.value} value={e.value} icon={e.icon} meta={e.meta} disabled={e.disabled} className={e.className}>
                      {e.label}
                    </PickerItem>
                  ))
                )
              ) : (
                children
              )}
            </div>
          </SheetContext.Provider>
        </ModeContext.Provider>
        {footer ? <div className="safe-bottom border-line border-t px-4 pt-3 pb-4">{footer}</div> : null}
      </DrawerContent>
    </Drawer>
  )
}

/* ---------- the Select-compatible picker ---------- */

export type PickerProps = {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Sheet title; falls back to the aria-label, then the placeholder. */
  title?: string
  searchable?: boolean
  searchPlaceholder?: string
  /** Applied to the trigger in both modes. The phone trigger keeps its 44px minimum regardless. */
  className?: string
  id?: string
  "aria-label"?: string
  children: React.ReactNode
}

function Picker({ value = "", onValueChange, placeholder, disabled, title, searchable, searchPlaceholder, className, id, "aria-label": ariaLabel, children }: PickerProps) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)

  if (!phone) {
    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <ModeContext.Provider value="select">{children}</ModeContext.Provider>
        </SelectContent>
      </Select>
    )
  }

  const entries: Entry[] = []
  collect(children, entries)
  const chosen = value ? entries.find((e) => e.value === value) : undefined
  const sheetTitle = title ?? ariaLabel ?? placeholder ?? "Choose"

  return (
    <PickerSheet
      open={open}
      onOpenChange={setOpen}
      title={sheetTitle}
      value={value}
      onValueChange={onValueChange}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      trigger={
        <button
          type="button"
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          data-slot="picker-trigger"
          data-placeholder={chosen ? undefined : ""}
          className={cn(
            "bg-surface shadow-ring text-text active:bg-surface-2 flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-base outline-none select-none focus-visible:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
            !chosen && "text-text-faint",
            className,
            "min-h-11",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
            {chosen?.icon}
            <span className="flex min-w-0 items-center gap-2 truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-text-muted">{chosen ? chosen.label : placeholder}</span>
          </span>
          <ChevronDownIcon className="text-text-faint size-4 shrink-0" />
        </button>
      }
    >
      {children}
    </PickerSheet>
  )
}

export { Picker, PickerGroup, PickerItem, PickerLabel, PickerSeparator, PickerSheet }
