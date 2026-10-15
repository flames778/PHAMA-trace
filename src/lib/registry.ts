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
 *
 * PRODUCTION READ PATH (see report.md for sources). A live deployment would
 * fill these same shapes from: the NAFDAC Greenbook / NAPAMS (registered
 * products and the NRN lookup), GS1 Verified by GS1 (is this scanned code a
 * genuinely issued identifier), the WHO prequalification list + openFDA /
 * RxNorm (rich product master data), NAFDAC Public Alerts (the confirmed-bad
 * list), and EPCIS-compatible custody events from the NAFDAC Traceability
 * Information System. Nothing here claims any of those connections — the
 * interface is deliberately shaped so they can plug in later.
 */

export interface Registry {
  mode: "local" | "server" | "supabase";
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

/**
 * Degraded-mode signal (ME-2).
 *
 * When the live backend is configured but unreachable, every registry call
 * falls back to the bundled data instead of failing the whole app. The first
 * fallback flips this module-level flag so the UI can say so honestly:
 * a "Supabase" badge next to a "showing bundled demo data" banner.
 */
let degraded = false;
const degradeListeners = new Set<() => void>();

export function isDegraded(): boolean {
  return degraded;
}

export function onDegradedChange(fn: () => void): () => void {
  degradeListeners.add(fn);
  return () => {
    degradeListeners.delete(fn);
  };
}

function markDegraded() {
  if (degraded) return;
  degraded = true;
  degradeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a UI listener must never break a registry call */
    }
  });
}

async function attempt<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  onFallback: () => void,
): Promise<T> {
  try {
    return await primary();
  } catch {
    onFallback();
    return fallback();
  }
}

/** Wrap a live backend so any failing call degrades to the fallback backend. */
export function withFallback(
  primary: Registry,
  fallback: Registry,
  onDegrade?: () => void,
): Registry {
  const fellBack = () => {
    markDegraded();
    onDegrade?.();
  };
  const run = <T>(call: (r: Registry) => Promise<T>): Promise<T> =>
    attempt(
      () => call(primary),
      () => call(fallback),
      fellBack,
    );
  return {
    mode: primary.mode,
    products: () => run((r) => r.products()),
    locations: () => run((r) => r.locations()),
    batches: () => run((r) => r.batches()),
    batchByCode: (code) => run((r) => r.batchByCode(code)),
    batchById: (id) => run((r) => r.batchById(id)),
    productById: (id) => run((r) => r.productById(id)),
    locationById: (id) => run((r) => r.locationById(id)),
    custodyFor: (batchId) => run((r) => r.custodyFor(batchId)),
    positions: () => run((r) => r.positions()),
    movements: () => run((r) => r.movements()),
    scans: () => run((r) => r.scans()),
    saveScan: (scan) => run((r) => r.saveScan(scan)),
    recordMovement: (movement) => run((r) => r.recordMovement(movement)),
  };
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

export function localRegistry(): Registry {
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
      // Cap the local mirror like scans (500): the forecast only reads the
      // window, and an unbounded log eventually hits the storage quota.
      const existing = readLocal<StockMovement[]>(LS_MOVEMENTS, []);
      writeLocal(LS_MOVEMENTS, [...existing, movement].slice(-2000));
    },
  };
}

// ------------------------------------------------------------------ supabase

function supabaseRegistry(): Registry {
  const db = supabase!;

  /** Database rows are untyped: coerce defensively so one malformed row
   *  cannot poison a forecast with NaN or crash a render with undefined. */
  const num = (v: unknown, fallback = 0): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
  const optStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

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
    id: str(r.id),
    batchId: str(r.batch_id),
    eventType: r.event_type as CustodyEvent["eventType"],
    fromLocationId: optStr(r.from_location_id),
    toLocationId: optStr(r.to_location_id),
    quantity: num(r.quantity),
    occurredAt: str(r.occurred_at),
    actor: str(r.actor, "unknown"),
    note: optStr(r.note),
    prevHash: str(r.prev_hash),
    eventHash: str(r.event_hash),
  });

  const mapMovement = (r: Record<string, unknown>): StockMovement => ({
    batchId: str(r.batch_id),
    locationId: str(r.location_id),
    day: String(r.day).slice(0, 10),
    dispensed: num(r.dispensed),
    received: num(r.received),
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
        // Chain order matters to verifyChain: occurred_at ties must fall back
        // to id order, or same-timestamp events false-report a broken chain.
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapCustody);
    },
    async positions() {
      const { data, error } = await db.from("stock_positions").select("*");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        batchId: str(r.batch_id),
        locationId: str(r.location_id),
        onHand: num(r.on_hand),
        updatedAt: str(r.updated_at),
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
          id: str(r.id),
          batchCode: str(r.batch_code),
          productId: optStr(r.product_id),
          batchId: optStr(r.batch_id),
          verdict: r.verdict as ScanResult["verdict"],
          confidence: num(r.confidence),
          headline: str(r.headline, "(no headline)"),
          reasons: Array.isArray(r.reasons) ? r.reasons.filter((x: unknown): x is string => typeof x === "string") : [],
          evidence: (r.evidence ?? {}) as ScanResult["evidence"],
          lat: num(r.lat),
          lng: num(r.lng),
          createdAt: str(r.created_at),
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

// -------------------------------------------------------------------- server

/**
 * `import.meta.env` only exists inside Vite. Under plain node (headless check
 * scripts that import this module) it is undefined, so read defensively the
 * same way src/lib/supabase.ts does.
 */
const viteEnv =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const API_BASE = viteEnv.VITE_API_URL ?? "http://localhost:3001/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API error ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; data: T };
  return body.data;
}

function serverRegistry(): Registry {
  return {
    mode: "server",
    products: () => apiFetch<Product[]>("/products"),
    locations: () => apiFetch<Location[]>("/locations"),
    batches: () => apiFetch<Batch[]>("/batches"),
    batchByCode: (code) => apiFetch<Batch | null>(`/batches/code/${encodeURIComponent(code)}`),
    batchById: (id) => apiFetch<Batch | null>(`/batches/${encodeURIComponent(id)}`),
    productById: (id) => apiFetch<Product | null>(`/products/${encodeURIComponent(id)}`),
    locationById: (id) => apiFetch<Location | null>(`/locations/${encodeURIComponent(id)}`),
    custodyFor: (batchId) => apiFetch<CustodyEvent[]>(`/custody/${encodeURIComponent(batchId)}`),
    positions: () => apiFetch<StockPosition[]>("/positions"),
    movements: () => apiFetch<StockMovement[]>("/movements"),
    scans: () => apiFetch<ScanResult[]>("/scans"),
    saveScan: async (scan) => {
      await apiFetch<ScanResult>("/scans", { method: "POST", body: JSON.stringify(scan) });
    },
    recordMovement: async (movement) => {
      await apiFetch<StockMovement>("/movements", { method: "POST", body: JSON.stringify(movement) });
    },
  };
}

export const registry: Registry = usingSupabase
  ? withFallback(supabaseRegistry(), localRegistry())
  : viteEnv.VITE_USE_SERVER === "true"
    ? withFallback(serverRegistry(), localRegistry())
    : localRegistry();
