import { z } from "zod";

export const timeframeSchema = z.enum(["15m", "1h", "4h"]);
export type Timeframe = z.infer<typeof timeframeSchema>;

export const showBarsSchema = z.union([
  z.literal(60),
  z.literal(120),
  z.literal(250),
]);
export type ShowBars = z.infer<typeof showBarsSchema>;

export const neevParamsSchema = z.object({
  atr_len: z.number().int().min(1).max(50),
  base_factor: z.number().min(0.5).max(8),
  auto_box: z.boolean(),
  manual_box: z.number().min(0.01),
  vol_filter: z.boolean(),
  adx_thresh: z.number().int().min(5).max(40),
});
export type NeevParams = z.infer<typeof neevParamsSchema>;

export const marketSchema = z.enum(["IN", "US"]);
export type Market = z.infer<typeof marketSchema>;

export const currencySchema = z.enum(["INR", "USD"]);
export type Currency = z.infer<typeof currencySchema>;

export const securityInputSchema = z.object({
  security_id: z.string(),
  symbol: z.string(),
  display_name: z.string(),
  exchange_segment: z.string(),
  instrument_type: z.string(),
  market: marketSchema.optional(),
  currency: currencySchema.optional(),
});
export type SecurityInput = z.infer<typeof securityInputSchema>;

export const instrumentSchema = z.object({
  label: z.string(),
  symbol: z.string(),
  security_id: z.string(),
  exchange_segment: z.string(),
  instrument_type: z.string(),
  display_name: z.string(),
  market: marketSchema.optional(),
  currency: currencySchema.optional(),
});
export type Instrument = z.infer<typeof instrumentSchema>;

export const chartBarSchema = z.object({
  timestamp: z.string().nullable().optional(),
  open: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  close: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  st: z.number().nullable().optional(),
  trend: z.union([z.number(), z.string()]).nullable().optional(),
  buy: z.boolean().optional(),
  sell: z.boolean().optional(),
});
export type ChartBar = z.infer<typeof chartBarSchema>;

export const signalResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  signal: z.string(),
  trend: z.string().nullable().optional(),
  bars_since_flip: z.number().nullable().optional(),
  close: z.number().nullable().optional(),
  st_level: z.number().nullable().optional(),
  regime: z.string().nullable().optional(),
  bar_time: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  frame: z.array(chartBarSchema).nullable().optional(),
});
export type SignalResult = z.infer<typeof signalResultSchema>;

export const signalsRequestSchema = z.object({
  securities: z.array(securityInputSchema).min(1),
  timeframe: timeframeSchema,
  lookback_days: z.number().int().min(5).max(365),
  params: neevParamsSchema,
  include_frame: z.literal(true),
  force_refresh: z.boolean(),
  show_bars: showBarsSchema,
});
export type SignalsRequest = z.infer<typeof signalsRequestSchema>;

export const signalsResponseSchema = z.object({
  results: z.array(signalResultSchema),
});
export type SignalsResponse = z.infer<typeof signalsResponseSchema>;

export const metaDefaultsSchema = z.object({
  lookbacks: z.record(z.string(), z.number()),
  params: neevParamsSchema,
  chart_bar_options: z.array(z.number()).optional(),
});
export type MetaDefaults = z.infer<typeof metaDefaultsSchema>;

export const healthSchema = z.object({
  status: z.string(),
});

export const indexSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  market: z.string(),
  tier: z.string(),
  size: z.number().int(),
  blurb: z.string(),
  refreshed_at: z.string().nullable().optional(),
});
export type IndexSummary = z.infer<typeof indexSummarySchema>;

export const indicesCatalogSchema = z.object({
  refreshed_at: z.string().nullable().optional(),
  indices: z.array(indexSummarySchema),
});
export type IndicesCatalog = z.infer<typeof indicesCatalogSchema>;

export const unresolvedSymbolSchema = z.object({
  symbol: z.string(),
  reason: z.string(),
});

export const indexMembersSchema = z.object({
  id: z.string(),
  name: z.string(),
  market: z.string(),
  tier: z.string(),
  size: z.number().int(),
  blurb: z.string(),
  refreshed_at: z.string().nullable().optional(),
  members: z.array(instrumentSchema),
  unresolved: z.array(unresolvedSymbolSchema),
  resolved_count: z.number().int(),
  unresolved_count: z.number().int(),
});
export type IndexMembers = z.infer<typeof indexMembersSchema>;

export type TimeframeSignals = Record<Timeframe, string | undefined>;

export type SignalCacheEntry = {
  symbol: string;
  signals: TimeframeSignals;
  lastRun: string;
};

export const coverageStateSchema = z.object({
  indexIds: z.array(z.string()),
  manual: z.array(instrumentSchema),
  indexAddedOn: z.record(z.string(), z.string()).optional(),
  indexLastRun: z.record(z.string(), z.string()).optional(),
});
export type CoverageState = z.infer<typeof coverageStateSchema>;

export const stocksSignalTfSchema = z.enum(["1h", "4h", "1d"]);
export type StocksSignalTf = z.infer<typeof stocksSignalTfSchema>;

export const coverageRowSchema = z.object({
  security_id: z.string(),
  symbol: z.string(),
  display_name: z.string(),
  exchange_segment: z.string(),
  market: marketSchema.optional(),
  currency: currencySchema.optional(),
  sources: z.array(z.string()),
  manual: z.boolean(),
  ltp: z.number().nullable().optional(),
  change_pct: z.number().nullable().optional(),
  signals: z.object({
    "1h": z.string().nullable().optional(),
    "4h": z.string().nullable().optional(),
    "1d": z.string().nullable().optional(),
  }),
  error: z.string().nullable().optional(),
  last_run_at: z.string().nullable().optional(),
});
export type CoverageRow = z.infer<typeof coverageRowSchema>;

export const coverageRowsResponseSchema = z.object({
  last_run_at: z.string().nullable().optional(),
  quote_error: z.string().nullable().optional(),
  rows: z.array(coverageRowSchema),
});
export type CoverageRowsResponse = z.infer<typeof coverageRowsResponseSchema>;

export const DEFAULT_PARAMS: NeevParams = {
  atr_len: 14,
  base_factor: 3,
  auto_box: true,
  manual_box: 10,
  vol_filter: false,
  adx_thresh: 15,
};

export const DEFAULT_LOOKBACKS: Record<Timeframe, number> = {
  "15m": 30,
  "1h": 90,
  "4h": 365,
};

export const reviewTimeframeSchema = z.enum(["1h", "4h", "1d"]);
export type ReviewTimeframe = z.infer<typeof reviewTimeframeSchema>;

export const signalCellSchema = z.object({
  security_id: z.string(),
  symbol: z.string(),
  timeframe: reviewTimeframeSchema,
  side: z.string(),
  entry: z.number().nullable(),
  target: z.number().nullable(),
  stop: z.number().nullable(),
  note: z.string(),
  status: z.string(),
  computed_at: z.string(),
  run_id: z.string(),
  market: marketSchema.optional(),
  currency: currencySchema.optional(),
});
export type SignalCell = z.infer<typeof signalCellSchema>;

export const matrixStockSchema = z.object({
  security_id: z.string(),
  symbol: z.string(),
  display_name: z.string(),
  exchange_segment: z.string(),
  market: marketSchema.optional(),
  currency: currencySchema.optional(),
  sources: z.array(z.string()),
  manual: z.boolean(),
  ltp: z.number().nullable().optional(),
  change_pct: z.number().nullable().optional(),
  last_run_at: z.string().nullable().optional(),
});
export type MatrixStock = z.infer<typeof matrixStockSchema>;

export const latestRunSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  symbol_count: z.number(),
  finished_at: z.string().nullable(),
});
export type LatestRun = z.infer<typeof latestRunSchema>;

export const latestJobSchema = z.object({
  id: z.string(),
  status: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  symbol_count: z.number(),
  error_count: z.number(),
  trigger: z.string(),
});
export type LatestJob = z.infer<typeof latestJobSchema>;

export const signalMatrixResponseSchema = z.object({
  last_run_at: z.string().nullable(),
  pending_count: z.number(),
  latest_run: latestRunSchema.nullable().optional(),
  stocks: z.array(matrixStockSchema),
  cells: z.array(signalCellSchema),
});
export type SignalMatrixResponse = z.infer<typeof signalMatrixResponseSchema>;

export const REVIEW_TIMEFRAMES: {
  id: ReviewTimeframe;
  label: string;
  horizon: string;
}[] = [
  { id: "1h", label: "1 Hour", horizon: "1–3 days" },
  { id: "4h", label: "4 Hour", horizon: "3–10 days" },
  { id: "1d", label: "1 Day", horizon: "2–6 weeks" },
];
