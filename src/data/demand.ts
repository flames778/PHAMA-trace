import type { StockMovement, StockPosition } from "../types";
import { BATCHES, TODAY, batchById } from "./batches";
import { PHARMACIES } from "./locations";

/**
 * Synthetic dispensing series.
 *
 * There is no real Nigerian pharmacy data in this repo, so the forecast module
 * is fed a deterministic, seeded generator that mimics the three things that
 * actually drive demand for these products: a stable base rate, a weekday
 * effect, and a strong wet-season peak for malaria and diarrhoeal disease.
 * Same seed, same series, every run — which matters when you are demoing
 * live and want the numbers to match your slides.
 *
 * The yardstick this mimics is the WHO / Health Action International method
 * for measuring medicine availability in facilities; a production system
 * would replace the generator with logged dispensing plus that survey
 * method, and blend reference signals like openFDA drug/shortages and the
 * EMA shortages catalogue (see report.md).
 */

const WINDOW_DAYS = 120;
const MS_DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Base units/day at a "size-1" pharmacy. */
const BASE_DAILY: Record<string, number> = {
  "prd-malafem": 46,
  "prd-amoxaclear": 31,
  "prd-sulfix": 12,
  "prd-paraxp": 140,
  "prd-rehydra": 24,
};

/** Amplitude of the wet-season (roughly May–October) surge. 0 = no seasonality. */
const SEASON_AMPLITUDE: Record<string, number> = {
  "prd-malafem": 0.85,
  "prd-amoxaclear": 0.35,
  "prd-sulfix": 0.55,
  "prd-paraxp": 0.08,
  "prd-rehydra": 0.95,
};

/** Relative demand by Nigerian geopolitical zone. Malaria burden is uneven. */
const ZONE_INDEX: Record<string, number> = {
  NorthWest: 1.25,
  NorthEast: 1.3,
  NorthCentral: 1.1,
  SouthWest: 0.85,
  SouthEast: 0.95,
  SouthSouth: 1.15,
  FCT: 0.9,
};

function zoneOf(state: string): string {
  switch (state) {
    case "Kano":
    case "Kaduna":
    case "Sokoto":
      return "NorthWest";
    case "Borno":
      return "NorthEast";
    case "Plateau":
    case "Benue":
      return "NorthCentral";
    case "Lagos":
    case "Oyo":
      return "SouthWest";
    case "Enugu":
    case "Abia":
      return "SouthEast";
    case "Rivers":
    case "Cross River":
    case "Delta":
    case "Edo":
      return "SouthSouth";
    case "FCT":
      return "FCT";
    default:
      return "SouthWest";
  }
}

/**
 * Shelves deliberately starved in the last stretch of the series so the
 * forecast panel has something real to warn about. Keyed `${batchId}@${locationId}`.
 *
 * INVARIANT: every key must be a pair that `assignPairs()` below actually
 * emits, otherwise the squeeze silently does nothing (this bit us once —
 * five dead keys meant the forecast panel never warned about anything).
 */
const SQUEEZE: Record<string, number> = {
  "bat-mf-0917@loc-ph-nassarawa": 0.92,
  "bat-mf-0917@loc-ph-ogbete": 0.96,
  "bat-ac-0811@loc-ph-dala": 0.94,
  "bat-rh-0640@loc-ph-bodija": 0.88,
  "bat-sf-0051@loc-ph-ringroad": 0.95,
};

/** Delivery cadence in days per product. */
const DELIVERY_INTERVAL: Record<string, number> = {
  "prd-malafem": 7,
  "prd-amoxaclear": 10,
  "prd-sulfix": 14,
  "prd-paraxp": 14,
  "prd-rehydra": 12,
};

/** Delivery sizing. Cover the delivery interval at *peak-season* demand with
 *  a day of margin: interval × (1 + seasonal amplitude) + 1. Anything less
 *  drains every shelf to zero by October (measured once: 75 of 76 shelves
 *  read critical) and every alert becomes noise. Starved (SQUEEZE) shelves
 *  still drain because their deliveries are quartered for most of the window. */

interface PairSpec {
  batchId: string;
  locationId: string;
}

/**
 * Which batch sits on which shelf. Deterministic assignment so the custody
 * ledger, the stock table and the map always agree with each other.
 */
function assignPairs(): PairSpec[] {
  const pairs: PairSpec[] = [];
  for (const batch of BATCHES) {
    if (batch.status === "expired") continue;
    const siblings = BATCHES.filter((b) => b.productId === batch.productId && b.status !== "expired");
    const rank = siblings.findIndex((b) => b.id === batch.id);
    PHARMACIES.forEach((pharmacy, i) => {
      // The recalled batch is spread thinly, the way a bad batch actually
      // trickles out across a distribution network.
      const carries = batch.status === "recalled" ? i % 5 === rank % 5 : i % siblings.length === rank;
      if (carries) pairs.push({ batchId: batch.id, locationId: pharmacy.id });
    });
  }
  return pairs;
}

function openingStock(daily: number): number {
  return Math.round(daily * 12);
}

function dailyDemand(
  productId: string,
  locationId: string,
  date: Date,
  dailyBase: number,
  rnd: () => number,
): number {
  const dayOfWeek = date.getUTCDay();
  const weekday =
    dayOfWeek === 0 ? 0.72 : dayOfWeek === 6 ? 1.18 : dayOfWeek === 1 ? 1.12 : 1.0;
  // Peak around early August (day ~220), matching the Nigerian wet season.
  const doy = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / MS_DAY);
  const seasonal = 1 + SEASON_AMPLITUDE[productId] * Math.cos((2 * Math.PI * (doy - 220)) / 365);
  const jitter = 0.78 + rnd() * 0.44;
  void locationId;
  return Math.max(0, Math.round(dailyBase * weekday * seasonal * jitter));
}

export interface GeneratedSeries {
  movements: StockMovement[];
  positions: StockPosition[];
  asOf: string;
}

export function generateSeries(on: Date = TODAY): GeneratedSeries {
  const end = new Date(on.getTime() - MS_DAY);
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * MS_DAY);
  const movements: StockMovement[] = [];

  for (const pair of assignPairs()) {
    const batch = batchById.get(pair.batchId)!;
    const pharmacy = PHARMACIES.find((p) => p.id === pair.locationId)!;
    const base =
      BASE_DAILY[batch.productId] *
      (0.6 + (hashString(pair.locationId) % 90) / 100) *
      ZONE_INDEX[zoneOf(pharmacy.state)];

    const rnd = mulberry32(hashString(`${pair.batchId}|${pair.locationId}`));
    const interval = DELIVERY_INTERVAL[batch.productId];
    const coverDays = Math.ceil(interval * (1 + SEASON_AMPLITUDE[batch.productId])) + 1;
    const deliverySize = Math.round(base * coverDays * (0.9 + rnd() * 0.3));
    const squeeze = SQUEEZE[`${pair.batchId}@${pair.locationId}`] ?? 0;

    let onHand = openingStock(base);
    const dayBuf = new Map<string, { dispensed: number; received: number }>();
    const bucket = (iso: string) => {
      let b = dayBuf.get(iso);
      if (!b) {
        b = { dispensed: 0, received: 0 };
        dayBuf.set(iso, b);
      }
      return b;
    };

    for (let i = 0; i < WINDOW_DAYS; i++) {
      const date = new Date(start.getTime() + i * MS_DAY);
      const iso = date.toISOString().slice(0, 10);
      const daysFromEnd = WINDOW_DAYS - 1 - i;

      if (i % interval === 0) {
        const starved = squeeze > 0 && daysFromEnd < Math.round(WINDOW_DAYS * squeeze);
        const shouldShip = !starved || i % (interval * 2) === 0;
        // A recalled batch stops shipping once the recall is public (45 days ago).
        const recallBlock = batch.status === "recalled" && daysFromEnd <= 45;
        if (shouldShip && !recallBlock) {
          const qty = starved ? Math.round(deliverySize * 0.25) : deliverySize;
          onHand += qty;
          bucket(iso).received += qty;
        }
      }

      const want = dailyDemand(batch.productId, pair.locationId, date, base, rnd);
      const sold = Math.min(onHand, want);
      onHand -= sold;
      bucket(iso).dispensed = sold;
    }

    const ordered = [...dayBuf.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [day, v] of ordered) {
      if (v.dispensed === 0 && v.received === 0) continue;
      movements.push({
        batchId: pair.batchId,
        locationId: pair.locationId,
        day,
        dispensed: v.dispensed,
        received: v.received,
      });
    }
  }

  return { movements, positions: positionsFrom(movements), asOf: end.toISOString() };
}

export function positionsFrom(movements: StockMovement[]): StockPosition[] {
  const acc = new Map<string, StockPosition>();
  for (const m of movements) {
    const key = `${m.batchId}|${m.locationId}`;
    let pos = acc.get(key);
    if (!pos) {
      pos = { batchId: m.batchId, locationId: m.locationId, onHand: 0, updatedAt: m.day };
      acc.set(key, pos);
    }
    pos.onHand += m.received - m.dispensed;
    pos.updatedAt = m.day;
  }
  for (const p of acc.values()) p.onHand = Math.max(0, p.onHand);
  return [...acc.values()].sort(
    (a, b) => a.locationId.localeCompare(b.locationId) || a.batchId.localeCompare(b.batchId),
  );
}

export const HISTORY_WINDOW_DAYS = WINDOW_DAYS;
