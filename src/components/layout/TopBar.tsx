import { Menu, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { SidebarContent } from "./Sidebar";
import { UserMenu } from "./UserMenu";

/**
 * Top row of the main column. On desktop it is just the search field; on
 * phones it also carries the menu button that opens the navigation sheet.
 */
export function TopBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/expenses?q=${encodeURIComponent(q.trim())}` : "/expenses");
  };

  return (
    <header className="mb-5 flex items-center gap-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[288px] flex-col gap-4 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="px-2 py-1.5">
            <Logo />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
          <UserMenu onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link to="/dashboard" className="shrink-0 lg:hidden" aria-label="UnSplit home">
        <Logo wordmark={false} />
      </Link>

      <form onSubmit={submit} className="hidden w-full max-w-sm sm:block" role="search">
        <label className="relative block">
          <span className="sr-only">Search expenses</span>
          <Search className="text-text-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search expenses"
            className="bg-surface shadow-card text-text placeholder:text-text-faint focus-visible:ring-ring h-9 w-full rounded-[10px] pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
          />
        </label>
      </form>

      <Button variant="outline" size="icon" className="ml-auto sm:hidden" aria-label="Search" onClick={() => navigate("/expenses")}>
        <Search />
      </Button>
    </header>
  );
}
