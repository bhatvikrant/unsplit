import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Heart, House, Plane, Users } from "lucide-react";

const sizes = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-[15px]", xl: "size-20 text-xl" };

export function hue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Soft tinted background + readable ink for a hue, in both colour schemes. */
export function tint(h: number): React.CSSProperties {
  return {
    background: `light-dark(oklch(0.91 0.06 ${h}), oklch(0.31 0.06 ${h}))`,
    color: `light-dark(oklch(0.4 0.12 ${h}), oklch(0.86 0.1 ${h}))`,
  };
}

export function UserAvatar({ user, size = "md", className }: { user: { name: string; image?: string | null; isPlaceholder?: boolean }; size?: keyof typeof sizes; className?: string }) {
  return (
    <Avatar className={cn(sizes[size], "shrink-0", className)} title={user.name}>
      {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
      <AvatarFallback className="font-semibold" style={tint(hue(user.name))}>
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

const typeIcon = { home: House, trip: Plane, couple: Heart, other: Users } as const;
const tileRadius = { xs: "rounded-[7px]", sm: "rounded-lg", md: "rounded-xl", lg: "rounded-[14px]", xl: "rounded-[20px]" };

export function GroupAvatar({ group, size = "md", className }: { group: { name: string; type: keyof typeof typeIcon; coverUrl?: string | null }; size?: keyof typeof sizes; className?: string }) {
  const Icon = typeIcon[group.type] ?? Users;
  return (
    <div
      className={cn(sizes[size], tileRadius[size], "flex shrink-0 items-center justify-center overflow-hidden", className)}
      style={group.coverUrl ? undefined : tint(hue(group.name))}
      aria-hidden
    >
      {group.coverUrl ? <img src={group.coverUrl} alt="" className="size-full object-cover" /> : <Icon className="size-[52%]" strokeWidth={1.75} />}
    </div>
  );
}

export const GROUP_TYPE_LABELS: Record<keyof typeof typeIcon, string> = { home: "Home", trip: "Trip", couple: "Couple", other: "Other" };
