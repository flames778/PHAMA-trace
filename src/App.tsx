import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ScanRequest } from "./lib/usePharmaTrace";
import { usePharmaTrace, type ScanOutcome } from "./lib/usePharmaTrace";
import { Scanner, DEMO_PACKS } from "./components/Scanner";
import { Landing } from "./components/Landing";
import { Select } from "./components/Select";
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
  const [view, setView] = useState<"landing" | "app">("landing");
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
    const map = new Map<string, "critical" | "warning" | "watch" | "ok">();
    for (const s of state.scans) {
      if (s.verdict !== "suspicious") continue;
      const loc = state.locations.find(
        (l) => Math.abs(l.lat - s.lat) < 0.035 && Math.abs(l.lng - s.lng) < 0.035,
      );
      if (loc) map.set(loc.id, "critical");
    }
    // Forecast bands reach the map too, as the prop contract promises:
    // a shelf reading critical/warning paints its pharmacy even with no
    // suspicious scan there yet. Suspicious scans always win ties.
    for (const summary of stockByProduct.values()) {
      for (const shelf of summary.atRisk) {
        if (shelf.band === "critical") map.set(shelf.locationId, "critical");
        else if (shelf.band === "warning" && map.get(shelf.locationId) !== "critical") {
          map.set(shelf.locationId, "warning");
        }
      }
    }
    return map;
  }, [state.scans, state.locations, stockByProduct]);

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
          <div className="grid gap-5 lg:grid-cols-12">
            <section className="rounded-xl border border-line bg-ink-soft/60 p-4 sm:p-5 lg:col-span-7">
              <h2 className="font-display mb-1 text-[19px] font-bold text-slate-100">Scan a pack</h2>
              <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500">
                Read the batch code from the barcode, then compare the print against the
                manufacturer&apos;s registered artwork. Both are needed. A code alone can be copied.
              </p>
              <Scanner busy={state.busy} locationName={state.scanLocation.name} onScan={handleScan} />
            </section>

            <div className="space-y-5 lg:col-span-5">
              <div className="rounded-xl border border-teal-400/25 bg-teal-400/5 px-4 py-3">
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
                    onClick={() => {
                      runDemoFlow().catch(() =>
                        setDemoStep("Demo failed before the second scan. Check the connection and retry."),
                      );
                    }}
                    className="pt-press shrink-0 rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-teal-950 transition hover:bg-teal-400 disabled:opacity-40"
                  >
                    {demoRunning ? "Running…" : "▶ Play demo"}
                  </button>
                </div>
                {demoStep && (
                  <p className="mt-2 text-[12px] text-teal-200">{demoStep}</p>
                )}
              </div>

              <div className="rounded-xl border border-line bg-ink-soft/60 p-4">
                <Select
                  label="Scan location"
                  value={state.scanLocation.id}
                  onChange={state.setScanLocationId}
                  options={state.locations
                    .filter((l) => l.kind === "pharmacy" || l.kind === "regulator")
                    .map((l) => ({
                      value: l.id,
                      label: `${l.name} · ${l.lga}, ${l.state}`,
                    }))}
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Changing this drives the route-plausibility check: a pack found hundreds of
                  kilometres off its recorded distribution path is flagged.
                </p>
              </div>
            </div>

            {outcome ? (
              <>
                <section className="lg:col-span-7">
                  <VerdictPanel
                    result={outcome.result}
                    product={outcome.product}
                    visionError={outcome.visionError}
                  />
                </section>
                {outcome.batch && (
                  <section className="rounded-xl border border-line bg-ink-soft/60 p-4 lg:col-span-5">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Chain of custody: {outcome.batch.batchCode}
                    </h3>
                    <CustodyTimeline
                      events={state.custody}
                      locationById={(id) => state.locations.find((l) => l.id === id) ?? null}
                      chainIntact={chainCheck.ok}
                      brokenAtEventId={chainCheck.brokenAtEventId}
                    />
                  </section>
                )}
                {outcome.product && (
                  <section className="lg:col-span-12">
                    <div className="max-w-4xl">
                      <MedicineGuide product={outcome.product} />
                    </div>
                  </section>
                )}
              </>
            ) : (
              <section className="lg:col-span-12">
                <EmptyVerdict />
              </section>
            )}
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
                  key={state.scanLocation.id}
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
              <details className="pt-details">
                <summary>How hotspot reporting works</summary>
                <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-slate-500">
                  Every scan is plotted. Suspicious results accumulate into clusters a regulator or
                  NGO can act on. This demo workspace is not connected to NAFDAC. It shows what a
                  shared view would look like.
                </p>
              </details>
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
            <details className="pt-details rounded-xl border border-line bg-ink-soft/60 px-4 py-3">
              <summary>About this data</summary>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
                {state.degraded
                  ? "The live backend failed, so these rows are the local fallback copy. Nothing here leaves this browser."
                  : state.mode === "supabase"
                    ? "Live rows from the connected Supabase project, seeded with the demo registry."
                    : "Bundled mock registry. Every brand, manufacturer and serial below is fictional and exists only so this demo runs end to end."}{" "}
                A production deployment would read these same shapes from the NAFDAC
                Greenbook (registered products), GS1 identifiers (code identity) and the
                NAFDAC traceability system (custody events). See report.md for the mapping.
              </p>
            </details>
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
                household, especially for elderly family members who may not remember.
              </p>
            </div>
            <MyMedicines
              scans={state.scans}
              products={state.products}
              stockByProduct={stockByProduct}
              onViewStock={() => setTab("stock")}
              onScanPack={() => setTab("verify")}
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
    <Shell
      mode={state.mode}
      siteName={state.scanLocation.name}
      tabs={TABS}
      activeTab={tab}
      onNavigate={(t) => {
        setView("app");
        setTab(t);
      }}
      onHome={() => setView("landing")}
    >
      <main className="pt-6">
        {state.degraded && (
          <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3">
            <p className="text-[12.5px] text-amber-100/90">
              <span className="font-semibold">Live registry unreachable.</span> Showing the
              bundled demo registry so the demo can continue. Scans and stock entries are
              kept locally until the connection is back.
            </p>
          </div>
        )}
        {view === "landing" ? (
          <Landing
            productCount={state.products.length}
            batchCount={state.batches.length}
            pharmacyCount={state.locations.filter((l) => l.kind === "pharmacy").length}
            onCheckPack={() => {
              setView("app");
              setTab("verify");
            }}
            onMyMedicines={() => {
              setView("app");
              setTab("medicines");
            }}
            onPlayDemo={() => {
              setView("app");
              void runDemoFlow();
            }}
          />
        ) : (
          <div key={tab} className="pt-rise">
            {content}
          </div>
        )}
      </main>
    </Shell>
  );
}

function EmptyVerdict() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-ink-soft/40 px-6 py-14 text-center">
      <p className="font-display text-[17px] font-bold text-slate-200">No scan yet</p>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-slate-500">
        Pick a demo pack above, or press play. Each scan runs barcode decode,
        registry lookup, packaging comparison, and custody verification.
      </p>
    </div>
  );
}

const MODE_BADGE: Record<
  "local" | "server" | "supabase",
  { classes: string; label: string }
> = {
  supabase: {
    classes: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    label: "Supabase",
  },
  server: {
    classes: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
    label: "Server",
  },
  local: {
    classes: "border-slate-500/30 bg-slate-500/10 text-slate-400",
    label: "Local mock registry",
  },
};

function Shell({
  mode,
  siteName,
  tabs,
  activeTab,
  onNavigate,
  onHome,
  children,
}: {
  mode: "local" | "server" | "supabase";
  siteName: string;
  tabs: [Tab, string][];
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
  onHome: () => void;
  children: React.ReactNode;
}) {
  const badge = MODE_BADGE[mode];
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Follow-pill: the indicator slides to the active tab (transform only).
  // Re-measured on every tab change so font loading or resize cannot strand
  // it, and the strip scrolls the active tab into view on mobile.
  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
    el.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeTab, tabs, reduceMotion]);
  return (
    <div className="min-h-full">
      <div className="border-b border-line bg-ink-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-1.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            Demo environment: bundled registry, no regulator connection
          </span>
          <span className="ml-auto hidden sm:inline">FMOH · PCN protocol</span>
        </div>
      </div>

      <header className="border-b border-line bg-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <button
            type="button"
            onClick={onHome}
            aria-label="PharmaTrace home"
            className="flex min-w-0 items-center gap-3 rounded-lg text-left"
          >
            <img src="/brand/icon.svg" alt="" className="h-[38px] w-[38px] shrink-0" />
            <span className="min-w-0">
              <span className="font-display block text-[22px] font-bold leading-none tracking-tight text-slate-100">
                PharmaTrace
              </span>
              <span className="mt-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Verify · track · predict · report
              </span>
            </span>
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-ink-soft px-2.5 py-1 text-[11px] text-slate-400 md:flex">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="12" cy="10" r="2.5" fill="currentColor" />
              </svg>
              {siteName}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${badge.classes}`}
            >
              {badge.label}
            </span>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-1">
          <div className="pt-scroll overflow-x-auto">
            <nav aria-label="Primary" className="relative flex min-w-max gap-7 px-1">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(id, el);
                    else tabRefs.current.delete(id);
                  }}
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={activeTab === id ? "page" : undefined}
                  className={`whitespace-nowrap px-1 py-3 text-[14px] transition ${
                    activeTab === id
                      ? "font-semibold text-teal-300"
                      : "font-medium text-slate-500 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span
                aria-hidden="true"
                className="pt-tab-indicator absolute bottom-[5px] left-0 h-[3px] w-[100px] rounded-full bg-teal-500"
                style={{
                  transform: `translateX(${pill.left}px) scaleX(${pill.width / 100})`,
                  opacity: pill.ready ? 1 : 0,
                }}
              />
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pb-16">{children}</div>

      <footer className="border-t border-line bg-ink-soft/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <button type="button" onClick={onHome} aria-label="PharmaTrace home" className="block">
              <img
                src="/brand/logo.svg"
                alt="PharmaTrace: Community Care and Medicine Verification"
                className="h-auto w-52"
              />
            </button>
            <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
              Scan a pack, know if it is real, and see where shortages are.
              This demo runs on a fictional registry. Nothing here is
              connected to NAFDAC or any manufacturer.
            </p>
          </div>
          <nav aria-label="Regulatory portals">
            <h2 className="font-display text-[15px] font-bold text-slate-100">Regulatory portals</h2>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              <li>
                <a
                  className="text-teal-300 underline-offset-2 hover:underline"
                  href="https://greenbook.nafdac.gov.ng"
                  target="_blank"
                  rel="noreferrer"
                >
                  NAFDAC Greenbook Registry
                </a>
              </li>
              <li>
                <a
                  className="text-teal-300 underline-offset-2 hover:underline"
                  href="https://nafdac.gov.ng"
                  target="_blank"
                  rel="noreferrer"
                >
                  NAFDAC
                </a>
              </li>
              <li className="text-slate-500">Pharmacists Council of Nigeria (reference)</li>
              <li className="text-slate-500">Federal Ministry of Health (reference)</li>
            </ul>
          </nav>
          <nav aria-label="Product">
            <h2 className="font-display text-[15px] font-bold text-slate-100">Product</h2>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("verify")}
                  className="text-teal-300 underline-offset-2 hover:underline"
                >
                  Check a pack
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("medicines")}
                  className="text-teal-300 underline-offset-2 hover:underline"
                >
                  My medicines
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("stock")}
                  className="text-teal-300 underline-offset-2 hover:underline"
                >
                  Stock &amp; forecast
                </button>
              </li>
            </ul>
          </nav>
          <div>
            <h2 className="font-display text-[15px] font-bold text-slate-100">Suspect a fake?</h2>
            <div className="mt-3 space-y-2.5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-3.5">
              <ol className="space-y-1.5 text-[12px] leading-snug text-rose-200">
                <li>
                  <span className="font-semibold">1. Quarantine it.</span> Take the pack off
                  the shelf and do not dispense it.
                </li>
                <li>
                  <span className="font-semibold">2. Note the code.</span> Batch code,
                  expiry, and where you bought it.
                </li>
                <li>
                  <span className="font-semibold">3. Report it.</span> Scan it here so it
                  lands on the hotspot map, then escalate:
                </li>
              </ol>
              <p className="font-mono text-[11px] text-rose-200">
                <a className="underline-offset-2 hover:underline" href="mailto:sf.alert@nafdac.gov.ng">
                  sf.alert@nafdac.gov.ng
                </a>
              </p>
              <button
                type="button"
                onClick={() => onNavigate("hotspots")}
                className="pt-press mt-1 w-full rounded-lg bg-rose-400/15 px-3 py-2 text-[12px] font-semibold text-rose-200 transition hover:bg-rose-400/25"
              >
                Open the hotspot map →
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-5 py-4 text-[11px] text-slate-500">
            <span>© 2026 PharmaTrace demo</span>
            <span>Mock registry: all products fictional</span>
            <span className="ml-auto">Decision support, not medical advice</span>
          </div>
        </div>
      </footer>
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
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-slate-500">
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
                <span className="shrink-0 font-mono text-[10.5px] text-slate-500">
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
    <div className="pt-scroll overflow-auto rounded-xl border border-line">
      <table className="pt-cards w-full border-collapse text-left text-[12px]">
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
              <tr key={b.id} className="transition hover:bg-teal-500/5">
                <td data-label="Batch code" className="px-3 py-2.5 font-mono text-slate-200">{b.batchCode}</td>
                <td data-label="Product" className="px-3 py-2.5 text-slate-300">{p?.brandName ?? b.productId}</td>
                <td data-label="Manufacturer" className="px-3 py-2.5 text-slate-400">{p?.manufacturer ?? "—"}</td>
                <td data-label="Expiry" className="px-3 py-2.5 font-mono text-slate-400">{b.expiresOn}</td>
                <td data-label="Released" className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-400">
                  {b.quantityReleased.toLocaleString()}
                </td>
                <td data-label="On shelves" className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">
                  {onHandFor(b.id).toLocaleString()}
                </td>
                <td data-label="Status" className="px-3 py-2.5">
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
