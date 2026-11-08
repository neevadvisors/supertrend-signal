import {
  type SignalCacheEntry,
  type SignalResult,
  type Timeframe,
} from "@/lib/schemas";
import { SIGNAL_CACHE_KEY } from "@/lib/coverage-storage";

function loadCache(): Record<string, SignalCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SIGNAL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SignalCacheEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, SignalCacheEntry>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIGNAL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function sideFromResult(result: SignalResult): string {
  const sig = (result.signal || "").toUpperCase();
  if (sig.includes("BUY")) return "BUY";
  if (sig.includes("SELL")) return "SELL";
  if (sig === "NONE" || sig === "HOLD") return "NONE";
  return sig || "NONE";
}

export function updateSignalCache(
  results: SignalResult[],
  timeframe: Timeframe
): void {
  const cache = loadCache();
  const now = new Date().toISOString();
  for (const row of results) {
    if (row.error) continue;
    const existing = cache[row.symbol] ?? {
      symbol: row.symbol,
      signals: {},
      lastRun: now,
    };
    existing.signals[timeframe] = sideFromResult(row);
    existing.lastRun = now;
    cache[row.symbol] = existing;
  }
  saveCache(cache);
}

export function getSignalCache(): Record<string, SignalCacheEntry> {
  return loadCache();
}

export function formatLastRun(iso?: string): string {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Never";
  }
}
