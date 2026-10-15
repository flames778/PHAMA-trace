import express from "express";
import cors from "cors";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDb, saveDb, resetDb } from "./store";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

let db = loadDb();

// ------------------------------------------------------------------ helpers

function ok(res: express.Response, data: unknown) {
  res.json({ ok: true, data });
}

function fail(res: express.Response, message: string, status = 400) {
  res.status(status).json({ ok: false, error: message });
}

// ------------------------------------------------------------------- health

app.get("/api/health", (_req, res) => {
  ok(res, {
    status: "up",
    mode: "server",
    products: db.products.length,
    batches: db.batches.length,
    locations: db.locations.length,
    custodyEvents: db.custodyEvents.length,
    scans: db.scans.length,
    stockMovements: db.stockMovements.length,
    stockPositions: db.stockPositions.length,
  });
});

// ----------------------------------------------------------------- products

app.get("/api/products", (_req, res) => {
  ok(res, db.products);
});

app.get("/api/products/:id", (req, res) => {
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return fail(res, "Product not found", 404);
  ok(res, product);
});

// ---------------------------------------------------------------- locations

app.get("/api/locations", (_req, res) => {
  ok(res, db.locations);
});

app.get("/api/locations/:id", (req, res) => {
  const location = db.locations.find((l) => l.id === req.params.id);
  if (!location) return fail(res, "Location not found", 404);
  ok(res, location);
});

// ------------------------------------------------------------------ batches

app.get("/api/batches", (_req, res) => {
  ok(res, db.batches);
});

app.get("/api/batches/:id", (req, res) => {
  const batch = db.batches.find((b) => b.id === req.params.id);
  if (!batch) return fail(res, "Batch not found", 404);
  ok(res, batch);
});

app.get("/api/batches/code/:code", (req, res) => {
  const batch = db.batches.find((b) => b.batchCode === req.params.code);
  if (!batch) return fail(res, "Batch not found", 404);
  ok(res, batch);
});

// ------------------------------------------------------------------ custody

app.get("/api/custody/:batchId", (req, res) => {
  const events = db.custodyEvents
    .filter((e) => e.batchId === req.params.batchId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  ok(res, events);
});

// ------------------------------------------------------------------ stocks

app.get("/api/positions", (_req, res) => {
  ok(res, db.stockPositions);
});

app.get("/api/movements", (_req, res) => {
  ok(res, db.stockMovements);
});

app.post("/api/movements", (req, res) => {
  const { batchId, locationId, day, dispensed, received } = req.body ?? {};
  if (!batchId || !locationId || !day) {
    return fail(res, "batchId, locationId and day are required");
  }
  const movement = {
    batchId: String(batchId),
    locationId: String(locationId),
    day: String(day).slice(0, 10),
    dispensed: Math.max(0, Number(dispensed) || 0),
    received: Math.max(0, Number(received) || 0),
  };
  db.stockMovements.push(movement);

  const key = `${movement.batchId}|${movement.locationId}`;
  const existing = db.stockPositions.find(
    (p) => `${p.batchId}|${p.locationId}` === key,
  );
  if (existing) {
    existing.onHand = Math.max(0, existing.onHand + movement.received - movement.dispensed);
    existing.updatedAt = movement.day;
  } else {
    db.stockPositions.push({
      batchId: movement.batchId,
      locationId: movement.locationId,
      onHand: Math.max(0, movement.received - movement.dispensed),
      updatedAt: movement.day,
    });
  }

  saveDb(db);
  ok(res, movement);
});

// ------------------------------------------------------------------- scans

app.get("/api/scans", (_req, res) => {
  const sorted = [...db.scans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  ok(res, sorted.slice(0, 500));
});

app.post("/api/scans", (req, res) => {
  const scan = req.body;
  if (!scan || !scan.id || !scan.verdict) {
    return fail(res, "id and verdict are required");
  }
  db.scans.unshift(scan);
  if (db.scans.length > 500) db.scans = db.scans.slice(0, 500);
  saveDb(db);
  ok(res, scan);
});

// ------------------------------------------------------------------ forecast

app.get("/api/forecast", (_req, res) => {
  ok(res, {
    positions: db.stockPositions,
    movements: db.stockMovements,
    batches: db.batches,
    products: db.products,
    locations: db.locations,
  });
});

// ------------------------------------------------------------------ hotspots

app.get("/api/hotspots", (_req, res) => {
  const grid = new Map<
    string,
    { lat: number; lng: number; total: number; suspicious: number; genuine: number; unverifiable: number }
  >();
  for (const scan of db.scans) {
    const latCell = Math.round(scan.lat * 100) / 100;
    const lngCell = Math.round(scan.lng * 100) / 100;
    const key = `${latCell}|${lngCell}`;
    const cell = grid.get(key) ?? {
      lat: latCell,
      lng: lngCell,
      total: 0,
      suspicious: 0,
      genuine: 0,
      unverifiable: 0,
    };
    cell.total++;
    if (scan.verdict === "suspicious") cell.suspicious++;
    else if (scan.verdict === "genuine") cell.genuine++;
    else cell.unverifiable++;
    grid.set(key, cell);
  }
  ok(res, [...grid.values()]);
});

// -------------------------------------------------------------------- reset

app.post("/api/reset", (_req, res) => {
  db = resetDb();
  ok(res, { reset: true });
});

// ------------------------------------------------------------- static files

const distDir = join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(join(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`PharmaTrace backend running on http://localhost:${PORT}`);
  console.log(`  API:     http://localhost:${PORT}/api/health`);
  console.log(`  Data:    ${join(__dirname, "data", "db.json")}`);
});
