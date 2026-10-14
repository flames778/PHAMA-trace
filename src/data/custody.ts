import type { CustodyEvent } from "../types";
import { batchById } from "./batches";
import { LOCATIONS, PHARMACIES } from "./locations";
import { generateSeries } from "./demand";
import { buildChain, type RawCustodyEvent } from "../lib/ledger";

/**
 * MOCK REGISTRY — chain of custody
 * --------------------------------
 * The chain is derived from the same dispensing series the stock table uses,
 * so the ledger, the shelves and the map cannot drift out of agreement.
 * Each event is hash-chained to the previous one (see src/lib/ledger.ts).
 */

const ROUTING: Record<string, string> = {
  "loc-mfg-kano": "loc-dist-kaduna",
  "loc-mfg-lagos": "loc-dist-marina",
  "loc-mfg-nile": "loc-dist-kaduna",
  "loc-mfg-delta": "loc-dist-phc",
};

const ACTORS: Record<string, string> = {
  "loc-mfg-kano": "Kano BioPharm QA release desk",
  "loc-mfg-lagos": "Lagos Therapeutics QA release desk",
  "loc-mfg-nile": "Nile Chemicals QA release desk",
  "loc-mfg-delta": "Delta Health QA release desk",
  "loc-dist-kaduna": "Northgate warehouse officer",
  "loc-dist-marina": "Marina warehouse officer",
  "loc-dist-phc": "Delta warehouse officer",
  "loc-dist-abuja": "Unity warehouse officer",
};

/** Product -> manufacturer plant, explicit so the mapping is auditable. */
const PLANT_BY_PRODUCT: Record<string, string> = {
  "prd-malafem": "loc-mfg-kano",
  "prd-sulfix": "loc-mfg-kano",
  "prd-amoxaclear": "loc-mfg-lagos",
  "prd-paraxp": "loc-mfg-nile",
  "prd-rehydra": "loc-mfg-delta",
};

export interface CustodyBundle {
  byBatch: Map<string, CustodyEvent[]>;
  all: CustodyEvent[];
}

export function buildCustodyChain(): CustodyBundle {
  const series = generateSeries();
  const byBatch = new Map<string, CustodyEvent[]>();

  // Group the receiving pharmacies by batch, then emit one continuous chain
  // per batch: release -> distribute -> receive, in chronological order.
  const arrivals = new Map<string, { locationId: string; day: string; received: number }[]>();
  for (const m of series.movements) {
    if (m.received <= 0) continue;
    const key = m.batchId;
    const list = arrivals.get(key) ?? [];
    list.push({ locationId: m.locationId, day: m.day, received: m.received });
    arrivals.set(key, list);
  }

  for (const [batchId, legs] of [...arrivals.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const batch = batchById.get(batchId)!;
    const plant = PLANT_BY_PRODUCT[batch.productId];
    const hub = ROUTING[plant];
    legs.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

    const raws: RawCustodyEvent[] = [
      {
        batchId,
        eventType: "released",
        fromLocationId: plant,
        toLocationId: plant,
        quantity: batch.quantityReleased,
        occurredAt: `${batch.registeredAt}`,
        actor: ACTORS[plant] ?? "manufacturer",
        note: `Batch released to market after QC release testing. ${batch.quantityReleased.toLocaleString()} units.`,
      },
      {
        batchId,
        eventType: "shipped",
        fromLocationId: plant,
        toLocationId: hub,
        quantity: batch.quantityReleased,
        occurredAt: shift(batch.registeredAt, 36),
        actor: ACTORS[plant] ?? "manufacturer",
        note: `Primary distribution leg to ${LOCATIONS.find((l) => l.id === hub)?.name ?? hub}.`,
      },
      {
        batchId,
        eventType: "received",
        fromLocationId: plant,
        toLocationId: hub,
        quantity: batch.quantityReleased,
        occurredAt: shift(batch.registeredAt, 42),
        actor: ACTORS[hub] ?? "distributor",
        note: "Goods-in check passed; batch loaded to warehouse management system.",
      },
    ];

    let running = batch.quantityReleased;
    for (const leg of legs) {
      const pharmacy = PHARMACIES.find((p) => p.id === leg.locationId)!;
      const shipAt = `${leg.day}T06:30:00Z`;
      const receiveAt = `${leg.day}T11:00:00Z`;
      if (running < leg.received) break;
      running -= leg.received;

      raws.push(
        {
          batchId,
          eventType: "shipped",
          fromLocationId: hub,
          toLocationId: leg.locationId,
          quantity: leg.received,
          occurredAt: shipAt,
          actor: ACTORS[hub] ?? "distributor",
          note: `Consignment to ${pharmacy.name}, ${pharmacy.lga} LGA.`,
        },
        {
          batchId,
          eventType: "received",
          fromLocationId: hub,
          toLocationId: leg.locationId,
          quantity: leg.received,
          occurredAt: receiveAt,
          actor: `${pharmacy.name} pharmacist-in-charge`,
          note: "Signed for and shelved.",
        },
      );
    }

    if (batch.status === "recalled" && batch.recallReason) {
      raws.push({
        batchId,
        eventType: "flagged",
        fromLocationId: null,
        toLocationId: "loc-reg-sw",
        quantity: 0,
        occurredAt: shift(batch.registeredAt, 3200),
        actor: "Regulator Desk (demo) — post-market surveillance",
        note: batch.recallReason,
      });
      raws.push({
        batchId,
        eventType: "recalled",
        fromLocationId: "loc-reg-sw",
        toLocationId: null,
        quantity: batch.quantityReleased,
        occurredAt: shift(batch.registeredAt, 3260),
        actor: "Regulator Desk (demo)",
        note: "Batch withdrawn from distribution and all retail shelves notified.",
      });
    }

    byBatch.set(batchId, buildChain(batchId, raws));
  }

  const all = [...byBatch.values()].flat().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return { byBatch, all };
}

function shift(isoWithTime: string, hours: number): string {
  return new Date(new Date(isoWithTime).getTime() + hours * 3_600_000).toISOString();
}
