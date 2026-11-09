"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleSlash,
  Loader2,
  Minus,
  RotateCcw,
  Send,
  Undo2,
} from "lucide-react";
import { SignalsReviewSkeleton } from "@/components/signals/signals-review-skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  fetchCoverage,
  fetchIndicesCatalog,
  fetchSignalMatrix,
  patchSignalStatus,
} from "@/lib/api";
import { formatLastRun } from "@/lib/signal-cache";
import {
  REVIEW_TIMEFRAMES,
  type CoverageState,
  type IndexSummary,
  type ReviewTimeframe,
  type SignalCell,
  type SignalMatrixResponse,
  type MatrixStock,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

type View = "review" | "all";
type SourceFilter = "ALL" | "MANUAL" | string;

function fmtInr(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(price);
}

function pct(entry: number, target: number): number {
  if (!entry) return 0;
  return ((target - entry) / entry) * 100;
}

function cellKey(securityId: string, tf: string) {
  return `${securityId}:${tf}`;
}

function tfLabel(tf: ReviewTimeframe): string {
  return REVIEW_TIMEFRAMES.find((t) => t.id === tf)?.label ?? tf;
}

function SidePill({ side, size = "md" }: { side: string; size?: "sm" | "md" }) {
  const base =
    size === "sm" ? "px-1.5 py-0.5 text-xs gap-0.5" : "px-2 py-1 text-xs gap-1";
  if (side === "BUY") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-sm bg-[color-mix(in_srgb,var(--ds-buy)_18%,transparent)] font-semibold text-[var(--ds-buy)]",
          base
        )}
      >
        <ArrowUpRight size={12} strokeWidth={2.25} /> BUY
      </span>
    );
  }
  if (side === "SELL") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-sm bg-[color-mix(in_srgb,var(--ds-sell)_18%,transparent)] font-semibold text-[var(--ds-sell)]",
          base
        )}
      >
        <ArrowDownRight size={12} strokeWidth={2.25} /> SELL
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-[var(--secondary)] font-medium text-[var(--ds-muted)]",
        base
      )}
    >
      <Minus size={12} strokeWidth={2} /> No signal
    </span>
  );
}

function Segment<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface)] p-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm",
            value === it.id
              ? "bg-[var(--secondary)] font-medium text-[var(--ds-text)]"
              : "text-[var(--ds-muted)] hover:text-[var(--ds-text)]"
          )}
        >
          {it.label}
          {it.count !== undefined && it.count > 0 ? (
            <span className="rounded-sm bg-[color-mix(in_srgb,var(--ds-hold)_22%,transparent)] px-1 font-mono text-xs text-[var(--ds-hold)]">
              {it.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Alignment({ buys, sells }: { buys: number; sells: number }) {
  const dom = buys >= sells ? "BUY" : "SELL";
  const n = Math.max(buys, sells);
  if (n < 2) {
    return <span className="text-xs text-[var(--ds-muted)]">Mixed</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-1.5 rounded-sm",
              i < n
                ? dom === "BUY"
                  ? "bg-[var(--ds-buy)]"
                  : "bg-[var(--ds-sell)]"
                : "bg-[var(--ds-border)]"
            )}
          />
        ))}
      </div>
      <span
        className={cn(
          "text-xs font-medium",
          dom === "BUY" ? "text-[var(--ds-buy)]" : "text-[var(--ds-sell)]"
        )}
      >
        {n}/3 {dom === "BUY" ? "Buy" : "Sell"}
      </span>
    </div>
  );
}

export function SignalsReviewView() {
  const [data, setData] = useState<SignalMatrixResponse | null>(null);
  const [coverage, setCoverage] = useState<CoverageState | null>(null);
  const [indexCatalog, setIndexCatalog] = useState<IndexSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [view, setView] = useState<View>("review");
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [alignedOnly, setAlignedOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const indexNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ix of indexCatalog) m[ix.id] = ix.name;
    return m;
  }, [indexCatalog]);

  const cellMap = useMemo(() => {
    const m = new Map<string, SignalCell>();
    if (!data) return m;
    for (const c of data.cells) m.set(cellKey(c.security_id, c.timeframe), c);
    return m;
  }, [data]);

  const stocksById = useMemo(() => {
    const m = new Map<string, MatrixStock>();
    if (!data) return m;
    for (const s of data.stocks) m.set(s.security_id, s);
    return m;
  }, [data]);

  const matchesSource = (stock: MatrixStock) => {
    if (source === "ALL") return true;
    if (source === "MANUAL") return stock.manual;
    const name = indexNameById[source];
    return name ? stock.sources.includes(name) : false;
  };

  const rows = useMemo(() => {
    if (!data) return [];
    return data.stocks
      .filter(matchesSource)
      .map((stock) => {
        const cells = REVIEW_TIMEFRAMES.map(
          (tf) => cellMap.get(cellKey(stock.security_id, tf.id)) ?? null
        );
        const buys = cells.filter((c) => c?.side === "BUY").length;
        const sells = cells.filter((c) => c?.side === "SELL").length;
        const pending = cells.filter(
          (c) => c && c.status === "pending" && c.side !== "NONE"
        ).length;
        return { stock, cells, buys, sells, pending };
      })
      .filter((r) => r.cells.some(Boolean))
      .filter((r) => view === "all" || r.pending > 0)
      .filter((r) => !alignedOnly || r.buys === 3 || r.sells === 3);
  }, [data, cellMap, source, view, alignedOnly, indexNameById]);

  const selectedCell = selectedKey ? cellMap.get(selectedKey) : undefined;
  const selectedStock = selectedCell
    ? stocksById.get(selectedCell.security_id)
    : undefined;

  const load = async () => {
    setError(null);
    try {
      const [matrix, cov, catalog] = await Promise.all([
        fetchSignalMatrix(),
        fetchCoverage(),
        fetchIndicesCatalog(),
      ]);
      setData(matrix);
      setCoverage(cov);
      setIndexCatalog(catalog.indices);
      const firstPending = matrix.cells.find(
        (c) => c.status === "pending" && c.side !== "NONE"
      );
      if (firstPending && !selectedKey) {
        setSelectedKey(cellKey(firstPending.security_id, firstPending.timeframe));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load signals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const nextPendingKey = (afterKey: string) => {
    if (!data) return null;
    for (const c of data.cells) {
      const k = cellKey(c.security_id, c.timeframe);
      if (
        k !== afterKey &&
        c.status === "pending" &&
        c.side !== "NONE"
      ) {
        return k;
      }
    }
    return null;
  };

  const applyCellPatch = (patched: SignalCell) => {
    setData((prev) => {
      if (!prev) return prev;
      const cells = prev.cells.map((c) =>
        c.security_id === patched.security_id && c.timeframe === patched.timeframe
          ? patched
          : c
      );
      const pending_count = cells.filter(
        (c) => c.status === "pending" && c.side !== "NONE"
      ).length;
      return { ...prev, cells, pending_count };
    });
  };

  const handleSkip = async () => {
    if (!selectedCell) return;
    setActionLoading(true);
    try {
      const patched = await patchSignalStatus(
        selectedCell.security_id,
        selectedCell.timeframe,
        "skipped"
      );
      applyCellPatch(patched);
      const n = nextPendingKey(selectedKey!);
      if (n) setSelectedKey(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Skip failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevert = async () => {
    if (!selectedCell) return;
    setActionLoading(true);
    try {
      const patched = await patchSignalStatus(
        selectedCell.security_id,
        selectedCell.timeframe,
        "pending"
      );
      applyCellPatch(patched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setActionLoading(false);
    }
  };

  const headerSub = useMemo(() => {
    if (!data?.latest_run) {
      return "Run a strategy on Stocks to populate signals across 1h, 4h, and 1d.";
    }
    const run = data.latest_run;
    const when = formatLastRun(run.finished_at ?? data.last_run_at ?? undefined);
    const mode = run.trigger === "cron" ? "Auto" : "Manual";
    return `Run ${run.id.toUpperCase()} · ${mode} · ${when} · ${run.symbol_count} stocks × 3 timeframes.`;
  }, [data]);

  const coverageIndexOptions = useMemo(() => {
    if (!coverage) return [];
    return coverage.indexIds
      .map((id) => ({ id, name: indexNameById[id] ?? id }))
      .filter((x) => x.name);
  }, [coverage, indexNameById]);

  if (loading) {
    return <SignalsReviewSkeleton />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-8 pt-7 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">
            Signals
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ds-muted)]">{headerSub}</p>
        </div>
        <Link
          href="/stocks"
          className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--ds-border)] bg-transparent px-3 text-sm font-medium text-[var(--ds-text)] hover:bg-[var(--secondary)]"
          )}
        >
          <RotateCcw className="size-3.5" /> New run
        </Link>
      </header>

      {error ? (
        <div className="mx-8 mt-4 rounded-lg border border-[var(--ds-sell)]/40 bg-[color-mix(in_srgb,var(--ds-sell)_12%,transparent)] px-4 py-3 text-sm text-[var(--ds-text)]">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Segment
                value={view}
                onChange={setView}
                items={[
                  {
                    id: "review",
                    label: "Needs review",
                    count: data?.pending_count ?? 0,
                  },
                  { id: "all", label: "All results" },
                ]}
              />
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2.5 py-2 text-sm text-[var(--ds-text)] outline-none"
                aria-label="Filter by coverage"
              >
                <option value="ALL">All coverage</option>
                <option value="MANUAL">Individual stocks</option>
                {coverageIndexOptions.map((ix) => (
                  <option key={ix.id} value={ix.id}>
                    {ix.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ds-muted)]">
              <Switch checked={alignedOnly} onCheckedChange={setAlignedOnly} />
              <span onClick={() => setAlignedOnly((a) => !a)}>
                All 3 timeframes agree
              </span>
            </label>
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)]">
            <div className="grid grid-cols-[minmax(170px,1.2fr)_repeat(3,minmax(150px,1fr))_110px] border-b border-[var(--ds-border)] text-xs text-[var(--ds-muted)]">
              <div className="px-4 py-2.5 font-medium">Stock</div>
              {REVIEW_TIMEFRAMES.map((tf) => (
                <div
                  key={tf.id}
                  className="border-l border-[var(--ds-border)] px-3 py-2.5"
                >
                  <span className="font-medium text-[var(--ds-text)]">
                    {tf.label}
                  </span>
                  <span className="ml-1.5 text-[var(--ds-muted)]">
                    {tf.horizon}
                  </span>
                </div>
              ))}
              <div className="border-l border-[var(--ds-border)] px-3 py-2.5 font-medium">
                Alignment
              </div>
            </div>

            {rows.map((r) => (
              <div
                key={r.stock.security_id}
                className="grid grid-cols-[minmax(170px,1.2fr)_repeat(3,minmax(150px,1fr))_110px] border-b border-[var(--ds-border)] last:border-0"
              >
                <div className="px-4 py-3">
                  <div className="font-mono text-sm font-medium text-[var(--ds-text)]">
                    {r.stock.symbol}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--ds-muted)]">
                    {r.stock.display_name}
                  </div>
                  {r.stock.ltp != null ? (
                    <div className="mt-0.5 font-mono text-xs text-[var(--ds-muted)]">
                      {fmtInr(r.stock.ltp)}
                    </div>
                  ) : null}
                </div>
                {r.cells.map((c, i) =>
                  c ? (
                    <MatrixCell
                      key={c.security_id + c.timeframe}
                      cell={c}
                      active={selectedKey === cellKey(c.security_id, c.timeframe)}
                      onSelect={() =>
                        setSelectedKey(cellKey(c.security_id, c.timeframe))
                      }
                    />
                  ) : (
                    <div
                      key={i}
                      className="border-l border-[var(--ds-border)]"
                    />
                  )
                )}
                <div className="flex items-center border-l border-[var(--ds-border)] px-3">
                  <Alignment buys={r.buys} sells={r.sells} />
                </div>
              </div>
            ))}

            {rows.length === 0 ? (
              <MatrixEmpty
                onSeeAll={() => setView("all")}
                reviewMode={view === "review"}
              />
            ) : null}
          </div>
        </div>

        <aside className="w-[400px] shrink-0 overflow-y-auto border-l border-[var(--ds-border)] bg-[var(--ds-surface)]">
          {selectedCell && selectedStock ? (
            <ReviewPanel
              cell={selectedCell}
              stock={selectedStock}
              siblings={REVIEW_TIMEFRAMES.map(
                (tf) =>
                  cellMap.get(
                    cellKey(selectedCell.security_id, tf.id)
                  ) ?? undefined
              )}
              onPick={(c) => setSelectedKey(cellKey(c.security_id, c.timeframe))}
              onSkip={handleSkip}
              onRevert={handleRevert}
              loading={actionLoading}
              onNext={() => {
                const n = selectedKey ? nextPendingKey(selectedKey) : null;
                if (n) setSelectedKey(n);
              }}
              hasNext={
                selectedKey ? Boolean(nextPendingKey(selectedKey)) : false
              }
            />
          ) : (
            <div className="p-8 text-sm text-[var(--ds-muted)]">
              Select a signal to review.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function MatrixEmpty({
  onSeeAll,
  reviewMode,
}: {
  onSeeAll: () => void;
  reviewMode: boolean;
}) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ds-buy)_18%,transparent)] text-[var(--ds-buy)]">
        <Check size={18} />
      </div>
      <div className="mt-3 text-sm font-medium text-[var(--ds-text)]">
        {reviewMode ? "All caught up" : "No signals in this view"}
      </div>
      <div className="mt-1 text-sm text-[var(--ds-muted)]">
        {reviewMode
          ? "No signals waiting for review in this view."
          : "Try changing filters or run coverage on Stocks."}
      </div>
      {reviewMode ? (
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-3 text-sm font-medium text-[var(--ds-text)] underline-offset-2 hover:underline"
        >
          See all results
        </button>
      ) : (
        <Link
          href="/stocks"
          className="mt-3 inline-block text-sm font-medium text-[var(--ds-text)] underline-offset-2 hover:underline"
        >
          Go to Stocks
        </Link>
      )}
    </div>
  );
}

function MatrixCell({
  cell,
  active,
  onSelect,
}: {
  cell: SignalCell;
  active: boolean;
  onSelect: () => void;
}) {
  const dim = cell.status === "skipped" || cell.side === "NONE";
  const up =
    cell.entry != null && cell.target != null
      ? pct(cell.entry, cell.target)
      : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-start gap-1.5 border-l border-[var(--ds-border)] px-3 py-3 text-left",
        active
          ? "bg-[color-mix(in_srgb,var(--ds-text)_8%,transparent)] outline-2 -outline-offset-2 outline-[var(--ds-text)]"
          : "hover:bg-[var(--secondary)]"
      )}
    >
      <div className={cn("flex w-full items-center justify-between", dim && "opacity-60")}>
        <SidePill side={cell.side} size="sm" />
        {cell.status === "approved" ? (
          <span className="flex items-center gap-0.5 text-xs font-medium text-[var(--ds-buy)]">
            <Check size={12} strokeWidth={2.5} /> Live
          </span>
        ) : null}
        {cell.status === "skipped" ? (
          <span className="text-xs text-[var(--ds-muted)]">Skipped</span>
        ) : null}
        {cell.status === "pending" && cell.side !== "NONE" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ds-hold)]" />
        ) : null}
      </div>
      {cell.side !== "NONE" && cell.entry != null ? (
        <div
          className={cn(
            "font-mono text-xs",
            dim ? "text-[var(--ds-muted)]" : "text-[var(--ds-text)]"
          )}
        >
          {fmtInr(cell.entry)}
          <span
            className={cn(
              "ml-1.5",
              cell.side === "BUY" ? "text-[var(--ds-buy)]" : "text-[var(--ds-sell)]"
            )}
          >
            {up > 0 ? "+" : ""}
            {up.toFixed(1)}%
          </span>
        </div>
      ) : (
        <div className="text-xs text-[var(--ds-muted)]">Inside range</div>
      )}
    </button>
  );
}

function Level({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "buy" | "sell";
}) {
  return (
    <div className="bg-[var(--ds-surface)] px-3 py-2.5">
      <div className="text-xs text-[var(--ds-muted)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-medium text-[var(--ds-text)]">
        {value}
        {hint ? (
          <span
            className={cn(
              "ml-1.5 text-xs",
              tone === "buy" ? "text-[var(--ds-buy)]" : "text-[var(--ds-sell)]"
            )}
          >
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ReviewPanel({
  cell,
  stock,
  siblings,
  onPick,
  onSkip,
  onRevert,
  loading,
  onNext,
  hasNext,
}: {
  cell: SignalCell;
  stock: MatrixStock;
  siblings: (SignalCell | undefined)[];
  onPick: (c: SignalCell) => void;
  onSkip: () => void;
  onRevert: () => void;
  loading: boolean;
  onNext: () => void;
  hasNext: boolean;
}) {
  const entry = cell.entry ?? 0;
  const target = cell.target ?? entry;
  const stop = cell.stop ?? entry;
  const up = pct(entry, target);
  const down = pct(entry, stop);
  const rr = down !== 0 ? Math.abs(up / down) : 0;

  return (
    <div className="flex flex-col">
      <div className="border-b border-[var(--ds-border)] px-6 pt-5 pb-4">
        <div className="font-mono text-base font-semibold text-[var(--ds-text)]">
          {cell.symbol}
        </div>
        <div className="text-xs text-[var(--ds-muted)]">{stock.display_name}</div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-md bg-[var(--secondary)] p-0.5">
          {siblings.map((sib) =>
            sib ? (
              <button
                key={sib.timeframe}
                type="button"
                onClick={() => onPick(sib)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-sm py-1.5 text-xs",
                  cellKey(sib.security_id, sib.timeframe) ===
                    cellKey(cell.security_id, cell.timeframe)
                    ? "bg-[var(--ds-surface)] font-medium shadow-sm"
                    : "text-[var(--ds-muted)] hover:text-[var(--ds-text)]"
                )}
              >
                {tfLabel(sib.timeframe as ReviewTimeframe)}
                <span
                  className={cn(
                    "font-mono text-xs",
                    sib.side === "BUY"
                      ? "text-[var(--ds-buy)]"
                      : sib.side === "SELL"
                        ? "text-[var(--ds-sell)]"
                        : "text-[var(--ds-muted)]"
                  )}
                >
                  {sib.side === "NONE" ? "—" : sib.side}
                </span>
              </button>
            ) : null
          )}
        </div>
      </div>

      {cell.side === "NONE" ? (
        <div className="px-6 py-10 text-center">
          <div className="text-sm font-medium text-[var(--ds-text)]">
            No signal on {tfLabel(cell.timeframe as ReviewTimeframe)}
          </div>
          <p className="mt-1 text-sm text-[var(--ds-muted)]">{cell.note}</p>
        </div>
      ) : (
        <>
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[var(--ds-border)] bg-[var(--ds-border)]">
              <Level label="Entry" value={fmtInr(entry)} />
              <Level label="Risk : reward" value={`1 : ${rr.toFixed(1)}`} />
              <Level
                label="Target"
                value={fmtInr(target)}
                hint={`${up > 0 ? "+" : ""}${up.toFixed(1)}%`}
                tone="buy"
              />
              <Level
                label="Stop-loss"
                value={fmtInr(stop)}
                hint={`${down > 0 ? "+" : ""}${down.toFixed(1)}%`}
                tone="sell"
              />
            </div>
            <div className="mt-3 rounded-md bg-[var(--ds-bg)] p-3">
              <div className="text-xs font-medium text-[var(--ds-text)]">
                Why the strategy fired
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ds-muted)]">
                {cell.note}
              </p>
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto border-t border-[var(--ds-border)] bg-[var(--ds-surface)] px-6 py-4">
            {cell.status === "pending" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={onSkip}
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CircleSlash className="size-3.5" />
                  )}
                  Skip
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled
                  title="Approve & post — coming soon"
                >
                  <Send className="size-3.5" /> Approve & post to Instagram
                </Button>
              </div>
            ) : null}
            {cell.status === "approved" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--ds-buy)]">
                  <Check size={15} strokeWidth={2.5} /> Approved
                </span>
                {hasNext ? (
                  <Button type="button" size="sm" onClick={onNext}>
                    Next
                  </Button>
                ) : null}
              </div>
            ) : null}
            {cell.status === "skipped" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-[var(--ds-muted)]">
                  Skipped. Not published.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={onRevert}
                >
                  <Undo2 className="size-3.5" /> Move back to review
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
