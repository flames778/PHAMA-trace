import type { CustodyEvent, CustodyEventType, CustodySummary } from "../types";
import { sha256Hex } from "./sha256";

export const GENESIS_HASH = "0".repeat(64);

export type RawCustodyEvent = Omit<CustodyEvent, "id" | "prevHash" | "eventHash">;

/**
 * Deterministic serialization of the signed payload. Field order is fixed so
 * two processes that see the same custody fact always hash to the same value.
 */
export function canonicalize(raw: RawCustodyEvent): string {
  return JSON.stringify([
    raw.batchId,
    raw.eventType,
    raw.fromLocationId ?? "",
    raw.toLocationId ?? "",
    raw.quantity,
    raw.occurredAt,
    raw.actor,
    raw.note ?? "",
  ]);
}

/**
 * Each event commits to the previous one:
 *   eventHash = sha256(prevHash + canonicalPayload)
 * Editing or deleting any event anywhere in the chain breaks every hash
 * downstream of it, which is what `verifyChain` detects.
 */
export function hashEvent(prevHash: string, raw: RawCustodyEvent): string {
  return sha256Hex(`${prevHash}|${canonicalize(raw)}`);
}

export function buildChain(prefix: string, raws: RawCustodyEvent[]): CustodyEvent[] {
  let prev = GENESIS_HASH;
  return raws.map((raw, i) => {
    const eventHash = hashEvent(prev, raw);
    const event: CustodyEvent = { id: `${prefix}-${String(i + 1).padStart(3, "0")}`, prevHash: prev, eventHash, ...raw };
    prev = eventHash;
    return event;
  });
}

export function appendEvent(prefix: string, events: CustodyEvent[], raw: RawCustodyEvent): CustodyEvent {
  const prevHash = events.length ? events[events.length - 1].eventHash : GENESIS_HASH;
  return {
    id: `${prefix}-${String(events.length + 1).padStart(3, "0")}`,
    prevHash,
    eventHash: hashEvent(prevHash, raw),
    ...raw,
  };
}

export interface ChainVerification {
  ok: boolean;
  brokenAtEventId: string | null;
  checked: number;
}

export function verifyChain(events: CustodyEvent[]): ChainVerification {
  let prev = GENESIS_HASH;
  for (const e of events) {
    if (e.prevHash !== prev) return { ok: false, brokenAtEventId: e.id, checked: events.length };
    if (hashEvent(e.prevHash, toRaw(e)) !== e.eventHash) {
      return { ok: false, brokenAtEventId: e.id, checked: events.length };
    }
    prev = e.eventHash;
  }
  return { ok: true, brokenAtEventId: null, checked: events.length };
}

function toRaw(e: CustodyEvent): RawCustodyEvent {
  return {
    batchId: e.batchId,
    eventType: e.eventType,
    fromLocationId: e.fromLocationId,
    toLocationId: e.toLocationId,
    quantity: e.quantity,
    occurredAt: e.occurredAt,
    actor: e.actor,
    note: e.note,
  };
}

export function summarizeChain(events: CustodyEvent[], locationName: (id: string | null) => string | null): CustodySummary {
  const { ok, brokenAtEventId } = verifyChain(events);
  const last = events[events.length - 1] ?? null;
  return {
    hops: events.length,
    lastKnownCustodian: last ? locationName(last.toLocationId ?? last.fromLocationId) : null,
    lastMovement: last?.occurredAt ?? null,
    chainIntact: ok,
    brokenAtEventId,
  };
}

export const EVENT_LABELS: Record<CustodyEventType, string> = {
  released: "Released by manufacturer",
  shipped: "Shipped to distributor",
  received: "Received into stock",
  dispensed: "Dispensed to patient",
  returned: "Returned upstream",
  flagged: "Flagged as suspect",
  recalled: "Batch recalled",
};
