import { useCallback, useMemo, useState } from "react";
import type { ScanRequest } from "./lib/usePharmaTrace";
import { usePharmaTrace, type ScanOutcome } from "./lib/usePharmaTrace";
import { Scanner, DEMO_PACKS } from "./components/Scanner";
import { VerdictPanel } from "./components/VerdictPanel";
import { CustodyTimeline } from "./components/CustodyTimeline";
import { ForecastPanel } from "./components/ForecastPanel";
import { HotspotMap } from "./components/HotspotMap";
import { StockLogger } from "./components/StockLogger";
import { AgentPanel } from "./components/AgentPanel";
import { MedicineGuide } from "./components/MedicineGuide";
import { MyMedicines } from "./components/MyMedicines";
import { TODAY } from "./data/batches";
import { verifyChain } from "./lib/ledger";
import { summarizeProductStock, type ProductStockSummary } from "./lib/forecast";
import type { Batch, Product, ScanResult, StockPosition } from "./types";

type Tab = "verify" | "stock" | "hotspots" | "registry" | "medicines" | "ai";

const TABS: [Tab, string][] = [
  ["verify", "Verify"],
  ["stock", "Stock & forecast"],
  ["hotspots", "Hotspots"],
  ["registry", "Registry"],
  ["medicines", "My medicines"],
  ["ai", "AI assistant"],
];

export default function App() {
  const state = usePharmaTrace();
  const [tab, setTab] = useState<Tab>("verify");
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState<string | null>(null);

  const handleScan = useCallback(
    async (req: ScanRequest) => {
      const result = await state.runScan(req);
      setOutcome(result);
      setSelectedScanId(result.result.id);
    },
    [state],
  );

  const chainCheck = useMemo(() => verifyChain(state.custody), [state.custody]);

  // ME-4: the stage demo in one click — genuine pack, then counterfeit, then
  // the hotspot map opens on the new alert. handleScan already selects each
  // result, so the second (suspicious) scan is highlighted when we arrive.
  const runDemoFlow = useCallback(async () => {
    if (demoRunning || state.busy) return;
    setDemoRunning(true);
    try {
      const flow = [DEMO_PACKS[0], DEMO_PACKS[1]];
      for (const [i, pack] of flow.entries()) {
        setDemoStep(`Scan ${i + 1} of ${flow.length}: ${pack.label}…`);
        const blob = await (await fetch(pack.src)).blob();
        await handleScan({ code: pack.code, photo: blob, codeSource: "demo" });
      }
      setDemoStep("Opening the hotspot map…");
      setTab("hotspots");
    } finally {
      setDemoRunning(false);
      setDemoStep(null);
    }
  }, [demoRunning, state.busy, handleScan]);

  // ME-3: per-product stock rollup for the personal alerts on My medicines.
  // Same forecasts the Stock tab shows, so the two views can never disagree.
  const stockByProduct = useMemo(() => {
    const map = new Map<string, ProductStockSummary>();
    for (const p of state.products) {
      map.set(
        p.id,
        summarizeProductStock(p.id, state.batches, state.movements, state.positions, TODAY),
      );
    }
    return map;
  }, [state.products, state.batches, state.movements, state.positions]);

  const riskByLocation = useMemo(() => {
    const map = new Map<string, "critical">();
    for (const s of state.scans) {
      if (s.verdict !== "suspicious") continue;
      const loc = state.locations.find(
        (l) => Math.abs(l.lat - s.lat) < 0.035 && Math.abs(l.lng - s.lng) < 0.035,
      );
      if (loc) map.set(loc.id, "critical");
    }
    return map;
  }, [state.scans, state.locations]);

  const content = (() => {
    if (state.error) {
      return <p className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-200">Failed to load the registry: {state.error}</p>;
    }
    if (!state.ready) {
      return (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          Loading registry…
        </div>
      );
    }

    switch (tab) {
      case "verify":
        return (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <section>
              <h2 className="mb-1 text-[15px] font-semibold text-slate-100">Scan a pack</h2>
              <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500">
                Read the batch code from the barcode, then compare the print against the
                manufacturer&apos;s registered artwork. Both are needed — a code alone can be copied.
              </p>
              <div className="mb-4 rounded-xl border border-teal-400/25 bg-teal-400/5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-100">Play the 30-second demo</p>
                    <p className="text-[12px] leading-snug text-slate-500">
                      Scans a genuine pack, then a counterfeit, then opens the hotspot map on the
                      new alert.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={state.busy || demoRunning || !state.ready}
                    onClick={() => void runDemoFlow()}
                    className="shrink-0 rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-teal-950 transition hover:bg-teal-400 disabled:opacity-40"
                  >
                    {demoRunning ? "Running…" : "▶ Play demo"}
                  </button>
                </div>
                {demoStep && (
                  <p className="mt-2 text-[12px] text-teal-200">{demoStep}</p>
                )}
              </div>
              <Scanner busy={state.busy} locationName={state.scanLocation.name} onScan={handleScan} />

              <div className="mt-6">
                <label
                  htmlFor="scan-location"
                  className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Scan location
                </label>
                <select
                  id="scan-location"
                  value={state.scanLocation.id}
                  onChange={(e) => state.setScanLocationId(e.target.value)}
                  className="w-full rounded-lg border border-line bg-ink-soft px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-teal-500/60"
                >
                  {state.locations
                    .filter((l) => l.kind === "pharmacy" || l.kind === "regulator")
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} — {l.lga}, {l.state}
                      </option>
                    ))}
                </select>
                <p className="mt-1.5 text-[11px] text-slate-600">
                  Changing this drives the route-plausibility check: a pack found hundreds of
                  kilometres off its recorded distribution path is flagged.
                </p>
              </div>
            </section>

            <section className="space-y-6">
              {outcome ? (
                <>
                  <VerdictPanel
                    result={outcome.result}
                    product={outcome.product}
                    visionError={outcome.visionError}
                  />
                  {outcome.product && <MedicineGuide product={outcome.product} />}
                  {outcome.batch && (
                    <div>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Chain of custody — {outcome.batch.batchCode}
                      </h3>
                      <CustodyTimeline
                        events={state.custody}
                        locationById={(id) => state.locations.find((l) => l.id === id) ?? null}
                        chainIntact={chainCheck.ok}
                        brokenAtEventId={chainCheck.brokenAtEventId}
                      />
                    </div>
                  )}
                </>
              ) : (
                <EmptyVerdict />
              )}
            </section>
          </div>
        );

      case "stock":
        return (
          <div className="space-y-6">
            <ForecastPanel
              movements={state.movements}
              positions={state.positions}
              batches={state.batches}
              products={state.products}
              locations={state.locations}
              today={TODAY}
            />
            <div className="border-t border-line pt-6">
              <h2 className="mb-1 text-[15px] font-semibold text-slate-100">Log stock</h2>
              <p className="mb-4 text-[12.5px] text-slate-500">
                Receipts and dispensing, written straight into the ledger the forecast reads.
              </p>
              <div className="max-w-3xl">
                <StockLogger
                  batches={state.batches}
                  products={state.products}
                  locations={state.locations}
                  positions={state.positions}
                  defaultLocationId={
                    state.scanLocation.id.startsWith("loc-ph") ? state.scanLocation.id : "loc-ph-ikeja"
                  }
                  onRecord={state.recordMovement}
                />
              </div>
            </div>
          </div>
        );

      case "hotspots":
        return (
          <div className="space-y-5">
            <div>
              <h2 className="mb-1 text-[15px] font-semibold text-slate-100">Falsification hotspots</h2>
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                Every scan is plotted. Suspicious results accumulate into clusters a regulator or
                NGO can act on. This demo workspace is not connected to NAFDAC — it shows what a
                shared view would look like.
              </p>
            </div>
            <HotspotMap
              locations={state.locations}
              scans={state.scans}
              riskByLocation={riskByLocation}
              selectedScanId={selectedScanId}
              onSelectScan={setSelectedScanId}
            />
            <ScanFeed scans={state.scans} selectedId={selectedScanId} onSelect={setSelectedScanId} />
          </div>
        );

      case "registry":
        return (
          <div className="space-y-5">
            <div>
              <h2 className="mb-1 text-[15px] font-semibold text-slate-100">Batch registry</h2>
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                {state.mode === "supabase"
                  ? "Live rows from Supabase."
                  : "Bundled mock registry. Every brand, manufacturer and serial below is fictional and exists only so this demo runs end to end."}
              </p>
            </div>
            <BatchTable
              batches={state.batches}
              products={state.products}
              positions={state.positions}
            />
            <div className="rounded-xl border border-line bg-ink-soft/60 px-4 py-3">
              <h3 className="text-[12px] font-semibold text-slate-200">About this data</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                {state.degraded
                  ? "The live backend failed, so these rows are the local fallback copy. Nothing here leaves this browser."
                  : state.mode === "supabase"
                    ? "Live rows from the connected Supabase project, seeded with the demo registry."
                    : "Bundled mock registry. Every brand, manufacturer and serial below is fictional and exists only so this demo runs end to end."}{" "}
                A production deployment would read these same shapes from the NAFDAC
                Greenbook (registered products), GS1 identifiers (code identity) and the
                NAFDAC traceability system (custody events) — see report.md for the mapping.
              </p>
            </div>
          </div>
        );

      case "medicines":
        return (
          <div className="space-y-5">
            <div>
              <h2 className="mb-1 text-[15px] font-semibold text-slate-100">My medicines</h2>
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                Every medicine you scan is saved here with a plain-language explanation of what
                it is for and how to take it. Handy for keeping track of everything in the
                household — especially for elderly family members who may not remember.
              </p>
            </div>
            <MyMedicines
              scans={state.scans}
              products={state.products}
              stockByProduct={stockByProduct}
              onViewStock={() => setTab("stock")}
            />
          </div>
        );

      case "ai":
        return (
          <div className="max-w-3xl">
            <AgentPanel
              result={outcome?.result ?? null}
              product={outcome?.product ?? null}
              batch={outcome?.batch ?? null}
            />
          </div>
        );
    }
  })();

  return (
    <Shell mode={state.mode}>
      <nav className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`relative px-4 py-2.5 text-[13px] font-medium transition ${
              tab === id ? "text-teal-300" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
            {tab === id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-teal-400" />}
          </button>
        ))}
      </nav>
      <main className="pt-6">
        {state.degraded && (
          <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3">
            <p className="text-[12.5px] text-amber-100/90">
              <span className="font-semibold">Live registry unreachable.</span> Showing the
              bundled demo registry so the demo can continue — scans and stock entries are
              kept locally until the connection is back.
            </p>
          </div>
        )}
        {content}
      </main>
    </Shell>
  );
}

function EmptyVerdict() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-ink-soft/40 px-6 py-14 text-center">
      <p className="text-[13px] text-slate-400">No scan yet</p>
      <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-slate-600">
        Pick one of the demo packs to run the full pipeline — barcode decode, registry lookup,
        packaging comparison and custody verification.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {DEMO_PACKS.map((p) => (
          <span
            key={p.src}
            className="rounded-md border border-line px-2 py-0.5 font-mono text-[10.5px] text-slate-500"
          >
            {p.code}
          </span>
        ))}
      </div>
    </div>
  );
}

function Shell({ mode, children }: { mode: "local" | "supabase"; children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-ink-soft/50">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-cyan-600 text-[13px] font-black text-teal-950">
            PT
          </div>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-slate-50">PharmaTrace</div>
            <div className="text-[11px] text-slate-500">Verify · track · predict · report</div>
          </div>
          <span
            className={`ml-auto rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${
              mode === "supabase"
                ? "border-teal-400/40 bg-teal-400/10 text-teal-300"
                : "border-slate-500/30 bg-slate-500/10 text-slate-400"
            }`}
          >
            {mode === "supabase" ? "Supabase" : "Local mock registry"}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 pb-16">{children}</div>
    </div>
  );
}

function ScanFeed({
  scans,
  selectedId,
  onSelect,
}: {
  scans: ScanResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const tone: Record<ScanResult["verdict"], string> = {
    genuine: "text-emerald-300 border-emerald-400/30 bg-emerald-400/5",
    suspicious: "text-rose-300 border-rose-400/40 bg-rose-400/10",
    unverifiable: "text-amber-200 border-amber-400/30 bg-amber-400/5",
  };

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Scan feed ({scans.length})
      </h3>
      {scans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-slate-600">
          No scans logged yet. Run one from the Verify tab and it will appear here and on the map.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {scans.slice(0, 40).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition ${
                  selectedId === s.id ? "bg-teal-500/10" : "hover:bg-white/[0.03]"
                }`}
              >
                <span
                  className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone[s.verdict]}`}
                >
                  {s.verdict === "unverifiable" ? "unknown" : s.verdict}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-slate-200">{s.headline}</span>
                  <span className="font-mono text-[10.5px] text-slate-500">
                    {s.batchCode || "no code"} · {Math.round(s.confidence * 100)}%
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-slate-600">
                  {s.createdAt.replace("T", " ").slice(11, 16)}Z
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BatchTable({
  batches,
  products,
  positions,
}: {
  batches: Batch[];
  products: Product[];
  positions: StockPosition[];
}) {
  const prodById = new Map(products.map((p) => [p.id, p]));
  const onHandFor = (id: string) =>
    positions.filter((p) => p.batchId === id).reduce((s, p) => s + p.onHand, 0);

  const tone: Record<Batch["status"], string> = {
    active: "text-emerald-300 border-emerald-400/30 bg-emerald-400/5",
    recalled: "text-rose-300 border-rose-400/40 bg-rose-400/10",
    expired: "text-amber-200 border-amber-400/30 bg-amber-400/5",
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead className="bg-ink-soft">
          <tr className="text-[10.5px] uppercase tracking-[0.12em] text-slate-500">
            <th className="px-3 py-2.5 font-semibold">Batch code</th>
            <th className="px-3 py-2.5 font-semibold">Product</th>
            <th className="px-3 py-2.5 font-semibold">Manufacturer</th>
            <th className="px-3 py-2.5 font-semibold">Expiry</th>
            <th className="px-3 py-2.5 text-right font-semibold">Released</th>
            <th className="px-3 py-2.5 text-right font-semibold">On shelves</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {batches.map((b) => {
            const p = prodById.get(b.productId);
            return (
              <tr key={b.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2.5 font-mono text-slate-200">{b.batchCode}</td>
                <td className="px-3 py-2.5 text-slate-300">{p?.brandName ?? b.productId}</td>
                <td className="px-3 py-2.5 text-slate-400">{p?.manufacturer ?? "—"}</td>
                <td className="px-3 py-2.5 font-mono text-slate-400">{b.expiresOn}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-400">
                  {b.quantityReleased.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">
                  {onHandFor(b.id).toLocaleString()}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone[b.status]}`}
                  >
                    {b.status}
                  </span>
                  {b.recallReason && (
                    <p className="mt-1 max-w-[22rem] text-[10.5px] leading-snug text-slate-500">
                      {b.recallReason}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
