import type {
  Batch,
  CustodyEvent,
  Location,
  Product,
  ScanResult,
  StockMovement,
  StockPosition,
} from "../types";
import { BATCHES, batchByCode as seedBatchByCode, batchById as seedBatchById } from "../data/batches";
import { PRODUCTS, productById as seedProductById } from "../data/products";
import { LOCATIONS, locationById as seedLocationById } from "../data/locations";
import { buildCustodyChain } from "../data/custody";
import { generateSeries } from "../data/demand";
import { supabase, usingSupabase } from "./supabase";

/**
 * Registry access.
 *
 * Two interchangeable backends behind one interface:
 *   local    — the bundled mock registry, with new scans and stock movements
 *              mirrored into localStorage so a demo survives a page reload.
 *   supabase — the same tables in Postgres, via supabase/schema.sql.
 *
 * The verification logic never knows which one it is talking to.
 */

export interface Registry {
  mode: "local" | "supabase";
  products(): Promise<Product[]>;
  locations(): Promise<Location[]>;
  batches(): Promise<Batch[]>;
  batchByCode(code: string): Promise<Batch | null>;
  batchById(id: string): Promise<Batch | null>;
  productById(id: string): Promise<Product | null>;
  locationById(id: string): Promise<Location | null>;
  custodyFor(batchId: string): Promise<CustodyEvent[]>;
  positions(): Promise<StockPosition[]>;
  movements(): Promise<StockMovement[]>;
  scans(): Promise<ScanResult[]>;
  saveScan(scan: ScanResult): Promise<void>;
  recordMovement(movement: StockMovement): Promise<void>;
}

// --------------------------------------------------------------------- local

const LS_SCANS = "pharmatrace:scans:v1";
const LS_MOVEMENTS = "pharmatrace:movements:v1";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — the demo still works, it just will not persist */
  }
}

const custodyBundle = buildCustodyChain();
const series = generateSeries();

function localRegistry(): Registry {
  return {
    mode: "local",
    async products() {
      return PRODUCTS;
    },
    async locations() {
      return LOCATIONS;
    },
    async batches() {
      return BATCHES;
    },
    async batchByCode(code) {
      return seedBatchByCode.get(code) ?? null;
    },
    async batchById(id) {
      return seedBatchById.get(id) ?? null;
    },
    async productById(id) {
      return seedProductById.get(id) ?? null;
    },
    async locationById(id) {
      return seedLocationById.get(id) ?? null;
    },
    async custodyFor(batchId) {
      return custodyBundle.byBatch.get(batchId) ?? [];
    },
    async positions() {
      const extra = readLocal<StockMovement[]>(LS_MOVEMENTS, []);
      if (extra.length === 0) return series.positions;
      const merged = new Map<string, StockPosition>();
      for (const p of series.positions) {
        merged.set(`${p.batchId}|${p.locationId}`, { ...p });
      }
      for (const m of extra) {
        const key = `${m.batchId}|${m.locationId}`;
        const pos = merged.get(key) ?? { batchId: m.batchId, locationId: m.locationId, onHand: 0, updatedAt: m.day };
        pos.onHand = Math.max(0, pos.onHand + m.received - m.dispensed);
        pos.updatedAt = m.day;
        merged.set(key, pos);
      }
      return [...merged.values()];
    },
    async movements() {
      return [...series.movements, ...readLocal<StockMovement[]>(LS_MOVEMENTS, [])];
    },
    async scans() {
      return readLocal<ScanResult[]>(LS_SCANS, []);
    },
    async saveScan(scan) {
      const existing = readLocal<ScanResult[]>(LS_SCANS, []);
      writeLocal(LS_SCANS, [scan, ...existing].slice(0, 500));
    },
    async recordMovement(movement) {
      const existing = readLocal<StockMovement[]>(LS_MOVEMENTS, []);
      writeLocal(LS_MOVEMENTS, [...existing, movement]);
    },
  };
}

// ------------------------------------------------------------------ supabase

function supabaseRegistry(): Registry {
  const db = supabase!;

  const mapBatch = (r: Record<string, unknown>): Batch => ({
    id: r.id as string,
    batchCode: r.batch_code as string,
    productId: r.product_id as string,
    manufacturedOn: r.manufactured_on as string,
    expiresOn: r.expires_on as string,
    quantityReleased: Number(r.quantity_released),
    status: r.status as Batch["status"],
    recallReason: (r.recall_reason as string | null) ?? null,
    registeredAt: r.registered_at as string,
  });

  const mapProduct = (r: Record<string, unknown>): Product => ({
    id: r.id as string,
    brandName: r.brand_name as string,
    genericName: r.generic_name as string,
    strength: (r.strength as string) ?? "",
    form: (r.form as string) ?? "",
    manufacturer: r.manufacturer as string,
    category: r.category as Product["category"],
    artworkRef: (r.artwork_ref as string) ?? "",
    highRisk: Boolean(r.high_risk),
    whatItsFor: (r.what_its_for as string) ?? "",
    howToTake: (r.how_to_take as string) ?? "",
    commonSideEffects: (r.common_side_effects as string) ?? "",
    whoShouldNotTake: (r.who_should_not_take as string) ?? "",
    storage: (r.storage as string) ?? "",
    missedDose: (r.missed_dose as string) ?? "",
  });

  const mapLocation = (r: Record<string, unknown>): Location => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as Location["kind"],
    lat: Number(r.lat),
    lng: Number(r.lng),
    lga: r.lga as string,
    state: r.state as string,
  });

  const mapCustody = (r: Record<string, unknown>): CustodyEvent => ({
    id: r.id as string,
    batchId: r.batch_id as string,
    eventType: r.event_type as CustodyEvent["eventType"],
    fromLocationId: (r.from_location_id as string | null) ?? null,
    toLocationId: (r.to_location_id as string | null) ?? null,
    quantity: Number(r.quantity),
    occurredAt: r.occurred_at as string,
    actor: r.actor as string,
    note: (r.note as string | null) ?? null,
    prevHash: r.prev_hash as string,
    eventHash: r.event_hash as string,
  });

  const mapMovement = (r: Record<string, unknown>): StockMovement => ({
    batchId: r.batch_id as string,
    locationId: r.location_id as string,
    day: String(r.day).slice(0, 10),
    dispensed: Number(r.dispensed),
    received: Number(r.received),
  });

  return {
    mode: "supabase",
    async products() {
      const { data, error } = await db.from("products").select("*").order("brand_name");
      if (error) throw error;
      return (data ?? []).map(mapProduct);
    },
    async locations() {
      const { data, error } = await db.from("locations").select("*").order("kind");
      if (error) throw error;
      return (data ?? []).map(mapLocation);
    },
    async batches() {
      const { data, error } = await db.from("batches").select("*").order("batch_code");
      if (error) throw error;
      return (data ?? []).map(mapBatch);
    },
    async batchByCode(code) {
      const { data, error } = await db.from("batches").select("*").eq("batch_code", code).maybeSingle();
      if (error) throw error;
      return data ? mapBatch(data) : null;
    },
    async batchById(id) {
      const { data, error } = await db.from("batches").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapBatch(data) : null;
    },
    async productById(id) {
      const { data, error } = await db.from("products").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapProduct(data) : null;
    },
    async locationById(id) {
      const { data, error } = await db.from("locations").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapLocation(data) : null;
    },
    async custodyFor(batchId) {
      const { data, error } = await db
        .from("custody_events")
        .select("*")
        .eq("batch_id", batchId)
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapCustody);
    },
    async positions() {
      const { data, error } = await db.from("stock_positions").select("*");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        batchId: r.batch_id as string,
        locationId: r.location_id as string,
        onHand: Number(r.on_hand),
        updatedAt: r.updated_at as string,
      }));
    },
    async movements() {
      const { data, error } = await db
        .from("stock_movements")
        .select("*")
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapMovement);
    },
    async scans() {
      const { data, error } = await db.from("scans").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []).map(
        (r): ScanResult => ({
          id: r.id as string,
          batchCode: (r.batch_code as string) ?? "",
          productId: (r.product_id as string | null) ?? null,
          batchId: (r.batch_id as string | null) ?? null,
          verdict: r.verdict as ScanResult["verdict"],
          confidence: Number(r.confidence),
          headline: r.headline as string,
          reasons: (r.reasons as string[]) ?? [],
          evidence: r.evidence as ScanResult["evidence"],
          lat: Number(r.lat),
          lng: Number(r.lng),
          createdAt: r.created_at as string,
        }),
      );
    },
    async saveScan(scan) {
      const { error } = await db.from("scans").insert({
        id: scan.id,
        batch_code: scan.batchCode || null,
        product_id: scan.productId,
        batch_id: scan.batchId,
        verdict: scan.verdict,
        confidence: scan.confidence,
        headline: scan.headline,
        reasons: scan.reasons,
        evidence: scan.evidence,
        lat: scan.lat,
        lng: scan.lng,
        created_at: scan.createdAt,
      });
      if (error) throw error;
    },
    async recordMovement(movement) {
      const { error } = await db.from("stock_movements").insert({
        batch_id: movement.batchId,
        location_id: movement.locationId,
        day: movement.day,
        dispensed: movement.dispensed,
        received: movement.received,
      });
      if (error) throw error;
    },
  };
}

export const registry: Registry = usingSupabase ? supabaseRegistry() : localRegistry();
