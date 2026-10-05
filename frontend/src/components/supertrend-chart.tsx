import { useEffect, useRef } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { loadPlotly } from "@/lib/load-plotly";
import type { ChartBar, Timeframe } from "@/lib/schemas";
import { buildSupertrendFigure } from "@/lib/supertrend-figure";

type SupertrendChartProps = {
  frame: ChartBar[] | null | undefined;
  symbol: string;
  showBars: number;
  timeframe: Timeframe;
};

export function SupertrendChart({
  frame,
  symbol,
  showBars,
  timeframe,
}: SupertrendChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const chartHeight = isDesktop ? 460 : 300;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    async function render() {
      const Plotly = await loadPlotly();
      if (cancelled || !el) return;
      const { data, layout, config } = buildSupertrendFigure(
        frame,
        symbol,
        showBars,
        timeframe,
        chartHeight
      );
      await Plotly.react(el, data, layout, config);
    }

    void render();

    return () => {
      cancelled = true;
      void loadPlotly().then((Plotly) => {
        Plotly.purge(el);
      });
    };
  }, [frame, symbol, showBars, timeframe, chartHeight]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl border border-[var(--ds-border)] bg-[var(--ds-bg)]"
      style={{ minHeight: chartHeight }}
    />
  );
}
