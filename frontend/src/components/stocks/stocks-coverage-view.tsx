"use client";

import { useEffect, useState } from "react";
import {
  Layers,
  Loader2,
  Play,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { useJobStatus } from "@/components/job-status-provider";
import {
  AddCoverageDialog,
  type CoverageChanges,
} from "@/components/stocks/add-coverage-dialog";
import {
  StocksHeaderLastRunSkeleton,
  StocksLastRunCellSkeleton,
  StocksLtpCellSkeleton,
  StocksSignalsCellSkeleton,
} from "@/components/stocks/stocks-coverage-skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchCoverage,
  fetchCoverageRows,
  fetchIndexMembers,
  fetchIndicesCatalog,
  postCoverageRun,
  putCoverage,
} from "@/lib/api";
import {
  coverageTagsForInstrument,
  mergeCoverageInstruments,
  type IndexMembersMap,
} from "@/lib/coverage-storage";
import {
  instrumentSchema,
  type CoverageRow,
  type CoverageState,
  type IndexSummary,
  type Instrument,
} from "@/lib/schemas";
import { fmtPrice, resolveCurrency, resolveMarket } from "@/lib/format";
import { formatLastRun } from "@/lib/signal-cache";
import { cn } from "@/lib/utils";

const LARGE_RUN_WARN = 50;

type Scope = "ALL" | "MANUAL" | string;
type MarketFilter = "ALL" | "IN" | "US";
type AddTab = "indices" | "stocks";

function MarketTag({ market }: { market: "IN" | "US" }) {
  return (
    <span className="rounded-sm border border-[var(--ds-border)] px-1 py-px font-mono text-[10px] font-semibold leading-none text-[var(--ds-muted)]">
      {market}
    </span>
  );
}

function instrumentMarket(inst: Instrument): "IN" | "US" {
  return resolveMarket(inst.market, inst.exchange_segment);
}

function RailItem({
  active,
  onClick,
  label,
  count,
  sub,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left",
        active
          ? "bg-[var(--secondary)] text-[var(--ds-text)]"
          : "text-[var(--ds-muted)] hover:bg-[var(--secondary)]"
      )}
    >
      {icon ? <span className="text-[var(--ds-muted)]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", active && "font-medium")}>
          {label}
        </span>
        {sub ? (
          <span className="block truncate text-xs text-[var(--ds-muted)]">{sub}</span>
        ) : null}
      </span>
      <span className="font-mono text-xs text-[var(--ds-muted)]">{count}</span>
    </button>
  );
}

function RowCheckbox({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
        on
          ? "border-[var(--ds-text)] bg-[var(--ds-text)] text-[var(--ds-bg)]"
          : "border-[var(--ds-border)] bg-[var(--ds-surface)]"
      )}
    >
      {on ? <span className="text-[10px] font-bold">✓</span> : null}
    </span>
  );
}

function SignalDot({ side }: { side?: string }) {
  if (!side) {
    return (
      <span className="h-6 w-9 rounded-sm border border-dashed border-[var(--ds-border)]" />
    );
  }
  const cls =
    side === "BUY"
      ? "bg-[rgba(63,185,80,0.15)] text-[var(--ds-buy)]"
      : side === "SELL"
        ? "bg-[rgba(248,81,73,0.15)] text-[var(--ds-sell)]"
        : "bg-[var(--secondary)] text-[var(--ds-muted)]";
  const label = side === "NONE" ? "—" : side === "BUY" ? "B" : side === "SELL" ? "S" : side[0];
  return (
    <span
      className={cn(
        "flex h-6 w-9 items-center justify-center rounded-sm font-mono text-xs font-semibold",
        cls
      )}
    >
      {label}
    </span>
  );
}

export function StocksCoverageView() {
  const { running, lastCompletedJob, markJobStarted, resyncJobStatus } =
    useJobStatus();
  const [catalog, setCatalog] = useState<IndexSummary[]>([]);
  const [coverage, setCoverage] = useState<CoverageState>({ indexIds: [], manual: [] });
  const [indexMembers, setIndexMembers] = useState<IndexMembersMap>({});
  const [scope, setScope] = useState<Scope>("ALL");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("indices");
  const [addMarket, setAddMarket] = useState<"IN" | "US">("IN");
  const [runError, setRunError] = useState<string | null>(null);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [unresolvedNote, setUnresolvedNote] = useState<string | null>(null);
  const [rowBySecurityId, setRowBySecurityId] = useState<Record<string, CoverageRow>>(
    {}
  );
  const [globalLastRun, setGlobalLastRun] = useState<string | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const indexById = Object.fromEntries(catalog.map((i) => [i.id, i]));
  const allInstruments = mergeCoverageInstruments(coverage, indexMembers);
  const activeIndex = scope !== "ALL" && scope !== "MANUAL" ? indexById[scope] : undefined;

  const scoped =
    scope === "ALL"
      ? allInstruments
      : scope === "MANUAL"
        ? coverage.manual
        : (indexMembers[scope] ?? []);

  const filtered = scoped.filter((s) => {
    if (scope === "ALL" && marketFilter !== "ALL") {
      if (instrumentMarket(s) !== marketFilter) return false;
    }
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      s.symbol.toLowerCase().includes(needle) ||
      s.display_name.toLowerCase().includes(needle)
    );
  });

  const rows =
    scope === "ALL" && marketFilter === "ALL"
      ? [...filtered].sort((a, b) => {
          const ca = rowBySecurityId[a.security_id]?.change_pct;
          const cb = rowBySecurityId[b.security_id]?.change_pct;
          const aPct = ca ?? -Infinity;
          const bPct = cb ?? -Infinity;
          if (bPct !== aPct) return bPct - aPct;
          return a.symbol.localeCompare(b.symbol);
        })
      : filtered;

  const inIndexIds = coverage.indexIds.filter(
    (id) => (indexById[id]?.market ?? "IN") !== "US"
  );
  const usIndexIds = coverage.indexIds.filter(
    (id) => (indexById[id]?.market ?? "IN") === "US"
  );

  const manualCount = coverage.manual.length;

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setBootLoading(true);
      try {
        const [cat, saved] = await Promise.all([
          fetchIndicesCatalog(),
          fetchCoverage(),
        ]);
        if (cancelled) return;
        setCatalog(cat.indices);
        setCoverage(saved);
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadRows() {
      setRowsLoading(true);
      try {
        const payload = await fetchCoverageRows();
        if (cancelled) return;
        const map: Record<string, CoverageRow> = {};
        for (const row of payload.rows) {
          map[row.security_id] = row;
        }
        setRowBySecurityId(map);
        setGlobalLastRun(payload.last_run_at ?? null);
        setRowsError(
          payload.quote_error
            ? `Live prices unavailable: ${payload.quote_error}`
            : null
        );
      } catch (err) {
        if (!cancelled) {
          setRowsError(
            err instanceof Error ? err.message : "Could not load coverage rows"
          );
        }
      } finally {
        if (!cancelled) setRowsLoading(false);
      }
    }
    if (!bootLoading) void loadRows();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, coverage.indexIds.join(","), coverage.manual.length]);

  useEffect(() => {
    let cancelled = false;
    async function loadMembers() {
      if (coverage.indexIds.length === 0) {
        setIndexMembers({});
        return;
      }
      setMembersLoading(true);
      setUnresolvedNote(null);
      const map: IndexMembersMap = {};
      const notes: string[] = [];
      for (const id of coverage.indexIds) {
        try {
          const payload = await fetchIndexMembers(id);
          if (cancelled) return;
          map[id] = payload.members;
          if (payload.unresolved_count > 0) {
            notes.push(
              `${payload.name}: ${payload.unresolved_count} symbol(s) could not be resolved`
            );
          }
        } catch {
          if (!cancelled) notes.push(`Could not load ${id}`);
        }
      }
      if (!cancelled) {
        setIndexMembers(map);
        setUnresolvedNote(notes.length ? notes.join(". ") : null);
        setMembersLoading(false);
      }
    }
    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [coverage.indexIds.join(",")]);

  useEffect(() => {
    if (bootLoading || !lastCompletedJob?.id) return;
    let cancelled = false;
    async function refreshAfterJob() {
      try {
        const [payload, saved] = await Promise.all([
          fetchCoverageRows(),
          fetchCoverage(),
        ]);
        if (cancelled) return;
        const map: Record<string, CoverageRow> = {};
        for (const row of payload.rows) {
          map[row.security_id] = row;
        }
        setRowBySecurityId(map);
        setGlobalLastRun(payload.last_run_at ?? null);
        setCoverage(saved);
        setRowsError(
          payload.quote_error
            ? `Live prices unavailable: ${payload.quote_error}`
            : null
        );
      } catch {
        // ignore refresh errors after job completion
      }
    }
    void refreshAfterJob();
    return () => {
      cancelled = true;
    };
  }, [lastCompletedJob?.id, bootLoading]);

  const pickScope = (next: Scope) => {
    setScope(next);
    setSelectedIds(new Set());
    setQ("");
    setConfirmRemoveIndex(false);
    if (next !== "ALL") setMarketFilter("ALL");
  };

  const openAddDialog = (tab: AddTab, market: "IN" | "US") => {
    setAddMarket(market);
    setAddTab(tab);
    setAddOpen(true);
  };

  const toggleRow = (inst: Instrument) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(inst.security_id)) next.delete(inst.security_id);
      else next.add(inst.security_id);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.security_id));

  const runLabel =
    selectedIds.size > 0
      ? `Run on ${selectedIds.size} selected`
      : activeIndex
        ? `Run on ${activeIndex.name}`
        : scope === "MANUAL"
          ? `Run on ${scoped.length} stocks`
          : `Run on all ${scoped.length}`;

  async function handleRun() {
    const target =
      selectedIds.size > 0
        ? scoped.filter((r) => selectedIds.has(r.security_id))
        : scoped;
    if (target.length === 0) return;
    if (target.length > LARGE_RUN_WARN) {
      const ok = window.confirm(
        `This will compute signals for ${target.length} stocks and may take several minutes. Continue?`
      );
      if (!ok) return;
    }

    setRunError(null);
    setRunNotice(null);
    markJobStarted();
    try {
      const securities = target.map((inst) => {
        const market = instrumentMarket(inst);
        return {
          security_id: inst.security_id,
          symbol: inst.symbol,
          display_name: inst.display_name,
          exchange_segment: inst.exchange_segment,
          instrument_type: inst.instrument_type,
          market,
          currency: resolveCurrency(inst.currency, market),
        };
      });
      const runResult = await postCoverageRun(securities);
      const updated = runResult.symbol_count - runResult.error_count;
      if (runResult.status === "failed" || runResult.error_count > 0) {
        setRunNotice(
          `Run ${runResult.status}: updated ${updated}/${runResult.symbol_count} stocks` +
            (runResult.error_count > 0
              ? ` (${runResult.error_count} with no timeframe data).`
              : ".")
        );
      }
      const payload = await fetchCoverageRows();
      const map: Record<string, CoverageRow> = {};
      for (const row of payload.rows) {
        map[row.security_id] = row;
      }
      setRowBySecurityId(map);
      setGlobalLastRun(payload.last_run_at ?? null);
      setRowsError(
        payload.quote_error
          ? `Live prices unavailable: ${payload.quote_error}`
          : null
      );
      const saved = await fetchCoverage();
      setCoverage(saved);
      resyncJobStatus();
    } catch (err) {
      resyncJobStatus();
      setRunError(err instanceof Error ? err.message : "Run failed");
    }
  }

  async function handleUpdateCoverage(changes: CoverageChanges) {
    const { addIdx, remIdx, addStk, remStk } = changes;
    if (
      addIdx.length === 0 &&
      remIdx.length === 0 &&
      addStk.length === 0 &&
      remStk.length === 0
    ) {
      return;
    }

    const parsedAdds = instrumentSchema.array().safeParse(addStk);
    const newStocks = parsedAdds.success ? parsedAdds.data : [];

    const addedOn = new Date().toISOString().slice(0, 10);

    const nextState = (() => {
      let indexIds = coverage.indexIds.filter((id) => !remIdx.includes(id));
      indexIds = Array.from(new Set([...indexIds, ...addIdx]));
      const indexAddedOn = { ...(coverage.indexAddedOn ?? {}) };
      for (const id of remIdx) delete indexAddedOn[id];
      for (const id of addIdx) indexAddedOn[id] = addedOn;
      let manual = coverage.manual.filter((m) => !remStk.includes(m.security_id));
      const byId = new Map(manual.map((m) => [m.security_id, m]));
      for (const inst of newStocks) byId.set(inst.security_id, inst);
      manual = Array.from(byId.values());
      return { ...coverage, indexIds, indexAddedOn, manual };
    })();

    try {
      const saved = await putCoverage(nextState);
      setCoverage(saved);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Could not save coverage");
    }

    setAddOpen(false);

    if (addIdx.length > 0) {
      pickScope(addIdx[0]);
    } else if (remIdx.includes(scope)) {
      pickScope("ALL");
    } else if (addStk.length > 0 || remStk.length > 0) {
      pickScope("MANUAL");
    }
  }

  async function removeManual(securityId: string) {
    const next = {
      ...coverage,
      manual: coverage.manual.filter((m) => m.security_id !== securityId),
    };
    try {
      const saved = await putCoverage(next);
      setCoverage(saved);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Could not update coverage");
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(securityId);
      return next;
    });
  }

  async function removeIndex(id: string) {
    const next = {
      ...coverage,
      indexIds: coverage.indexIds.filter((x) => x !== id),
    };
    try {
      const saved = await putCoverage(next);
      setCoverage(saved);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Could not update coverage");
    }
    pickScope("ALL");
  }

  const indexNames = Object.fromEntries(catalog.map((i) => [i.id, i.name]));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--ds-border)] px-6 py-5 md:px-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Stocks</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ds-muted)]">
            Cover whole indices or single stocks. Signals refresh hourly for 1h, 4h
            and 1d.
          </p>
          {bootLoading || rowsLoading ? (
            <StocksHeaderLastRunSkeleton />
          ) : globalLastRun ? (
            <p className="mt-1 text-sm text-[var(--ds-muted)]">
              Last run {formatLastRun(globalLastRun)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="border-[var(--ds-border)]"
            onClick={() => openAddDialog("indices", "IN")}
          >
            <Plus size={15} /> Manage coverage
          </Button>
          <Button
            disabled={running || scoped.length === 0 || bootLoading}
            onClick={() => void handleRun()}
          >
            {running ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {running ? "Running strategy…" : runLabel}
          </Button>
        </div>
      </header>

      {runError ? (
        <div className="mx-8 mt-4 shrink-0 rounded-lg border border-[var(--ds-sell)] bg-[rgba(248,81,73,0.12)] px-3 py-2 text-sm text-[var(--ds-sell)]">
          {runError}
        </div>
      ) : null}

      {runNotice ? (
        <div className="mx-8 mt-4 shrink-0 rounded-lg border border-[var(--ds-hold)] bg-[rgba(210,153,34,0.12)] px-3 py-2 text-sm text-[var(--ds-hold)]">
          {runNotice}
        </div>
      ) : null}

      {rowsError ? (
        <div className="mx-8 mt-4 shrink-0 rounded-lg border border-[var(--ds-hold)] bg-[rgba(210,153,34,0.12)] px-3 py-2 text-sm text-[var(--ds-hold)]">
          {rowsError}
        </div>
      ) : null}

      {unresolvedNote ? (
        <div className="mx-8 mt-4 shrink-0 rounded-lg border border-[var(--ds-hold)] bg-[rgba(210,153,34,0.12)] px-3 py-2 text-sm text-[var(--ds-hold)]">
          {unresolvedNote}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="w-64 shrink-0 overflow-y-auto border-r border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-4">
          <RailItem
            active={scope === "ALL"}
            onClick={() => pickScope("ALL")}
            icon={<Layers size={14} strokeWidth={1.75} />}
            label="All coverage"
            count={allInstruments.length}
          />
          <RailItem
            active={scope === "MANUAL"}
            onClick={() => pickScope("MANUAL")}
            icon={<User size={14} strokeWidth={1.75} />}
            label="Individual stocks"
            count={manualCount}
          />

          <div className="mt-5">
            <div className="px-2.5 pb-1.5 text-xs font-medium text-[var(--ds-muted)]">
              India indices
            </div>
            {inIndexIds.map((id) => {
              const def = indexById[id];
              if (!def) return null;
              const lastRun = coverage.indexLastRun?.[id];
              return (
                <RailItem
                  key={id}
                  active={scope === id}
                  onClick={() => pickScope(id)}
                  label={def.name}
                  count={indexMembers[id]?.length ?? def.size}
                  sub={lastRun ? `Last run ${formatLastRun(lastRun)}` : "Not run yet"}
                />
              );
            })}
            {inIndexIds.length === 0 ? (
              <div className="px-2.5 py-1.5 text-xs text-[var(--ds-muted)]">None added</div>
            ) : null}
            <button
              type="button"
              onClick={() => openAddDialog("indices", "IN")}
              className="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--ds-muted)] hover:bg-[var(--secondary)] hover:text-[var(--ds-text)]"
            >
              <Plus size={13} /> Add India index
            </button>
          </div>

          <div className="mt-5">
            <div className="px-2.5 pb-1.5 text-xs font-medium text-[var(--ds-muted)]">
              US indices
            </div>
            {usIndexIds.map((id) => {
              const def = indexById[id];
              if (!def) return null;
              const lastRun = coverage.indexLastRun?.[id];
              return (
                <RailItem
                  key={id}
                  active={scope === id}
                  onClick={() => pickScope(id)}
                  label={def.name}
                  count={indexMembers[id]?.length ?? def.size}
                  sub={lastRun ? `Last run ${formatLastRun(lastRun)}` : "Not run yet"}
                />
              );
            })}
            {usIndexIds.length === 0 ? (
              <div className="px-2.5 py-1.5 text-xs text-[var(--ds-muted)]">None added</div>
            ) : null}
            <button
              type="button"
              onClick={() => openAddDialog("indices", "US")}
              className="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--ds-muted)] hover:bg-[var(--secondary)] hover:text-[var(--ds-text)]"
            >
              <Plus size={13} /> Add US index
            </button>
          </div>
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 py-5 md:px-8">
          {activeIndex ? (
            <div className="mb-4 flex shrink-0 items-start justify-between gap-6 border-b border-[var(--ds-border)] pb-4">
              <div>
                <h2 className="text-base font-semibold">{activeIndex.name}</h2>
                <p className="mt-0.5 text-sm text-[var(--ds-muted)]">{activeIndex.blurb}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--ds-muted)]">
                  <span>
                    <span className="font-mono text-[var(--ds-text)]">
                      {indexMembers[activeIndex.id]?.length ?? activeIndex.size}
                    </span>{" "}
                    stocks resolved
                  </span>
                  {coverage.indexAddedOn?.[activeIndex.id] ? (
                    <span>Added {coverage.indexAddedOn[activeIndex.id]}</span>
                  ) : null}
                </div>
              </div>
              {confirmRemoveIndex ? (
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="text-[var(--ds-muted)]">Remove from coverage?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveIndex(false)}
                    className="rounded-md px-2.5 py-1.5 hover:bg-[var(--secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => removeIndex(activeIndex.id)}
                    className="rounded-md bg-[var(--ds-sell)] px-2.5 py-1.5 font-medium text-white"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveIndex(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-[var(--ds-muted)] hover:bg-[rgba(248,81,73,0.12)] hover:text-[var(--ds-sell)]"
                >
                  <Trash2 size={14} /> Remove index
                </button>
              )}
            </div>
          ) : null}

          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-medium text-[var(--ds-text)]">
                {scope === "MANUAL"
                  ? "Individual stocks"
                  : scope === "ALL"
                    ? "All in coverage"
                    : "Index constituents"}
              </div>
              {scope === "ALL" ? (
                <div className="flex rounded-md border border-[var(--ds-border)] p-0.5">
                  {(
                    [
                      ["ALL", "All"],
                      ["IN", "IN"],
                      ["US", "US"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMarketFilter(id)}
                      className={cn(
                        "rounded-sm px-2.5 py-1 text-xs",
                        marketFilter === id
                          ? "bg-[var(--secondary)] font-medium text-[var(--ds-text)]"
                          : "text-[var(--ds-muted)] hover:text-[var(--ds-text)]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex w-full max-w-xs items-center gap-2 rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2.5 py-1.5 sm:w-72">
              <Search size={14} className="text-[var(--ds-muted)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search symbol or company"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--ds-muted)]"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)]">
            <Table containerClassName="">
              <TableHeader>
                <TableRow className="border-[var(--ds-border)] hover:bg-transparent">
                  <TableHead className="sticky top-0 z-10 w-10 bg-[var(--ds-surface)]">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds(
                          allSelected
                            ? new Set()
                            : new Set(rows.map((r) => r.security_id))
                        )
                      }
                    >
                      <RowCheckbox on={allSelected} />
                    </button>
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-[var(--ds-surface)]">
                    Stock
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-[var(--ds-surface)]">
                    {scope === "ALL" ? "Covered through" : "Source"}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-[var(--ds-surface)] text-right">
                    LTP
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-[var(--ds-surface)] pl-4">
                    Signals · 1h / 4h / 1d
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-[var(--ds-surface)]">
                    Last run
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 w-12 bg-[var(--ds-surface)]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(bootLoading || membersLoading || rowsLoading) && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center text-sm text-[var(--ds-muted)]">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                      Loading coverage…
                    </TableCell>
                  </TableRow>
                ) : null}
                {rows.map((s) => {
                  const on = selectedIds.has(s.security_id);
                  const rowData = rowBySecurityId[s.security_id];
                  const tags = coverageTagsForInstrument(
                    s,
                    coverage,
                    indexMembers,
                    indexNames
                  );
                  const isManual = coverage.manual.some(
                    (m) => m.security_id === s.security_id
                  );
                  return (
                    <TableRow
                      key={s.security_id}
                      onClick={() => toggleRow(s)}
                      className={cn(
                        "group cursor-pointer border-[var(--ds-border)]",
                        on ? "bg-[var(--secondary)]/80" : "hover:bg-[var(--ds-bg)]"
                      )}
                    >
                      <TableCell>
                        <RowCheckbox on={on} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium">{s.symbol}</span>
                          {scope === "ALL" && marketFilter === "ALL" ? (
                            <MarketTag market={instrumentMarket(s)} />
                          ) : null}
                        </div>
                        <div className="text-xs text-[var(--ds-muted)]">{s.display_name}</div>
                      </TableCell>
                      <TableCell>
                        {scope === "ALL" ? (
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="rounded-sm border border-[var(--ds-border)] px-1.5 py-0.5 text-xs"
                              >
                                {t}
                              </span>
                            ))}
                            {tags.length > 2 ? (
                              <span className="text-xs text-[var(--ds-muted)]">
                                +{tags.length - 2}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[var(--ds-muted)]">
                            {activeIndex?.name ?? "Individual"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rowsLoading ? (
                          <StocksLtpCellSkeleton />
                        ) : rowData?.ltp != null ? (
                          <>
                            <div>
                              {fmtPrice(rowData.ltp, {
                                currency: rowData.currency,
                                market: rowData.market ?? instrumentMarket(s),
                                exchange_segment: s.exchange_segment,
                              })}
                            </div>
                            {rowData.change_pct != null ? (
                              <div
                                className={cn(
                                  "text-xs",
                                  rowData.change_pct >= 0
                                    ? "text-[var(--ds-buy)]"
                                    : "text-[var(--ds-sell)]"
                                )}
                              >
                                {rowData.change_pct >= 0 ? "+" : ""}
                                {rowData.change_pct.toFixed(2)}%
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[var(--ds-muted)]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pl-4">
                        {rowsLoading ? (
                          <StocksSignalsCellSkeleton />
                        ) : (
                          <>
                            <div className="flex gap-1">
                              <SignalDot side={rowData?.signals["1h"] ?? undefined} />
                              <SignalDot side={rowData?.signals["4h"] ?? undefined} />
                              <SignalDot side={rowData?.signals["1d"] ?? undefined} />
                            </div>
                            {rowData?.error ? (
                              <p
                                className="mt-1 max-w-[14rem] truncate text-xs text-[var(--ds-sell)]"
                                title={rowData.error}
                              >
                                {rowData.error}
                              </p>
                            ) : null}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--ds-muted)]">
                        {rowsLoading ? (
                          <StocksLastRunCellSkeleton />
                        ) : (
                          formatLastRun(rowData?.last_run_at ?? undefined)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isManual ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeManual(s.security_id);
                            }}
                            className="rounded-sm p-1.5 text-[var(--ds-muted)] opacity-0 hover:bg-[rgba(248,81,73,0.12)] hover:text-[var(--ds-sell)] group-hover:opacity-100"
                            aria-label={`Remove ${s.symbol}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!bootLoading && !membersLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      {q ? (
                        <div className="text-sm text-[var(--ds-muted)]">
                          No stock matches &quot;{q}&quot;
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-medium">Nothing in coverage yet</div>
                          <div className="mt-1 text-sm text-[var(--ds-muted)]">
                            Add an index or a single stock to start.
                          </div>
                          <Button
                            className="mt-4"
                            onClick={() => openAddDialog("indices", "IN")}
                          >
                            <Plus size={15} /> Manage coverage
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 shrink-0 text-xs text-[var(--ds-muted)]">
            Select stocks to run a subset, or run everything in view. The worker also
            refreshes signals every hour.
          </p>
        </div>
      </div>

      <AddCoverageDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        catalog={catalog}
        addedIndexIds={coverage.indexIds}
        existingManual={coverage.manual}
        initialTab={addTab}
        initialMarket={addMarket}
        onUpdateCoverage={handleUpdateCoverage}
      />
    </div>
  );
}
