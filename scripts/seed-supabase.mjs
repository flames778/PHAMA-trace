import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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

const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf-8"));
const locations = JSON.parse(readFileSync(join(root, "src/data/locations.json"), "utf-8"));
const batches = JSON.parse(readFileSync(join(root, "src/data/batches.json"), "utf-8"));
const custody = JSON.parse(readFileSync(join(root, "src/data/custody.json"), "utf-8"));
const demand = JSON.parse(readFileSync(join(root, "src/data/demand.json"), "utf-8"));

async function seed() {
  console.log("Clearing existing data...");
  await db.from("scans").delete().neq("id", "");
  await db.from("stock_movements").delete().neq("id", 0);
  await db.from("stock_positions").delete().neq("batch_id", "");
  await db.from("custody_events").delete().neq("id", "");
  await db.from("batches").delete().neq("id", "");
  await db.from("products").delete().neq("id", "");
  await db.from("locations").delete().neq("id", "");

  console.log(`Seeding ${products.length} products...`);
  const { error: e1 } = await db.from("products").insert(products);
  if (e1) throw e1;

  console.log(`Seeding ${locations.length} locations...`);
  const { error: e2 } = await db.from("locations").insert(locations);
  if (e2) throw e2;

  console.log(`Seeding ${batches.length} batches...`);
  const { error: e3 } = await db.from("batches").insert(batches);
  if (e3) throw e3;

  console.log(`Seeding ${custody.length} custody events...`);
  const { error: e4 } = await db.from("custody_events").insert(custody);
  if (e4) throw e4;

  console.log(`Seeding ${demand.positions.length} stock positions...`);
  const { error: e5 } = await db.from("stock_positions").insert(demand.positions);
  if (e5) throw e5;

  console.log(`Seeding ${demand.movements.length} stock movements...`);
  const { error: e6 } = await db.from("stock_movements").insert(demand.movements);
  if (e6) throw e6;

  console.log("Seed complete.");
}

seed().catch((e) => {
  console.error("Seed failed:", e.message ?? e);
  process.exit(1);
});
