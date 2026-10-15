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

export interface Db {
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
    products: PRODUCTS,
    locations: LOCATIONS,
    batches: BATCHES,
    custodyEvents: custody.all,
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
    return JSON.parse(raw) as Db;
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
