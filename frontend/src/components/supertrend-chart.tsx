import { useEffect, useRef } from "react";
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    async function render() {
      const Plotly = (await import("plotly.js-dist-min")).default;
      if (cancelled || !el) return;
      const { data, layout, config } = buildSupertrendFigure(
        frame,
        symbol,
        showBars,
        timeframe
      );
      await Plotly.react(el, data, layout, config);
    }

    void render();

    return () => {
      cancelled = true;
      void import("plotly.js-dist-min").then(({ default: Plotly }) => {
        Plotly.purge(el);
      });
    };
  }, [frame, symbol, showBars, timeframe]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl border border-[var(--ds-border)] bg-[var(--ds-bg)]"
      style={{ minHeight: 420 }}
    />
  );
}
