"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchIndexMembers, searchInstruments } from "@/lib/api";
import type { IndexSummary, Instrument } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type AddTab = "indices" | "stocks";

const TIER_ORDER = ["Large cap", "Mid cap", "Small cap", "Sector"];

export type CoverageChanges = {
  addIdx: string[];
  remIdx: string[];
  addStk: Instrument[];
  remStk: string[];
};

type AddCoverageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: IndexSummary[];
  addedIndexIds: string[];
  existingManual: Instrument[];
  initialTab?: AddTab;
  initialMarket?: "IN" | "US";
  onUpdateCoverage: (changes: CoverageChanges) => void;
};

function CoverageCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
        checked
          ? "border-[var(--ds-text)] bg-[var(--ds-text)] text-[var(--ds-bg)]"
          : "border-[var(--ds-border)] bg-[var(--ds-surface)]"
      )}
    >
      {checked ? (
        <span className="text-[10px] font-bold leading-none">✓</span>
      ) : null}
    </span>
  );
}

function RowStatus({ current, on }: { current: boolean; on: boolean }) {
  if (current && !on) {
    return (
      <span className="text-xs font-medium text-[var(--ds-sell)]">Will be removed</span>
    );
  }
  if (!current && on) {
    return (
      <span className="text-xs font-medium text-[var(--ds-buy)]">Will be added</span>
    );
  }
  if (current) {
    return <span className="text-xs text-[var(--ds-muted)]">In coverage</span>;
  }
  return null;
}

function sortWithPickedFirst(
  list: Instrument[],
  pickedIds: Set<string>
): Instrument[] {
  return [...list].sort((a, b) => {
    const aOn = pickedIds.has(a.security_id) ? 1 : 0;
    const bOn = pickedIds.has(b.security_id) ? 1 : 0;
    if (bOn !== aOn) return bOn - aOn;
    return a.symbol.localeCompare(b.symbol);
  });
}

export function AddCoverageDialog({
  open,
  onOpenChange,
  catalog,
  addedIndexIds,
  existingManual,
  initialTab = "indices",
  initialMarket = "IN",
  onUpdateCoverage,
}: AddCoverageDialogProps) {
  const [tab, setTab] = useState<AddTab>(initialTab);
  const [market, setMarket] = useState<"IN" | "US">(initialMarket);
  const [q, setQ] = useState("");
  const [pickedIdx, setPickedIdx] = useState<string[]>([]);
  const [pickedStk, setPickedStk] = useState<Instrument[]>([]);
  const [searchResults, setSearchResults] = useState<Instrument[]>([]);
  const [popularStocks, setPopularStocks] = useState<Instrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [popularLoading, setPopularLoading] = useState(false);

  const existingManualIds = useMemo(
    () => new Set(existingManual.map((m) => m.security_id)),
    [existingManual]
  );

  const pickedStkIds = useMemo(
    () => new Set(pickedStk.map((s) => s.security_id)),
    [pickedStk]
  );

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setMarket(initialMarket);
    setPickedIdx([...addedIndexIds]);
    setPickedStk([...existingManual]);
    setQ("");
  }, [open, initialTab, initialMarket, addedIndexIds, existingManual]);

  useEffect(() => {
    const trimmed = q.trim();
    if (!open || tab !== "stocks" || trimmed) {
      if (!trimmed) setSearchResults([]);
      return;
    }
    let cancelled = false;
    setPopularLoading(true);
    const popularIndexId = market === "US" ? "dow30" : "nifty50";
    void fetchIndexMembers(popularIndexId)
      .then((payload) => {
        if (cancelled) return;
        const byId = new Map<string, Instrument>();
        for (const inst of payload.members) {
          byId.set(inst.security_id, inst);
        }
        for (const inst of pickedStk) {
          byId.set(inst.security_id, inst);
        }
        setPopularStocks(Array.from(byId.values()));
      })
      .catch(() => {
        if (!cancelled) {
          setPopularStocks([...pickedStk]);
        }
      })
      .finally(() => {
        if (!cancelled) setPopularLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, q, market]);

  useEffect(() => {
    const trimmed = q.trim();
    if (!open || tab !== "stocks" || !trimmed) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void searchInstruments(trimmed, { limit: 40, market })
        .then((rows) => {
          if (!cancelled) {
            setSearchResults(rows);
            setSearchError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setSearchResults([]);
            setSearchError(
              err instanceof Error ? err.message : "Search failed"
            );
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, tab, q, market]);

  const catalogForMarket = catalog.filter(
    (i) => (i.market === "US" ? "US" : "IN") === market
  );

  const indexGroups = TIER_ORDER.map((tier) => ({
    tier,
    items: catalogForMarket.filter((i) => i.tier === tier),
  })).filter((g) => g.items.length > 0);

  const addIdx = pickedIdx.filter((id) => !addedIndexIds.includes(id));
  const remIdx = addedIndexIds.filter((id) => !pickedIdx.includes(id));
  const addStk = pickedStk.filter((s) => !existingManualIds.has(s.security_id));
  const remStk = existingManual
    .filter((s) => !pickedStkIds.has(s.security_id))
    .map((s) => s.security_id);

  const toAdd = addIdx.length + addStk.length;
  const toRemove = remIdx.length + remStk.length;
  const hasChanges = toAdd > 0 || toRemove > 0;

  const summary = [
    toAdd ? `${toAdd} to add` : "",
    toRemove ? `${toRemove} to remove` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const stockList = useMemo(() => {
    const base = q.trim() ? searchResults : popularStocks;
    return sortWithPickedFirst(base, pickedStkIds);
  }, [q, searchResults, popularStocks, pickedStkIds]);

  function toggleStock(inst: Instrument) {
    const exists = pickedStkIds.has(inst.security_id);
    if (exists) {
      setPickedStk((p) => p.filter((s) => s.security_id !== inst.security_id));
    } else {
      setPickedStk((p) => [...p, inst]);
    }
  }

  function flipIndex(id: string) {
    setPickedIdx((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(90vh,640px)] w-[min(100vw-2rem,720px)] max-w-[min(100vw-2rem,720px)] flex-col gap-0 overflow-hidden border-[var(--ds-border)] bg-[var(--ds-surface)] p-0"
      >
        <DialogHeader className="relative shrink-0 border-b border-[var(--ds-border)] px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold">Manage coverage</DialogTitle>
          <p className="text-xs text-[var(--ds-muted)]">
            Tick to cover, untick to remove. Nothing changes until you update.
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 rounded-sm p-1 text-[var(--ds-muted)] hover:bg-[var(--secondary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div className="flex rounded-md border border-[var(--ds-border)] p-0.5">
            {(
              [
                ["indices", "Index groups"],
                ["stocks", "Individual stocks"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm",
                  tab === id
                    ? "bg-[var(--secondary)] font-medium text-[var(--ds-text)]"
                    : "text-[var(--ds-muted)] hover:text-[var(--ds-text)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-[var(--ds-border)] p-0.5">
            {(
              [
                ["IN", "India"],
                ["US", "US"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMarket(id);
                  setQ("");
                  setSearchError(null);
                }}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm",
                  market === id
                    ? "bg-[var(--secondary)] font-medium text-[var(--ds-text)]"
                    : "text-[var(--ds-muted)] hover:text-[var(--ds-text)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "indices" ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {indexGroups.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--ds-muted)]">
                No {market === "US" ? "US" : "India"} indices in catalog yet.
              </div>
            ) : null}
            {indexGroups.map((g) => (
              <div key={g.tier} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-xs font-medium text-[var(--ds-muted)]">
                  {g.tier}
                </div>
                {g.items.map((ix) => {
                  const current = addedIndexIds.includes(ix.id);
                  const on = pickedIdx.includes(ix.id);
                  return (
                    <button
                      key={ix.id}
                      type="button"
                      onClick={() => flipIndex(ix.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left",
                        current && !on
                          ? "bg-[rgba(248,81,73,0.08)]"
                          : !current && on
                            ? "bg-[var(--secondary)]"
                            : "hover:bg-[var(--ds-bg)]"
                      )}
                    >
                      <span className="mt-0.5">
                        <CoverageCheckbox checked={on} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{ix.name}</span>
                          <span className="font-mono text-xs text-[var(--ds-muted)]">
                            {ix.size} stocks
                          </span>
                        </div>
                        <div className="text-xs text-[var(--ds-muted)]">{ix.blurb}</div>
                      </div>
                      <span className="mt-0.5 shrink-0">
                        <RowStatus current={current} on={on} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mx-5 mt-3 flex shrink-0 items-center gap-2 rounded-md border border-[var(--ds-border)] px-2.5 py-1.5">
              <Search size={14} className="text-[var(--ds-muted)]" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ticker or company"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              {searching || popularLoading ? (
                <Loader2 size={14} className="animate-spin text-[var(--ds-muted)]" />
              ) : null}
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {stockList.map((u) => {
                const current = existingManualIds.has(u.security_id);
                const on = pickedStkIds.has(u.security_id);
                return (
                  <button
                    key={u.security_id}
                    type="button"
                    onClick={() => toggleStock(u)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left",
                      current && !on
                        ? "bg-[rgba(248,81,73,0.08)]"
                        : !current && on
                          ? "bg-[var(--secondary)]"
                          : "hover:bg-[var(--ds-bg)]"
                    )}
                  >
                    <CoverageCheckbox checked={on} />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-medium">{u.symbol}</div>
                      <div className="text-xs text-[var(--ds-muted)]">{u.display_name}</div>
                    </div>
                    <RowStatus current={current} on={on} />
                  </button>
                );
              })}
              {searchError ? (
                <div className="py-6 text-center text-sm text-[var(--ds-sell)]">
                  {searchError}
                </div>
              ) : null}
              {q.trim() && !searching && !searchError && searchResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--ds-muted)]">
                  No match for &quot;{q.trim()}&quot;
                </div>
              ) : null}
            </div>
          </>
        )}

        <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-[var(--ds-border)] px-5 py-3">
          <span className="text-xs text-[var(--ds-muted)]">
            {summary || "No changes"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!hasChanges}
              onClick={() =>
                onUpdateCoverage({ addIdx, remIdx, addStk, remStk })
              }
            >
              Update coverage
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
