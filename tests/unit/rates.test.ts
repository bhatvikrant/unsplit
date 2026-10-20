import { describe, expect, it } from "vitest";
import { currencySymbol, formatRate, formatRateNumber } from "@/lib/rates";

describe("currencySymbol", () => {
  it("uses the symbol a person would write", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("GBP")).toBe("£");
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("JPY")).toBe("¥");
    expect(currencySymbol("KRW")).toBe("₩");
    expect(currencySymbol("THB")).toBe("฿");
    expect(currencySymbol("BRL")).toBe("R$");
  });
  it("tells the dollars and yuans apart", () => {
    expect(currencySymbol("SGD")).toBe("S$");
    expect(currencySymbol("AUD")).toBe("A$");
    expect(currencySymbol("CAD")).toBe("C$");
    expect(currencySymbol("HKD")).toBe("HK$");
    expect(currencySymbol("NZD")).toBe("NZ$");
    expect(currencySymbol("CNY")).toBe("CN¥");
  });
  it("falls back to the code", () => {
    expect(currencySymbol("AED")).toBe("AED");
    expect(currencySymbol("CHF")).toBe("CHF");
    expect(currencySymbol("XYZ")).toBe("XYZ");
  });
});

describe("formatRateNumber", () => {
  it("keeps the useful digits only", () => {
    expect(formatRateNumber(96.7123)).toBe("96.7");
    expect(formatRateNumber(1234.56)).toBe("1,234.6");
    expect(formatRateNumber(1.0912)).toBe("1.09");
    expect(formatRateNumber(1)).toBe("1");
    expect(formatRateNumber(0.010506)).toBe("0.0105");
    expect(formatRateNumber(0.5)).toBe("0.5");
  });
});

describe("formatRate", () => {
  it("puts the stronger currency first", () => {
    expect(formatRate("INR", "USD", 0.010506)).toBe("$1 = ₹95.2");
    expect(formatRate("USD", "INR", 95.18)).toBe("$1 = ₹95.2");
    expect(formatRate("EUR", "USD", 1.0912)).toBe("€1 = $1.09");
    expect(formatRate("USD", "EUR", 0.9164)).toBe("€1 = $1.09");
  });
  it("uses the right dollar", () => {
    expect(formatRate("SGD", "INR", 68.4)).toBe("S$1 = ₹68.4");
    expect(formatRate("INR", "SGD", 1 / 68.4)).toBe("S$1 = ₹68.4");
  });
  it("spaces out codes that have no symbol", () => {
    expect(formatRate("AED", "INR", 22.7)).toBe("AED 1 = ₹22.7");
    expect(formatRate("CHF", "EUR", 1.06)).toBe("CHF 1 = €1.06");
  });
  it("is empty for a missing rate", () => {
    expect(formatRate("USD", "EUR", 0)).toBe("");
    expect(formatRate("USD", "EUR", Number.NaN)).toBe("");
  });
});
