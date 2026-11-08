"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChartsPanel } from "@/components/charts-panel";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { ResultsTable } from "@/components/results-table";
import { SettingsDrawer } from "@/components/settings-drawer";
import { StockSearch } from "@/components/stock-search";
import { Button } from "@/components/ui/button";
import {
  fetchMetaDefaults,
  postSignals,
  refreshInstrumentCache,
} from "@/lib/api";
import { consumeStocksRun } from "@/lib/coverage-storage";
import {
  DEFAULT_LOOKBACKS,
  DEFAULT_PARAMS,
  instrumentSchema,
  neevParamsSchema,
  showBarsSchema,
  signalResultSchema,
  timeframeSchema,
  type Instrument,
  type NeevParams,
  type ShowBars,
  type SignalResult,
  type Timeframe,
} from "@/lib/schemas";
import { updateSignalCache } from "@/lib/signal-cache";

const STORAGE_KEY = "ds:dashboard";

function settingsFingerprint(
  params: NeevParams,
  timeframe: Timeframe,
  lookbackDays: number,
  showBars: ShowBars
): string {
  return [
    params.atr_len,
    params.base_factor,
    params.auto_box,
    params.manual_box,
    params.vol_filter,
    params.adx_thresh,
    timeframe,
    lookbackDays,
    showBars,
  ].join("|");
}

function selectionKey(items: Instrument[]): string {
  return items.map((i) => i.security_id).join(",");
}

function loadPersistedDashboard(): {
  selected: Instrument[];
  params: NeevParams;
  timeframe: Timeframe;
  lookbackDays: number;
  showBars: ShowBars;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    const selectedParsed = instrumentSchema.array().safeParse(record.selected);
    const paramsParsed = neevParamsSchema.safeParse(record.params);
    const timeframeParsed = timeframeSchema.safeParse(record.timeframe);
    const showBarsParsed = showBarsSchema.safeParse(record.showBars);
    const lookback =
      typeof record.lookbackDays === "number" ? record.lookbackDays : null;
    if (
      !selectedParsed.success ||
      !paramsParsed.success ||
      !timeframeParsed.success ||
      !showBarsParsed.success ||
      lookback == null ||
      !Number.isFinite(lookback)
    ) {
      return null;
    }
    return {
      selected: selectedParsed.data,
      params: paramsParsed.data,
      timeframe: timeframeParsed.data,
      lookbackDays: Math.min(365, Math.max(5, Math.round(lookback))),
      showBars: showBarsParsed.data,
    };
  } catch {
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [params, setParams] = useState<NeevParams>(DEFAULT_PARAMS);
  const [defaultParams, setDefaultParams] = useState<NeevParams>(DEFAULT_PARAMS);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [lookbackDays, setLookbackDays] = useState(30);
  const [lookbacks, setLookbacks] =
    useState<Record<Timeframe, number>>(DEFAULT_LOOKBACKS);
  const [defaultLookbacks, setDefaultLookbacks] =
    useState<Record<Timeframe, number>>(DEFAULT_LOOKBACKS);
  const [showBars, setShowBars] = useState<ShowBars>(120);
  const [selected, setSelected] = useState<Instrument[]>([]);
  const [results, setResults] = useState<SignalResult[] | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [instrumentsRefreshing, setInstrumentsRefreshing] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [instrumentsError, setInstrumentsError] = useState<string | null>(null);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const persistenceApplied = useRef(false);
  const skipNextCompute = useRef(false);

  const fingerprint = settingsFingerprint(
    params,
    timeframe,
    lookbackDays,
    showBars
  );
  const currentSelectionKey = selectionKey(selected);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBootLoading(true);
      setBootError(null);
      try {
        const meta = await fetchMetaDefaults();
        if (cancelled) return;
        setParams(meta.params);
        setDefaultParams(meta.params);
        const nextLookbacks: Record<Timeframe, number> = {
          "15m": meta.lookbacks["15m"] ?? DEFAULT_LOOKBACKS["15m"],
          "1h": meta.lookbacks["1h"] ?? DEFAULT_LOOKBACKS["1h"],
          "4h": meta.lookbacks["4h"] ?? DEFAULT_LOOKBACKS["4h"],
        };
        setLookbacks(nextLookbacks);
        setDefaultLookbacks(nextLookbacks);
        setLookbackDays(nextLookbacks["15m"]);
      } catch (err) {
        if (cancelled) return;
        setBootError(
          err instanceof Error ? err.message : "Failed to load defaults"
        );
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
    if (bootLoading || persistenceApplied.current) return;
    persistenceApplied.current = true;
    const rawFromStocks = consumeStocksRun();
    if (rawFromStocks) {
      const resultsParsed = signalResultSchema.array().safeParse(rawFromStocks.results);
      if (resultsParsed.success) {
        setSelected(rawFromStocks.selected);
        setParams(rawFromStocks.params);
        setTimeframe(rawFromStocks.timeframe);
        setLookbackDays(rawFromStocks.lookbackDays);
        setShowBars(rawFromStocks.showBars);
        setResults(resultsParsed.data);
        setLastUpdated(new Date());
        updateSignalCache(resultsParsed.data, rawFromStocks.timeframe);
        skipNextCompute.current = true;
        return;
      }
    }
    const saved = loadPersistedDashboard();
    if (!saved) return;
    setSelected(saved.selected);
    setParams(saved.params);
    setTimeframe(saved.timeframe);
    setLookbackDays(saved.lookbackDays);
    setShowBars(saved.showBars);
  }, [bootLoading]);

  useEffect(() => {
    if (bootLoading) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selected,
          params,
          timeframe,
          lookbackDays,
          showBars,
        })
      );
    } catch {
      /* ignore quota / private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist when selection or settings fingerprint changes
  }, [bootLoading, currentSelectionKey, fingerprint]); // values read from closure when keys change

  useEffect(() => {
    setLookbacks((prev) => ({ ...prev, [timeframe]: lookbackDays }));
  }, [timeframe, lookbackDays]);

  useEffect(() => {
    if (skipNextCompute.current) {
      skipNextCompute.current = false;
      return;
    }

    if (selected.length === 0) {
      setResults(null);
      setSignalsError(null);
      setSignalsLoading(false);
      return;
    }

    let cancelled = false;

    async function compute() {
      setSignalsLoading(true);
      setSignalsError(null);
      try {
        const securities = selected.map((inst) => ({
          security_id: inst.security_id,
          symbol: inst.symbol,
          display_name: inst.display_name,
          exchange_segment: inst.exchange_segment,
          instrument_type: inst.instrument_type,
        }));

        const response = await postSignals({
          securities,
          timeframe,
          lookback_days: lookbackDays,
          params,
          include_frame: true,
          force_refresh: false,
          show_bars: showBars,
        });
        if (cancelled) return;
        setResults(response.results);
        setLastUpdated(new Date());
        updateSignalCache(response.results, timeframe);
      } catch (err) {
        if (cancelled) return;
        setSignalsError(
          err instanceof Error ? err.message : "Failed to compute signals"
        );
      } finally {
        if (!cancelled) setSignalsLoading(false);
      }
    }

    void compute();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drive off primitive keys only
  }, [currentSelectionKey, fingerprint]);

  async function handleRefreshInstruments() {
    setInstrumentsRefreshing(true);
    setInstrumentsError(null);
    try {
      await refreshInstrumentCache();
    } catch (err) {
      setInstrumentsError(
        err instanceof Error ? err.message : "Failed to refresh instruments"
      );
    } finally {
      setInstrumentsRefreshing(false);
    }
  }

  async function handleForceMarketRefresh() {
    if (selected.length === 0) return;
    setSignalsLoading(true);
    setSignalsError(null);
    try {
      const securities = selected.map((inst) => ({
        security_id: inst.security_id,
        symbol: inst.symbol,
        display_name: inst.display_name,
        exchange_segment: inst.exchange_segment,
        instrument_type: inst.instrument_type,
      }));
      const response = await postSignals({
        securities,
        timeframe,
        lookback_days: lookbackDays,
        params,
        include_frame: true,
        force_refresh: true,
        show_bars: showBars,
      });
      setResults(response.results);
      setLastUpdated(new Date());
      updateSignalCache(response.results, timeframe);
    } catch (err) {
      setSignalsError(
        err instanceof Error ? err.message : "Failed to compute signals"
      );
    } finally {
      setSignalsLoading(false);
    }
  }

  function handleResetToDefaults() {
    setParams(defaultParams);
    setTimeframe("15m");
    setLookbacks(defaultLookbacks);
    setLookbackDays(defaultLookbacks["15m"]);
    setShowBars(120);
  }

  function handleRemoveStock(securityId: string) {
    setSelected((prev) => prev.filter((s) => s.security_id !== securityId));
  }

  function handleLogout() {
    void (async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    })();
  }

  const showResultsSection = selected.length > 0 && results != null;

  return (
    <>
      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        params={params}
        onParamsChange={setParams}
        onRefreshInstruments={() => void handleRefreshInstruments()}
        onResetToDefaults={handleResetToDefaults}
        instrumentsLoading={instrumentsRefreshing}
      />

      <main className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-5 md:p-6 lg:p-8">
        <DashboardHeader
          lastUpdated={lastUpdated}
          signalsLoading={signalsLoading}
          refreshDisabled={selected.length === 0}
          onRefreshMarket={() => void handleForceMarketRefresh()}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={handleLogout}
        />

        <StockSearch
          selected={selected}
          onChange={setSelected}
          disabled={bootLoading}
        />

        {bootError ? (
          <div className="rounded-lg border border-[var(--ds-sell)] bg-[rgba(248,81,73,0.12)] px-3 py-2 text-sm text-[var(--ds-sell)]">
            {bootError}
          </div>
        ) : null}

        {instrumentsError ? (
          <div className="rounded-lg border border-[var(--ds-sell)] bg-[rgba(248,81,73,0.12)] px-3 py-2 text-sm text-[var(--ds-sell)]">
            {instrumentsError}
          </div>
        ) : null}

        {selected.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--ds-muted)]">
            <p>
              Pick stocks on the{" "}
              <Link href="/stocks" className="text-[var(--ds-text)] underline">
                Stocks
              </Link>{" "}
              page, or search here — try RELIANCE, HDFCBANK, or TCS.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 border-[var(--ds-border)]"
              onClick={() => router.push("/stocks")}
            >
              Go to Stocks coverage
            </Button>
          </div>
        ) : null}

        {signalsError ? (
          <div className="rounded-lg border border-[var(--ds-sell)] bg-[rgba(248,81,73,0.12)] px-3 py-2 text-sm text-[var(--ds-sell)]">
            {signalsError}
          </div>
        ) : null}

        {signalsLoading && !results ? <DashboardSkeleton /> : null}

        {showResultsSection ? (
          <div
            className={
              signalsLoading ? "space-y-4 opacity-60 transition-opacity" : "space-y-4"
            }
          >
            <ChartsPanel
              selected={selected}
              results={results}
              showBars={showBars}
              timeframe={timeframe}
              lookbackDays={lookbackDays}
              lookbacks={lookbacks}
              onTimeframeChange={setTimeframe}
              onLookbackChange={setLookbackDays}
              onShowBarsChange={setShowBars}
              onRemove={handleRemoveStock}
            />
            <ResultsTable results={results} />
          </div>
        ) : null}
      </main>
    </>
  );
}
