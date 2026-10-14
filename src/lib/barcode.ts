/**
 * Barcode reading.
 *
 * Uses the browser's native `BarcodeDetector` where it exists (Chrome, Edge,
 * Android WebView). Safari and Firefox do not ship it, so callers must offer a
 * manual code entry as well — which the demo screen does.
 */

export type BarcodeFormat = "code_128" | "code_39" | "qr_code" | "data_matrix" | "unknown";

export interface BarcodeHit {
  rawValue: string;
  format: BarcodeFormat;
}

type DetectorCtor = new (opts: { formats?: string[] }) => {
  detect(source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement): Promise<Array<{ rawValue?: string; format?: string }>>;
};

export function barcodeSupported(): boolean {
  return typeof globalThis !== "undefined" && "BarcodeDetector" in globalThis;
}

const KNOWN: BarcodeFormat[] = ["code_128", "code_39", "qr_code", "data_matrix"];

function normaliseFormat(f: string | undefined): BarcodeFormat {
  const v = (f ?? "").toLowerCase();
  return (KNOWN.find((k) => v.includes(k.split("_")[0])) ?? "unknown") as BarcodeFormat;
}

/**
 * Detect every barcode in an image. Returns the strongest hit — the longest
 * decoded payload, which for a medicine pack is the batch serial.
 */
export async function detectBarcode(source: ImageBitmap | HTMLCanvasElement): Promise<BarcodeHit | null> {
  if (!barcodeSupported()) return null;
  const Detector = (globalThis as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
  const detector = new Detector({
    formats: ["code_128", "code_39", "code_93", "qr_code", "data_matrix", "ean_13", "ean_8", "upc_a"],
  });

  try {
    const results = await detector.detect(source);
    if (!results.length) return null;
    const best = results.reduce((a, b) => ((a.rawValue?.length ?? 0) >= (b.rawValue?.length ?? 0) ? a : b));
    const value = (best.rawValue ?? "").trim();
    if (!value) return null;
    return { rawValue: value, format: normaliseFormat(best.format) };
  } catch {
    // Some browsers throw on unsupported formats rather than returning [].
    return null;
  }
}

/** Decode a still image (file or URL) without leaking the bitmap. */
export async function detectBarcodeInImage(src: Blob | string): Promise<BarcodeHit | null> {
  const bitmap = await createImageBitmap(src instanceof Blob ? src : await (await fetch(src)).blob());
  try {
    return await detectBarcode(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Human label for the format badge. */
export function formatLabel(f: BarcodeFormat): string {
  switch (f) {
    case "code_128":
      return "Code 128";
    case "code_39":
      return "Code 39";
    case "qr_code":
      return "QR";
    case "data_matrix":
      return "Data Matrix";
    default:
      return "Barcode";
  }
}
