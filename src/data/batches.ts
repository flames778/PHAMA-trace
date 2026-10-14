import type { Batch } from "../types";

/** Fixed "today" so the demo is deterministic and screenshots stay stable. */
export const TODAY = new Date("2026-10-13T09:00:00Z");

/**
 * MOCK REGISTRY — batches
 * -----------------------
 * Every batch below is invented. The codes are the shape Nigeria's own
 * track-and-trace guidance describes (country — product — year — serial) but
 * they are not real serials and are not registered anywhere.
 *
 * In GS1 terms the batch code is AI (10) lot + serial; in NAFDAC terms the
 * lookup key is the NAFDAC Reg. No. (NRN) on NAPAMS. The recalled batch here
 * mirrors the shape of a real NAFDAC Public Alert (product + batch +
 * reason + mop-up instruction).
 */
export const BATCHES: Batch[] = [
  {
    id: "bat-mf-0917",
    batchCode: "NG-MF-26-0917",
    productId: "prd-malafem",
    manufacturedOn: "2026-03-12",
    expiresOn: "2028-02-29",
    quantityReleased: 240000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-03-20T08:12:00Z",
  },
  {
    id: "bat-mf-0530",
    batchCode: "NG-MF-26-0530",
    productId: "prd-malafem",
    manufacturedOn: "2026-01-20",
    expiresOn: "2027-12-31",
    quantityReleased: 180000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-01-28T10:40:00Z",
  },
  {
    id: "bat-mf-0208",
    batchCode: "NG-MF-25-0208",
    productId: "prd-malafem",
    manufacturedOn: "2025-01-05",
    expiresOn: "2026-09-30",
    quantityReleased: 120000,
    status: "expired",
    recallReason: null,
    registeredAt: "2025-01-14T11:05:00Z",
  },
  {
    id: "bat-ac-0442",
    batchCode: "NG-AC-25-0442",
    productId: "prd-amoxaclear",
    manufacturedOn: "2025-06-11",
    expiresOn: "2027-05-31",
    quantityReleased: 300000,
    status: "recalled",
    recallReason:
      "Assay 61% of label claim on post-market sampling (spec: 90-110%). Falsified product found in 3 LGAs. Do not dispense; quarantine and return to distributor.",
    registeredAt: "2025-06-19T09:30:00Z",
  },
  {
    id: "bat-ac-0811",
    batchCode: "NG-AC-26-0811",
    productId: "prd-amoxaclear",
    manufacturedOn: "2026-02-02",
    expiresOn: "2028-01-31",
    quantityReleased: 260000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-02-10T14:22:00Z",
  },
  {
    id: "bat-sf-0051",
    batchCode: "NG-SF-26-0051",
    productId: "prd-sulfix",
    manufacturedOn: "2026-01-15",
    expiresOn: "2028-01-14",
    quantityReleased: 90000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-01-23T08:00:00Z",
  },
  {
    id: "bat-sf-1177",
    batchCode: "NG-SF-25-1177",
    productId: "prd-sulfix",
    manufacturedOn: "2025-09-01",
    expiresOn: "2027-08-31",
    quantityReleased: 70000,
    status: "active",
    recallReason: null,
    registeredAt: "2025-09-09T16:45:00Z",
  },
  {
    id: "bat-px-1103",
    batchCode: "NG-PX-26-1103",
    productId: "prd-paraxp",
    manufacturedOn: "2026-04-01",
    expiresOn: "2029-03-31",
    quantityReleased: 1500000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-04-09T07:15:00Z",
  },
  {
    id: "bat-px-0220",
    batchCode: "NG-PX-26-0220",
    productId: "prd-paraxp",
    manufacturedOn: "2026-02-18",
    expiresOn: "2029-02-17",
    quantityReleased: 1200000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-02-26T12:00:00Z",
  },
  {
    id: "bat-rh-0640",
    batchCode: "NG-RH-26-0640",
    productId: "prd-rehydra",
    manufacturedOn: "2026-03-05",
    expiresOn: "2029-02-28",
    quantityReleased: 400000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-03-13T10:10:00Z",
  },
  {
    id: "bat-rh-1201",
    batchCode: "NG-RH-26-1201",
    productId: "prd-rehydra",
    manufacturedOn: "2026-06-10",
    expiresOn: "2029-06-09",
    quantityReleased: 350000,
    status: "active",
    recallReason: null,
    registeredAt: "2026-06-18T09:05:00Z",
  },
];

export const batchById = new Map(BATCHES.map((b) => [b.id, b]));
export const batchByCode = new Map(BATCHES.map((b) => [b.batchCode, b]));

export function isExpired(batch: Batch, on: Date = TODAY): boolean {
  return new Date(batch.expiresOn + "T23:59:59Z").getTime() < on.getTime();
}

export function daysToExpiry(batch: Batch, on: Date = TODAY): number {
  return Math.round(
    (new Date(batch.expiresOn + "T23:59:59Z").getTime() - on.getTime()) / 86_400_000,
  );
}
