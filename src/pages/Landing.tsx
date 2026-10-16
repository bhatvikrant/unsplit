import { motion } from "framer-motion";
import { ArrowRight, Calculator, Globe, Receipt, Repeat, ScanLine, Users } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Users, title: "Groups and friends", body: "Trips, flats, couples, one-offs. Every balance in one place." },
  { icon: Calculator, title: "Split any way", body: "Equally, by exact amounts, percentages, shares, adjustments or item by item." },
  { icon: Repeat, title: "Recurring bills", body: "Rent, internet, subscriptions. Set it once, it posts on time." },
  { icon: ScanLine, title: "Scan receipts", body: "Photograph a bill and assign each line to whoever had it." },
  { icon: Globe, title: "Any currency", body: "Balances per currency, and one click to convert a whole trip." },
  { icon: Receipt, title: "Search, charts, export", body: "Find any old bill, see where the money goes, download it all." },
];

export function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo size={28} />
        <nav className="flex items-center gap-2">
          <Button asChild>
            <Link to="/login">Log in</Link>
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5">
        <section className="py-16 sm:py-24">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="text-text max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Shared costs, settled without the spreadsheet.</h1>
            <p className="text-text-muted mt-5 max-w-xl text-lg">
              UnSplit tracks who paid for what and who owes whom, across every group you're in. Every feature is free. No limits, no ads, nothing locked.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/login">
                  Get started <ArrowRight />
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="card p-5"
            >
              <div className="bg-brand-soft text-brand mb-3 flex size-9 items-center justify-center rounded-md">
                <f.icon className="size-4.5" />
              </div>
              <h2 className="text-text font-semibold">{f.title}</h2>
              <p className="text-text-muted mt-1 text-sm">{f.body}</p>
            </motion.div>
          ))}
        </section>
      </main>
      <footer className="text-text-faint mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-10 text-xs">
        <span>UnSplit is open and free. Your data is yours: export it any time.</span>
        <Link to="/privacy" className="hover:underline">Privacy</Link>
      </footer>
    </div>
  );
}
