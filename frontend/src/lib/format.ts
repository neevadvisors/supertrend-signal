export type Market = "IN" | "US";
export type Currency = "INR" | "USD";

export function marketFromExchangeSegment(exchangeSegment: string): Market {
  return exchangeSegment === "US_EQ" ? "US" : "IN";
}

export function resolveMarket(
  market?: string | null,
  exchangeSegment?: string
): Market {
  if (market === "US" || market === "IN") return market;
  if (exchangeSegment) return marketFromExchangeSegment(exchangeSegment);
  return "IN";
}

export function resolveCurrency(
  currency?: string | null,
  market?: Market | string | null
): Currency {
  if (currency === "USD" || currency === "INR") return currency;
  const m = resolveMarket(market, undefined);
  return m === "US" ? "USD" : "INR";
}

export function fmtPrice(
  price: number,
  opts?: {
    currency?: string | null;
    market?: string | null;
    exchange_segment?: string;
  }
): string {
  const market = resolveMarket(opts?.market, opts?.exchange_segment);
  const currency = resolveCurrency(opts?.currency, market);
  const locale = currency === "USD" ? "en-US" : "en-IN";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}
