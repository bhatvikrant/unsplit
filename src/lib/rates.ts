/** Exchange rates the way people write them: the stronger unit first, with the symbol a person would use. */

// Intl's narrow symbol is a bare "$" (or "¥") for every dollar and yuan, so these say which one.
const SYMBOLS: Record<string, string> = {
  AUD: "A$", CAD: "C$", HKD: "HK$", MXN: "MX$", NZD: "NZ$", SGD: "S$", TWD: "NT$", BRL: "R$", ZAR: "R",
  CNY: "CN¥", JPY: "¥", KRW: "₩", INR: "₹", THB: "฿", PHP: "₱", VND: "₫", NGN: "₦", TRY: "₺", ILS: "₪", RUB: "₽", UAH: "₴", PLN: "zł",
};

/** "€" for EUR, "S$" for SGD; the ISO code when there is no symbol a reader would know (AED, CHF). */
export function currencySymbol(code: string, locale = "en-US"): string {
  const c = code.toUpperCase();
  if (SYMBOLS[c]) return SYMBOLS[c];
  try {
    const sym = new Intl.NumberFormat(locale, { style: "currency", currency: c, currencyDisplay: "narrowSymbol" }).formatToParts(1).find((p) => p.type === "currency")?.value;
    if (sym && sym !== c) return sym;
  } catch {
    // unknown code
  }
  return c;
}

/** 96.7, 1.09, 0.0105: enough digits to be useful, none that only look precise. */
export function formatRateNumber(n: number, locale = "en-US"): string {
  const opts: Intl.NumberFormatOptions = n >= 10 ? { maximumFractionDigits: 1 } : n >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 3 };
  return new Intl.NumberFormat(locale, opts).format(n);
}

function amount(symbol: string, n: string): string {
  return /[A-Za-z]$/.test(symbol) ? `${symbol} ${n}` : `${symbol}${n}`;
}

/**
 * `rate` is units of `to` per one unit of `from`. Shows whichever side is worth more as the "1",
 * so INR→USD at 0.0105 reads "$1 = ₹95.2" rather than "1 INR = 0.0105 USD".
 */
export function formatRate(from: string, to: string, rate: number, locale = "en-US"): string {
  if (!(rate > 0) || !Number.isFinite(rate)) return "";
  const [one, many, value] = rate >= 1 ? [from, to, rate] : [to, from, 1 / rate];
  return `${amount(currencySymbol(one, locale), "1")} = ${amount(currencySymbol(many, locale), formatRateNumber(value, locale))}`;
}
