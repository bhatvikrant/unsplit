/**
 * Expenses handed over by UnMoney (github.com/bhatvikrant/unmoney). It opens /expenses/new with
 * the entries in the URL hash, the add-expense form starts from them, and once the expense is
 * saved the browser goes back to UnMoney with the expense's id, so its entries can link to it.
 * The hash never reaches a server. Between landing and the dialog the payload waits in
 * sessionStorage, because signing in with Google leaves and re-enters the app on the way.
 */
import { currencyDecimals, minorToDecimalString } from "@convex/lib/money";

export const UNMONEY_URL = ((import.meta.env.VITE_UNMONEY_URL as string | undefined) || "https://unmoney.vercel.app").replace(/\/$/, "");

/** Amounts are decimal strings in major units ("1234.50"); the date is an ISO day. */
export type HandoffItem = { ref: string; name: string; amount: string };
export type Handoff = {
  v: 1;
  source: "unmoney";
  /** UnMoney's ids of the entries, sent back with the expense so they can be linked to it. */
  refs: string[];
  description: string;
  notes?: string;
  currency: string;
  date: string;
  amount: string;
  /** UnMoney's category name, to guess ours from. */
  category?: string;
  /** More than one entry: one line each, for an itemised split. */
  items?: HandoffItem[];
};

/** base64url of the JSON, UTF-8 safe. */
export function encodePayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePayload<T>(text: string): T | null {
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as T;
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : null);
const MAX_ITEMS = 200;

/** The handoff in a /expenses/new hash, checked field by field; null when it is not one. */
export function parseHandoff(hash: string): Handoff | null {
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get("unmoney");
  const p = raw ? decodePayload<Record<string, unknown>>(raw) : null;
  if (!p || p.v !== 1 || p.source !== "unmoney") return null;
  if (!Array.isArray(p.refs) || !p.refs.length || !p.refs.every((r) => typeof r === "string" && r)) return null;
  const description = str(p.description, 200);
  const currency = str(p.currency, 8)?.toUpperCase();
  const date = str(p.date, 10);
  const amount = str(p.amount, 32);
  if (description === null || !currency || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !amount) return null;
  const h: Handoff = { v: 1, source: "unmoney", refs: p.refs as string[], description, currency, date, amount };
  const notes = str(p.notes, 2000);
  if (notes) h.notes = notes;
  const category = str(p.category, 100);
  if (category) h.category = category;
  if (p.items !== undefined) {
    if (!Array.isArray(p.items) || p.items.length > MAX_ITEMS) return null;
    const items: HandoffItem[] = [];
    for (const it of p.items as Record<string, unknown>[]) {
      const ref = str(it?.ref, 64);
      const name = str(it?.name, 200);
      const amt = str(it?.amount, 32);
      if (!ref || name === null || !amt) return null;
      items.push({ ref, name: name || "Item", amount: amt });
    }
    if (items.length) h.items = items;
  }
  return h;
}

/** An amount from UnMoney as our form writes it, in the currency's decimals; "" when it is not a number. */
export function amountText(text: string, currency: string): string {
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return "";
  return minorToDecimalString(Math.round(n * 10 ** currencyDecimals(currency)), currency);
}

const KEY = "unsplit.handoff";
/** A handoff older than this is dropped rather than popping up a form the user has forgotten about. */
const TTL = 60 * 60 * 1000;

export function stashHandoff(h: Handoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), handoff: h }));
  } catch {
    /* private mode or storage off: the dialog just will not open on its own */
  }
}

/** The waiting handoff, once; nothing when there is none or it is stale. */
export function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const { at, handoff } = JSON.parse(raw) as { at: number; handoff: Handoff };
    return Date.now() - at < TTL ? handoff : null;
  } catch {
    return null;
  }
}

/** Back to UnMoney with the expense that was made, so its entries can link to it. */
export function returnUrl(h: Handoff, expenseId: string): string {
  return `${UNMONEY_URL}/unsplit/return#unsplit=${encodePayload({ v: 1, expenseId, refs: h.refs })}`;
}
