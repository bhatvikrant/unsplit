import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { CATEGORY_GROUPS, categoryBySlug } from "@convex/lib/categories";
import { CURRENCIES, currencySymbol } from "@convex/lib/currencies";
import { CategoryIcon } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PickerGroup, PickerItem, PickerLabel, PickerSheet } from "@/components/ui/picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePhone } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Searchable currency list: a Command popover on desktop, a picker sheet with search on phones. */
export function CurrencyPicker({ value, onChange, className, compact }: { value: string; onChange: (code: string) => void; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  if (phone) {
    return (
      <PickerSheet
        open={open}
        onOpenChange={setOpen}
        title="Currency"
        value={value}
        onValueChange={onChange}
        searchable
        searchPlaceholder="Search currencies"
        trigger={
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={`Currency: ${value}`} className={cn("shadow-ring h-11 justify-between font-medium select-none", compact ? "w-[84px] px-2" : "w-[120px]", className)}>
            <span className="tnum">{compact ? value : `${currencySymbol(value)} ${value}`}</span>
            <ChevronsUpDown className="text-text-faint size-3.5" />
          </Button>
        }
      >
        {CURRENCIES.map((c) => (
          <PickerItem key={c.code} value={c.code} keywords={c.name} meta={c.symbol}>
            <span className="tnum w-12 shrink-0 font-medium">{c.code}</span>
            <span className="text-text-muted truncate">{c.name}</span>
          </PickerItem>
        ))}
      </PickerSheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={`Currency: ${value}`} className={cn("shadow-ring justify-between font-medium", compact ? "w-[84px] px-2" : "w-[120px]", className)}>
          <span className="tnum">{compact ? value : `${currencySymbol(value)} ${value}`}</span>
          <ChevronsUpDown className="text-text-faint size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currency…" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {CURRENCIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.name}`}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                >
                  <span className="w-10 font-medium">{c.code}</span>
                  <span className="text-text-muted truncate">{c.name}</span>
                  <span className="text-text-faint ml-auto">{c.symbol}</span>
                  {c.code === value ? <Check className="ml-1 size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Grouped category list with icon tiles: a Command popover on desktop, a picker sheet with search on phones. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const cat = categoryBySlug(value);
  if (phone) {
    return (
      <PickerSheet
        open={open}
        onOpenChange={setOpen}
        title="Category"
        value={value}
        onValueChange={onChange}
        searchable
        searchPlaceholder="Search categories"
        trigger={
          <Button type="button" variant="outline" size="icon-lg" role="combobox" aria-expanded={open} aria-label={`Category: ${cat.name}`} title={cat.name} className="size-11 p-0 select-none">
            <CategoryIcon slug={value} size="md" className="bg-transparent" />
          </Button>
        }
      >
        {CATEGORY_GROUPS.map((g) => (
          <PickerGroup key={g.slug}>
            <PickerLabel>{g.name}</PickerLabel>
            {g.children.map((c) => (
              <PickerItem key={c.slug} value={c.slug} keywords={g.name} icon={<CategoryIcon slug={c.slug} size="sm" />}>
                {c.name}
              </PickerItem>
            ))}
          </PickerGroup>
        ))}
      </PickerSheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon-lg" aria-label={`Category: ${cat.name}`} title={cat.name} className="p-0">
          <CategoryIcon slug={value} size="md" className="bg-transparent" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No match.</CommandEmpty>
            {CATEGORY_GROUPS.map((g) => (
              <CommandGroup key={g.slug} heading={g.name}>
                {g.children.map((c) => (
                  <CommandItem
                    key={c.slug}
                    value={`${g.name} ${c.name}`}
                    onSelect={() => {
                      onChange(c.slug);
                      setOpen(false);
                    }}
                  >
                    <CategoryIcon slug={c.slug} size="sm" />
                    <span>{c.name}</span>
                    {c.slug === value ? <Check className="ml-auto size-4" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
