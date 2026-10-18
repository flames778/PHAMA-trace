import { readFileSync, existsSync } from "node:fs";
import type { CustodyEvent, ScanResult } from "../src/types.ts";

/**
 * BE-4 gate: the app running against a live hosted Supabase project.
 *
 * Everything else (verify:pipeline, cabinet-check, source-check) runs on the
 * bundled mock registry. This one proves the Supabase path is real: the same
 * registry object, the same ledger verifier and the same forecaster, pointed
 * at rows an actual database is storing.
 *
 * Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local. Without
 * them it SKIPS (exit 0) rather than failing, so a fresh clone without
 * credentials still has a green suite.
 *
 * Run with: npm run verify:supabase
 */

// Node does not read .env.local, and Vite's import.meta.env is absent under
// tsx. Load it into process.env FIRST, then pull the app modules in with
// dynamic imports: ESM hoists static imports, so supabase.ts would read an
// empty process.env and silently fall back to the bundled mock.
for (const line of (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    console.log("\nSKIP  no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — bundled mock mode.\n");
    return;
  }

  console.log("\nSupabase end-to-end\n");

  const [{ registry }, { verifyChain }, { forecastAll }, { supabase }, { PRODUCTS }, { LOCATIONS }, { BATCHES, TODAY }] =
    await Promise.all([
      import("../src/lib/registry.ts"),
      import("../src/lib/ledger.ts"),
      import("../src/lib/forecast.ts"),
      import("../src/lib/supabase.ts"),
      import("../src/data/products.ts"),
      import("../src/data/locations.ts"),
      import("../src/data/batches.ts"),
    ]);

  console.log("Config");
  check("Supabase client constructed", supabase !== null);
  check("registry resolved to supabase mode", registry.mode === "supabase", registry.mode);
  if (registry.mode !== "supabase" || !supabase) return;

  console.log("\nReference data");
  const [products, locations, batches] = await Promise.all([
    registry.products(),
    registry.locations(),
    registry.batches(),
  ]);
  check("products match the seed source", products.length === PRODUCTS.length, `${products.length} vs ${PRODUCTS.length}`);
  check("locations match the seed source", locations.length === LOCATIONS.length, `${locations.length} vs ${LOCATIONS.length}`);
  check("batches match the seed source", batches.length === BATCHES.length, `${batches.length} vs ${BATCHES.length}`);
  check(
    "brand names survived the column rename",
    products.every((p) => p.brandName.length > 0 && p.genericName.length > 0),
  );

  console.log("\nCustody ledger (real rows, id order)");
  let verified = 0;
  let events = 0;
  const broken: string[] = [];
  for (const b of batches) {
    const chain: CustodyEvent[] = await registry.custodyFor(b.id);
    if (chain.length === 0) continue;
    events += chain.length;
    const v = verifyChain(chain);
    if (v.ok) verified++;
    else broken.push(`${b.batchCode} @ ${v.brokenAtEventId}`);
  }
  check("every seeded chain verifies", broken.length === 0, broken.join("; ") || `${verified} chains, ${events} events`);

  // The bug this gate exists for (b3ab8d5): custody must be served in chain
  // order. Timestamp order looks plausible and silently breaks the hashes,
  // because several legs of a journey share a day.
  const hero = batches.find((b) => b.batchCode === "NG-MF-26-0917") ?? batches[0];
  const heroChain = await registry.custodyFor(hero.id);
  const byTime = [...heroChain].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const timeOrderDiffers = byTime.some((e, i) => e.id !== heroChain[i].id);
  check("hero chain is not in timestamp order", timeOrderDiffers, `${heroChain.length} events`);
  check("hero chain verifies as served", verifyChain(heroChain).ok);

  console.log("\nStock and forecast (real rows)");
  const [movements, positions] = await Promise.all([registry.movements(), registry.positions()]);
  check("movements loaded", movements.length > 0, `${movements.length} movements`);
  check("positions loaded", positions.length > 0, `${positions.length} positions`);

  // Regression guard: PostgREST caps responses at 1000 rows without saying so.
  // An unpaginated read once returned 1000 of 8686 movements and the forecast
  // still produced plausible numbers, so nothing else would have caught it.
  const { count: movementCount } = await supabase
    .from("stock_movements")
    .select("*", { count: "exact", head: true });
  check(
    "movement read is not silently truncated at the 1000-row cap",
    movements.length === movementCount,
    `read ${movements.length}, table holds ${movementCount}`,
  );

  const byProduct = new Set(products.map((p) => p.id));
  const positionByKey = new Map(positions.map((p) => [`${p.batchId}|${p.locationId}`, p]));
  const inputs = positions.map((p) => {
    const batch = batches.find((b) => b.id === p.batchId);
    return {
      batchId: p.batchId,
      locationId: p.locationId,
      productId: batch?.productId ?? "",
      movements: movements.filter((m) => m.batchId === p.batchId && m.locationId === p.locationId),
      position: positionByKey.get(`${p.batchId}|${p.locationId}`),
      today: TODAY,
    };
  });
  const forecasts = forecastAll(inputs);
  const bands = forecasts.reduce<Record<string, number>>((acc, f) => {
    acc[f.band] = (acc[f.band] ?? 0) + 1;
    return acc;
  }, {});
  check("forecast runs on live rows", forecasts.length > 0, `${forecasts.length} shelves forecast`);
  check(
    "live data produces at-risk shelves",
    (bands.critical ?? 0) + (bands.warning ?? 0) > 0,
    JSON.stringify(bands),
  );
  check("every forecast maps to a known product", inputs.every((i) => byProduct.has(i.productId) || i.productId === ""));

  console.log("\nWrites (RLS policies + triggers)");
  // Stable id on purpose: if cleanup is impossible (see below) at most ONE
  // probe row can ever exist, instead of one per run.
  const probeId = "e2e-probe";
  const probe: ScanResult = {
    id: probeId,
    batchCode: hero.batchCode,
    productId: hero.productId,
    batchId: hero.id,
    verdict: "genuine",
    confidence: 0.99,
    headline: "e2e probe row, deleted immediately after insert",
    reasons: ["written by scripts/verify-supabase.mts"],
    evidence: {
      codeSource: "demo",
      codeRead: hero.batchCode,
      vision: null,
      custody: { hops: 0, lastKnownCustodian: null, lastMovement: null, chainIntact: true, brokenAtEventId: null },
      flags: [],
    },
    lat: 6.5244,
    lng: 3.3792,
    createdAt: new Date().toISOString(),
  };
  await registry.saveScan(probe);
  const readBack = (await registry.scans()).find((s) => s.id === probeId);
  check("anon may insert a scan and read it back", readBack?.verdict === "genuine");

  // The anon key has no DELETE policy on `scans` (deliberate: the demo grants
  // anonymous inserts so the app works without auth, but nothing more). So
  // cleanup usually fails, and that is correct behaviour, not a regression.
  const { error: delError } = await supabase.from("scans").delete().eq("id", probeId);
  const survived = (await registry.scans()).some((s) => s.id === probeId);
  if (survived) {
    console.log(
      `  NOTE  probe row "${probeId}" remains: no anon DELETE policy on scans (by design).\n` +
        "        Remove it once with the service_role key:\n" +
        `          delete from scans where id = '${probeId}';`,
    );
  } else {
    check("probe row cleaned up", true, delError?.message ?? "");
  }

  console.log("\nHotspot view");
  const grid = registry.hotspotGrid ? await registry.hotspotGrid() : null;
  check("hotspotGrid() reads the live view", grid !== null && grid.length > 0, `${grid?.length ?? 0} cells`);
  const gridTotal = (grid ?? []).reduce((n, c) => n + c.total, 0);
  const { count: scanTotal } = await supabase.from("scans").select("*", { count: "exact", head: true });
  check("grid accounts for every scan row", gridTotal === scanTotal, `${gridTotal} in grid, ${scanTotal} scanned`);
  check(
    "suspicious cells exist, so the map has something to light up",
    (grid ?? []).some((c) => c.suspicious > 0),
  );

  console.log("\nRecall drill (BE-5)");
  const recalled = batches.find((b) => b.status === "recalled") ?? batches[0];
  check("a recalled batch exists in the registry", recalled.status === "recalled", recalled.batchCode);
  const recallChain = await registry.custodyFor(recalled.id);
  const touched = new Set<string>();
  for (const e of recallChain) {
    if (e.fromLocationId) touched.add(e.fromLocationId);
    if (e.toLocationId) touched.add(e.toLocationId);
  }
  const knownIds = new Set(locations.map((l) => l.id));
  const orphans = [...touched].filter((id) => !knownIds.has(id));
  check(
    "recall locates every custody row for the batch",
    recallChain.length > 0 && touched.size > 0,
    `${recallChain.length} events across ${touched.size} locations`,
  );
  check("every location named in the recall is in the registry", orphans.length === 0, orphans.join(", "));
  check("the recalled chain still verifies", verifyChain(recallChain).ok);
  const recallReason = recalled.recallReason ?? "";
  check("recall carries a reason for the regulator", recallReason.length > 0, recallReason.slice(0, 48));

  console.log(
    failures === 0
      ? "\nSupabase end-to-end — all checks passed.\n"
      : `\nSupabase end-to-end — ${failures} failed.\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("\nverify:supabase crashed:", e?.message ?? e);
  process.exitCode = 1;
});