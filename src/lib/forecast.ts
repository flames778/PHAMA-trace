import type { Batch, StockMovement, StockPosition } from "../types";
import { HISTORY_WINDOW_DAYS } from "../data/demand";

/**
 * Stockout forecasting.
 *
 * Three layers, each with a stated reason for existing:
 *
 *  1. Weekly rhythm — pharmacies sell more on Mondays and Saturdays. Estimated
 *     from the observed series, not assumed.
 *  2. Annual disease season — malaria and diarrhoeal disease in Nigeria track
 *     the rains. 120 days of history cannot identify a 365-day cycle, so this
 *     comes from a documented climatology prior rather than being "learned".
 *     In production this prior would be replaced by multi-year sales data or a
 *     public epidemiological feed.
 *  3. Level + trend — Holt's double exponential smoothing on the deseasonalised
 *     series, projected forward and then re-seasonalised.
 *
 * The output is a days-to-stockout estimate and an alert band. It is an
 * operations aid, not a guarantee.
 */

export interface ForecastPoint {
  day: string;
  /** Projected units dispensed on that day. */
  demand: number;
  /** Observed values where history exists, null for the projection. */
  observed: number | null;
}

export interface ForecastResult {
  batchId: string;
  locationId: string;
  productId: string;
  onHand: number;
  /** Mean projected daily demand over the next 7 days. */
  dailyDemand: number;
  daysToStockout: number | null;
  band: "critical" | "warning" | "watch" | "ok";
  /** Confidence in the projection, 0..1. */
  confidence: number;
  series: ForecastPoint[];
  /** The next scheduled delivery, if the cadence implies one arrives in time. */
  nextDeliveryDay: string;
  note: string;
}

const ALPHA = 0.32; // level smoothing
const BETA = 0.12; // trend smoothing
const HORIZON = 30;
const MS_DAY = 86_400_000;

/** Wet-season peak amplitude per product — the climatology prior. */
const SEASON_AMPLITUDE: Record<string, number> = {
  "prd-malafem": 0.85,
  "prd-amoxaclear": 0.35,
  "prd-sulfix": 0.55,
  "prd-paraxp": 0.08,
  "prd-rehydra": 0.95,
};

const DELIVERY_INTERVAL: Record<string, number> = {
  "prd-malafem": 7,
  "prd-amoxaclear": 10,
  "prd-sulfix": 14,
  "prd-paraxp": 14,
  "prd-rehydra": 12,
};

/** Annual multiplicative index for a given day-of-year. Peak ~ early August. */
export function seasonalIndex(productId: string, date: Date): number {
  const amplitude = SEASON_AMPLITUDE[productId] ?? 0.3;
  const doy = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / MS_DAY);
  return 1 + amplitude * Math.cos((2 * Math.PI * (doy - 220)) / 365);
}

/** Weekly multiplicative index for a day-of-week, 0 = Sunday. */
export function weeklyIndex(dayOfWeek: number): number {
  const table = [0.74, 1.13, 0.97, 0.98, 1.0, 1.02, 1.16];
  return table[((dayOfWeek % 7) + 7) % 7];
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Holt's double exponential smoothing. Returns level, trend and the fitted
 * residual standard error, which we use to scale the confidence figure.
 */
function holt(series: number[]): { level: number; trend: number; rmse: number } {
  if (series.length === 0) return { level: 0, trend: 0, rmse: 0 };
  if (series.length === 1) return { level: series[0], trend: 0, rmse: 0 };

  let level = series[0];
  let trend = series[1] - series[0];
  const errors: number[] = [];

  for (let t = 1; t < series.length; t++) {
    const predicted = level + trend;
    const prevLevel = level;
    level = ALPHA * series[t] + (1 - ALPHA) * (level + trend);
    trend = BETA * (level - prevLevel) + (1 - BETA) * trend;
    errors.push(series[t] - predicted);
  }

  const rmse = Math.sqrt(mean(errors.map((e) => e * e)));
  return { level, trend, rmse };
}

export interface ForecastInput {
  batchId: string;
  locationId: string;
  productId: string;
  movements: StockMovement[];
  position: StockPosition | undefined;
  today: Date;
}

export function forecastStockout(input: ForecastInput): ForecastResult | null {
  const { movements, productId, today } = input;
  if (movements.length === 0) return null;

  const byDay = new Map<string, number>();
  for (const m of movements) byDay.set(m.day, (byDay.get(m.day) ?? 0) + m.dispensed);

  const days = [...byDay.keys()].sort();
  const first = new Date(days[0] + "T00:00:00Z");
  const observed: number[] = [];
  const calendar: Date[] = [];
  const cursor = new Date(first);
  const lastDate = new Date(days[days.length - 1] + "T00:00:00Z");
  while (cursor.getTime() <= lastDate.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    observed.push(byDay.get(iso) ?? 0);
    calendar.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // 1. Split the observed series into the annual climatology (a documented
  //    prior — 120 days cannot identify a 365-day cycle) and a weekly rhythm
  //    fitted from the data itself, falling back to the prior per weekday when
  //    there are no samples.
  const weeklyBuckets: number[][] = [[], [], [], [], [], [], []];
  for (let i = 0; i < observed.length; i++) {
    const annual = seasonalIndex(productId, calendar[i]);
    weeklyBuckets[calendar[i].getUTCDay()].push(observed[i] / annual);
  }

  const bucketMeans = weeklyBuckets.map((b) => mean(b));
  const overall = mean(bucketMeans.filter((v) => v > 0)) || 1;
  const weeklyRhythm = bucketMeans.map((v, dow) =>
    v > 0 ? v / overall : weeklyIndex(dow),
  );

  const deseasonalised = observed.map(
    (v, i) => v / (seasonalIndex(productId, calendar[i]) * weeklyRhythm[calendar[i].getUTCDay()]),
  );

  // 2. Smooth and project the deseasonalised level + trend.
  const { level, trend, rmse } = holt(deseasonalised);
  const meanDemand = mean(deseasonalised);
  const trendShare = meanDemand > 0 ? Math.abs(trend) / meanDemand : 0;
  const confidence = Math.max(
    0.15,
    Math.min(0.92, 0.85 - (meanDemand > 0 ? rmse / meanDemand : 1) * 0.45 - Math.min(0.3, trendShare * 0.2)),
  );

  // 3. Re-seasonalise the projection horizon.
  const last = calendar[calendar.length - 1];
  const series: ForecastPoint[] = calendar.map((date, i) => ({
    day: date.toISOString().slice(0, 10),
    demand: observed[i],
    observed: observed[i],
  }));

  let horizonTotal = 0;
  for (let h = 1; h <= HORIZON; h++) {
    const date = new Date(last.getTime() + h * MS_DAY);
    const annual = seasonalIndex(productId, date);
    const weekly = weeklyRhythm[date.getUTCDay()];
    const demand = Math.max(0, Math.round((level + trend * h) * annual * weekly));
    if (h <= 7) horizonTotal += demand;
    series.push({ day: date.toISOString().slice(0, 10), demand, observed: null });
  }

  const dailyDemand = horizonTotal / 7;
  const onHand = Math.max(0, input.position?.onHand ?? 0);
  const interval = DELIVERY_INTERVAL[productId] ?? 10;
  const dayIndex = Math.floor(today.getTime() / MS_DAY);
  // A delivery due today is 0 days out, not a full interval away.
  const nextDeliveryInDays = (interval - (dayIndex % interval)) % interval;
  const nextDeliveryDay = new Date(today.getTime() + nextDeliveryInDays * MS_DAY).toISOString().slice(0, 10);

  // Days of shelf life at the projected rate. A delivery only helps if it can
  // land before the shelf empties.
  const daysToStockout = dailyDemand > 0 ? onHand / dailyDemand : Number.POSITIVE_INFINITY;
  const stockoutBeforeDelivery = daysToStockout < nextDeliveryInDays;

  let band: ForecastResult["band"] = "ok";
  if (stockoutBeforeDelivery || daysToStockout <= 3) band = "critical";
  else if (daysToStockout <= 7) band = "warning";
  else if (daysToStockout <= 12) band = "watch";

  const finite = Number.isFinite(daysToStockout) ? Math.round(daysToStockout * 10) / 10 : null;
  const note =
    band === "critical"
      ? stockoutBeforeDelivery
        ? `Shelf covers ${finite?.toFixed(1) ?? "—"} days at ${dailyDemand.toFixed(1)}/day but the next delivery is ${nextDeliveryInDays} days out. Stockout lands first — reorder now.`
        : `Shelf covers ${finite?.toFixed(1) ?? "—"} days at ${dailyDemand.toFixed(1)}/day. Reorder now by expedited route.`
      : band === "warning"
        ? `Shelf covers ${finite?.toFixed(1) ?? "—"} days at ${dailyDemand.toFixed(1)}/day. Raise a purchase order this week.`
        : band === "watch"
          ? `Shelf covers ${finite?.toFixed(1) ?? "—"} days. Demand is climbing with the season; keep the next order on schedule.`
          : `Shelf covers ${finite?.toFixed(1) ?? "—"} days at ${dailyDemand.toFixed(1)}/day. No action needed.`;

  return {
    batchId: input.batchId,
    locationId: input.locationId,
    productId,
    onHand,
    dailyDemand,
    daysToStockout: finite,
    band,
    confidence,
    series,
    nextDeliveryDay,
    note,
  };
}

export function forecastAll(inputs: ForecastInput[]): ForecastResult[] {
  return inputs
    .map(forecastStockout)
    .filter((r): r is ForecastResult => r !== null)
    .sort((a, b) => (a.daysToStockout ?? 99) - (b.daysToStockout ?? 99));
}

/**
 * Per-product rollup (ME-3) — the "is MY medicine running low" answer.
 *
 * Forecasts every shelf carrying the product and keeps the worst band plus
 * the warning/critical shelves. The My medicines tab renders this as a
 * personal alert; the numbers are the same forecasts the Stock tab shows,
 * so the two views can never disagree.
 */
export interface AtRiskShelf {
  batchId: string;
  locationId: string;
  band: "critical" | "warning";
  daysToStockout: number | null;
  onHand: number;
}

export interface ProductStockSummary {
  productId: string;
  worst: ForecastResult["band"] | null;
  shelves: number;
  atRisk: AtRiskShelf[];
}

const BAND_RANK: Record<ForecastResult["band"], number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  ok: 3,
};

export function summarizeProductStock(
  productId: string,
  batches: Batch[],
  movements: StockMovement[],
  positions: StockPosition[],
  today: Date,
): ProductStockSummary {
  const batchIds = new Set(batches.filter((b) => b.productId === productId).map((b) => b.id));
  const byPair = new Map<string, StockMovement[]>();
  for (const m of movements) {
    if (!batchIds.has(m.batchId)) continue;
    const key = `${m.batchId}|${m.locationId}`;
    const list = byPair.get(key) ?? [];
    list.push(m);
    byPair.set(key, list);
  }
  const results: ForecastResult[] = [];
  for (const [key, moves] of byPair) {
    const [batchId, locationId] = key.split("|");
    const fc = forecastStockout({
      batchId,
      locationId,
      productId,
      movements: moves,
      position: positions.find((p) => p.batchId === batchId && p.locationId === locationId),
      today,
    });
    if (fc) results.push(fc);
  }
  results.sort((a, b) => BAND_RANK[a.band] - BAND_RANK[b.band]);
  return {
    productId,
    worst: results.length > 0 ? results[0].band : null,
    shelves: results.length,
    atRisk: results
      .filter(
        (r): r is ForecastResult & { band: "critical" | "warning" } =>
          r.band === "critical" || r.band === "warning",
      )
      .map((r) => ({
        batchId: r.batchId,
        locationId: r.locationId,
        band: r.band,
        daysToStockout: r.daysToStockout,
        onHand: r.onHand,
      })),
  };
}

export const FORECAST_WINDOW_DAYS = HISTORY_WINDOW_DAYS;
