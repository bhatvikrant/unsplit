import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  /** Label of the confirming button. */
  action?: string;
  /** Label of the cancelling button. */
  cancel?: string;
  /** Destructive by default: nearly every caller is a delete or something just as final. */
  destructive?: boolean;
};

type Confirm = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<Confirm | null>(null);

/** Destructive actions ask first, in the app's own modal: `if (!(await confirm({ title: "Delete X?" }))) return;` */
export function useConfirm(): Confirm {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return c;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  const confirm = useCallback<Confirm>((o) => {
    // A second question while one is open answers the first with "no".
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {/*
        The other modals are bottom sheets on phones (ui/responsive-dialog.tsx); this one stays a
        centred alert everywhere, on purpose. It is the native pattern for a destructive question
        (iOS and Android both use a centred alert, not a sheet, for "Delete?"), it cannot be
        swiped away by accident mid-question, it never has to stack on top of an open sheet, and
        its two buttons are already full-width tap targets side by side.
      */}
      <AlertDialog open={!!opts} onOpenChange={(o) => !o && settle(false)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description ? <AlertDialogDescription>{opts.description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{opts?.cancel ?? "Cancel"}</AlertDialogCancel>
            <AlertDialogAction variant={opts?.destructive === false ? "default" : "destructive"} onClick={() => settle(true)}>
              {opts?.action ?? "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}
