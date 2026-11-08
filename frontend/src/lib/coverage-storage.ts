import {
  coverageStateSchema,
  instrumentSchema,
  neevParamsSchema,
  showBarsSchema,
  signalResultSchema,
  timeframeSchema,
  type CoverageState,
  type Instrument,
  type NeevParams,
  type ShowBars,
  type SignalResult,
  type Timeframe,
} from "@/lib/schemas";

export const COVERAGE_STORAGE_KEY = "ds:coverage";
export const SIGNAL_CACHE_KEY = "ds:signal-cache";
export const STOCKS_RUN_KEY = "ds:stocks-run";

export function loadCoverage(): CoverageState {
  if (typeof window === "undefined") {
    return { indexIds: [], manual: [] };
  }
  try {
    const raw = window.localStorage.getItem(COVERAGE_STORAGE_KEY);
    if (!raw) return { indexIds: [], manual: [] };
    const parsed = coverageStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { indexIds: [], manual: [] };
    return parsed.data;
  } catch {
    return { indexIds: [], manual: [] };
  }
}

export function saveCoverage(state: CoverageState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COVERAGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export type IndexMembersMap = Record<string, Instrument[]>;

export function mergeCoverageInstruments(
  coverage: CoverageState,
  indexMembers: IndexMembersMap
): Instrument[] {
  const byId = new Map<string, Instrument>();
  for (const id of coverage.indexIds) {
    const members = indexMembers[id] ?? [];
    for (const inst of members) {
      byId.set(inst.security_id, inst);
    }
  }
  for (const inst of coverage.manual) {
    byId.set(inst.security_id, inst);
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
}

export function coverageTagsForInstrument(
  inst: Instrument,
  coverage: CoverageState,
  indexMembers: IndexMembersMap,
  indexNames: Record<string, string>
): string[] {
  const tags: string[] = [];
  if (coverage.manual.some((m) => m.security_id === inst.security_id)) {
    tags.push("Individual");
  }
  for (const id of coverage.indexIds) {
    const members = indexMembers[id] ?? [];
    if (members.some((m) => m.security_id === inst.security_id)) {
      tags.push(indexNames[id] ?? id);
    }
  }
  return tags;
}

export type StocksRunPayload = {
  selected: Instrument[];
  results: SignalResult[];
  params: NeevParams;
  timeframe: Timeframe;
  lookbackDays: number;
  showBars: ShowBars;
};

export function writeStocksRun(payload: StocksRunPayload): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STOCKS_RUN_KEY, JSON.stringify(payload));
}

export function consumeStocksRun(): StocksRunPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STOCKS_RUN_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(STOCKS_RUN_KEY);
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    const selected = instrumentSchema.array().safeParse(record.selected);
    const results = signalResultSchema.array().safeParse(record.results);
    const params = neevParamsSchema.safeParse(record.params);
    const timeframe = timeframeSchema.safeParse(record.timeframe);
    const showBars = showBarsSchema.safeParse(record.showBars);
    const lookback =
      typeof record.lookbackDays === "number" ? record.lookbackDays : null;
    if (
      !selected.success ||
      !results.success ||
      !params.success ||
      !timeframe.success ||
      !showBars.success ||
      lookback == null ||
      !Number.isFinite(lookback)
    ) {
      return null;
    }
    return {
      selected: selected.data,
      results: results.data,
      params: params.data,
      timeframe: timeframe.data,
      lookbackDays: Math.min(365, Math.max(5, Math.round(lookback))),
      showBars: showBars.data,
    };
  } catch {
    return null;
  }
}
