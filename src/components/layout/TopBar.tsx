import { useAuthActions } from "@convex-dev/auth/react";
import { ChevronDown, Menu, Search, Settings, LogOut, Trash2, BarChart3, Repeat } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { UserAvatar } from "@/components/common/Avatars";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMe } from "@/lib/hooks";
import { Logo } from "./Logo";
import { SidebarContent } from "./Sidebar";

export function TopBar() {
  const me = useMe();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/expenses?q=${encodeURIComponent(q.trim())}` : "/expenses");
  };

  return (
    <header className="bg-bg/90 sticky top-0 z-30 h-14 border-b backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1200px] items-center gap-3 px-3 sm:px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] px-3 py-5">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="mb-4 px-2.5">
              <Logo />
            </div>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <Link to="/dashboard" className="shrink-0" aria-label="Unsplit home">
          <Logo />
        </Link>

        <form onSubmit={submit} className="mx-auto hidden w-full max-w-md sm:block" role="search">
          <label className="relative block">
            <span className="sr-only">Search expenses</span>
            <Search className="text-text-faint pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search expenses"
              className="bg-surface focus-visible:ring-ring/50 h-9 w-full rounded-md pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => navigate("/expenses")}>
            <Search />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-1.5">
                {me ? <UserAvatar user={me} size="sm" /> : <span className="bg-surface size-8 rounded-full" />}
                <span className="hidden max-w-[140px] truncate text-sm md:inline">{me?.name}</span>
                <ChevronDown className="text-text-faint size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal">
                <div className="text-text truncate font-medium">{me?.name}</div>
                <div className="text-text-muted truncate text-xs">{me?.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/account")}>
                <Settings /> Account settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/charts")}>
                <BarChart3 /> Spending charts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/expenses/recurring")}>
                <Repeat /> Recurring expenses
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/trash")}>
                <Trash2 /> Deleted items
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut().then(() => navigate("/"))}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
