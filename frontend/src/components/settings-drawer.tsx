import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { NeevParams } from "@/lib/schemas";

type SettingsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: NeevParams;
  onParamsChange: (next: NeevParams) => void;
  onRefreshInstruments: () => void;
  onResetToDefaults: () => void;
  instrumentsLoading?: boolean;
};

function SettingsFields({
  params,
  onParamsChange,
}: {
  params: NeevParams;
  onParamsChange: (next: NeevParams) => void;
}) {
  const [atrDraft, setAtrDraft] = useState(params.atr_len);
  const [factorDraft, setFactorDraft] = useState(params.base_factor);
  const [adxDraft, setAdxDraft] = useState(params.adx_thresh);

  useEffect(() => {
    setAtrDraft(params.atr_len);
  }, [params.atr_len]);

  useEffect(() => {
    setFactorDraft(params.base_factor);
  }, [params.base_factor]);

  useEffect(() => {
    setAdxDraft(params.adx_thresh);
  }, [params.adx_thresh]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="atr-len">ATR length</Label>
          <span className="font-mono text-xs text-[var(--ds-muted)]">
            {atrDraft}
          </span>
        </div>
        <Slider
          id="atr-len"
          min={1}
          max={50}
          step={1}
          value={[atrDraft]}
          onValueChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            if (typeof next === "number") setAtrDraft(next);
          }}
          onValueCommitted={(v) => {
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
            {factorDraft.toFixed(1)}
          </span>
        </div>
        <Slider
          id="base-factor"
          min={0.5}
          max={8}
          step={0.1}
          value={[factorDraft]}
          onValueChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            if (typeof next === "number") setFactorDraft(next);
          }}
          onValueCommitted={(v) => {
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
              {adxDraft}
            </span>
          </div>
          <Slider
            id="adx-thresh"
            min={5}
            max={40}
            step={1}
            value={[adxDraft]}
            onValueChange={(v) => {
              const next = Array.isArray(v) ? v[0] : v;
              if (typeof next === "number") setAdxDraft(next);
            }}
            onValueCommitted={(v) => {
              const next = Array.isArray(v) ? v[0] : v;
              if (typeof next === "number") {
                onParamsChange({ ...params, adx_thresh: next });
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SettingsFooter({
  onResetToDefaults,
  onRefreshInstruments,
  instrumentsLoading,
}: {
  onResetToDefaults: () => void;
  onRefreshInstruments: () => void;
  instrumentsLoading?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <Button type="button" variant="outline" onClick={onResetToDefaults}>
        Reset to defaults
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={instrumentsLoading}
        onClick={onRefreshInstruments}
      >
        {instrumentsLoading ? "Refreshing…" : "Refresh instrument list"}
      </Button>
    </div>
  );
}

export function SettingsDrawer({
  open,
  onOpenChange,
  params,
  onParamsChange,
  onRefreshInstruments,
  onResetToDefaults,
  instrumentsLoading,
}: SettingsDrawerProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Supertrend settings</SheetTitle>
            <SheetDescription>NEEV Renko Supertrend parameters</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-4 pb-4">
            <SettingsFields params={params} onParamsChange={onParamsChange} />
          </ScrollArea>
          <SheetFooter>
            <SettingsFooter
              onResetToDefaults={onResetToDefaults}
              onRefreshInstruments={onRefreshInstruments}
              instrumentsLoading={instrumentsLoading}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader>
          <DrawerTitle>Supertrend settings</DrawerTitle>
          <DrawerDescription>NEEV Renko Supertrend parameters</DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="max-h-[50dvh] px-4 pb-2">
          <SettingsFields params={params} onParamsChange={onParamsChange} />
        </ScrollArea>
        <DrawerFooter>
          <SettingsFooter
            onResetToDefaults={onResetToDefaults}
            onRefreshInstruments={onRefreshInstruments}
            instrumentsLoading={instrumentsLoading}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
