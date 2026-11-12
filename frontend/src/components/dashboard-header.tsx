import { Loader2Icon, LogOutIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type DashboardHeaderProps = {
  lastUpdated: Date | null;
  signalsLoading: boolean;
  refreshDisabled: boolean;
  onRefreshMarket: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

function formatUpdated(at: Date): string {
  return at.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DashboardHeader({
  lastUpdated,
  signalsLoading,
  refreshDisabled,
  onRefreshMarket,
  onOpenSettings,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-40 -mx-4 flex h-14 items-center justify-between gap-3 border-b border-[var(--ds-border)] bg-[var(--ds-bg)]/85 px-4 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
          Neev Signals
        </h1>
        <p className="hidden text-xs text-[var(--ds-muted)] sm:block">
          NEEV AI Renko Supertrend
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {lastUpdated ? (
          <span className="hidden text-xs text-[var(--ds-muted)] sm:inline">
            Updated {formatUpdated(lastUpdated)}, cached ~15m
          </span>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={refreshDisabled}
          aria-label="Refresh market data"
          onClick={onRefreshMarket}
        >
          {signalsLoading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon className="size-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Log out"
          onClick={onLogout}
        >
          <LogOutIcon className="size-4" />
        </Button>
      </div>
    </header>
  );
}
