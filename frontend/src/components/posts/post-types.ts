export type PostArtworkInput = {
  callNo: number
  side: "BUY" | "SELL"
  symbol: string
  name: string
  exchange?: string
  sector?: string
  price?: number | null
  changePct?: number | null
  market?: "IN" | "US"
  logoDomain?: string
}

export function marketLabel(market?: "IN" | "US"): string {
  return market === "US" ? "United States" : "India"
}

export function formatPostPrice(
  price: number | null | undefined,
  market?: "IN" | "US"
): string {
  if (price == null || Number.isNaN(price)) return "—"
  if (market === "US") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

export function formatChangePct(changePct: number | null | undefined): string {
  if (changePct == null || Number.isNaN(changePct)) return "—"
  const sign = changePct > 0 ? "+" : ""
  return `${sign}${changePct.toFixed(2)}%`
}

export function companyInitials(name: string, symbol: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return symbol.slice(0, 2).toUpperCase()
}

export function postCaption(input: PostArtworkInput): string {
  const exchange = input.exchange ?? (input.market === "US" ? "NASDAQ" : "NSE")
  const view = input.side === "BUY" ? "Buy" : "Sell"
  const sector = input.sector?.trim() || "—"
  return `Call No. ${input.callNo} — ${input.name} (${exchange}: ${input.symbol}). Our view: ${view}. ${sector}. Research by a SEBI-registered analyst. Know someone who invests for the long run? Send them this call. Powered by neev.money`
}
