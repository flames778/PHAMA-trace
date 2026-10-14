import { createClient } from "@supabase/supabase-js";
import { PRODUCTS } from "../src/data/products";
import { LOCATIONS } from "../src/data/locations";
import { BATCHES } from "../src/data/batches";
import { buildCustodyChain } from "../src/data/custody";
import { generateSeries } from "../src/data/demand";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const custody = buildCustodyChain();
const series = generateSeries();

function mapProduct(p: (typeof PRODUCTS)[number]) {
  return {
    id: p.id,
    brand_name: p.brandName,
    generic_name: p.genericName,
    strength: p.strength,
    form: p.form,
    manufacturer: p.manufacturer,
    category: p.category,
    artwork_ref: p.artworkRef,
    high_risk: p.highRisk,
    what_its_for: p.whatItsFor,
    how_to_take: p.howToTake,
    common_side_effects: p.commonSideEffects,
    who_should_not_take: p.whoShouldNotTake,
    storage: p.storage,
    missed_dose: p.missedDose,
  };
}

function mapLocation(l: (typeof LOCATIONS)[number]) {
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    lat: l.lat,
    lng: l.lng,
    lga: l.lga,
    state: l.state,
  };
}

function mapBatch(b: (typeof BATCHES)[number]) {
  return {
    id: b.id,
    batch_code: b.batchCode,
    product_id: b.productId,
    manufactured_on: b.manufacturedOn,
    expires_on: b.expiresOn,
    quantity_released: b.quantityReleased,
    status: b.status,
    recall_reason: b.recallReason,
    registered_at: b.registeredAt,
  };
}

function mapCustody(e: ReturnType<typeof buildCustodyChain>["all"][number]) {
  return {
    id: e.id,
    batch_id: e.batchId,
    event_type: e.eventType,
    from_location_id: e.fromLocationId,
    to_location_id: e.toLocationId,
    quantity: e.quantity,
    occurred_at: e.occurredAt,
    actor: e.actor,
    note: e.note,
    prev_hash: e.prevHash,
    event_hash: e.eventHash,
  };
}

function mapPosition(p: ReturnType<typeof generateSeries>["positions"][number]) {
  return {
    batch_id: p.batchId,
    location_id: p.locationId,
    on_hand: p.onHand,
    updated_at: p.updatedAt,
  };
}

function mapMovement(m: ReturnType<typeof generateSeries>["movements"][number]) {
  return {
    batch_id: m.batchId,
    location_id: m.locationId,
    day: m.day,
    dispensed: m.dispensed,
    received: m.received,
  };
}

async function seed() {
  console.log("Clearing existing data...");
  await db.from("scans").delete().neq("id", "");
  await db.from("stock_movements").delete().neq("id", 0);
  await db.from("stock_positions").delete().neq("batch_id", "");
  await db.from("custody_events").delete().neq("id", "");
  await db.from("batches").delete().neq("id", "");
  await db.from("products").delete().neq("id", "");
  await db.from("locations").delete().neq("id", "");

  console.log(`Seeding ${PRODUCTS.length} products...`);
  const { error: e1 } = await db.from("products").insert(PRODUCTS.map(mapProduct));
  if (e1) throw e1;

  console.log(`Seeding ${LOCATIONS.length} locations...`);
  const { error: e2 } = await db.from("locations").insert(LOCATIONS.map(mapLocation));
  if (e2) throw e2;

  console.log(`Seeding ${BATCHES.length} batches...`);
  const { error: e3 } = await db.from("batches").insert(BATCHES.map(mapBatch));
  if (e3) throw e3;

  console.log(`Seeding ${custody.all.length} custody events...`);
  const { error: e4 } = await db.from("custody_events").insert(custody.all.map(mapCustody));
  if (e4) throw e4;

  console.log(`Seeding ${series.positions.length} stock positions...`);
  const { error: e5 } = await db.from("stock_positions").insert(series.positions.map(mapPosition));
  if (e5) throw e5;

  console.log(`Seeding ${series.movements.length} stock movements...`);
  const { error: e6 } = await db.from("stock_movements").insert(series.movements.map(mapMovement));
  if (e6) throw e6;

  console.log("Seed complete.");
}

seed().catch((e) => {
  console.error("Seed failed:", e.message ?? e);
  process.exit(1);
});
