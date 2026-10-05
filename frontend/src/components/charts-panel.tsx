import { useEffect, useState } from "react";
import { SupertrendChart } from "@/components/supertrend-chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SignalResult, Timeframe } from "@/lib/schemas";

type ChartsPanelProps = {
  results: SignalResult[];
  showBars: number;
  timeframe: Timeframe;
};

export function ChartsPanel({
  results,
  showBars,
  timeframe,
}: ChartsPanelProps) {
  const chartable = results.filter(
    (r) => Array.isArray(r.frame) && r.frame.length > 0
  );
  const symbolsKey = chartable.map((r) => r.symbol).join("|");

  const [selectedSymbol, setSelectedSymbol] = useState(
    chartable[0]?.symbol ?? ""
  );

  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split("|");
    setSelectedSymbol((prev) =>
      symbols.includes(prev) ? prev : (symbols[0] ?? "")
    );
  }, [symbolsKey]);

  if (chartable.length === 0) {
    return null;
  }

  const activeSymbol =
    chartable.find((r) => r.symbol === selectedSymbol)?.symbol ??
    chartable[0].symbol;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-[var(--ds-text)]">Charts</h2>

      {chartable.length > 6 ? (
        <div className="space-y-3">
          <Select
            value={activeSymbol}
            onValueChange={(value) => {
              if (typeof value === "string") setSelectedSymbol(value);
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Stock chart" />
            </SelectTrigger>
            <SelectContent>
              {chartable.map((row) => (
                <SelectItem key={row.symbol} value={row.symbol}>
                  {row.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chartable
            .filter((row) => row.symbol === activeSymbol)
            .map((row) => (
              <SupertrendChart
                key={row.symbol}
                frame={row.frame}
                symbol={row.symbol}
                showBars={showBars}
                timeframe={timeframe}
              />
            ))}
        </div>
      ) : (
        <Tabs defaultValue={chartable[0].symbol}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {chartable.map((row) => (
              <TabsTrigger key={row.symbol} value={row.symbol}>
                {row.symbol}
              </TabsTrigger>
            ))}
          </TabsList>
          {chartable.map((row) => (
            <TabsContent key={row.symbol} value={row.symbol}>
              <SupertrendChart
                frame={row.frame}
                symbol={row.symbol}
                showBars={showBars}
                timeframe={timeframe}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
