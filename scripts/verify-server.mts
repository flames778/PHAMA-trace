import { readFileSync, existsSync } from "node:fs";

/**
 * Server-mode gate: the Express backend, reached through the same `Registry`
 * interface the app uses.
 *
 * This exists because server mode was the one backend no automated check
 * covered. It stayed invisible for weeks, and when it was finally exercised it
 * was broken twice over: the registry could not even boot in server mode
 * under node (env read from the wrong place), and its stored custody hashes
 * had been signed under a superseded hash contract.
 *
 * Skips cleanly (exit 0) when the API is not running, so a clone without
 * `npm run server` still has a green suite.
 *
 * Run with: npm run verify:server
 */

for (const line of (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const BASE = process.env.VITE_API_URL ?? "http://localhost:3001/api";

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await reachable())) {
    console.log(`\nSKIP  Express API not reachable at ${BASE}. Start it with: npm run server\n`);
    return;
  }

  console.log("\nServer backend end-to-end\n");

  // Select server mode the way the app does, then let the shared registry do
  // the rest. Supabase is cleared so the two modes cannot be confused.
  process.env.VITE_USE_SERVER = "true";
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  const [{ registry }, { verifyChain }, { PRODUCTS }, { LOCATIONS }, { BATCHES }] = await Promise.all([
    import("../src/lib/registry.ts"),
    import("../src/lib/ledger.ts"),
    import("../src/data/products.ts"),
    import("../src/data/locations.ts"),
    import("../src/data/batches.ts"),
  ]);

  console.log("Config");
  check("registry resolved to server mode", registry.mode === "server", registry.mode);
  check("not degraded into bundled data", registry.mode === "server");

  console.log("\nReference data");
  const [products, locations, batches] = await Promise.all([
    registry.products(),
    registry.locations(),
    registry.batches(),
  ]);
  check("products served over HTTP", products.length === PRODUCTS.length, `${products.length} vs ${PRODUCTS.length}`);
  check("locations served over HTTP", locations.length === LOCATIONS.length, `${locations.length} vs ${LOCATIONS.length}`);
  check("batches served over HTTP", batches.length === BATCHES.length, `${batches.length} vs ${BATCHES.length}`);

  console.log("\nCustody ledger over HTTP");
  let chains = 0;
  let events = 0;
  const broken: string[] = [];
  for (const b of batches) {
    const chain = await registry.custodyFor(b.id);
    if (chain.length === 0) continue;
    chains++;
    events += chain.length;
    const v = verifyChain(chain);
    if (!v.ok) broken.push(`${b.batchCode} @ ${v.brokenAtEventId}`);
  }
  check(
    "every served chain verifies",
    broken.length === 0,
    broken.join("; ") || `${chains} chains, ${events} events`,
  );

  console.log("\nStock and forecast over HTTP");
  const [movements, positions] = await Promise.all([registry.movements(), registry.positions()]);
  check("movements served", movements.length > 0, `${movements.length} movements`);
  check("positions served", positions.length > 0, `${positions.length} positions`);

  console.log(failures === 0 ? "\nServer backend — all checks passed.\n" : `\nServer backend — ${failures} failed.\n`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("\nverify:server crashed:", e?.message ?? e);
  process.exitCode = 1;
});