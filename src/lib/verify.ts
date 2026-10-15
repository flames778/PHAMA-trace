import type {
  Batch,
  CustodyEvent,
  Location,
  Product,
  ScanEvidence,
  ScanResult,
  StockPosition,
  Verdict,
  VisionReport,
} from "../types";
import { VISION_THRESHOLD } from "./vision";
import { summarizeChain } from "./ledger";

/**
 * Decision engine.
 *
 * Combines the registry check, the packaging analysis and the supply-chain
 * context into one of three answers plus the reasons that produced it.
 * Nothing here is proof: it is a ranked recommendation for a pharmacist.
 *
 * The flag taxonomy (near-miss serials, packaging mismatch, recalled batch,
 * geographic anomaly, code reuse) mirrors the fields of a WHO GSMS Medical
 * Product Alert — product, batch, visual discrepancies, distribution detail —
 * so a suspicious scan already carries the shape a regulator report needs.
 * Escalation targets are the official channels, not this app: NAFDAC's Med
 * Safety app / sf.alert@nafdac.gov.ng nationally, rapidalert@who.int
 * internationally (see report.md).
 */

export interface VerifyInput {
  rawCode: string;
  codeSource: ScanEvidence["codeSource"];
  vision: VisionReport | null;
  /** True when a photo was actually analysed, even if it produced no verdict. */
  photoProvided: boolean;
  batch: Batch | null;
  product: Product | null;
  custody: CustodyEvent[];
  positions: StockPosition[];
  scanLocation: Location;
  /** Prior scans of the same code, most recent first. */
  priorScans: ScanResult[];
  /** Every batch code the registry knows about, for near-miss detection. */
  registeredCodes: string[];
  /** Resolve a location id to its record. */
  locationById: (id: string) => Location | null;
  locationName: (id: string | null) => string | null;
}

interface Signal {
  id: string;
  label: string;
  /** Negative pushes toward suspicious, positive toward genuine. */
  weight: number;
  detail: string;
  severity: "info" | "warning" | "critical";
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: Location, b: Location): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "-");
}

/** Levenshtein distance, capped for speed. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 4;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function verify(input: VerifyInput): ScanResult {
  const signals: Signal[] = [];
  const flags: string[] = [];
  const code = normaliseCode(input.rawCode);
  const { batch, product, vision } = input;

  // ---------------------------------------------------------------- registry
  if (batch) {
    signals.push({
      id: "registry-hit",
      label: "Batch registry",
      weight: 2.2,
      severity: "info",
      detail: `Code ${code} is registered to ${product?.brandName ?? "a registered product"} (${product?.manufacturer ?? "manufacturer on file"}).`,
    });

    if (batch.status === "recalled") {
      flags.push("RECALLED_BATCH");
      signals.push({
        id: "recalled",
        label: "Recall status",
        weight: -6,
        severity: "critical",
        detail: `This batch is under recall: ${batch.recallReason ?? "reason on file"}`,
      });
    }

    const expired = new Date(batch.expiresOn + "T23:59:59Z").getTime() < Date.now();
    if (expired || batch.status === "expired") {
      flags.push("EXPIRED_BATCH");
      signals.push({
        id: "expired",
        label: "Expiry",
        weight: -4.5,
        severity: "critical",
        detail: `Batch expired on ${batch.expiresOn}. A pack carrying this code and still on sale should be pulled.`,
      });
    } else {
      const days = Math.round((new Date(batch.expiresOn).getTime() - Date.now()) / 86_400_000);
      if (days < 180) {
        signals.push({
          id: "near-expiry",
          label: "Expiry",
          weight: -0.8,
          severity: "warning",
          detail: `Batch expires in ${days} days (${batch.expiresOn}).`,
        });
      }
    }

    // ---------------------------------------------------------------- custody
    const custodySummary = summarizeChain(input.custody, input.locationName);
    if (input.custody.length === 0) {
      flags.push("NO_CUSTODY_HISTORY");
      signals.push({
        id: "custody-missing",
        label: "Chain of custody",
        weight: -2.4,
        severity: "warning",
        detail: "The batch is registered but no custody events have been logged for it.",
      });
    } else if (!custodySummary.chainIntact) {
      flags.push("CUSTODY_CHAIN_BROKEN");
      signals.push({
        id: "custody-broken",
        label: "Chain of custody",
        weight: -3.6,
        severity: "critical",
        detail: `Custody ledger fails hash verification at event ${custodySummary.brokenAtEventId}. At least one record was altered after it was written.`,
      });
    } else {
      signals.push({
        id: "custody-ok",
        label: "Chain of custody",
        weight: 1.4,
        severity: "info",
        detail: `Ledger verifies across ${custodySummary.hops} hash-chained events. Last custodian: ${custodySummary.lastKnownCustodian ?? "unknown"} on ${custodySummary.lastMovement?.slice(0, 10) ?? "—"}.`,
      });
    }

    // -------------------------------------------------------- route geometry
    const destinations = new Set(
      input.custody.filter((e) => e.eventType === "received" && e.toLocationId).map((e) => e.toLocationId as string),
    );
    const receiptLocations = input.positions.map((p) => p.locationId).filter((id) => destinations.has(id));
    if (receiptLocations.length > 0) {
      const distances = receiptLocations
        .map((id) => input.locationById(id))
        .filter((loc): loc is Location => Boolean(loc))
        .map((loc) => ({ name: loc.name, km: haversineKm(input.scanLocation, loc) }));
      const nearest = distances.reduce<{ name: string; km: number } | null>(
        (best, d) => (best === null || d.km < best.km ? d : best),
        null,
      );
      if (nearest && nearest.km > 450) {
        flags.push("GEOGRAPHIC_ANOMALY");
        signals.push({
          id: "geo-anomaly",
          label: "Route plausibility",
          weight: -2.2,
          severity: "warning",
          detail: `Nearest recorded destination for this batch is ${nearest.name}, ${Math.round(nearest.km)} km away. A pack surfacing this far off its route is worth a second look.`,
        });
      } else if (nearest) {
        signals.push({
          id: "geo-ok",
          label: "Route plausibility",
          weight: 0.6,
          severity: "info",
          detail: `Scan is ${Math.round(nearest.km)} km from ${nearest.name}, a recorded destination for this batch.`,
        });
      }
    }

    // ---------------------------------------------------- repeated-scan check
    // One genuine pack carries one code — but the owner re-scanning their own
    // shelf is not an attack. Flag only cross-site reuse (the copied-serial
    // pattern) or relentless same-site repetition.
    const today = new Date().toISOString().slice(0, 10);
    const todayScans = input.priorScans.filter((s) => s.createdAt.slice(0, 10) === today);
    const lgas = new Set(todayScans.map((s) => `${s.lat.toFixed(2)},${s.lng.toFixed(2)}`));
    if (todayScans.length >= 2 && (lgas.size > 1 || todayScans.length >= 4)) {
      flags.push("REPEATED_CODE");
      signals.push({
        id: "repeated",
        label: "Reuse of code",
        weight: -2.6,
        severity: "critical",
        detail: `This code has already been scanned ${todayScans.length} times today across ${lgas.size} location(s). One genuine pack carries one code.`,
      });
    }
  } else {
    const near = nearestRegisteredCode(code, input.registeredCodes);
    if (near) {
      flags.push("CODE_NEAR_MISS");
      signals.push({
        id: "near-miss",
        label: "Batch registry",
        weight: -2.8,
        severity: "critical",
        detail: `Code ${code} is not in the registry, but ${near} is. It differs by ${editDistance(code, near)} character(s). That is the classic pattern of a copied serial.`,
      });
    } else {
      flags.push("CODE_UNKNOWN");
      signals.push({
        id: "unknown-code",
        label: "Batch registry",
        weight: -2.0,
        severity: "warning",
        detail: `Code ${code || "(empty)"} does not match any batch in the registry. Either the batch was never registered, or this pack was made up.`,
      });
    }
  }

  // ------------------------------------------------------------------ vision
  // A report with no weighted checks means "no reference artwork on file",
  // not "the print failed every measurement" — score 0 must not read as a
  // measured mismatch.
  if (vision && vision.checks.every((c) => c.weight === 0)) {
    flags.push("NO_REFERENCE_ARTWORK");
    signals.push({
      id: "vision-no-reference",
      label: "Packaging analysis",
      weight: -1.3,
      severity: "warning",
      detail:
        "A photograph was analysed but the registry holds no reference artwork for this product, so the print could not be compared. The verdict rests on the code and custody checks below.",
    });
  } else if (vision) {
    const failing = vision.checks.filter((c) => c.weight > 0 && c.status === "fail");
    const warning = vision.checks.filter((c) => c.weight > 0 && c.status === "warn");

    if (vision.score >= VISION_THRESHOLD.genuine && failing.length === 0) {
      signals.push({
        id: "vision-pass",
        label: "Packaging analysis",
        weight: 2.6,
        severity: "info",
        detail: `Pack matches the registered artwork (aggregate ${Math.round(vision.score * 100)}%). ${vision.checks.length - 1} print measurements taken.`,
      });
    } else if (vision.score <= VISION_THRESHOLD.mismatch || failing.length >= 2) {
      flags.push("PACKAGING_MISMATCH");
      signals.push({
        id: "vision-fail",
        label: "Packaging analysis",
        weight: -3.2,
        severity: "critical",
        detail: `Pack does not match the registered artwork (aggregate ${Math.round(vision.score * 100)}%). ${failing.map((c) => c.label).join(", ") || "Overall similarity"} failed.`,
      });
    } else {
      signals.push({
        id: "vision-weak",
        label: "Packaging analysis",
        weight: -0.6,
        severity: "warning",
        detail: `Packaging comparison is inconclusive (aggregate ${Math.round(vision.score * 100)}%). ${warning.map((c) => c.label).join(", ") || "Some measurements"} outside the expected band.`,
      });
    }
  } else if (batch && product) {
    // A failed analysis is worse than none: the user did the right thing and
    // still got no comparison. photoProvided distinguishes the two.
    const analysed = input.photoProvided;
    signals.push({
      id: "vision-missing",
      label: "Packaging analysis",
      weight: analysed ? -1.6 : -1.1,
      severity: "warning",
      detail: analysed
        ? "A pack photograph was provided but could not be analysed. Retake with even light and the pack filling the frame. A batch code on its own can be photocopied onto a fake pack."
        : "No pack photograph was analysed. A batch code on its own can be photocopied onto a fake pack.",
    });
  }

  // --------------------------------------------------------------- decision
  // Frequently falsified products (Product.highRisk) amplify negative
  // evidence by 15%. Positive evidence is untouched, so a clean pack from a
  // high-risk line still reads genuine — only borderline packs tip sooner.
  const riskMultiplier = product?.highRisk ? 1.15 : 1;
  const score = signals.reduce(
    (s, x) => s + (x.weight < 0 ? x.weight * riskMultiplier : x.weight),
    0,
  );
  const verdict = decide(score, signals, Boolean(batch), Boolean(vision));
  const confidence = confidenceFor(verdict, score, signals, Boolean(vision));

  const reasons = [...signals]
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .map((s) => s.detail);

  const evidence: ScanEvidence = {
    codeSource: input.codeSource,
    codeRead: code || null,
    vision,
    custody: batch
      ? summarizeChain(input.custody, input.locationName)
      : { hops: 0, lastKnownCustodian: null, lastMovement: null, chainIntact: false, brokenAtEventId: null },
    flags,
  };

  return {
    id: `scn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    batchCode: code,
    productId: product?.id ?? null,
    batchId: batch?.id ?? null,
    verdict,
    confidence,
    headline: headlineFor(verdict, code, product),
    reasons,
    evidence,
    lat: input.scanLocation.lat,
    lng: input.scanLocation.lng,
    createdAt: new Date().toISOString(),
  };
}

export function decide(score: number, signals: Signal[], hasBatch: boolean, hasVision: boolean): Verdict {
  const critical = signals.some((s) => s.severity === "critical" && s.weight <= -2.5);
  if (critical || score <= -2.5) return "suspicious";
  // Code-only success is deliberately not enough to call a pack genuine —
  // this cap sits above the score>=3 line on purpose.
  if (!hasVision && hasBatch && score >= 0) return "unverifiable";
  if (score >= 3) return "genuine";
  if (score >= 0.5 && hasBatch && hasVision) return "genuine";
  return "unverifiable";
}

function confidenceFor(verdict: Verdict, score: number, signals: Signal[], hasVision: boolean): number {
  const magnitude = Math.min(1, Math.abs(score) / 7);
  const base = verdict === "unverifiable" ? 0.35 : 0.45 + magnitude * 0.5;
  const bonus = verdict === "genuine" && hasVision ? 0.06 : 0;
  const penalty = signals.some((s) => s.severity === "critical") ? 0.05 : 0;
  return Math.max(0.05, Math.min(0.98, base + bonus - penalty));
}

function headlineFor(verdict: Verdict, code: string, product: Product | null): string {
  switch (verdict) {
    case "genuine":
      return `${product?.brandName ?? "Pack"}: matches the registered batch`;
    case "suspicious":
      return `Do not dispense ${code}`;
    default:
      return `Cannot confirm ${code}`;
  }
}

function nearestRegisteredCode(code: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = 4;
  for (const c of candidates) {
    const d = editDistance(code, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return bestDist <= 2 ? best : null;
}
