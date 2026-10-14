import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Batch,
  CustodyEvent,
  Location,
  Product,
  ScanResult,
  StockMovement,
  StockPosition,
} from "../types";
import { registry, isDegraded, onDegradedChange } from "./registry";
import { verify, normaliseCode, type VerifyInput } from "./verify";
import { analysePack, loadImageData } from "./vision";
import { detectBarcodeInImage, type BarcodeHit } from "./barcode";

export interface ScanRequest {
  /** Code already known (typed, or decoded from the camera). */
  code?: string;
  codeSource: ScanRequestSource;
  /** Photograph of the pack. Drives the packaging analysis. */
  photo?: Blob | string | null;
  /** Override the location the scan is attributed to. */
  locationId?: string;
}

export type ScanRequestSource = "camera" | "upload" | "manual" | "demo";

export interface ScanOutcome {
  result: ScanResult;
  product: Product | null;
  batch: Batch | null;
  barcode: BarcodeHit | null;
  /** Set when the packaging analysis could not run at all. */
  visionError: string | null;
}

export interface PharmaTraceState {
  ready: boolean;
  error: string | null;
  mode: "local" | "supabase";
  /** True once any registry call has fallen back to bundled data. */
  degraded: boolean;
  products: Product[];
  locations: Location[];
  batches: Batch[];
  positions: StockPosition[];
  movements: StockMovement[];
  scans: ScanResult[];
  /** Custody events for the batch currently on screen, loaded on demand. */
  custody: CustodyEvent[];
  custodyFor: (batchId: string) => Promise<CustodyEvent[]>;
  /** The location new scans are attributed to. */
  scanLocation: Location;
  setScanLocationId: (id: string) => void;
  busy: boolean;
  runScan: (req: ScanRequest) => Promise<ScanOutcome>;
  recordMovement: (m: StockMovement) => Promise<void>;
  refreshScans: () => Promise<void>;
}

const DEFAULT_LOCATION = "loc-ph-ikeja";

/** Cache decoded reference artwork — it never changes between scans. */
const referenceCache = new Map<string, Promise<ImageData | null>>();

async function referenceFor(product: Product | null): Promise<ImageData | null> {
  if (!product?.artworkRef) return null;
  let pending = referenceCache.get(product.artworkRef);
  if (!pending) {
    pending = loadImageData(product.artworkRef).catch(() => null);
    referenceCache.set(product.artworkRef, pending);
  }
  return pending;
}

export function usePharmaTrace(): PharmaTraceState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanLocationId, setScanLocationId] = useState(DEFAULT_LOCATION);
  const [custody, setCustody] = useState<CustodyEvent[]>([]);
  const [degraded, setDegraded] = useState(isDegraded);

  useEffect(() => onDegradedChange(() => setDegraded(true)), []);

  const custodyFor = useCallback(async (batchId: string) => {
    const events = await registry.custodyFor(batchId);
    setCustody(events);
    return events;
  }, []);

  const refreshScans = useCallback(async () => {
    setScans(await registry.scans());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, l, b, pos, mov, sc] = await Promise.all([
          registry.products(),
          registry.locations(),
          registry.batches(),
          registry.positions(),
          registry.movements(),
          registry.scans(),
        ]);
        if (cancelled) return;
        setProducts(p);
        setLocations(l);
        setBatches(b);
        setPositions(pos);
        setMovements(mov);
        setScans(sc);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scanLocation = useMemo(
    () => locations.find((l) => l.id === scanLocationId) ?? locations.find((l) => l.kind === "pharmacy") ?? {
      id: "loc-ph-ikeja",
      name: "Adeniyi Jones Pharmacy",
      kind: "pharmacy" as const,
      lat: 6.6143,
      lng: 3.3485,
      lga: "Ikeja",
      state: "Lagos",
    },
    [locations, scanLocationId],
  );

  const locationById = useCallback(
    (id: string) => locations.find((l) => l.id === id) ?? null,
    [locations],
  );

  const locationName = useCallback(
    (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? null) : null),
    [locations],
  );

  const runScan = useCallback(
    async (req: ScanRequest): Promise<ScanOutcome> => {
      setBusy(true);
      try {
        let code = req.code ?? "";
        let barcode: BarcodeHit | null = null;

        // Prefer the code decoded from the photograph over a typed one.
        if (req.photo) {
          try {
            barcode = await detectBarcodeInImage(req.photo);
            if (barcode?.rawValue) code = barcode.rawValue;
          } catch {
            /* no detector, or the photo has no readable barcode — fall through */
          }
        }

        const normalised = normaliseCode(code);
        const batch = normalised ? await registry.batchByCode(normalised) : null;
        const product = batch ? await registry.productById(batch.productId) : null;

        let vision: ScanResult["evidence"]["vision"] = null;
        let visionError: string | null = null;
        if (req.photo) {
          try {
            const [photoData, reference] = await Promise.all([
              loadImageData(req.photo),
              referenceFor(product ?? products.find((p) => p.artworkRef && productMatchesCode(p, normalised)) ?? null),
            ]);
            vision = analysePack({ photo: photoData, reference });
          } catch (e) {
            visionError = e instanceof Error ? e.message : String(e);
          }
        }

        const registeredCodes = batches.map((b) => b.batchCode);
        const custody = batch ? await registry.custodyFor(batch.id) : [];

        const input: VerifyInput = {
          rawCode: normalised,
          codeSource: req.codeSource,
          vision,
          photoProvided: Boolean(req.photo),
          batch,
          product,
          custody,
          positions: batch ? positions.filter((p) => p.batchId === batch.id) : [],
          scanLocation: locations.find((l) => l.id === (req.locationId ?? scanLocation.id)) ?? scanLocation,
          priorScans: scans.filter((s) => normaliseCode(s.batchCode) === normalised),
          registeredCodes,
          locationById,
          locationName,
        };

        const result = verify(input);
        await registry.saveScan(result);
        setScans((prev) => [result, ...prev]);
        if (batch) setCustody(custody);
        return { result, product, batch, barcode, visionError };
      } finally {
        setBusy(false);
      }
    },
    [batches, locationById, locationName, locations, positions, products, scanLocation, scans],
  );

  const recordMovement = useCallback(async (movement: StockMovement) => {
    await registry.recordMovement(movement);
    setPositions((prev) => {
      const key = `${movement.batchId}|${movement.locationId}`;
      const found = prev.find((p) => `${p.batchId}|${p.locationId}` === key);
      if (!found) {
        return [
          ...prev,
          {
            batchId: movement.batchId,
            locationId: movement.locationId,
            onHand: Math.max(0, movement.received - movement.dispensed),
            updatedAt: movement.day,
          },
        ];
      }
      return prev.map((p) =>
        p.batchId === movement.batchId && p.locationId === movement.locationId
          ? { ...p, onHand: Math.max(0, p.onHand + movement.received - movement.dispensed), updatedAt: movement.day }
          : p,
      );
    });
    setMovements((prev) => [...prev, movement]);
  }, []);

  return {
    ready,
    error,
    mode: registry.mode,
    degraded,
    products,
    locations,
    batches,
    positions,
    movements,
    scans,
    custody,
    custodyFor,
    scanLocation,
    setScanLocationId,
    busy,
    runScan,
    recordMovement,
    refreshScans,
  };
}

/**
 * When the decoded code is unknown, we still want the packaging analysis to
 * compare against *something*. This guesses the product from the prefix the
 * mock registry uses (`NG-MF-…` -> `prd-malafem`).
 */
function productMatchesCode(product: Product, code: string): boolean {
  const prefix = code.split("-")[1];
  if (!prefix) return false;
  return product.id.includes(prefix.toLowerCase().slice(0, 2));
}
