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

type StockCardsProps = {
  results: SignalResult[];
};

export function StockCards({ results }: StockCardsProps) {
  if (results.length === 0) {
    return (
      <div className="ds-stock-grid">
        <p className="ds-name">No stocks to display.</p>
      </div>
    );
  }

  return (
    <div className="ds-stock-grid">
      {results.map((row) => {
        const err = row.error;
        const trend = trendMeta(row.trend);
        const signalLabel = String(row.signal || "HOLD").toUpperCase();

        return (
          <article
            key={`${row.symbol}-${row.name}`}
            className={err ? "ds-stock-card is-error" : "ds-stock-card"}
          >
            <div className="ds-card-header">
              <div>
                <div className="ds-symbol">{row.symbol || "—"}</div>
                <div className="ds-name">{row.name || ""}</div>
              </div>
              <div className="ds-badges">
                <span className={`ds-badge ${signalClass(row.signal)}`}>
                  {signalLabel}
                </span>
                {trend ? (
                  <span className={`ds-trend ${trend.className}`}>
                    {trend.label}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="ds-metrics">
              <div>
                <div className="ds-metric-label">Close</div>
                <div className="ds-metric-value">{fmtNum(row.close)}</div>
              </div>
              <div>
                <div className="ds-metric-label">ST level</div>
                <div className="ds-metric-value">{fmtNum(row.st_level)}</div>
              </div>
              <div>
                <div className="ds-metric-label">Bars since flip</div>
                <div className="ds-metric-value">
                  {row.bars_since_flip != null ? String(row.bars_since_flip) : "—"}
                </div>
              </div>
              {row.regime != null && String(row.regime).trim() ? (
                <div>
                  <div className="ds-metric-label">Regime</div>
                  <div className="ds-metric-value">{String(row.regime)}</div>
                </div>
              ) : null}
            </div>
            {err ? <div className="ds-error">{err}</div> : null}
          </article>
        );
      })}
    </div>
  );
}
