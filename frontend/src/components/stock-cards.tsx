import type { SignalResult } from "@/lib/schemas";

function fmtNum(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function signalClass(signal: string | undefined): string {
  const key = String(signal || "HOLD").toUpperCase();
  if (key === "BUY") return "badge-buy";
  if (key === "SELL") return "badge-sell";
  return "badge-hold";
}

function trendMeta(
  trend: string | null | undefined
): { className: string; label: string } | null {
  const key = String(trend || "").toUpperCase();
  if (key === "1" || key === "BULL") {
    return { className: "trend-bull", label: "BULL" };
  }
  if (key === "-1" || key === "BEAR") {
    return { className: "trend-bear", label: "BEAR" };
  }
  return null;
}

function signalDotClass(signal: string | undefined): string {
  const key = String(signal || "HOLD").toUpperCase();
  if (key === "BUY") return "bg-[var(--ds-buy)]";
  if (key === "SELL") return "bg-[var(--ds-sell)]";
  return "bg-[var(--ds-hold)]";
}

export function signalDotColor(signal: string | undefined): string {
  return signalDotClass(signal);
}

type StockCardProps = {
  row: SignalResult;
};

export function StockCard({ row }: StockCardProps) {
  const err = row.error;
  const trend = trendMeta(row.trend);
  const signalLabel = String(row.signal || "HOLD").toUpperCase();

  return (
    <article className={err ? "ds-stock-card-compact is-error" : "ds-stock-card-compact"}>
      <div className="ds-compact-main">
        <div className="ds-compact-title">
          <span className="ds-symbol-compact">{row.symbol || "—"}</span>
          {row.name ? (
            <span className="ds-name-compact">{row.name}</span>
          ) : null}
        </div>
        <div className="ds-compact-badges">
          <span className={`ds-badge-compact ${signalClass(row.signal)}`}>
            {signalLabel}
          </span>
          {trend ? (
            <span className={`ds-trend-compact ${trend.className}`}>
              {trend.label}
            </span>
          ) : null}
        </div>
      </div>
      <div className="ds-compact-stats">
        <span>
          <span className="ds-stat-label">Close</span> {fmtNum(row.close)}
        </span>
        <span>
          <span className="ds-stat-label">ST</span> {fmtNum(row.st_level)}
        </span>
        <span>
          <span className="ds-stat-label">Flip</span>{" "}
          {row.bars_since_flip != null ? String(row.bars_since_flip) : "—"}
        </span>
        {row.regime != null && String(row.regime).trim() ? (
          <span>
            <span className="ds-stat-label">Regime</span> {String(row.regime)}
          </span>
        ) : null}
      </div>
      {err ? <div className="ds-error-compact">{err}</div> : null}
    </article>
  );
}
