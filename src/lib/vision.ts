import type { VisionCheck, VisionReport } from "../types";

/**
 * Packaging comparison.
 *
 * This is deliberately a classical, fully-explainable pipeline rather than a
 * neural network. On a ten-day build we cannot train a model on enough genuine
 * and falsified packs for its accuracy number to mean anything, and a judge who
 * asks "how do you know?" deserves an answer that is not "the model said so".
 *
 * The pipeline:
 *   1. letterbox-normalise both the photographed pack and the manufacturer's
 *      registered artwork into a fixed working resolution,
 *   2. coarse-to-fine multi-scale template search (normalised cross-correlation)
 *      to recover scale and translation,
 *   3. five independent measurements scored 0..1 and reported separately.
 *
 * Everything here is decision support. It is not forensic evidence.
 */

export const WORK_W = 128;
export const WORK_H = 128;

export interface GrayImage {
  w: number;
  h: number;
  data: Float32Array;
}

/** ---------------------------------------------------------------- loading */

export async function loadImageData(src: string | Blob): Promise<ImageData> {
  const bitmap = await decode(src);
  try {
    return rasterise(bitmap, bitmap.width, bitmap.height);
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

async function decode(src: string | Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot decode images for packaging analysis.");
  }
  if (typeof src === "string") {
    const res = await fetch(src, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Could not load ${src} (${res.status})`);
    return createImageBitmap(await res.blob());
  }
  return createImageBitmap(src);
}

function rasterise(bitmap: ImageBitmap, w: number, h: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** ------------------------------------------------------------- conversion */

export function toGray(img: ImageData): GrayImage {
  const data = new Float32Array(img.width * img.height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    // Rec.709 luma — matches how a phone camera's Bayer filter weights colour.
    data[i] = 0.2126 * img.data[p] + 0.7152 * img.data[p + 1] + 0.0722 * img.data[p + 2];
  }
  return { w: img.width, h: img.height, data };
}

/** Bilinear sample of a grayscale image at fractional coordinates. */
function sample(g: GrayImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = Math.min(x0 + 1, g.w - 1);
  const y1 = Math.min(y0 + 1, g.h - 1);
  const cx0 = Math.max(0, x0);
  const cy0 = Math.max(0, y0);
  const a = g.data[cy0 * g.w + cx0];
  const b = g.data[cy0 * g.w + x1];
  const c = g.data[y1 * g.w + cx0];
  const d = g.data[y1 * g.w + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/**
 * Letterbox into `outW x outH`. We letterbox rather than stretch so a pack
 * photographed slightly off-angle keeps its aspect ratio, which is what the
 * template search expects.
 */
export function letterbox(img: ImageData, outW = WORK_W, outH = WORK_H): GrayImage {
  const gray = toGray(img);
  const out = new Float32Array(outW * outH).fill(255);
  const scale = Math.min(outW / gray.w, outH / gray.h);
  const dw = gray.w * scale;
  const dh = gray.h * scale;
  const ox = (outW - dw) / 2;
  const oy = (outH - dh) / 2;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = x / scale;
      const sy = y / scale;
      out[Math.floor(oy + y) * outW + Math.floor(ox + x)] = sample(gray, sx, sy);
    }
  }
  return { w: outW, h: outH, data: out };
}

/** ------------------------------------------------------------- statistics */

function meanStd(g: GrayImage): { mean: number; std: number } {
  let sum = 0;
  for (const v of g.data) sum += v;
  const mean = sum / g.data.length;
  let acc = 0;
  for (const v of g.data) acc += (v - mean) * (v - mean);
  return { mean, std: Math.sqrt(acc / g.data.length) };
}

/** Pearson correlation between two equal-length zero-centred vectors. */
function ncc(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Coarse-to-fine multi-scale template search.
 *
 * Search a small working grid for the best (scale, dx, dy), then re-evaluate
 * the winner at full working resolution. Returns the best correlation in
 * [-1, 1] and the transform that produced it.
 */
export function alignAndCorrelate(ref: GrayImage, photo: GrayImage): {
  score: number;
  scale: number;
  dx: number;
  dy: number;
} {
  const COARSE = 48;
  const refC = downsample(ref, COARSE, COARSE);
  const photoC = downsample(photo, COARSE, COARSE);

  const scales = [0.72, 0.82, 0.91, 1.0, 1.1, 1.22, 1.36];
  const steps = [-12, -8, -4, 0, 4, 8, 12];
  let best = { score: -1, scale: 1, dx: 0, dy: 0 };

  for (const scale of scales) {
    for (const dx of steps) {
      for (const dy of steps) {
        const warped = warp(refC.w, refC.h, photoC, scale, dx / COARSE, dy / COARSE);
        const score = ncc(refC.data, warped);
        if (score > best.score) best = { score, scale, dx, dy };
      }
    }
  }

  // Refine around the coarse winner at full working resolution.
  const refine = [
    { scale: best.scale, dx: best.dx, dy: best.dy },
    { scale: best.scale * 0.97, dx: best.dx, dy: best.dy },
    { scale: best.scale * 1.03, dx: best.dx, dy: best.dy },
    { scale: best.scale, dx: best.dx - 1, dy: best.dy },
    { scale: best.scale, dx: best.dx + 1, dy: best.dy },
    { scale: best.scale, dx: best.dx, dy: best.dy - 1 },
    { scale: best.scale, dx: best.dx, dy: best.dy + 1 },
  ];
  for (const c of refine) {
    const warped = warp(ref.w, ref.h, photo, c.scale, c.dx / ref.w, c.dy / ref.h);
    const score = ncc(ref.data, warped);
    if (score > best.score) best = { score, scale: c.scale, dx: c.dx, dy: c.dy };
  }

  return best;
}

/** Sample `photo` into a ref-sized grid under scale + normalised translation. */
function warp(outW: number, outH: number, photo: GrayImage, scale: number, nx: number, ny: number): Float32Array {
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const sy = (y - ny * outH) / scale;
    for (let x = 0; x < outW; x++) {
      const sx = (x - nx * outW) / scale;
      out[y * outW + x] =
        sx < 0 || sy < 0 || sx > photo.w - 1 || sy > photo.h - 1 ? 128 : sample(photo, sx, sy);
    }
  }
  return out;
}

function downsample(g: GrayImage, w: number, h: number): GrayImage {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = (x / w) * g.w;
      const sy = (y / h) * g.h;
      out[y * w + x] = sample(g, sx, sy);
    }
  }
  return { w, h, data: out };
}

/**
 * Sobel gradient magnitude, normalised to 0..255.
 *
 * Template matching runs on this field rather than on raw intensity. Two
 * different medicine cartons share a lot of low-frequency structure — pale
 * board, a dark band across the top, blocks of text — so plain intensity
 * correlation scores a completely different product surprisingly well. The
 * gradient field throws that shared structure away and compares where the ink
 * actually forms edges, which is what differs when a pack is redrawn.
 */
export function edgeField(g: GrayImage): GrayImage {
  const out = new Float32Array(g.w * g.h);
  let max = 1e-6;
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      const gx =
        -g.data[i - g.w - 1] - 2 * g.data[i - 1] - g.data[i + g.w - 1] +
        g.data[i - g.w + 1] + 2 * g.data[i + 1] + g.data[i + g.w + 1];
      const gy =
        -g.data[i - g.w - 1] - 2 * g.data[i - g.w] - g.data[i - g.w + 1] +
        g.data[i + g.w - 1] + 2 * g.data[i + g.w] + g.data[i + g.w + 1];
      const m = Math.hypot(gx, gy);
      out[i] = m;
      if (m > max) max = m;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * 255;
  return { w: g.w, h: g.h, data: out };
}

/** Variance of Laplacian — the standard focus / print-clarity measure. */
function laplacianVariance(g: GrayImage): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      const v =
        g.data[i - 1] + g.data[i + 1] + g.data[i - g.w] + g.data[i + g.w] - 4 * g.data[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Fraction of pixels where the Sobel gradient exceeds a perceptual threshold. */
function edgeDensity(g: GrayImage): number {
  let edges = 0;
  let n = 0;
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      const gx =
        -g.data[i - g.w - 1] - 2 * g.data[i - 1] - g.data[i + g.w - 1] +
        g.data[i - g.w + 1] + 2 * g.data[i + 1] + g.data[i + g.w + 1];
      const gy =
        -g.data[i - g.w - 1] - 2 * g.data[i - g.w] - g.data[i - g.w + 1] +
        g.data[i + g.w - 1] + 2 * g.data[i + g.w] + g.data[i + g.w + 1];
      if (Math.hypot(gx, gy) > 96) edges++;
      n++;
    }
  }
  return edges / n;
}

/** Colour histogram intersection over 6 bins per channel. */
export function paletteSimilarity(a: ImageData, b: ImageData): number {
  const hist = (img: ImageData) => {
    const bins = new Float32Array(6 * 6 * 6);
    let total = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const r = Math.min(5, Math.floor(img.data[i] / (256 / 6)));
      const g = Math.min(5, Math.floor(img.data[i + 1] / (256 / 6)));
      const bl = Math.min(5, Math.floor(img.data[i + 2] / (256 / 6)));
      bins[(r * 36) + g * 6 + bl]++;
      total++;
    }
    for (let i = 0; i < bins.length; i++) bins[i] /= total;
    return bins;
  };
  const ha = hist(a);
  const hb = hist(b);
  let inter = 0;
  for (let i = 0; i < ha.length; i++) inter += Math.min(ha[i], hb[i]);
  return inter;
}

/**
 * Localised template check on the regulatory-mark region.
 *
 * The registered artwork tells us roughly where the regulator's mark sits.
 * We compare that small window after alignment; a reprinted or redrawn pack
 * almost always loses the fine guilloche detail inside the seal.
 */
function regulatoryMarkScore(ref: GrayImage, photo: GrayImage, dx: number, dy: number, scale: number): number {
  const rx = Math.round(ref.w * 0.06);
  const ry = Math.round(ref.h * 0.62);
  const rw = Math.round(ref.w * 0.18);
  const rh = Math.round(ref.h * 0.22);
  return patchNcc(ref, photo, rx, ry, rw, rh, dx, dy, scale);
}

/** Brand-panel check — the top third carries the wordmark, the strongest cue. */
function brandPanelScore(ref: GrayImage, photo: GrayImage, dx: number, dy: number, scale: number): number {
  const rx = Math.round(ref.w * 0.08);
  const ry = Math.round(ref.h * 0.1);
  const rw = Math.round(ref.w * 0.84);
  const rh = Math.round(ref.h * 0.3);
  return patchNcc(ref, photo, rx, ry, rw, rh, dx, dy, scale);
}

function patchNcc(
  ref: GrayImage,
  photo: GrayImage,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  dx: number,
  dy: number,
  scale: number,
): number {
  const nx = dx / ref.w;
  const ny = dy / ref.h;
  const patch = new Float32Array(rw * rh);
  const warped = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const rxp = rx + x;
      const ryp = ry + y;
      patch[y * rw + x] = ref.data[ryp * ref.w + rxp];
      const sx = (rxp - nx * ref.w) / scale;
      const sy = (ryp - ny * ref.h) / scale;
      warped[y * rw + x] =
        sx < 0 || sy < 0 || sx > photo.w - 1 || sy > photo.h - 1 ? 128 : sample(photo, sx, sy);
    }
  }
  return ncc(patch, warped);
}

/** ----------------------------------------------------------- entry point */

export interface AnalysisInput {
  photo: ImageData;
  reference: ImageData | null;
  /** Set when the caller knows the batch is a documented reference sample. */
  label?: string;
}

const MIN_SIDE = 96;

export function analysePack(input: AnalysisInput): VisionReport {
  const { photo, reference } = input;
  const checks: VisionCheck[] = [];

  const brightness = meanStd(toGray(photo));
  const lit = brightness.mean > 32 && brightness.std > 18;
  checks.push({
    id: "capture-quality",
    label: "Capture quality",
    status: lit ? "pass" : "warn",
    detail: lit
      ? `Image is adequately lit and textured (mean luma ${brightness.mean.toFixed(0)}, σ ${brightness.std.toFixed(0)}).`
      : `Image is ${brightness.mean < 32 ? "too dark" : "too flat"} for a reliable comparison. Retake with even light and the pack filling the frame.`,
    weight: 0,
    measured: brightness.mean / 255,
  });

  if (!reference) {
    return {
      checks,
      score: 0,
      width: photo.width,
      height: photo.height,
    };
  }

  const sharp = laplacianVariance(toGray(photo));
  // Below ~40 the print is effectively unreadable at pack scale.
  const sharpScore = clamp01((sharp - 18) / 160);
  checks.push({
    id: "print-clarity",
    label: "Print clarity",
    status: sharpScore > 0.55 ? "pass" : sharpScore > 0.3 ? "warn" : "fail",
    detail:
      sharpScore > 0.55
        ? `Micro-text and line edges are crisp (Laplacian variance ${sharp.toFixed(0)}).`
        : `Print is ${sharpScore > 0.3 ? "soft" : "noticeably blurred"} (Laplacian variance ${sharp.toFixed(0)}). Reprinted or screen-captured packaging loses high-frequency detail.`,
    weight: 0.15,
    measured: sharpScore,
  });

  const palette = paletteSimilarity(photo, reference);
  checks.push({
    id: "colour-palette",
    label: "Colour palette",
    status: palette > 0.62 ? "pass" : palette > 0.4 ? "warn" : "fail",
    detail:
      palette > 0.62
        ? `Ink distribution matches the registered artwork (histogram intersection ${(palette * 100).toFixed(0)}%).`
        : `Ink distribution differs from the registered artwork (histogram intersection ${(palette * 100).toFixed(0)}%). Offset printers using the wrong Pantone produce this signature.`,
    weight: 0.2,
    measured: palette,
  });

  // Alignment, brand panel and regulatory mark all run in the gradient domain.
  // Comparing raw intensity lets a different carton score high on shared
  // layout; the gradient field only agrees where the print detail agrees.
  const refEdge = edgeField(letterbox(reference));
  const photoEdge = edgeField(letterbox(photo));
  const align = alignAndCorrelate(refEdge, photoEdge);
  const artwork = clamp01((align.score + 0.1) / 1.05);

  checks.push({
    id: "artwork-template",
    label: "Artwork template match",
    status: artwork > 0.72 ? "pass" : artwork > 0.5 ? "warn" : "fail",
    detail: `Best multi-scale match against registered artwork scored ${(align.score * 100).toFixed(0)}% (scale ×${align.scale.toFixed(2)}).`,
    weight: 0.34,
    measured: artwork,
  });

  const brand = brandPanelScore(refEdge, photoEdge, align.dx, align.dy, align.scale);
  checks.push({
    id: "brand-panel",
    label: "Brand panel alignment",
    status: brand > 0.7 ? "pass" : brand > 0.45 ? "warn" : "fail",
    detail: `Wordmark region correlation ${(brand * 100).toFixed(0)}%.`,
    weight: 0.16,
    measured: clamp01((brand + 0.05) / 1.05),
  });

  const seal = regulatoryMarkScore(refEdge, photoEdge, align.dx, align.dy, align.scale);
  checks.push({
    id: "regulatory-mark",
    label: "Regulatory mark detail",
    status: seal > 0.68 ? "pass" : seal > 0.42 ? "warn" : "fail",
    detail:
      seal > 0.68
        ? `Guilloche detail inside the regulator's mark survives comparison (${(seal * 100).toFixed(0)}%).`
        : `Fine detail inside the regulator's mark is degraded or redrawn (${(seal * 100).toFixed(0)}%). Copies almost always lose it.`,
    weight: 0.15,
    measured: clamp01(seal),
  });

  const edges = edgeDensity(toGray(photo));
  const edgeScore = clamp01(1 - Math.abs(edges - 0.14) / 0.14);
  checks.push({
    id: "edge-signature",
    label: "Edge signature",
    status: edgeScore > 0.6 ? "pass" : edgeScore > 0.35 ? "warn" : "fail",
    detail: `Edge density ${(edges * 100).toFixed(1)}% (expected band 7–21%).`,
    weight: 0.1,
    measured: edgeScore,
  });

  const scored = checks.filter((c) => c.weight > 0);
  const totalWeight = scored.reduce((s, c) => s + c.weight, 0);
  const score = scored.reduce((s, c) => s + c.weight * (c.measured ?? 0), 0) / totalWeight;

  return { checks, score, width: photo.width, height: photo.height };
}

/** Scale a raw correlation into 0..1 for display without over-trusting it. */
export function correlationToScore(r: number): number {
  return clamp01((r + 0.1) / 1.05);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const VISION_THRESHOLD = {
  /** Above this aggregate score a pack is treated as matching its artwork. */
  genuine: 0.74,
  /** Below this it is treated as a mismatch. */
  mismatch: 0.52,
};

export const MIN_WORKING_SIDE = MIN_SIDE;
