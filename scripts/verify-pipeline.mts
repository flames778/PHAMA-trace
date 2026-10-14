import sharp from "sharp";
import { letterbox, alignAndCorrelate, paletteSimilarity, toGray, edgeField } from "../src/lib/vision.ts";
import { generateSeries } from "../src/data/demand.ts";
import { buildCustodyChain } from "../src/data/custody.ts";
import { verifyChain, appendEvent, GENESIS_HASH } from "../src/lib/ledger.ts";
import { forecastStockout, summarizeProductStock } from "../src/lib/forecast.ts";
import { batchById, batchByCode, TODAY, BATCHES } from "../src/data/batches.ts";
import { locationById, PHARMACIES } from "../src/data/locations.ts";

/**
 * Headless check of the two claims the demo leans on hardest:
 *   1. the packaging pipeline separates a genuine pack from a counterfeit one,
 *   2. the custody ledger detects a tampered event.
 * Run with: npm run verify:pipeline
 */

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function imageData(path: string) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .resize(600, 820, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Vision code reads RGBA; give it a stride of 4.
  const rgba = new Uint8ClampedArray(600 * 820 * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    rgba[j] = data[i];
    rgba[j + 1] = data[i + 1];
    rgba[j + 2] = data[i + 2];
    rgba[j + 3] = 255;
  }
  return { width: info.width, height: info.height, data: rgba };
}

function correlate(ref: ImageData, photo: ImageData) {
  const a = edgeField(letterbox(ref));
  const b = edgeField(letterbox(photo));
  return alignAndCorrelate(a, b);
}

const REF = "public/packs/refs/malafem.png";

console.log("\nPackaging pipeline");
const reference = await imageData(REF);
const genuine = await imageData("public/packs/malafem-sample.png");
const counterfeit = await imageData("public/packs/malafem-counterfeit.png");
const otherProduct = await imageData("public/packs/refs/amoxaclear.png");

const gen = correlate(reference, genuine);
const fake = correlate(reference, counterfeit);
const wrong = correlate(reference, otherProduct);
const selfScore = correlate(reference, reference);

const genPalette = paletteSimilarity(genuine, reference);
const fakePalette = paletteSimilarity(counterfeit, reference);
const wrongPalette = paletteSimilarity(otherProduct, reference);

console.log(
  `  scores — self ${(selfScore.score * 100).toFixed(1)}% | genuine ${(gen.score * 100).toFixed(1)}% | counterfeit ${(fake.score * 100).toFixed(1)}% | wrong product ${(wrong.score * 100).toFixed(1)}%`,
);
console.log(
  `  palette — genuine ${(genPalette * 100).toFixed(1)}% | counterfeit ${(fakePalette * 100).toFixed(1)}% | wrong product ${(wrongPalette * 100).toFixed(1)}%`,
);

check("reference matches itself", selfScore.score > 0.95, `${(selfScore.score * 100).toFixed(1)}%`);
check("genuine pack scores above 0.72", gen.score > 0.72, `${(gen.score * 100).toFixed(1)}%`);
check("counterfeit scores below 0.55", fake.score < 0.55, `${(fake.score * 100).toFixed(1)}%`);
check("genuine beats counterfeit by >0.25", gen.score - fake.score > 0.25);
// NOTE on the two ordering checks below: all five mock packs are rendered
// from one generator template (same geometry, different ink), so the edge
// metric cannot push a different product near zero — every wrong product
// scores ~0.92 here. What the pipeline must guarantee is ranking: the right
// product outscores a wrong one, and a redrawn counterfeit falls far below
// both. Real manufacturers use distinct artwork per brand, where absolute
// separation holds; our mock cannot claim it, so the gate asserts ordering.
check("wrong product scores below genuine", wrong.score < gen.score, `${(wrong.score * 100).toFixed(1)}%`);
check("genuine palette above 0.62", genPalette > 0.62, `${(genPalette * 100).toFixed(1)}%`);
check("counterfeit palette below genuine", fakePalette < genPalette - 0.05);
check("wrong-product palette below genuine", wrongPalette < genPalette);

// Gray conversion sanity: 1x1 red pixel -> Rec.709 luma of (255,0,0).
{
  const px = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
  const luma = toGray(px).data[0];
  check("Rec.709 luma of pure red", Math.abs(luma - 0.2126 * 255) < 0.5, luma.toFixed(2));
}

console.log("\nCustody ledger");
const bundle = buildCustodyChain();
const heroBatch = batchByCode.get("NG-MF-26-0917")!;
const chain = bundle.byBatch.get(heroBatch.id) ?? [];
check("hero batch has a custody chain", chain.length > 10, `${chain.length} events`);
check("chain verifies as written", verifyChain(chain).ok);
check("chain does not start mid-flight", chain[0]?.prevHash === GENESIS_HASH);

{
  const tampered = chain.map((e, i) => (i === 5 ? { ...e, quantity: e.quantity + 9999 } : e));
  const result = verifyChain(tampered);
  check("tampered event is detected", !result.ok);
  check("detection points at the edited event", result.brokenAtEventId === tampered[5].id, result.brokenAtEventId ?? "none");
}

{
  const appended = appendEvent("demo", chain, {
    batchId: heroBatch.id,
    eventType: "received",
    fromLocationId: "loc-dist-kaduna",
    toLocationId: "loc-ph-ikeja",
    quantity: 12,
    occurredAt: "2026-10-13T10:00:00Z",
    actor: "test",
    note: null,
  });
  check("a legitimately appended event still verifies", verifyChain([...chain, appended]).ok);
}

console.log("\nForecast");
const series = generateSeries();
// Must be a pair assignPairs() emits AND a SQUEEZE key in demand.ts,
// otherwise there are no movements and no starvation to warn about.
const pair = series.movements.find((m) => m.batchId === "bat-mf-0917" && m.locationId === "loc-ph-nassarawa")!;
const fc = forecastStockout({
  batchId: pair.batchId,
  locationId: pair.locationId,
  productId: batchById.get(pair.batchId)!.productId,
  movements: series.movements.filter((m) => m.batchId === pair.batchId && m.locationId === pair.locationId),
  position: series.positions.find((p) => p.batchId === pair.batchId && p.locationId === pair.locationId),
  today: TODAY,
});

check("forecast produces a result for a starved shelf", fc !== null);
if (fc) {
  const shelfName = locationById.get(pair.locationId)?.name ?? pair.locationId;
  console.log(
    `  ${shelfName} — ${fc.onHand} on hand, ${fc.dailyDemand.toFixed(1)}/day, ${fc.daysToStockout} days, band=${fc.band}`,
  );
  check("starved shelf lands in warning or critical", fc.band === "warning" || fc.band === "critical", fc.band);
  // The library compacts history to active days, so length is not the
  // assertion — the assertion is that the series ends in a projection
  // dated after today.
  const lastPoint = fc.series[fc.series.length - 1];
  const todayIso = TODAY.toISOString().slice(0, 10);
  check("projection extends past today", lastPoint.day > todayIso && lastPoint.observed === null, `${fc.series.length} points to ${lastPoint.day}`);
  check("history portion is observed", fc.series[0].observed !== null);
  check("horizon portion is projected", fc.series[fc.series.length - 1].observed === null);
  check("confidence is in range", fc.confidence > 0.15 && fc.confidence < 0.95, fc.confidence.toFixed(2));
}

{
  const healthy = series.movements.find((m) => m.locationId === "loc-ph-yaba")!;
  const fc2 = forecastStockout({
    batchId: healthy.batchId,
    locationId: healthy.locationId,
    productId: batchById.get(healthy.batchId)!.productId,
    movements: series.movements.filter((m) => m.batchId === healthy.batchId && m.locationId === healthy.locationId),
    position: series.positions.find((p) => p.batchId === healthy.batchId && p.locationId === healthy.locationId),
    today: TODAY,
  });
  if (fc2) {
    console.log(`  Yaba Primary Care — ${fc2.onHand} on hand, ${fc2.daysToStockout} days, band=${fc2.band}`);
    check("unstarved shelf is not critical", fc2.band !== "critical", fc2.band);
  }

  // ME-3: per-product rollup that powers the "is MY medicine running low"
  // alerts on the My medicines tab.
  const malaSummary = summarizeProductStock("prd-malafem", BATCHES, series.movements, series.positions, TODAY);
  check("squeezed product reads critical somewhere", malaSummary.worst === "critical", malaSummary.worst ?? "none");
  check(
    "at-risk list names shelves",
    malaSummary.atRisk.length > 0 && malaSummary.atRisk.every((r) => r.locationId && (r.band === "critical" || r.band === "warning")),
    `${malaSummary.atRisk.length} shelf(s)`,
  );
  const pxSummary = summarizeProductStock("prd-paraxp", BATCHES, series.movements, series.positions, TODAY);
  check("unsqueezed staple stays calm", pxSummary.worst === "ok", pxSummary.worst ?? "none");
  const noSummary = summarizeProductStock("prd-nope", BATCHES, series.movements, series.positions, TODAY);
  check("unknown product has no summary", noSummary.worst === null && noSummary.shelves === 0 && noSummary.atRisk.length === 0);
}

console.log("\nData integrity");
check("recalled batch is in the registry", batchByCode.get("NG-AC-25-0442")?.status === "recalled");
check("expired batch is in the registry", batchByCode.get("NG-MF-25-0208")?.status === "expired");
check("counterfeit serial is NOT registered", !batchByCode.has("NG-MF-26-0917X"));
check("pharmacies span multiple states", new Set(PHARMACIES.map((p) => p.state)).size >= 8);
check("all custody chains verify", [...bundle.byBatch.values()].every((c) => verifyChain(c).ok));
console.log(
  `  ${bundle.byBatch.size} batch chains, ${bundle.all.length} events total, ${series.movements.length} stock movements, ${series.positions.length} shelf positions`,
);
console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
