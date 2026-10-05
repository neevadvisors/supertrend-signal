import type { Data, Layout, Config } from "plotly.js";
import type { ChartBar, Timeframe } from "@/lib/schemas";

const BULL_COLOR = "#22c55e";
const BEAR_COLOR = "#ef4444";
const BUY_MARKER = "#4ade80";
const SELL_MARKER = "#f87171";
const PAPER_BG = "#0e1117";
const PLOT_BG = "#161b22";
const GRID = "#30363d";
const TEXT = "#e6edf3";

type CleanBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  st: number | null;
  trend: ChartBar["trend"];
  buy: boolean;
  sell: boolean;
};

function isBull(trend: ChartBar["trend"]): boolean {
  if (trend === null || trend === undefined) return true;
  if (typeof trend === "string") {
    const t = trend.trim().toUpperCase();
    if (t === "BULL" || t === "1" || t === "TRUE") return true;
    if (t === "BEAR" || t === "-1" || t === "FALSE") return false;
  }
  const n = Number(trend);
  if (Number.isFinite(n)) return n > 0;
  return true;
}

function chartLayoutMetrics(chartHeight: number): {
  height: number;
  margin: { l: number; r: number; t: number; b: number };
  titleSize: number;
} {
  const compact = chartHeight <= 320;
  return {
    height: chartHeight,
    margin: compact
      ? { l: 40, r: 16, t: 56, b: 32 }
      : { l: 48, r: 24, t: 72, b: 40 },
    titleSize: compact ? 14 : 16,
  };
}

function emptyFigure(
  symbol: string,
  chartHeight: number
): { data: Data[]; layout: Partial<Layout> } {
  const { height, margin, titleSize } = chartLayoutMetrics(chartHeight);
  return {
    data: [],
    layout: {
      title: { text: `${symbol} — no data`, font: { color: TEXT, size: titleSize } },
      paper_bgcolor: PAPER_BG,
      plot_bgcolor: PLOT_BG,
      height,
      margin,
      font: { color: TEXT },
    },
  };
}

function addStFill(
  data: Data[],
  bars: CleanBar[],
  bull: boolean[]
): void {
  const n = bars.length;
  let start = 0;
  for (let i = 1; i <= n; i += 1) {
    if (i < n && bull[i] === bull[start]) continue;
    const segment = bars.slice(start, i);
    const isBullSeg = bull[start];
    const fillColor = isBullSeg
      ? "rgba(34, 197, 94, 0.12)"
      : "rgba(239, 68, 68, 0.12)";
    data.push({
      x: segment.map((b) => b.timestamp),
      y: segment.map((b) => b.close),
      type: "scatter",
      mode: "lines",
      line: { width: 0 },
      showlegend: false,
      hoverinfo: "skip",
    });
    data.push({
      x: segment.map((b) => b.timestamp),
      y: segment.map((b) => b.st),
      type: "scatter",
      mode: "lines",
      line: { width: 0 },
      fill: "tonexty",
      fillcolor: fillColor,
      showlegend: false,
      hoverinfo: "skip",
    });
    start = i;
  }
}

function addStSegments(
  data: Data[],
  bars: CleanBar[],
  bull: boolean[]
): void {
  const n = bars.length;
  let start = 0;
  for (let i = 1; i <= n; i += 1) {
    if (i < n && bull[i] === bull[start]) continue;
    const segment = bars.slice(start, i);
    const color = bull[start] ? BULL_COLOR : BEAR_COLOR;
    data.push({
      x: segment.map((b) => b.timestamp),
      y: segment.map((b) => b.st),
      type: "scatter",
      mode: "lines",
      line: { color, width: 2 },
      name: "Supertrend",
      legendgroup: "st",
      showlegend: start === 0,
      hovertemplate: "ST: %{y:.2f}<extra></extra>",
    });
    start = i;
  }
}

export function buildSupertrendFigure(
  frame: ChartBar[] | null | undefined,
  symbol: string,
  showBars: number,
  timeframe: Timeframe,
  chartHeight = 420
): { data: Data[]; layout: Partial<Layout>; config: Partial<Config> } {
  const config: Partial<Config> = {
    displayModeBar: false,
    scrollZoom: false,
    doubleClick: false,
    responsive: true,
  };

  if (!frame || frame.length === 0) {
    const empty = emptyFigure(symbol, chartHeight);
    return { ...empty, config };
  }

  const cleaned: CleanBar[] = [];
  for (const row of frame) {
    const ts = row.timestamp;
    const open = row.open;
    const high = row.high;
    const low = row.low;
    const close = row.close;
    if (
      ts == null ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    cleaned.push({
      timestamp: String(ts),
      open,
      high,
      low,
      close,
      st: row.st != null && Number.isFinite(row.st) ? row.st : null,
      trend: row.trend,
      buy: Boolean(row.buy),
      sell: Boolean(row.sell),
    });
  }

  const df = cleaned.slice(-showBars);
  if (df.length === 0) {
    const empty = emptyFigure(symbol, chartHeight);
    return { ...empty, config };
  }

  const bull = df.map((b) => isBull(b.trend));
  const data: Data[] = [];

  data.push({
    x: df.map((b) => b.timestamp),
    open: df.map((b) => b.open),
    high: df.map((b) => b.high),
    low: df.map((b) => b.low),
    close: df.map((b) => b.close),
    type: "candlestick",
    name: "Price",
    increasing: { line: { color: BULL_COLOR }, fillcolor: BULL_COLOR },
    decreasing: { line: { color: BEAR_COLOR }, fillcolor: BEAR_COLOR },
  } as Data);

  const withSt = df.every((b) => b.st != null);
  if (withSt) {
    addStFill(data, df, bull);
    addStSegments(data, df, bull);
  }

  const buys = df.filter((b) => b.buy);
  if (buys.length > 0) {
    data.push({
      x: buys.map((b) => b.timestamp),
      y: buys.map((b) => b.close),
      type: "scatter",
      mode: "markers",
      name: "BUY",
      marker: {
        symbol: "triangle-up",
        size: 11,
        color: BUY_MARKER,
        line: { width: 1, color: "#14532d" },
      },
      hovertemplate: "BUY @ %{y:.2f}<extra></extra>",
    });
  }

  const sells = df.filter((b) => b.sell);
  if (sells.length > 0) {
    data.push({
      x: sells.map((b) => b.timestamp),
      y: sells.map((b) => b.close),
      type: "scatter",
      mode: "markers",
      name: "SELL",
      marker: {
        symbol: "triangle-down",
        size: 11,
        color: SELL_MARKER,
        line: { width: 1, color: "#7f1d1d" },
      },
      hovertemplate: "SELL @ %{y:.2f}<extra></extra>",
    });
  }

  const { height, margin, titleSize } = chartLayoutMetrics(chartHeight);

  const layout: Partial<Layout> = {
    title: {
      text: `${symbol} — Supertrend (${timeframe})`,
      font: { size: titleSize, color: TEXT },
      x: 0,
      xanchor: "left",
    },
    paper_bgcolor: PAPER_BG,
    plot_bgcolor: PLOT_BG,
    font: { color: TEXT, size: 12 },
    height,
    margin,
    dragmode: "pan",
    hovermode: "x unified",
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "left",
      x: 0,
      bgcolor: "rgba(22, 27, 34, 0.8)",
      bordercolor: GRID,
      borderwidth: 1,
    },
    xaxis: {
      rangeslider: { visible: false },
      rangebreaks: [
        { bounds: ["sat", "mon"] },
        { bounds: [15.5, 9.25], pattern: "hour" },
      ],
      gridcolor: GRID,
      linecolor: GRID,
      tickfont: { color: TEXT },
      title: undefined,
    },
    yaxis: {
      fixedrange: true,
      gridcolor: GRID,
      linecolor: GRID,
      tickfont: { color: TEXT },
      title: { text: "Price", font: { color: TEXT } },
    },
  };

  return { data, layout, config };
}
