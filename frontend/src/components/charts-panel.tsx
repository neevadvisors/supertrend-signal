import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { cn } from "cn";
import { ChartControls } from "@/components/chart-controls";
import { signalDotColor, StockCard } from "@/components/stock-cards";
import { SupertrendChart } from "@/components/supertrend-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Instrument,
  ShowBars,
  SignalResult,
  Timeframe,
} from "@/lib/schemas";

type ChartsPanelProps = {
  selected: Instrument[];
  results: SignalResult[];
  showBars: ShowBars;
  timeframe: Timeframe;
  lookbackDays: number;
  lookbacks: Record<Timeframe, number>;
  onTimeframeChange: (next: Timeframe) => void;
  onLookbackChange: (days: number) => void;
  onShowBarsChange: (bars: ShowBars) => void;
  onRemove: (securityId: string) => void;
};

export function ChartsPanel({
  selected,
  results,
  showBars,
  timeframe,
  lookbackDays,
  lookbacks,
  onTimeframeChange,
  onLookbackChange,
  onShowBarsChange,
  onRemove,
}: ChartsPanelProps) {
  const selectionKey = selected.map((i) => i.security_id).join("|");

  const [activeSymbol, setActiveSymbol] = useState(selected[0]?.symbol ?? "");

  useEffect(() => {
    if (!selectionKey) {
      setActiveSymbol("");
      return;
    }
    const symbols = selected.map((i) => i.symbol);
    setActiveSymbol((prev) =>
      symbols.includes(prev) ? prev : (symbols[0] ?? "")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync tab when selection ids change
  }, [selectionKey]);

  if (selected.length === 0) {
    return null;
  }

  const hasAnyChart = results.some(
    (r) => Array.isArray(r.frame) && r.frame.length > 0
  );

  const resultsBySymbol = new Map(results.map((r) => [r.symbol, r]));
  const active =
    selected.find((i) => i.symbol === activeSymbol)?.symbol ??
    selected[0]?.symbol ??
    "";

  return (
    <section className="space-y-3">
      {hasAnyChart ? (
        <ChartControls
          timeframe={timeframe}
          lookbackDays={lookbackDays}
          lookbacks={lookbacks}
          showBars={showBars}
          onTimeframeChange={onTimeframeChange}
          onLookbackChange={onLookbackChange}
          onShowBarsChange={onShowBarsChange}
        />
      ) : null}

      <Tabs
        value={active}
        onValueChange={(value) => {
          if (typeof value === "string") setActiveSymbol(value);
        }}
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="inline-flex h-auto w-max min-w-full flex-nowrap justify-start gap-1 bg-transparent p-0">
            {selected.map((inst) => {
              const row = resultsBySymbol.get(inst.symbol);
              const dot = signalDotColor(row?.signal);
              return (
                <TabsTrigger
                  key={inst.security_id}
                  value={inst.symbol}
                  className="group flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2.5 data-active:border-[var(--ds-text)] data-active:bg-[var(--ds-surface)]"
                >
                  <span
                    className={cn("size-2 shrink-0 rounded-full", dot)}
                    aria-hidden
                  />
                  <span className="max-w-[7rem] truncate text-xs font-medium sm:max-w-none">
                    {inst.symbol}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100 [&_svg]:pointer-events-auto"
                    aria-label={`Remove ${inst.symbol}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onRemove(inst.security_id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        onRemove(inst.security_id);
                      }
                    }}
                  >
                    <XIcon className="size-3" />
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {selected.map((inst) => {
          const row = resultsBySymbol.get(inst.symbol);
          const hasFrame =
            row &&
            Array.isArray(row.frame) &&
            row.frame.length > 0;

          return (
            <TabsContent
              key={inst.security_id}
              value={inst.symbol}
              className="mt-2 space-y-2 outline-none"
            >
              {row ? <StockCard row={row} /> : null}
              {hasFrame && row ? (
                <SupertrendChart
                  frame={row.frame}
                  symbol={row.symbol}
                  showBars={showBars}
                  timeframe={timeframe}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--ds-border)] px-4 py-8 text-center text-sm text-[var(--ds-muted)]">
                  {row?.error
                    ? "Chart unavailable for this symbol."
                    : "Loading chart…"}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}
