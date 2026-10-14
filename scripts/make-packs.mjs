import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bwipjs from "bwip-js";
import sharp from "sharp";

/**
 * Generates the mock pack artwork used by the demo.
 *
 * Output
 *   public/packs/refs/<product>.png   clean manufacturer artwork (the template
 *                                     the vision pipeline compares against)
 *   public/packs/<code>.png           the "photo" the judge scans or uploads
 *   assets/packs/<product>-*.svg      editable vector sources
 *
 * The barcodes are genuine Code 128, generated with bwip-js, so the browser's
 * native BarcodeDetector reads them straight off the PNG during the demo.
 */

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REF_DIR = path.join(ROOT, "public", "packs", "refs");
const PACK_DIR = path.join(ROOT, "public", "packs");
const SRC_DIR = path.join(ROOT, "assets", "packs");

const FONT = "Helvetica, Arial, sans-serif";

/** ------------------------------------------------------------------ packs */

const PACKS = [
  {
    slug: "malafem",
    brand: "Malafem",
    sub: "20 / 120 mg",
    line: "Artemether + Lumefantrine dispersible tablets",
    count: "6 tablets per strip",
    maker: "Kano BioPharm Ltd",
    code: "NG-MF-26-0917",
    expiry: "2028-02-29",
    ink: "#0f766e",
    inkDark: "#134e4a",
    accent: "#f59e0b",
    variant: "reference",
  },
  {
    slug: "malafem-sample",
    brand: "Malafem",
    sub: "20 / 120 mg",
    line: "Artemether + Lumefantrine dispersible tablets",
    count: "6 tablets per strip",
    maker: "Kano BioPharm Ltd",
    code: "NG-MF-26-0917",
    expiry: "2028-02-29",
    ink: "#0f766e",
    inkDark: "#134e4a",
    accent: "#f59e0b",
    variant: "genuine",
  },
  {
    slug: "malafem-counterfeit",
    brand: "Malafem",
    sub: "20 / 120 mg",
    line: "Artemether + Lumefantrine dispersible tablets",
    count: "6 tablets per strip",
    maker: "Kano BioPharm Ltd",
    // One character away from the real serial — the near-miss the registry
    // is supposed to catch.
    code: "NG-MF-26-0917X",
    expiry: "2028-02-29",
    ink: "#1d9bd1",
    inkDark: "#0e6a96",
    accent: "#eab308",
    variant: "counterfeit",
  },
  {
    slug: "amoxaclear",
    brand: "Amoxaclear",
    sub: "500 mg",
    line: "Amoxicillin trihydrate hard capsules",
    count: "10 x 10 blister",
    maker: "Lagos Therapeutics Plc",
    code: "NG-AC-25-0442",
    expiry: "2027-05-31",
    ink: "#b91c1c",
    inkDark: "#7f1d1d",
    accent: "#fdba74",
    variant: "reference",
  },
  {
    slug: "amoxaclear-recalled",
    brand: "Amoxaclear",
    sub: "500 mg",
    line: "Amoxicillin trihydrate hard capsules",
    count: "10 x 10 blister",
    maker: "Lagos Therapeutics Plc",
    code: "NG-AC-25-0442",
    expiry: "2027-05-31",
    ink: "#b91c1c",
    inkDark: "#7f1d1d",
    accent: "#fdba74",
    variant: "genuine",
  },
  {
    slug: "paraxp",
    brand: "ParaXP",
    sub: "500 mg",
    line: "Paracetamol tablets",
    count: "1000 tablets bulk pack",
    maker: "Nile Chemicals Ltd",
    code: "NG-PX-26-1103",
    expiry: "2029-03-31",
    ink: "#4338ca",
    inkDark: "#312e81",
    accent: "#c4b5fd",
    variant: "reference",
  },
  {
    slug: "sulfix",
    brand: "Sulfix",
    sub: "500 / 25 mg",
    line: "Sulfadoxine + Pyrimethamine film-coated tablets",
    count: "3 tablets per strip",
    maker: "Kano BioPharm Ltd",
    code: "NG-SF-26-0051",
    expiry: "2028-01-14",
    ink: "#a16207",
    inkDark: "#713f12",
    accent: "#fef08a",
    variant: "reference",
  },
  {
    slug: "rehydra",
    brand: "Rehydra-ORS",
    sub: "20.5 g / L",
    line: "Oral rehydration salts, low osmolarity",
    count: "10 sachets",
    maker: "Delta Health Products",
    code: "NG-RH-26-0640",
    expiry: "2029-02-28",
    ink: "#0369a1",
    inkDark: "#0c4a6e",
    accent: "#7dd3fc",
    variant: "reference",
  },
];

/** --------------------------------------------------------------- artwork */

function guilloche(cx, cy, r, rings, rays, stroke, opacity) {
  const parts = [];
  for (let i = 0; i < rings; i++) {
    const rr = r - i * (r / (rings + 1));
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${rr.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="1.1" opacity="${opacity}"/>`,
    );
  }
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (r * 0.35);
    const y1 = cy + Math.sin(a) * (r * 0.35);
    const x2 = cx + Math.cos(a) * r;
    const y2 = cy + Math.sin(a) * r;
    parts.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${stroke}" stroke-width="0.9" opacity="${opacity}"/>`,
    );
  }
  return parts.join("");
}

async function barcodeSvg(text) {
  const svg = await bwipjs.toSVG({
    bcid: "code128",
    text,
    width: 420,
    height: 62,
    includetext: false,
    padding: 0,
  });
  return svg.replace(/^<\?xml[^>]*>\s*/, "").replace(/<svg([^>]*)>/, "<svg$1>");
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function packSvg(pack) {
  const counterfeit = pack.variant === "counterfeit";
  const sealPresent = !counterfeit;
  const W = 600;
  const H = 820;
  const bar = await barcodeSvg(pack.code);

  // The counterfeit gets the brand band at the wrong height and the wordmark
  // nudged off the baseline — visible to the eye only if you are looking.
  const bandH = counterfeit ? 158 : 172;
  const brandY = counterfeit ? 78 : 86;
  const brandSize = counterfeit ? 46 : 44;

  const seal = sealPresent
    ? `
  <g transform="translate(478,628)">
    <circle r="54" fill="#ffffff" stroke="${pack.inkDark}" stroke-width="2.5"/>
    ${guilloche(0, 0, 46, 7, 24, pack.inkDark, 0.55)}
    <circle r="16" fill="${pack.inkDark}" opacity="0.12"/>
    <text x="0" y="-4" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="${pack.inkDark}">REG</text>
    <text x="0" y="10" text-anchor="middle" font-family="${FONT}" font-size="9" fill="${pack.inkDark}">NG</text>
  </g>`
    : `
  <g transform="translate(478,628)">
    <rect x="-42" y="-30" width="84" height="60" fill="#e5e7eb"/>
    <text x="0" y="5" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#6b7280">REG</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pack.ink}"/>
      <stop offset="100%" stop-color="${pack.inkDark}"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect width="${W}" height="${bandH}" fill="url(#band)"/>
  <rect width="${W}" height="${bandH}" fill="url(#sheen)"/>

  <text x="32" y="${brandY}" font-family="${FONT}" font-size="${brandSize}" font-weight="700" fill="#ffffff" letter-spacing="0.5">${esc(pack.brand)}</text>
  <text x="32" y="${brandY + 36}" font-family="${FONT}" font-size="21" font-weight="600" fill="#ffffff" opacity="0.92">${esc(pack.sub)}</text>
  <rect x="32" y="${brandY + 52}" width="128" height="4" fill="${pack.accent}"/>

  <text x="32" y="${bandH + 52}" font-family="${FONT}" font-size="17" fill="#111827">${esc(pack.line)}</text>
  <text x="32" y="${bandH + 80}" font-family="${FONT}" font-size="15" fill="#4b5563">${esc(pack.count)}</text>
  <text x="32" y="${bandH + 108}" font-family="${FONT}" font-size="14" fill="#4b5563">Manufactured by ${esc(pack.maker)}</text>

  <rect x="32" y="${bandH + 132}" width="536" height="1" fill="#d1d5db"/>

  <text x="32" y="${bandH + 168}" font-family="${FONT}" font-size="13" fill="#6b7280" letter-spacing="1.2">BATCH</text>
  <text x="32" y="${bandH + 192}" font-family="${FONT}" font-size="20" font-weight="600" fill="#111827" letter-spacing="0.6">${esc(pack.code)}</text>
  <text x="320" y="${bandH + 168}" font-family="${FONT}" font-size="13" fill="#6b7280" letter-spacing="1.2">EXPIRY</text>
  <text x="320" y="${bandH + 192}" font-family="${FONT}" font-size="20" font-weight="600" fill="#111827">${esc(pack.expiry)}</text>

  <g transform="translate(32,${bandH + 250})">
    <rect x="-8" y="-8" width="446" height="96" fill="#ffffff" stroke="#e5e7eb"/>
    ${bar}
  </g>
  <text x="32" y="${bandH + 368}" font-family="${FONT}" font-size="15" fill="#374151" letter-spacing="2.2">${esc(pack.code)}</text>

  ${seal}

  <rect x="32" y="${H - 46}" width="536" height="1" fill="#d1d5db"/>
  <text x="32" y="${H - 22}" font-family="${FONT}" font-size="11" fill="#9ca3af">Demo artefact — fictional product, not a real pack.</text>
</svg>`;
}

/** -------------------------------------------------------------- rendering */

/** Add per-pixel noise without needing a second imaging library. */
async function addNoise(buf, amplitude, tintHex) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let seed = 0x2f6e2b1;
  const rnd = () => {
    // Lehmer generator — small constants, plenty for image noise.
    seed = (seed * 1905 + 12345) % 0x10000;
    return seed / 0x10000;
  };

  for (let i = 0; i < data.length; i += 4) {
    const n = (rnd() - 0.5) * amplitude * 2;
    data[i] = clamp8(data[i] + n + (tintHex?.[0] ?? 0));
    data[i + 1] = clamp8(data[i + 1] + n + (tintHex?.[1] ?? 0));
    data[i + 2] = clamp8(data[i + 2] + n + (tintHex?.[2] ?? 0));
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function hexToRgbShift(hex) {
  // Small channel offsets that read as a badly-profiled camera / wrong ink.
  return [parseInt(hex.slice(1, 3), 16) - 128, parseInt(hex.slice(3, 5), 16) - 128, parseInt(hex.slice(5, 7), 16) - 128];
}

/** ------------------------------------------------------------------- main */

async function main() {
  await mkdir(REF_DIR, { recursive: true });
  await mkdir(PACK_DIR, { recursive: true });
  await mkdir(SRC_DIR, { recursive: true });

  for (const pack of PACKS) {
    const svg = await packSvg(pack);
    await writeFile(path.join(SRC_DIR, `${pack.slug}.svg`), svg, "utf8");

    let buf;
    if (pack.variant === "reference") {
      buf = await sharp(Buffer.from(svg), { density: 192 }).resize(600, 820, { fit: "fill" }).png({ compressionLevel: 9 }).toBuffer();
      await writeFile(path.join(REF_DIR, `${pack.slug}.png`), buf);
      // Also expose a scannable copy under the batch code.
      await writeFile(path.join(PACK_DIR, `${pack.code}.png`), buf);
    } else if (pack.variant === "genuine") {
      const clean = await sharp(Buffer.from(svg), { density: 192 }).resize(600, 820, { fit: "fill" }).png().toBuffer();
      buf = await addNoise(clean, 4, [2, 0, -1]);
      await writeFile(path.join(PACK_DIR, `${pack.slug}.png`), buf);
    } else {
      const clean = await sharp(Buffer.from(svg), { density: 192 }).resize(600, 820, { fit: "fill" }).png().toBuffer();
      // Screen-grabbed and re-printed: softer, cooler, and noisy.
      const soft = await sharp(clean).blur(1.4).modulate({ saturation: 0.72, brightness: 1.04 }).png().toBuffer();
      buf = await addNoise(soft, 9, hexToRgbShift(pack.ink));
      await writeFile(path.join(PACK_DIR, `${pack.slug}.png`), buf);
    }

    console.log(`  ${pack.variant.padEnd(11)} ${pack.slug.padEnd(24)} ${pack.code}`);
  }

  // A blank "unknown product" sample for the CAN'T VERIFY path.
  console.log("\nWrote packs to public/packs and sources to assets/packs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
