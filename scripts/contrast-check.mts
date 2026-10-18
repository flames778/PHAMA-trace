import { readFileSync } from "node:fs";

/**
 * Contrast gate (WCAG 2.2).
 *
 * Reads the real token values out of index.css and asserts the foreground /
 * background pairs the UI actually ships. Tokens are the right place to
 * check: `text-clay-500` appears around eighty times across the app, so a
 * single token that misses 4.5:1 by four hundredths fails the whole product
 * and nothing about looking at the components would reveal it.
 *
 * Two thresholds, both from the spec:
 *   4.5:1 body text (SC 1.4.3)
 *   3:1  non-text: control boundaries and state (SC 1.4.11)
 *
 * Run with: npm run contrast-check
 */

const css = readFileSync("src/index.css", "utf8");

function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
  if (!m) throw new Error(`token --color-${name} not found in src/index.css`);
  return m[1];
}
const hex = (h: string) => {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const channel = (raw: number): number => {
  const c = raw / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (h: string) => {
  const [r, g, b] = hex(h).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Flat blend of two hex colours, matching what color-mix() produces. */
function mix(a: string, b: string, weightA: number): string {
  const A = hex(a);
  const B = hex(b);
  return (
    "#" +
    A.map((v, i) => Math.round(v * weightA + B[i] * (1 - weightA)).toString(16).padStart(2, "0")).join("")
  );
}

const canvas = token("canvas");
const card = token("card");
const paper = token("paper");

let failures = 0;
function check(label: string, fg: string, bg: string, need: number) {
  const r = contrast(fg, bg);
  const ok = r >= need;
  if (!ok) failures++;
  const verdict = ok ? "PASS" : "FAIL";
  const rule = need === 4.5 ? "1.4.3 text" : "1.4.11 non-text";
  console.log(`  ${verdict}  ${label.padEnd(42)} ${r.toFixed(2).padStart(5)}:1  (needs ${need}:1, ${rule})`);
}

console.log("\nContrast — text (4.5:1)");

check("primary label: white on terra-500", "#ffffff", token("terra-500"), 4.5);
check("primary hover: white on hover fill", "#ffffff", "#a8421f", 4.5);
check("primary active: white on terra-300", "#ffffff", token("terra-300"), 4.5);
check("danger label: white on rose-400", "#ffffff", token("rose-400"), 4.5);
check("secondary label: clay-100 on paper", token("clay-100"), paper, 4.5);
check("tertiary label: clay-200 on canvas", token("clay-200"), canvas, 4.5);
check("tonal label: terra-300 on tint", token("terra-300"), mix(token("terra-500"), paper, 0.13), 4.5);
check("segment active: white on terra-500", "#ffffff", token("terra-500"), 4.5);
check("segment idle: clay-300 on track", token("clay-300"), mix(token("clay-500"), canvas, 0.12), 4.5);
check("nav idle: clay-300 on track", token("clay-300"), mix(token("clay-500"), canvas, 0.12), 4.5);
check("body text: clay-500 on canvas", token("clay-500"), canvas, 4.5);
check("body text: clay-500 on card", token("clay-500"), card, 4.5);
check("secondary text: clay-300 on card", token("clay-300"), card, 4.5);
check("input text: clay-100 on paper", token("clay-100"), paper, 4.5);
check("placeholder: clay-500 on paper", token("clay-500"), paper, 4.5);
check("link: terra-300 on canvas", token("terra-300"), canvas, 4.5);
check("link on card: terra-300 on card", token("terra-300"), card, 4.5);
check("sage text: sage-200 on canvas", token("sage-200"), canvas, 4.5);
check("ochre text: ochre-200 on canvas", token("ochre-200"), canvas, 4.5);
check("rose text: rose-200 on canvas", token("rose-200"), canvas, 4.5);

console.log("\nContrast — control boundaries (3:1)");

const edges = [...css.matchAll(/--pt-edge:\s*(#[0-9a-fA-F]{3,6})/g)].map((m) => m[1]);
const edgeLabels = ["primary", "danger", "secondary", "tertiary", "tonal"];
edges.forEach((e, i) => {
  check(`${edgeLabels[i] ?? "edge"} edge on canvas`, e, canvas, 3);
});

console.log(failures === 0 ? "\nAll contrast checks passed.\n" : `\n${failures} contrast check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);