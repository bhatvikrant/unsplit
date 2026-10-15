/**
 * Money helpers. Every amount in the system is an integer in the currency's
 * minor unit (cents for USD, yen for JPY, fils for BHD). Never a float.
 */

const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX",
  "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyDecimals(code: string): number {
  const c = code.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/** "12.34" -> 1234 for a 2-decimal currency. Returns null on bad input. */
export function parseMoney(text: string, currency: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const decimals = currencyDecimals(currency);
  const negative = cleaned.startsWith("-");
  const [wholeRaw, fracRaw = ""] = cleaned.replace("-", "").split(".");
  if (fracRaw.length > decimals) return null;
  const whole = wholeRaw === "" ? 0 : Number(wholeRaw);
  const frac = Number((fracRaw + "0".repeat(decimals)).slice(0, decimals) || "0");
  const minor = whole * 10 ** decimals + frac;
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** 1234 -> "12.34" (no symbol). */
export function minorToDecimalString(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  if (decimals === 0) return sign + String(abs);
  const whole = Math.floor(abs / 10 ** decimals);
  const frac = String(abs % 10 ** decimals).padStart(decimals, "0");
  return `${sign}${whole}.${frac}`;
}

/** 1234 -> "$12.34" using Intl. Falls back to code when the symbol is unknown. */
export function formatMoney(
  minor: number,
  currency: string,
  opts: { locale?: string; signDisplay?: "auto" | "never" | "always" | "exceptZero" } = {},
): string {
  const decimals = currencyDecimals(currency);
  const value = minor / 10 ** decimals;
  try {
    return new Intl.NumberFormat(opts.locale ?? "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay: opts.signDisplay ?? "auto",
    }).format(value);
  } catch {
    return `${currency} ${minorToDecimalString(minor, currency)}`;
  }
}

/**
 * Split `total` across `weights` with largest-remainder rounding. Deterministic:
 * ties go to the earlier index. The result always sums to `total` exactly.
 * Zero or negative weights get 0. If all weights are 0, the total is split equally.
 */
export function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  let sum = safe.reduce((a, b) => a + b, 0);
  let w = safe;
  if (sum === 0) {
    w = weights.map(() => 1);
    sum = n;
  }
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const exact = w.map((x) => (abs * x) / sum);
  const floors = exact.map(Math.floor);
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    if (w[i] === 0) continue;
    floors[i] += 1;
    remainder -= 1;
  }
  // If remainder is still > 0 (all-zero weight edge), spread in order.
  let k = 0;
  while (remainder > 0) {
    floors[k % n] += 1;
    remainder -= 1;
    k++;
  }
  return floors.map((x) => sign * x);
}

export function sumMinor(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
