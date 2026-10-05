"use client";

import { useEffect, useState } from "react";
import { ChartsPanel } from "@/components/charts-panel";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { MetricsRow } from "@/components/metrics-row";
import { ResultsTable } from "@/components/results-table";
import { SettingsSidebar } from "@/components/settings-sidebar";
import { StockCards } from "@/components/stock-cards";
import { StockMultiselect } from "@/components/stock-multiselect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchMetaDefaults,
  postSignals,
  refreshInstrumentCache,
} from "@/lib/api";
import {
  DEFAULT_LOOKBACKS,
  DEFAULT_PARAMS,
  type Instrument,
  type NeevParams,
  type ShowBars,
  type SignalResult,
  type Timeframe,
} from "@/lib/schemas";

function settingsFingerprint(
  params: NeevParams,
  timeframe: Timeframe,
  lookbackDays: number
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
  ].join("|");
}

function selectionKey(items: Instrument[]): string {
  return items.map((i) => i.security_id).join(",");
}

export default function HomePage() {
  const [params, setParams] = useState<NeevParams>(DEFAULT_PARAMS);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [lookbackDays, setLookbackDays] = useState(30);
  const [lookbacks, setLookbacks] =
    useState<Record<Timeframe, number>>(DEFAULT_LOOKBACKS);
  const [showBars, setShowBars] = useState<ShowBars>(120);
  const [selected, setSelected] = useState<Instrument[]>([]);
  const [results, setResults] = useState<SignalResult[] | null>(null);
  const [resultSelectionKey, setResultSelectionKey] = useState<string | null>(
    null
  );
  const [lastSettings, setLastSettings] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [instrumentsRefreshing, setInstrumentsRefreshing] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [instrumentsError, setInstrumentsError] = useState<string | null>(null);
  const [signalsError, setSignalsError] = useState<string | null>(null);

  const fingerprint = settingsFingerprint(params, timeframe, lookbackDays);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBootLoading(true);
      setBootError(null);
      try {
        const meta = await fetchMetaDefaults();
        if (cancelled) return;
        setParams(meta.params);
        const nextLookbacks: Record<Timeframe, number> = {
          "15m": meta.lookbacks["15m"] ?? DEFAULT_LOOKBACKS["15m"],
          "1h": meta.lookbacks["1h"] ?? DEFAULT_LOOKBACKS["1h"],
          "4h": meta.lookbacks["4h"] ?? DEFAULT_LOOKBACKS["4h"],
        };
        setLookbacks(nextLookbacks);
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
    if (!results || selected.length === 0) return;
    if (lastSettings === null) return;
    if (fingerprint === lastSettings) return;

    let cancelled = false;

    async function recompute() {
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
        setResultSelectionKey(selectionKey(selected));
        setLastSettings(fingerprint);
      } catch (err) {
        if (cancelled) return;
        setSignalsError(
          err instanceof Error ? err.message : "Failed to compute signals"
        );
      } finally {
        if (!cancelled) setSignalsLoading(false);
      }
    }

    void recompute();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror Streamlit fingerprint recompute; keep deps primitive
  }, [fingerprint]);

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

  async function handleRefreshSignals() {
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
      setResultSelectionKey(selectionKey(selected));
      setLastSettings(fingerprint);
    } catch (err) {
      setSignalsError(
        err instanceof Error ? err.message : "Failed to compute signals"
      );
    } finally {
      setSignalsLoading(false);
    }
  }

  const currentSelectionKey = selectionKey(selected);
  const selectionChanged =
    results !== null &&
    resultSelectionKey !== null &&
    currentSelectionKey !== resultSelectionKey;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--ds-bg)] text-[var(--ds-text)] md:flex-row">
      <SettingsSidebar
        params={params}
        onParamsChange={setParams}
        onRefreshInstruments={() => void handleRefreshInstruments()}
        instrumentsLoading={instrumentsRefreshing}
      />

      <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Dhan Signals</h1>
          <p className="mt-1 text-sm text-[var(--ds-muted)]">
            NEEV AI Renko Supertrend — 15m, 1h, 4h
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-2">
            <Label>Timeframe</Label>
            <Tabs
              value={timeframe}
              onValueChange={(value) => {
                const next = String(value) as Timeframe;
                if (next !== "15m" && next !== "1h" && next !== "4h") return;
                if (next !== timeframe) {
                  setLookbackDays(lookbacks[next] ?? DEFAULT_LOOKBACKS[next]);
                }
                setTimeframe(next);
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="15m" className="flex-1">
                  15m
                </TabsTrigger>
                <TabsTrigger value="1h" className="flex-1">
                  1h
                </TabsTrigger>
                <TabsTrigger value="4h" className="flex-1">
                  4h
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="lookback">Lookback (days)</Label>
              <span className="font-mono text-xs text-[var(--ds-muted)]">
                {lookbackDays}
              </span>
            </div>
            <Slider
              id="lookback"
              min={5}
              max={365}
              step={1}
              value={[lookbackDays]}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v;
                if (typeof next === "number") setLookbackDays(next);
              }}
            />
          </div>
        </div>

        <StockMultiselect
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

        <div className="space-y-2">
          <Label>Bars on chart</Label>
          <Tabs
            value={String(showBars)}
            onValueChange={(value) => {
              const n = Number(value);
              if (n === 60 || n === 120 || n === 250) setShowBars(n);
            }}
          >
            <TabsList>
              <TabsTrigger value="60">60</TabsTrigger>
              <TabsTrigger value="120">120</TabsTrigger>
              <TabsTrigger value="250">250</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Button
          type="button"
          disabled={selected.length === 0 || signalsLoading}
          onClick={() => void handleRefreshSignals()}
        >
          {signalsLoading ? "Refreshing…" : "Refresh signals"}
        </Button>

        {selected.length === 0 ? (
          <p className="text-sm text-[var(--ds-muted)]">
            Select one or more stocks, then click{" "}
            <strong>Refresh signals</strong>.
          </p>
        ) : null}

        {selected.length > 0 && results === null && !signalsLoading ? (
          <p className="text-sm text-[var(--ds-muted)]">
            {selected.length} stock(s) selected. Click{" "}
            <strong>Refresh signals</strong> to compute.
          </p>
        ) : null}

        {selectionChanged ? (
          <div className="rounded-lg border border-[var(--ds-hold)] bg-[rgba(210,153,34,0.12)] px-3 py-2 text-sm text-[var(--ds-hold)]">
            Selection changed — click <strong>Refresh signals</strong> to
            update.
          </div>
        ) : null}

        {signalsError ? (
          <div className="rounded-lg border border-[var(--ds-sell)] bg-[rgba(248,81,73,0.12)] px-3 py-2 text-sm text-[var(--ds-sell)]">
            {signalsError}
          </div>
        ) : null}

        {signalsLoading ? <DashboardSkeleton /> : null}

        {!signalsLoading && results ? (
          <div className="space-y-6">
            <MetricsRow results={results} />
            <StockCards results={results} />
            <ChartsPanel
              results={results}
              showBars={showBars}
              timeframe={timeframe}
            />
            <ResultsTable results={results} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
