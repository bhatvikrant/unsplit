import { Share, Smartphone, SquarePlus, X, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Section } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstall, useInstallNudge } from "@/lib/install";
import { Logo } from "./Logo";

function Step({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="bg-surface-2 flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="text-text-muted size-5" aria-hidden="true" />
      </span>
      <span className="text-text text-sm">{children}</span>
    </li>
  );
}

/** The iOS route: there is no install API, so walk the user through the Share menu. */
export function AddToHomeScreenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Install UnSplit</DialogTitle>
          <DialogDescription>It then opens from your home screen like any other app, and works without a connection.</DialogDescription>
        </DialogHeader>
        <ol className="mt-2 space-y-4">
          <Step icon={Share}>
            Tap <b>Share</b> in the browser's toolbar.
          </Step>
          <Step icon={SquarePlus}>
            Scroll down and choose <b>Add to Home Screen</b>, then tap <b>Add</b>.
          </Step>
        </ol>
        <p className="text-text-faint mt-2 text-xs">On iPhone and iPad this works in Safari, and in Chrome or Edge on iOS 16.4 and later.</p>
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
          <div className="text-text text-sm font-medium">{installed ? "Installed on this device" : "Install app"}</div>
          <div className="text-text-muted text-xs">
            {installed ? "UnSplit runs from your home screen and keeps working offline." : "Opens full screen from your home screen and works offline."}
          </div>
        </div>
        {!installed ? (
          <InstallButton variant="outline" size="sm">
            {manual ? "How?" : "Install"}
          </InstallButton>
        ) : null}
      </div>
    </Section>
  );
}
