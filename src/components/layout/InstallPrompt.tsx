import { Share, Smartphone, SquarePlus, X } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Section } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstall, useInstallNudge } from "@/lib/install";
import { Logo } from "./Logo";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="bg-brand-soft text-brand-ink flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{n}</span>
      <span className="text-text pt-0.5 text-sm">{children}</span>
    </li>
  );
}

/** The iOS route: there is no install API, so walk the user through the Share menu. */
export function AddToHomeScreenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add UnSplit to your Home Screen</DialogTitle>
          <DialogDescription>It opens full screen like any other app and keeps working without a connection.</DialogDescription>
        </DialogHeader>
        <ol className="mt-2 space-y-3">
          <Step n={1}>
            Tap <Share className="mx-0.5 inline size-4 align-text-bottom" aria-hidden="true" /> <b>Share</b> in the browser toolbar.
          </Step>
          <Step n={2}>
            Scroll down and tap <SquarePlus className="mx-0.5 inline size-4 align-text-bottom" aria-hidden="true" /> <b>Add to Home Screen</b>.
          </Step>
          <Step n={3}>
            Tap <b>Add</b>. UnSplit now has its own icon.
          </Step>
        </ol>
      </DialogContent>
    </Dialog>
  );
}

/** Opens the browser's install dialog, or the iOS steps where there is none. Renders nothing elsewhere. */
export function InstallButton({ children = "Install", ...props }: ComponentProps<typeof Button>) {
  const { canPrompt, manual, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (!canPrompt && !manual) return null;
  return (
    <>
      <Button {...props} onClick={() => (canPrompt ? void install() : setHelp(true))}>
        {children}
      </Button>
      {manual ? <AddToHomeScreenDialog open={help} onOpenChange={setHelp} /> : null}
    </>
  );
}

/** One-line nudge above the page on phones that have not installed the app yet. */
export function InstallBanner() {
  const { installed, canPrompt, manual } = useInstall();
  const [dismissed, dismiss] = useInstallNudge();
  if (installed || dismissed || (!canPrompt && !manual)) return null;
  return (
    <div className="card mb-4 flex items-center gap-3 p-3 lg:hidden" data-testid="install-banner">
      <Logo wordmark={false} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-text text-sm font-medium">Get the app</div>
        <div className="text-text-muted text-xs">Add UnSplit to your home screen. Full screen, works offline.</div>
      </div>
      <InstallButton size="sm" />
      <Button variant="ghost" size="icon" aria-label="Not now" onClick={dismiss}>
        <X />
      </Button>
    </div>
  );
}

/** Account page card: install from here, or see that it already is. */
export function InstallSection() {
  const { installed, canPrompt, manual } = useInstall();
  // Browsers with no install route (desktop Safari, Firefox) get nothing to click.
  if (!installed && !canPrompt && !manual) return null;
  return (
    <Section title="App">
      <div className="flex items-center gap-3 p-4">
        <Smartphone className="text-text-faint size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-text text-sm font-medium">{installed ? "Installed on this device" : "Install on this device"}</div>
          <div className="text-text-muted text-xs">
            {installed ? "UnSplit runs from your home screen and keeps working offline." : "Add UnSplit to your home screen for a full-screen app that works offline."}
          </div>
        </div>
        {!installed ? <InstallButton variant="outline" size="sm" /> : null}
      </div>
    </Section>
  );
}
