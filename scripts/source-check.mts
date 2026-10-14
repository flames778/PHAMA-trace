import {
  registry,
  localRegistry,
  withFallback,
  isDegraded,
  type Registry,
} from "../src/lib/registry.ts";

/**
 * ME-2 checks: the registry boots in local mode with no backend configured,
 * and a failing primary falls back to the bundled data instead of dying.
 * Run with: npm run source-check
 */

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function failingRegistry(): Registry {
  const down = async (): Promise<never> => {
    throw new Error("backend unreachable");
  };
  return {
    mode: "supabase",
    products: down,
    locations: down,
    batches: down,
    batchByCode: down,
    batchById: down,
    productById: down,
    locationById: down,
    custodyFor: down,
    positions: down,
    movements: down,
    scans: down,
    saveScan: down,
    recordMovement: down,
  };
}

console.log("\nlocal mode (no backend configured here)");
check("default registry is local", registry.mode === "local", registry.mode);
check("products load", (await registry.products()).length === 5);
check("batches load", (await registry.batches()).length === 11);
check("hero batch resolves by code", (await registry.batchByCode("NG-MF-26-0917"))?.id === "bat-mf-0917");
check("custody chain loads", (await registry.custodyFor("bat-mf-0917")).length > 10);
check("empty scan feed, not a crash", (await registry.scans()).length === 0);

console.log("\nfallback wrapper");
const local = localRegistry();
let degradedCalls = 0;
const resilient = withFallback(failingRegistry(), local, () => {
  degradedCalls++;
});
check("mode still reports the primary", resilient.mode === "supabase");
check("reads fall back to bundled data", (await resilient.products()).length === 5);
check("custody falls back", (await resilient.custodyFor("bat-mf-0917")).length > 10);
check("degrade signal fired", degradedCalls > 0, `${degradedCalls} call(s)`);
await resilient.saveScan({
  id: "scn_test",
  batchCode: "NG-MF-26-0917",
  productId: "prd-malafem",
  batchId: "bat-mf-0917",
  verdict: "genuine",
  confidence: 0.9,
  headline: "test",
  reasons: [],
  evidence: {
    codeSource: "demo",
    codeRead: "NG-MF-26-0917",
    vision: null,
    custody: { hops: 0, lastKnownCustodian: null, lastMovement: null, chainIntact: false, brokenAtEventId: null },
    flags: [],
  },
  lat: 0,
  lng: 0,
  createdAt: new Date().toISOString(),
});
check("writes fall back without throwing", true);
check("degraded flag is module-level", typeof isDegraded() === "boolean");

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
