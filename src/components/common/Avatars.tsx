import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Heart, House, Plane, Users } from "lucide-react";

const sizes = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-base", xl: "size-20 text-xl" };

function hue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function UserAvatar({ user, size = "md", className }: { user: { name: string; image?: string | null; isPlaceholder?: boolean }; size?: keyof typeof sizes; className?: string }) {
  const h = hue(user.name);
  return (
    <Avatar className={cn(sizes[size], "shrink-0", className)} title={user.name}>
      {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
      <AvatarFallback
        className="font-semibold"
        style={{ background: `oklch(0.92 0.06 ${h})`, color: `oklch(0.38 0.12 ${h})` }}
      >
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

const typeIcon = { home: House, trip: Plane, couple: Heart, other: Users } as const;

export function GroupAvatar({ group, size = "md", className }: { group: { name: string; type: keyof typeof typeIcon; coverUrl?: string | null }; size?: keyof typeof sizes; className?: string }) {
  const Icon = typeIcon[group.type] ?? Users;
  const h = hue(group.name);
  return (
    <div
      className={cn(sizes[size], "flex shrink-0 items-center justify-center overflow-hidden rounded-md", className)}
      style={group.coverUrl ? undefined : { background: `oklch(0.93 0.05 ${h})`, color: `oklch(0.4 0.12 ${h})` }}
      aria-hidden
    >
      {group.coverUrl ? <img src={group.coverUrl} alt="" className="size-full object-cover" /> : <Icon className="size-[55%]" />}
    </div>
  );
}

export const GROUP_TYPE_LABELS: Record<keyof typeof typeIcon, string> = { home: "Home", trip: "Trip", couple: "Couple", other: "Other" };
