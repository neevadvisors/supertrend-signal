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

export const securityInputSchema = z.object({
  security_id: z.string(),
  symbol: z.string(),
  display_name: z.string(),
  exchange_segment: z.string(),
  instrument_type: z.string(),
});
export type SecurityInput = z.infer<typeof securityInputSchema>;

export const instrumentSchema = z.object({
  label: z.string(),
  symbol: z.string(),
  security_id: z.string(),
  exchange_segment: z.string(),
  instrument_type: z.string(),
  display_name: z.string(),
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
