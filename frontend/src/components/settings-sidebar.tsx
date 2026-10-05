import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { NeevParams } from "@/lib/schemas";

type SettingsSidebarProps = {
  params: NeevParams;
  onParamsChange: (next: NeevParams) => void;
  onRefreshInstruments: () => void;
  instrumentsLoading?: boolean;
};

export function SettingsSidebar({
  params,
  onParamsChange,
  onRefreshInstruments,
  instrumentsLoading,
}: SettingsSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col gap-5 border-r border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 md:w-72 md:shrink-0 lg:w-80">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-[var(--ds-text)]">
          Supertrend settings
        </h2>
        <p className="mt-1 text-xs text-[var(--ds-muted)]">
          NEEV Renko Supertrend parameters
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="atr-len">ATR length</Label>
            <span className="font-mono text-xs text-[var(--ds-muted)]">
              {params.atr_len}
            </span>
          </div>
          <Slider
            id="atr-len"
            min={1}
            max={50}
            step={1}
            value={[params.atr_len]}
            onValueChange={(v) => {
              const next = Array.isArray(v) ? v[0] : v;
              if (typeof next === "number") {
                onParamsChange({ ...params, atr_len: next });
              }
            }}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="base-factor">Base factor</Label>
            <span className="font-mono text-xs text-[var(--ds-muted)]">
              {params.base_factor.toFixed(1)}
            </span>
          </div>
          <Slider
            id="base-factor"
            min={0.5}
            max={8}
            step={0.1}
            value={[params.base_factor]}
            onValueChange={(v) => {
              const next = Array.isArray(v) ? v[0] : v;
              if (typeof next === "number") {
                onParamsChange({ ...params, base_factor: next });
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="auto-box">Auto brick size</Label>
          <Switch
            id="auto-box"
            checked={params.auto_box}
            onCheckedChange={(checked) =>
              onParamsChange({ ...params, auto_box: Boolean(checked) })
            }
          />
        </div>

        {!params.auto_box ? (
          <div className="space-y-2">
            <Label htmlFor="manual-box">Manual brick size</Label>
            <Input
              id="manual-box"
              type="number"
              min={0.01}
              step={0.01}
              value={params.manual_box}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) {
                  onParamsChange({ ...params, manual_box: value });
                }
              }}
            />
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="vol-filter">Choppy filter (ADX)</Label>
          <Switch
            id="vol-filter"
            checked={params.vol_filter}
            onCheckedChange={(checked) =>
              onParamsChange({ ...params, vol_filter: Boolean(checked) })
            }
          />
        </div>

        {params.vol_filter ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="adx-thresh">ADX threshold</Label>
              <span className="font-mono text-xs text-[var(--ds-muted)]">
                {params.adx_thresh}
              </span>
            </div>
            <Slider
              id="adx-thresh"
              min={5}
              max={40}
              step={1}
              value={[params.adx_thresh]}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v;
                if (typeof next === "number") {
                  onParamsChange({ ...params, adx_thresh: next });
                }
              }}
            />
          </div>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-[var(--ds-text)]">
          Instruments
        </h2>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={instrumentsLoading}
          onClick={onRefreshInstruments}
        >
          {instrumentsLoading ? "Refreshing…" : "Refresh instrument list"}
        </Button>
      </div>
    </aside>
  );
}
