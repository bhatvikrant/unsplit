import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { currencyDecimals } from "./lib/money";

export type ScannedReceipt = {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  items: { name: string; amountMinor: number }[];
  taxMinor: number;
  tipMinor: number;
  discountMinor: number;
  totalMinor: number | null;
};

const PROMPT = `You read receipts. Return ONLY a JSON object (no prose, no code fences) with this shape:
{"merchant": string|null, "date": "YYYY-MM-DD"|null, "currency": ISO-4217 code|null,
 "items": [{"name": string, "amount": number}], "tax": number, "tip": number, "discount": number, "total": number|null}
Rules: amounts are decimal numbers in the receipt's currency (e.g. 12.5). "items" are line items before tax and tip; merge quantity lines into one item with the extended price. "tax" is the sum of all taxes, "tip" any gratuity or service charge, "discount" the sum of discounts or coupons as a positive number. "total" is the final amount paid if printed. If you cannot read a field, use null or 0. Guess the currency from symbols or location when unclear.`;

export const scan = action({
  args: { storageId: v.id("_storage"), fallbackCurrency: v.optional(v.string()) },
  handler: async (ctx, { storageId, fallbackCurrency }): Promise<ScannedReceipt> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You need to be signed in");
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new ConvexError("Receipt scanning isn't set up on this deployment (ANTHROPIC_API_KEY missing)");
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new ConvexError("Receipt image not found");
    if (blob.size > 10 * 1024 * 1024) throw new ConvexError("Receipt image is too large (10 MB max)");
    const type = blob.type || "image/jpeg";
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) throw new ConvexError("Receipts must be a JPEG, PNG, WebP or GIF image");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base64 = btoa(binary);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
        max_tokens: 2048,
        system: PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: type, data: base64 } },
              { type: "text", text: "Extract this receipt as JSON." },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Anthropic error", res.status, text);
      throw new ConvexError(res.status === 401 ? "The Anthropic API key was rejected" : "Receipt scanning failed. Try a clearer photo.");
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const jsonText = text.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText.slice(jsonText.indexOf("{"), jsonText.lastIndexOf("}") + 1));
    } catch {
      throw new ConvexError("Couldn't read that receipt. Try a clearer photo.");
    }
    const currency = (typeof parsed.currency === "string" && parsed.currency.length === 3 ? parsed.currency.toUpperCase() : null) ?? fallbackCurrency ?? "USD";
    const dec = currencyDecimals(currency);
    const toMinor = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10 ** dec) : 0);
    const items = Array.isArray(parsed.items)
      ? (parsed.items as { name?: unknown; amount?: unknown }[])
          .map((it) => ({ name: String(it.name ?? "Item").slice(0, 80), amountMinor: toMinor(it.amount) }))
          .filter((it) => it.amountMinor > 0)
      : [];
    return {
      merchant: typeof parsed.merchant === "string" ? parsed.merchant.slice(0, 120) : null,
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      currency,
      items,
      taxMinor: toMinor(parsed.tax),
      tipMinor: toMinor(parsed.tip),
      discountMinor: toMinor(parsed.discount),
      totalMinor: typeof parsed.total === "number" ? toMinor(parsed.total) : null,
    };
  },
});
