import BoringAvatar from "boring-avatars";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Heart, House, Plane, Users } from "lucide-react";

const sizes = { xs: "size-6", sm: "size-8", md: "size-10", lg: "size-12", xl: "size-20" };

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

/** Warm palette matching the app theme: forest, brand green, cream, apricot, brick. */
const AVATAR_PALETTE = ["#14543b", "#3fb47a", "#f3ecd6", "#f0a868", "#cf5c4a"];

type AvatarUser = { _id?: string; name: string; image?: string | null; isPlaceholder?: boolean };

/** Deterministic generated avatar (boring-avatars "beam"), seeded by user id so same-named users differ. */
export function GeneratedAvatar({ user, className }: { user: AvatarUser; className?: string }) {
  return <BoringAvatar name={user._id ?? user.name} variant="beam" colors={AVATAR_PALETTE} size="100%" className={cn("size-full", className)} />;
}

export function UserAvatar({ user, size = "md", className }: { user: AvatarUser; size?: keyof typeof sizes; className?: string }) {
  return (
    <Avatar className={cn(sizes[size], "shrink-0", className)} title={user.name}>
      {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
      <AvatarFallback className="bg-transparent" aria-label={user.name}>
        <GeneratedAvatar user={user} />
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
