export type BatchStatus = "active" | "recalled" | "expired";

export type LocationKind = "manufacturer" | "distributor" | "pharmacy" | "regulator";

export type CustodyEventType =
  | "released"
  | "shipped"
  | "received"
  | "dispensed"
  | "returned"
  | "flagged"
  | "recalled";

export type Verdict = "genuine" | "suspicious" | "unverifiable";

export interface Product {
  id: string;
  brandName: string;
  genericName: string;
  strength: string;
  form: string;
  manufacturer: string;
  category: "antimalarial" | "antibiotic" | "analgesic" | "other";
  /** Path to the manufacturer-registered artwork template used by the vision check. */
  artworkRef: string;
  /** Marked true for products that are frequently falsified — raises suspicion weights. */
  highRisk: boolean;
  /** Plain-language explanation of what this medicine is for. */
  whatItsFor: string;
  /** Plain-language dosing instructions. */
  howToTake: string;
  /** Common side effects in plain language. */
  commonSideEffects: string;
  /** Who should NOT take this medicine. */
  whoShouldNotTake: string;
  /** Storage instructions. */
  storage: string;
  /** What to do if a dose is missed. */
  missedDose: string;
}

export interface Batch {
  id: string;
  batchCode: string;
  productId: string;
  manufacturedOn: string;
  expiresOn: string;
  quantityReleased: number;
  status: BatchStatus;
  recallReason: string | null;
  registeredAt: string;
}

export interface Location {
  id: string;
  name: string;
  kind: LocationKind;
  lat: number;
  lng: number;
  lga: string;
  state: string;
}

export interface CustodyEvent {
  id: string;
  batchId: string;
  eventType: CustodyEventType;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  occurredAt: string;
  actor: string;
  note: string | null;
  prevHash: string;
  eventHash: string;
}

export interface StockPosition {
  batchId: string;
  locationId: string;
  onHand: number;
  updatedAt: string;
}

export interface StockMovement {
  batchId: string;
  locationId: string;
  /** ISO date (yyyy-mm-dd) of the movement. */
  day: string;
  /** Units leaving stock — always positive for dispense, zero otherwise. */
  dispensed: number;
  /** Units entering stock. */
  received: number;
}

export interface ScanEvidence {
  codeSource: "camera" | "upload" | "manual" | "demo";
  codeRead: string | null;
  vision: VisionReport | null;
  custody: CustodySummary;
  flags: string[];
}

export interface CustodySummary {
  hops: number;
  lastKnownCustodian: string | null;
  lastMovement: string | null;
  chainIntact: boolean;
  brokenAtEventId: string | null;
}

export interface VisionCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail: string;
  /** 0..1 contribution weight of this check to the overall score. */
  weight: number;
  /** 0..1 measured similarity / quality value. */
  measured: number | null;
}

export interface VisionReport {
  checks: VisionCheck[];
  /** Aggregate 0..1 similarity of the photographed pack to the registered artwork. */
  score: number;
  width: number;
  height: number;
}

export interface ScanResult {
  id: string;
  batchCode: string;
  productId: string | null;
  batchId: string | null;
  verdict: Verdict;
  /** 0..1. How much the evidence supports the verdict. */
  confidence: number;
  headline: string;
  reasons: string[];
  evidence: ScanEvidence;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface Alert {
  id: string;
  kind: "stockout" | "low" | "expiry" | "falsified";
  severity: "critical" | "warning" | "info";
  locationId: string;
  batchId: string | null;
  message: string;
  createdAt: string;
}
