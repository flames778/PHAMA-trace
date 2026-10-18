import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Batch,
  CustodyEvent,
  Location,
  Product,
  ScanResult,
  StockMovement,
  StockPosition,
} from "../src/types";
import { BATCHES } from "../src/data/batches";
import { PRODUCTS } from "../src/data/products";
import { LOCATIONS } from "../src/data/locations";
import { buildCustodyChain } from "../src/data/custody";
import { generateSeries } from "../src/data/demand";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "server", "data");
const DATA_FILE = join(DATA_DIR, "db.json");

/**
 * Bump this whenever the hash contract changes (anything in `canonicalize`:
 * field order, timestamp normalization, the separator). Custody hashes are
 * signed once at seed time and stored, so a contract change makes every
 * existing row fail verification — correctly, but silently, because the data
 * was never tampered with. Stamping the file turns that mystery into a loud
 * re-seed.
 *
 * Current contract: full ISO 8601 UTC with milliseconds, see normalizeStamp.
 */
const STORE_VERSION = 2;

export interface Db {
  storeVersion: number;
  products: Product[];
  locations: Location[];
  batches: Batch[];
  custodyEvents: CustodyEvent[];
  stockPositions: StockPosition[];
  stockMovements: StockMovement[];
  scans: ScanResult[];
}

function seed(): Db {
  const custody = buildCustodyChain();
  const series = generateSeries();
  return {
    storeVersion: STORE_VERSION,
    products: PRODUCTS,
    locations: LOCATIONS,
    batches: BATCHES,
    // Chain order, NOT timestamp order: several legs share a day, so
    // sorting by occurredAt scrambles each batch's hash linkage (verified
    // live: timestamp-sorted mf-0917 breaks at event 006). custody.all is
    // timestamp-sorted for the map feed; the ledger needs causal order.
    custodyEvents: [...custody.byBatch.values()].flat(),
    stockPositions: series.positions,
    stockMovements: series.movements,
    scans: [],
  };
}

export function loadDb(): Db {
  if (!existsSync(DATA_FILE)) {
    const db = seed();
    saveDb(db);
    return db;
  }
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Db;
    if (parsed.storeVersion !== STORE_VERSION) {
      console.warn(
        `[store] db.json was written by hash contract v${parsed.storeVersion ?? 0}, ` +
          `this build uses v${STORE_VERSION}. Custody hashes were signed under the old\n` +
          `       contract and will all fail verification. Re-seeding from src/data.`,
      );
      const db = seed();
      saveDb(db);
      return db;
    }
    return parsed;
  } catch {
    const db = seed();
    saveDb(db);
    return db;
  }
}

export function saveDb(db: Db): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export function resetDb(): Db {
  const db = seed();
  saveDb(db);
  return db;
}
