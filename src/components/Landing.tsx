/**
 * Minimal landing page (decision 2026-10-15): the front door the header
 * wordmark links to. Composition follows the reference Landing Page mockup;
 * every number and claim here is real and labelled — nothing invented.
 */

import { useCountUp } from "../lib/useCountUp";

export interface LandingProps {
  productCount: number;
  batchCount: number;
  pharmacyCount: number;
  onCheckPack: () => void;
  onMyMedicines: () => void;
  onPlayDemo: () => void;
}

const PILLARS: { title: string; body: string }[] = [
  {
    title: "Verify packs",
    body: "Scan the barcode, compare the print to the registered artwork, and check the custody ledger. Genuine, suspicious, or can't verify, with the reasons shown.",
  },
  {
    title: "Track household",
    body: "Every scanned medicine lands in a household cabinet with plain-language dosing, dose times, and refill warnings before the shelf empties.",
  },
  {
    title: "Predict shortages",
    body: "Dispensing history feeds a forecast per shelf, and suspicious scans accumulate into hotspot clusters a regulator can act on.",
  },
];

export function Landing({
  productCount,
  batchCount,
  pharmacyCount,
  onCheckPack,
  onMyMedicines,
  onPlayDemo,
}: LandingProps) {
  return (
    <div className="pt-rise space-y-10 pb-4 pt-6">
      <section className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-terra-300">
          Demo environment · fictional registry
        </p>
        <h2 className="font-display mt-3 text-balance font-bold leading-[1.05] tracking-tight text-clay-100 text-[clamp(2rem,1.5rem+3vw,3rem)]">
          Know your medicine is real.
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-clay-400">
          PharmaTrace checks a drug pack against its batch registry, reads its
          packaging for tampering, and traces where it has been. Then it tells
          you, in plain words, whether to trust it.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onCheckPack}
            className="pt-press rounded-lg bg-terra-500 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-terra-400"
          >
            Check a pack
          </button>
          <button
            type="button"
            onClick={onPlayDemo}
            className="pt-press rounded-lg border border-line bg-paper px-5 py-2.5 text-[14px] font-semibold text-clay-200 transition hover:border-terra-500/50"
          >
            ▶ Play the 30-second demo
          </button>
          <button
            type="button"
            onClick={onMyMedicines}
            className="pt-press rounded-lg px-5 py-2.5 text-[14px] font-semibold text-terra-300 transition hover:bg-terra-500/10"
          >
            My medicines →
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {PILLARS.map((p) => (
          <div
            key={p.title}
            className="rounded-xl border border-line bg-card/60 px-5 py-5 transition hover:border-terra-500/40"
          >
            <h3 className="font-display text-[19px] font-bold text-clay-100">{p.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-clay-400">{p.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-line bg-card/60 px-5 py-5">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <Stat value={String(productCount)} label="medicines in the demo registry" />
          <Stat value={String(batchCount)} label="tracked batches" />
          <Stat value={String(pharmacyCount)} label="pharmacies on the map" />
        </div>
        <p className="mt-3 text-[11.5px] text-clay-500">
          Real counts from the bundled mock registry. Every brand and serial is
          fictional; nothing here connects to NAFDAC or any manufacturer.
        </p>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const shown = Math.round(useCountUp(Number(value.replace(/,/g, "")) || 0));
  return (
    <div>
      <div className="font-display text-3xl font-bold tabular-nums text-clay-100">{shown.toLocaleString()}</div>
      <div className="mt-0.5 text-[12px] text-clay-500">{label}</div>
    </div>
  );
}
