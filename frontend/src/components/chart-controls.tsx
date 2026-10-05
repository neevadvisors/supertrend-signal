import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_LOOKBACKS,
  type ShowBars,
  type Timeframe,
} from "@/lib/schemas";

type ChartControlsProps = {
  timeframe: Timeframe;
  lookbackDays: number;
  lookbacks: Record<Timeframe, number>;
  showBars: ShowBars;
  onTimeframeChange: (next: Timeframe) => void;
  onLookbackChange: (days: number) => void;
  onShowBarsChange: (bars: ShowBars) => void;
};

export function ChartControls({
  timeframe,
  lookbackDays,
  lookbacks,
  showBars,
  onTimeframeChange,
  onLookbackChange,
  onShowBarsChange,
}: ChartControlsProps) {
  const [lookbackDraft, setLookbackDraft] = useState(lookbackDays);

  useEffect(() => {
    setLookbackDraft(lookbackDays);
  }, [lookbackDays]);

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2.5">
      <div className="min-w-[140px] flex-1 space-y-1">
        <Label className="text-xs text-[var(--ds-muted)]">Timeframe</Label>
        <Tabs
          value={timeframe}
          onValueChange={(value) => {
            const next = String(value) as Timeframe;
            if (next !== "15m" && next !== "1h" && next !== "4h") return;
            if (next !== timeframe) {
              onLookbackChange(lookbacks[next] ?? DEFAULT_LOOKBACKS[next]);
            }
            onTimeframeChange(next);
          }}
        >
          <TabsList className="h-8 w-full">
            <TabsTrigger value="15m" className="flex-1 px-2 text-xs">
              15m
            </TabsTrigger>
            <TabsTrigger value="1h" className="flex-1 px-2 text-xs">
              1h
            </TabsTrigger>
            <TabsTrigger value="4h" className="flex-1 px-2 text-xs">
              4h
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="min-w-[160px] flex-[2] space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="lookback-chart" className="text-xs text-[var(--ds-muted)]">
            Lookback (days)
          </Label>
          <span className="font-mono text-xs text-[var(--ds-muted)]">
            {lookbackDraft}
          </span>
        </div>
        <Slider
          id="lookback-chart"
          min={5}
          max={365}
          step={1}
          value={[lookbackDraft]}
          onValueChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            if (typeof next === "number") setLookbackDraft(next);
          }}
          onValueCommitted={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            if (typeof next === "number") onLookbackChange(next);
          }}
        />
      </div>

      <div className="min-w-[120px] space-y-1">
        <Label className="text-xs text-[var(--ds-muted)]">Bars on chart</Label>
        <Tabs
          value={String(showBars)}
          onValueChange={(value) => {
            const n = Number(value);
            if (n === 60 || n === 120 || n === 250) onShowBarsChange(n);
          }}
        >
          <TabsList className="h-8">
            <TabsTrigger value="60" className="px-2.5 text-xs">
              60
            </TabsTrigger>
            <TabsTrigger value="120" className="px-2.5 text-xs">
              120
            </TabsTrigger>
            <TabsTrigger value="250" className="px-2.5 text-xs">
              250
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
