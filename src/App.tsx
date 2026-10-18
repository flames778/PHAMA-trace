import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ScanRequest } from "./lib/usePharmaTrace";
import { usePharmaTrace, type ScanOutcome } from "./lib/usePharmaTrace";
import { DEMO_PACKS } from "./data/demoPacks";
import { Landing } from "./components/Landing";
import { Select } from "./components/Select";
import { VerdictPanel } from "./components/VerdictPanel";
import { MedicineGuide } from "./components/MedicineGuide";
import { CustodyTimeline } from "./components/CustodyTimeline";

// Code-split by tab: the landing shell plus the instant verdict path stay in
// the initial bundle; everything else loads on first visit. Leaflet alone is
// a six-figure download — it must never block first paint on a mid-range
// phone. Each boundary gets a skeleton fallback, never a blank hole.
const Scanner = lazy(() => import("./components/Scanner").then((m) => ({ default: m.Scanner })));
const ForecastPanel = lazy(() => import("./components/ForecastPanel").then((m) => ({ default: m.ForecastPanel })));
const HotspotMap = lazy(() => import("./components/HotspotMap").then((m) => ({ default: m.HotspotMap })));
const StockLogger = lazy(() => import("./components/StockLogger").then((m) => ({ default: m.StockLogger })));
const AgentPanel = lazy(() => import("./components/AgentPanel").then((m) => ({ default: m.AgentPanel })));
const MyMedicines = lazy(() => import("./components/MyMedicines").then((m) => ({ default: m.MyMedicines })));

function TabFallback({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-3">
      <div className="pt-pulse h-8 w-48 rounded-md bg-clay-500/20" />
      <div className="pt-pulse h-40 rounded-xl border border-line bg-card/60" />
    </div>
  );
}
import { useCountUp } from "./lib/useCountUp";
import { formatStamp } from "./lib/format";
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

    // When the backend can aggregate verdicts for us (Postgres mode, BE-5)
    // trust those cells: they cover every scan row, not just the 500 the
    // client fetched. Otherwise derive the same thing from the scans we hold.
    const gridCells = state.hotspotGrid;
    if (gridCells && gridCells.length > 0) {
      for (const cell of gridCells) {
        if (cell.suspicious === 0) continue;
        const loc = state.locations.find(
          (l) => Math.abs(l.lat - cell.latCell) < 0.035 && Math.abs(l.lng - cell.lngCell) < 0.035,
        );
        if (loc) map.set(loc.id, "critical");
      }
    } else {
      for (const s of state.scans) {
        if (s.verdict !== "suspicious") continue;
        const loc = state.locations.find(
          (l) => Math.abs(l.lat - s.lat) < 0.035 && Math.abs(l.lng - s.lng) < 0.035,
        );
        if (loc) map.set(loc.id, "critical");
      }
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
  }, [state.scans, state.hotspotGrid, state.locations, stockByProduct]);

  const content = (() => {
    if (state.error) {
      return <p className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-200">Failed to load the registry: {state.error}</p>;
    }
    if (!state.ready) {
      return (
        <div className="flex h-64 items-center justify-center text-sm text-clay-500">
          Loading registry…
        </div>
      );
    }

    switch (tab) {
      case "verify":
        return (
          <div className="grid gap-5 lg:grid-cols-12">
            <section className="rounded-xl border border-line bg-card/60 p-4 sm:p-5 lg:col-span-7">
              <h2 className="font-display mb-1 text-[19px] font-bold text-clay-100">Scan a pack</h2>
              <p className="mb-4 text-[12.5px] leading-relaxed text-clay-500">
                Read the batch code from the barcode, then compare the print against the
                manufacturer&apos;s registered artwork. Both are needed. A code alone can be copied.
              </p>
              <Suspense fallback={<TabFallback label="Loading scanner" />}>
                <Scanner busy={state.busy} locationName={state.scanLocation.name} onScan={handleScan} />
              </Suspense>
            </section>

            <div className="space-y-5 lg:col-span-5">
              <div className="rounded-xl border border-terra-400/25 bg-terra-400/5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-clay-100">Play the 30-second demo</p>
                    <p className="text-[12px] leading-snug text-clay-500">
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
                    className="pt-press shrink-0 rounded-lg bg-terra-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-terra-400 disabled:opacity-40"
                  >
                    {demoRunning ? "Running…" : "▶ Play demo"}
                  </button>
                </div>
                {demoStep && (
                  <p role="status" className="mt-2 text-[12px] text-terra-200">{demoStep}</p>
                )}
              </div>

              <div className="rounded-xl border border-line bg-card/60 p-4">
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
                <p className="mt-1.5 text-[11px] text-clay-500">
                  Changing this drives the route-plausibility check: a pack found hundreds of
                  kilometres off its recorded distribution path is flagged.
                </p>
              </div>
            </div>

            {outcome ? (
              <>
                <section className="lg:col-span-7" role="status">
                  <VerdictPanel
                    result={outcome.result}
                    product={outcome.product}
                    visionError={outcome.visionError}
                  />
                </section>
                {outcome.batch && (
                  <section className="rounded-xl border border-line bg-card/60 p-4 lg:col-span-5">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-clay-500">
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
            ) : state.busy ? (
              <section aria-busy="true" aria-label="Scan in progress" className="space-y-4 lg:col-span-7">
                <div className="rounded-xl border border-line bg-card/60 p-4">
                  <div className="pt-pulse h-6 w-40 rounded-md bg-terra-500/20" />
                  <div className="pt-pulse mt-3 h-4 w-3/4 rounded bg-clay-500/20" />
                </div>
                <div className="space-y-2" aria-hidden="true">
                  {[90, 78, 64].map((w) => (
                    <div key={w} className="pt-pulse h-3 rounded bg-clay-500/15" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </section>
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
            <Suspense fallback={<TabFallback label="Loading forecast" />}>
              <ForecastPanel
                movements={state.movements}
                positions={state.positions}
                batches={state.batches}
                products={state.products}
                locations={state.locations}
                today={TODAY}
              />
            </Suspense>
            <div className="border-t border-line pt-6">
              <h2 className="font-display mb-1 text-[19px] font-bold text-clay-100">Log stock</h2>
              <p className="mb-4 text-[12.5px] text-clay-500">
                Receipts and dispensing, written straight into the ledger the forecast reads.
              </p>
              <div className="max-w-3xl">
                <Suspense fallback={<TabFallback label="Loading stock form" />}>
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
                </Suspense>
              </div>
            </div>
          </div>
        );

      case "hotspots":
        return (
          <div className="space-y-5">
            <div>
              <h2 className="font-display mb-1 text-[19px] font-bold text-clay-100">Falsification hotspots</h2>
              <details className="pt-details">
                <summary>How hotspot reporting works</summary>
                <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-clay-500">
                  Every scan is plotted. Suspicious results accumulate into clusters a regulator or
                  NGO can act on. This demo workspace is not connected to NAFDAC. It shows what a
                  shared view would look like.
                </p>
              </details>
            </div>
            <Suspense fallback={<TabFallback label="Loading map" />}>
              <HotspotMap
                locations={state.locations}
                scans={state.scans}
                riskByLocation={riskByLocation}
                selectedScanId={selectedScanId}
                onSelectScan={setSelectedScanId}
              />
            </Suspense>
            <ScanFeed scans={state.scans} selectedId={selectedScanId} onSelect={setSelectedScanId} />
          </div>
        );

      case "registry":
        return (
          <div className="space-y-5">
            <div>
              <h2 className="font-display mb-1 text-[19px] font-bold text-clay-100">Batch registry</h2>
              <p className="text-[12.5px] leading-relaxed text-clay-500">
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
            <details className="pt-details rounded-xl border border-line bg-card/60 px-4 py-3">
              <summary>About this data</summary>
              <p className="mt-2 text-[12px] leading-relaxed text-clay-400">
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
              <h2 className="font-display mb-1 text-[19px] font-bold text-clay-100">My medicines</h2>
              <p className="text-[12.5px] leading-relaxed text-clay-500">
                Every medicine you scan is saved here with a plain-language explanation of what
                it is for and how to take it. Handy for keeping track of everything in the
                household, especially for elderly family members who may not remember.
              </p>
            </div>
            <Suspense fallback={<TabFallback label="Loading cabinet" />}>
              <MyMedicines
                scans={state.scans}
                products={state.products}
                stockByProduct={stockByProduct}
                onViewStock={() => setTab("stock")}
                onScanPack={() => setTab("verify")}
              />
            </Suspense>
          </div>
        );

      case "ai":
        return (
          <div className="max-w-3xl">
            <Suspense fallback={<TabFallback label="Loading assistant" />}>
              <AgentPanel
                result={outcome?.result ?? null}
                product={outcome?.product ?? null}
                batch={outcome?.batch ?? null}
              />
            </Suspense>
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
      <main id="main-content" className="pt-6">
        {state.degraded && (
          <div className="mb-4 rounded-xl border border-ochre-400/25 bg-ochre-400/5 px-4 py-3">
            <p className="text-[12.5px] text-ochre-100/90">
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
    <div className="rounded-xl border border-dashed border-line bg-card/40 px-6 py-14 text-center">
      <p className="font-display text-[17px] font-bold text-clay-200">No scan yet</p>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-clay-500">
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
    classes: "border-sage-400/40 bg-sage-400/10 text-sage-300",
    label: "Supabase",
  },
  server: {
    classes: "border-steel-400/40 bg-steel-400/10 text-steel-300",
    label: "Server",
  },
  local: {
    classes: "border-clay-500/30 bg-clay-500/10 text-clay-400",
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
  const [pill, setPill] = useState({ left: 0, width: 0, top: 0, height: 0, ready: false });
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Follow-indicator: on the desktop a segmented pill slides behind the active
  // tab; on the phone the same measurements drive a 3px underline. Both are
  // transform-only, so neither animates layout. Re-measured on every tab
  // change so font loading or resize cannot strand it, and the strip scrolls
  // the active tab into view on mobile.
  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (!el) return;
    setPill({
      left: el.offsetLeft,
      width: el.offsetWidth,
      top: el.offsetTop,
      height: el.offsetHeight,
      ready: true,
    });
    el.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeTab, tabs, reduceMotion]);
  return (
    <div className="min-h-full">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-terra-500 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <div className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-1.5 text-[11px] text-clay-500">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ochre-400" aria-hidden="true" />
            Demo environment: mock registry, no regulator connection
          </span>
          <span className="ml-auto hidden sm:inline">FMOH · PCN protocol</span>
        </div>
      </div>

      <header className="border-b border-line bg-canvas">
        <h1 className="sr-only">PharmaTrace — medicine verification demo</h1>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <button
            type="button"
            onClick={onHome}
            aria-label="PharmaTrace home"
            className="flex min-w-0 items-center gap-3 rounded-lg text-left"
          >
            <img src="/brand/icon.svg" alt="" className="h-[38px] w-[38px] shrink-0" />
            <span className="min-w-0">
              <span className="font-display block text-[22px] font-bold leading-none tracking-tight text-clay-100">
                PharmaTrace
              </span>
              <span className="mt-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-clay-500">
                Verify · track · predict · report
              </span>
            </span>
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] text-clay-400 md:flex">
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
        <div className="mx-auto max-w-6xl px-5 pb-2">
          <div className="pt-scroll overflow-x-auto">
            <nav aria-label="Primary" className="pt-nav-track">
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
                  className="pt-nav-tab"
                >
                  {label}
                </button>
              ))}
              {/* Desktop segmented pill. Hidden below 640px by CSS, where the
                  underline below takes over. */}
              <span
                aria-hidden="true"
                className="pt-nav-pill"
                style={{
                  transform: `translateX(${pill.left}px)`,
                  width: pill.width,
                  opacity: pill.ready ? 1 : 0,
                }}
              />
              {/* Phone underline. Hidden above 640px by CSS. */}
              <span
                aria-hidden="true"
                className="pt-tab-indicator absolute bottom-[5px] left-0 h-[3px] w-[100px] rounded-full bg-terra-500 max-[639px]:block hidden"
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

      <footer className="mt-8 border-t border-line bg-card/50">
        {/* Row 1 — the close. The name returns at full width rather than
            sitting in a column beside three lists of links, which is what
            made this read as a sitemap instead of an ending. */}
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
          <div className="flex flex-col gap-6 border-b border-line pb-10 md:flex-row md:items-end md:justify-between">
            <div className="max-w-md">
              <p className="font-display text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] font-bold leading-[1.02] tracking-tight">
                <span className="text-clay-100">Pharma</span>
                <span className="text-terra-500">Trace</span>
              </p>
              <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-clay-500">
                Scan a pack, know whether to trust it, and see where shortages
                are forming. This demo runs on a fictional registry. Nothing
                here connects to NAFDAC or to any manufacturer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("verify")}
              className="pt-btn pt-btn-primary shrink-0 self-start md:self-auto"
            >
              Check a pack
            </button>
          </div>
        </div>

        {/* Row 2 — what the app does, and the one thing to do about a fake.
            Reporting a suspected pack is the most useful thing in this footer
            and it used to be the smallest column on the page. */}
        <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-12 md:grid-cols-2">
          <div>
            <h2 className="font-display text-[15px] font-bold text-clay-100">What you can do</h2>
            <ul className="mt-4 space-y-1 text-[13px]">
              {(
                [
                  ["verify", "Check a pack"],
                  ["medicines", "My medicines"],
                  ["stock", "Stock and forecast"],
                  ["hotspots", "Falsification hotspots"],
                  ["registry", "Batch registry"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(id)}
                    className="py-1 text-left text-clay-300 underline-offset-4 transition hover:text-terra-300 hover:underline"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            <h2 className="font-display mt-8 text-[15px] font-bold text-clay-100">Official registries</h2>
            <ul className="mt-4 space-y-1 text-[13px]">
              <li>
                <a
                  className="py-1 text-terra-300 underline-offset-4 transition hover:underline"
                  href="https://greenbook.nafdac.gov.ng"
                  target="_blank"
                  rel="noreferrer"
                >
                  NAFDAC Greenbook Registry
                </a>
              </li>
              <li>
                <a
                  className="py-1 text-terra-300 underline-offset-4 transition hover:underline"
                  href="https://nafdac.gov.ng"
                  target="_blank"
                  rel="noreferrer"
                >
                  NAFDAC
                </a>
              </li>
              <li className="py-1 text-clay-500">Pharmacists Council of Nigeria (reference)</li>
              <li className="py-1 text-clay-500">Federal Ministry of Health (reference)</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] p-6">
            <h2 className="font-display text-[17px] font-bold text-clay-100">Suspect a fake?</h2>
            <ol className="mt-4 space-y-3 text-[13px] leading-relaxed text-clay-300">
              <li>
                <span className="font-semibold text-clay-100">Quarantine it.</span> Take the pack
                off the shelf and do not dispense it.
              </li>
              <li>
                <span className="font-semibold text-clay-100">Note the code.</span> Batch code,
                expiry, and where you bought it.
              </li>
              <li>
                <span className="font-semibold text-clay-100">Report it.</span> Scan it here so
                it lands on the hotspot map, then escalate to{" "}
                <a
                  className="text-terra-300 underline underline-offset-4"
                  href="mailto:sf.alert@nafdac.gov.ng"
                >
                  sf.alert@nafdac.gov.ng
                </a>
              </li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate("verify")}
                className="pt-btn pt-btn-secondary"
              >
                Scan a suspect pack
              </button>
              <button
                type="button"
                onClick={() => onNavigate("hotspots")}
                className="pt-btn pt-btn-secondary"
              >
                Open the hotspot map
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-5 py-5 text-[12px] text-clay-500">
            <span>© 2026 PharmaTrace demo</span>
            <span>Mock registry: all products fictional</span>
            <span className="sm:ml-auto">Decision support, not medical advice</span>
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
    genuine: "text-sage-300 border-sage-400/30 bg-sage-400/5",
    suspicious: "text-rose-300 border-rose-400/40 bg-rose-400/10",
    unverifiable: "text-ochre-200 border-ochre-400/30 bg-ochre-400/5",
  };

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-clay-500">
        Scan feed ({scans.length})
      </h3>
      {scans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-clay-500">
          No scans logged yet. Run one from the Verify tab and it will appear here and on the map.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {scans.slice(0, 40).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:bg-terra-500/10 ${
                  selectedId === s.id ? "bg-terra-500/10" : "hover:bg-terra-500/[0.06]"
                }`}
              >
                <span
                  className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone[s.verdict]}`}
                >
                  {s.verdict === "unverifiable" ? "unknown" : s.verdict}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-clay-200">{s.headline}</span>
                  <span className="font-mono text-[10.5px] text-clay-500">
                    {s.batchCode || "no code"} · {Math.round(s.confidence * 100)}%
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-clay-500">
                  {formatStamp(s.createdAt)}
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
    active: "text-sage-300 border-sage-400/30 bg-sage-400/5",
    recalled: "text-rose-300 border-rose-400/40 bg-rose-400/10",
    expired: "text-ochre-200 border-ochre-400/30 bg-ochre-400/5",
  };

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Batch["status"]>("all");

  const counts = {
    active: batches.filter((b) => b.status === "active").length,
    recalled: batches.filter((b) => b.status === "recalled").length,
    expired: batches.filter((b) => b.status === "expired").length,
  };
  const totalOnShelves = positions.reduce((s, p) => s + p.onHand, 0);

  const q = query.trim().toLowerCase();
  const visible = batches.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (!q) return true;
    const p = prodById.get(b.productId);
    return (
      b.batchCode.toLowerCase().includes(q) ||
      (p?.brandName ?? "").toLowerCase().includes(q) ||
      (p?.manufacturer ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <RegistryStat value={String(batches.length)} label="batches registered" />
        <RegistryStat value={totalOnShelves.toLocaleString()} label="units on shelves" />
        <RegistryStat value={String(counts.recalled)} label="under recall" tone="text-rose-300" />
        <RegistryStat value={String(counts.expired)} label="expired" tone="text-ochre-200" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, product, manufacturer…"
            aria-label="Search the batch registry"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-clay-100 outline-none placeholder:text-clay-500 focus:border-terra-500/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[12px] leading-none text-clay-500 hover:text-rose-300"
            >
              ✕
            </button>
          )}
        </div>
        {(
          [
            ["all", `All (${batches.length})`],
            ["active", `Active (${counts.active})`],
            ["recalled", `Recalled (${counts.recalled})`],
            ["expired", `Expired (${counts.expired})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={statusFilter === key}
            onClick={() => setStatusFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
              statusFilter === key
                ? "border-terra-500/50 bg-terra-500/10 text-terra-300"
                : "border-line text-clay-500 hover:text-clay-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-[12px] text-clay-500" role="status">
        Showing {visible.length} of {batches.length} batches
        {q ? ` matching “${query.trim()}”` : ""}
        {statusFilter !== "all" ? ` with status ${statusFilter}` : ""}.
      </p>

    <div className="pt-scroll overflow-auto rounded-xl border border-line">
      <table className="pt-cards w-full border-collapse text-left text-[12px]">
        <thead className="bg-card">
          <tr className="text-[10.5px] uppercase tracking-[0.12em] text-clay-500">
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
          {visible.map((b) => {
            const p = prodById.get(b.productId);
            return (
              <tr key={b.id} className="transition hover:bg-terra-500/5">
                <td data-label="Batch code" className="px-3 py-2.5 font-mono text-clay-200">{b.batchCode}</td>
                <td data-label="Product" className="px-3 py-2.5 text-clay-300">{p?.brandName ?? b.productId}</td>
                <td data-label="Manufacturer" className="px-3 py-2.5 text-clay-400">{p?.manufacturer ?? "—"}</td>
                <td data-label="Expiry" className="px-3 py-2.5 font-mono text-clay-400">{b.expiresOn}</td>
                <td data-label="Released" className="px-3 py-2.5 text-right font-mono tabular-nums text-clay-400">
                  {b.quantityReleased.toLocaleString()}
                </td>
                <td data-label="On shelves" className="px-3 py-2.5 text-right font-mono tabular-nums text-clay-300">
                  {onHandFor(b.id).toLocaleString()}
                </td>
                <td data-label="Status" className="px-3 py-2.5">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone[b.status]}`}
                  >
                    {b.status}
                  </span>
                  {b.recallReason && (
                    <p className="mt-1 max-w-[22rem] text-[10.5px] leading-snug text-clay-500">
                      {b.recallReason}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {visible.length === 0 && (
        <p className="border-t border-line px-4 py-8 text-center text-[12.5px] text-clay-500">
          No batches match. Clear the search or pick a different status.
        </p>
      )}
    </div>
    </div>
  );
}

function RegistryStat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  const shown = Math.round(useCountUp(Number(value.replace(/,/g, "")) || 0));
  return (
    <div className="rounded-xl border border-line bg-card/60 px-3.5 py-3">
      <div className={`font-display text-2xl font-bold tabular-nums ${tone ?? "text-clay-100"}`}>{shown.toLocaleString()}</div>
      <div className="mt-0.5 text-[11px] text-clay-500">{label}</div>
    </div>
  );
}
