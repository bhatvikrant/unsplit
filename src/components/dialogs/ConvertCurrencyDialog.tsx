import { useAction, useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Money } from "@/components/common/Money";
import { Field } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/format";
import { useDefaultCurrency } from "@/lib/hooks";
import { CurrencyPicker } from "./pickers";

export type ConvertOptions = { groupId?: Id<"groups">; friendId?: Id<"users"> };

type Preview = Awaited<ReturnType<ReturnType<typeof useAction<typeof api.rates.preview>>>>;

export function ConvertCurrencyDialog({ options, onClose }: { options: ConvertOptions; onClose: () => void }) {
  const defaultCurrency = useDefaultCurrency();
  const preview = useAction(api.rates.preview);
  const apply = useMutation(api.rates.apply);
  const [target, setTarget] = useState(defaultCurrency);
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(null);
    preview({ ...options, target })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const convertible = data?.lines.filter((l) => l.rate !== null) ?? [];
  const total = convertible.reduce((a, l) => a + (l.convertedMinor ?? 0), 0);

  const run = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const rates = Object.fromEntries(convertible.map((l) => [l.currency, l.rate as number]));
      const n = await apply({ ...options, target, rates });
      toast.success(`Converted ${n} expense${n === 1 ? "" : "s"} to ${target}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to one currency</DialogTitle>
          <DialogDescription>Every expense here, including settled ones, is rewritten at today's rate. Everyone sees the converted amounts. The original amounts stay on each expense.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <Field label="Convert everything to">
            <CurrencyPicker value={target} onChange={setTarget} />
          </Field>
          {loading ? (
            <div className="text-text-muted flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Fetching rates…
            </div>
          ) : error ? (
            <p className="text-danger text-sm">{error}</p>
          ) : data && data.lines.length === 0 ? (
            <p className="text-text-muted text-sm">Everything here is already in {target}. Nothing to convert.</p>
          ) : data ? (
            <div className="space-y-2">
              <ul className="divide-y rounded-md border text-sm">
                {data.lines.map((l) => (
                  <li key={l.currency} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>
                      <span className="font-medium">{l.currency}</span> <span className="text-text-muted">· {l.count} expense{l.count === 1 ? "" : "s"}</span>
                    </span>
                    {l.rate ? (
                      <span className="text-right">
                        <Money minor={l.amountMinor} currency={l.currency} className="text-text-muted" /> → <Money minor={l.convertedMinor ?? 0} currency={target} className="font-medium" />
                        <span className="text-text-faint block text-xs">1 {l.currency} = {l.rate.toFixed(4)} {target}</span>
                      </span>
                    ) : (
                      <span className="text-warning text-xs">no rate available</span>
                    )}
                  </li>
                ))}
              </ul>
              {data.unsupported.length > 0 ? <p className="text-text-muted text-xs">No rate for {data.unsupported.join(", ")}. Those expenses stay as they are.</p> : null}
              {convertible.length > 0 ? (
                <p className="text-text-muted text-xs">
                  Rates from the European Central Bank via Frankfurter. Converted total: <Money minor={total} currency={target} className="font-medium" />.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="mt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void run()} disabled={busy || loading || convertible.length === 0}>
            {busy ? "Converting…" : `Convert to ${target}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
