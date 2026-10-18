import { useMemo, useRef, useState } from "react";
import type { Batch, Location, Product, StockMovement, StockPosition } from "../types";
import { forecastAll, type ForecastPoint, type ForecastResult } from "../lib/forecast";
import { useCountUp, useProgress } from "../lib/useCountUp";

const BAND_STYLE: Record<ForecastResult["band"], { label: string; classes: string }> = {
  critical: { label: "CRITICAL", classes: "border-rose-400/50 bg-rose-400/10 text-rose-300" },
  warning: { label: "WARNING", classes: "border-ochre-400/50 bg-ochre-400/10 text-ochre-200" },
  watch: { label: "WATCH", classes: "border-steel-400/40 bg-steel-400/10 text-steel-300" },
  ok: { label: "OK", classes: "border-sage-400/30 bg-sage-400/5 text-sage-300" },
};

export interface ForecastPanelProps {
  movements: StockMovement[];
  positions: StockPosition[];
  batches: Batch[];
  products: Product[];
  locations: Location[];
  today: Date;
}

type SortKey = "shelf" | "product" | "onhand" | "days" | "band";
type SortState = { key: SortKey; dir: 1 | -1 } | null;

const BAND_ORDER: Record<ForecastResult["band"], number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  ok: 3,
};

const SORT_LABEL: Record<SortKey, string> = {
  shelf: "Shelf",
  product: "Product",
  onhand: "On hand",
  days: "Days",
  band: "Band",
};

export function ForecastPanel({
  movements,
  positions,
  batches,
  products,
  locations,
  today,
}: ForecastPanelProps) {
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const results = useMemo(() => {
    const byPair = new Map<string, StockMovement[]>();
    for (const m of movements) {
      const key = `${m.batchId}|${m.locationId}`;
      const list = byPair.get(key) ?? [];
      list.push(m);
      byPair.set(key, list);
    }
    const inputs = [...byPair.entries()].map(([key, moves]) => {
      const [batchId, locationId] = key.split("|");
      const batch = batchById.get(batchId);
      return {
        batchId,
        locationId,
        productId: batch?.productId ?? "",
        movements: moves,
        position: positions.find((p) => p.batchId === batchId && p.locationId === locationId),
        today,
      };
    });
    return forecastAll(inputs);
  }, [movements, positions, batches, today, batchById]);

  const [sort, setSort] = useState<SortState>(null);
  const flipSort = (key: SortKey) =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const visible = useMemo(() => {
    if (!sort) return results;
    const val = (r: ForecastResult): string | number => {
      switch (sort.key) {
        case "shelf":
          return locationById.get(r.locationId)?.name ?? r.locationId;
        case "product":
          return productById.get(r.productId)?.brandName ?? "";
        case "onhand":
          return r.onHand;
        case "days":
          return r.daysToStockout ?? Number.POSITIVE_INFINITY;
        case "band":
          return BAND_ORDER[r.band];
      }
    };
    return [...results].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      // Stockouts unknown (null days) always sink to the bottom.
      if (sort.key === "days") {
        if (a.daysToStockout === null && b.daysToStockout === null) return 0;
        if (a.daysToStockout === null) return 1;
        if (b.daysToStockout === null) return -1;
      }
      const cmp =
        typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return cmp * sort.dir;
    });
  }, [results, sort, locationById, productById]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    results.find((r) => `${r.batchId}|${r.locationId}` === selectedKey) ?? results[0] ?? null;

  const atRisk = results.filter((r) => r.band === "critical" || r.band === "warning");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {(["critical", "warning", "watch", "ok"] as const).map((band) => (
          <BandCard
            key={band}
            band={band}
            n={results.filter((r) => r.band === band).length}
          />
        ))}
      </div>

      <BandDonut results={results} />

      {atRisk.length > 0 && (
        <div className="rounded-xl border border-ochre-400/25 bg-ochre-400/5 px-4 py-3">
          <p className="text-[12.5px] text-ochre-100/90">
            <span className="font-semibold">{atRisk.length} shelves</span> will empty before their
            next scheduled delivery at the current rate. Forecast uses Holt smoothing on
            deseasonalised dispensing, with the wet-season malaria peak applied as an explicit
            climatology prior.
          </p>
        </div>
      )}

      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="pt-scroll max-h-[430px] overflow-auto">
            <table className="pt-cards w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="text-[10.5px] uppercase tracking-[0.12em] text-clay-500">
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => {
                    const active = sort?.key === k;
                    const arrow = !active ? "↕" : sort.dir === 1 ? "↑" : "↓";
                    return (
                      <th
                        key={k}
                        scope="col"
                        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                        className={`px-3 py-2.5 font-semibold ${k === "onhand" || k === "days" ? "text-right" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => flipSort(k)}
                          title={`Sort by ${SORT_LABEL[k]} ${active && sort.dir === 1 ? "descending" : "ascending"}`}
                          className={`inline-flex items-center gap-1 rounded transition hover:text-clay-200 ${active ? "text-terra-300" : ""}`}
                        >
                          {SORT_LABEL[k]}
                          <span aria-hidden="true" className="text-[9px] opacity-70">{arrow}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((r) => {
                  const loc = locationById.get(r.locationId);
                  const product = productById.get(r.productId);
                  const batch = batchById.get(r.batchId);
                  const key = `${r.batchId}|${r.locationId}`;
                  const active = selected?.batchId === r.batchId && selected?.locationId === r.locationId;
                  return (
                    <tr
                      key={key}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => setSelectedKey(key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedKey(key);
                        }
                      }}
                      className={`cursor-pointer transition active:bg-terra-500/15 ${
                        active ? "bg-terra-500/10" : "hover:bg-terra-500/[0.06]"
                      }`}
                    >
                      <td data-label="Shelf" className="px-3 py-2.5">
                        <div className="font-medium text-clay-200">{loc?.name ?? r.locationId}</div>
                        <div className="text-[10.5px] text-clay-500">
                          {loc?.lga} · {loc?.state}
                        </div>
                      </td>
                      <td data-label="Product" className="px-3 py-2.5">
                        <div className="text-clay-300">{product?.brandName ?? "—"}</div>
                        <div className="font-mono text-[10.5px] text-clay-500">{batch?.batchCode}</div>
                      </td>
                      <td data-label="On hand" className="px-3 py-2.5 text-right font-mono tabular-nums text-clay-300">
                        {r.onHand.toLocaleString()}
                      </td>
                      <td data-label="Days" className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span
                          className={
                            r.band === "critical"
                              ? "font-semibold text-rose-300"
                              : r.band === "warning"
                                ? "text-ochre-200"
                                : "text-clay-300"
                          }
                        >
                          {r.daysToStockout === null ? "∞" : r.daysToStockout.toFixed(1)}
                        </span>
                      </td>
                      <td data-label="Band" className="px-3 py-2.5">
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${BAND_STYLE[r.band].classes}`}
                        >
                          {BAND_STYLE[r.band].label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {selected ? (
            <>
              <div className="pt-card p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-clay-500">
                    {locationById.get(selected.locationId)?.name}
                  </div>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${BAND_STYLE[selected.band].classes}`}
                  >
                    {BAND_STYLE[selected.band].label}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-clay-500">
                    {selected.daysToStockout === null
                      ? "no stockout in view"
                      : `${selected.daysToStockout.toFixed(1)} days of cover`}
                  </span>
                </div>
                <div className="font-display mt-1 text-[22px] font-bold text-clay-100">
                  {productById.get(selected.productId)?.brandName}
                </div>
                <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-clay-400">{selected.note}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                  <Stat
                    label="Daily demand"
                    value={selected.dailyDemand.toFixed(1)}
                    tone="neutral"
                    detail="Average projected sales per day over the next week, after removing the weekday rhythm and the wet-season peak."
                  />
                  <Stat
                    label="On hand"
                    value={selected.onHand.toLocaleString()}
                    tone={selected.onHand <= 0 ? "bad" : selected.band === "critical" || selected.band === "warning" ? "warn" : "good"}
                    detail="Units physically on this shelf today. A delivery only helps if it can land before the shelf empties."
                  />
                  <Stat
                    label="Confidence"
                    value={`${Math.round(selected.confidence * 100)}%`}
                    tone="neutral"
                    detail="How stable the projection is. Smoothed demand with a documented seasonal prior; wide swings lower it."
                  />
                </div>
              </div>
              <Sparkline
                series={selected.series}
                band={selected.band}
                onHand={selected.onHand}
              />
              <p className="text-[11px] leading-relaxed text-clay-500">
                The dashed section is the projection. Seasonality is applied from a documented prior
                rather than fitted. 120 days of history cannot identify a 365-day cycle, and saying
                otherwise would be dishonest.
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-line bg-card/60 px-4 py-8 text-center text-[12.5px] text-clay-500">
              No dispensing history loaded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type StatTone = "neutral" | "good" | "warn" | "bad";

const STAT_TONE: Record<StatTone, string> = {
  neutral: "bg-terra-500/[0.07]",
  good: "bg-sage-400/10 ring-1 ring-inset ring-sage-400/30",
  warn: "bg-ochre-400/10 ring-1 ring-inset ring-ochre-400/30",
  bad: "bg-rose-400/10 ring-1 ring-inset ring-rose-400/40",
};

function BandCard({ band, n }: { band: ForecastResult["band"]; n: number }) {
  const style = BAND_STYLE[band];
  const shown = Math.round(useCountUp(n));
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${style.classes}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-80">
        {style.label}
      </div>
      <div className="font-display mt-1 text-2xl font-bold tabular-nums">{shown}</div>
      <div className="text-[11px] opacity-70">shelves</div>
    </div>
  );
}

function Stat({ label, value, tone, detail }: { label: string; value: string; tone: StatTone; detail: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      title="Tap for an explanation"
      className={`rounded-lg px-2.5 py-2 text-left transition ${STAT_TONE[tone]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-clay-500">{label}</span>
        <span aria-hidden="true" className={`text-[10px] text-clay-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-clay-200">{value}</div>
      {open && <div className="mt-1 text-[11px] font-sans font-normal leading-snug text-clay-400">{detail}</div>}
    </button>
  );
}

/**
 * Band donut: the four shelf counts as one readable figure. Built for older
 * eyes — big numerals, thick segments, high-contrast legend, no thin
 * chartjunk. Pure SVG, no library.
 */
/**
 * Band donut: the four shelf counts as one readable figure. Fills in on
 * mount (skipped under reduced motion); hovering or keyboard-focusing a
 * legend pill spotlights its segment and swaps the center readout.
 * Pure SVG, no library.
 */
function BandDonut({ results }: { results: ForecastResult[] }) {
  const counts = {
    critical: 0,
    warning: 0,
    watch: 0,
    ok: 0,
  } as Record<ForecastResult["band"], number>;
  for (const r of results) counts[r.band]++;
  const total = results.length;

  const [active, setActive] = useState<ForecastResult["band"] | null>(null);
  const t = useProgress(900);

  if (total === 0) return null;

  const SEG: Record<ForecastResult["band"], string> = {
    critical: "#e11d48",
    warning: "#d97706",
    watch: "#6b94b5",
    ok: "#567263",
  };
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = (Object.keys(counts) as ForecastResult["band"][])
    .map((band) => {
      const frac = counts[band] / total;
      const seg = { band, frac, offset: acc };
      acc += frac;
      return seg;
    })
    .filter((s) => s.frac > 0);

  const centerTop = active ? String(counts[active]) : String(Math.round(total * t));
  const centerSub = active ? BAND_STYLE[active].label.toLowerCase() : "shelves";

  return (
    <div className="pt-card flex flex-wrap items-center gap-5 px-5 py-4">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label={`Shelf bands: ${counts.critical} critical, ${counts.warning} warning, ${counts.watch} watch, ${counts.ok} ok`}>
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="17" stroke="currentColor" opacity="0.12" />
        {arcs.map((s) => {
          const dimmed = active !== null && active !== s.band;
          return (
            <circle
              key={s.band}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={SEG[s.band]}
              strokeWidth={active === s.band ? 22 : 17}
              strokeDasharray={`${Math.max(0, s.frac * C * t - 2)} ${C}`}
              strokeDashoffset={-s.offset * C}
              strokeLinecap="butt"
              opacity={dimmed ? 0.35 : 1}
              style={{ transition: "opacity 160ms ease-out" }}
              transform="rotate(-90 70 70)"
            />
          );
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="800" fill="currentColor" className="font-display tabular-nums">
          {centerTop}
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.65">
          {centerSub}
        </text>
      </svg>
      <ul className="min-w-40 flex-1 space-y-1.5">
        {(Object.keys(counts) as ForecastResult["band"][]).map((band) => {
          const isActive = active === band;
          const pct = Math.round((counts[band] / total) * 100);
          return (
            <li key={band}>
              <button
                type="button"
                onMouseEnter={() => setActive(band)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(band)}
                onBlur={() => setActive(null)}
                aria-label={`${counts[band]} ${BAND_STYLE[band].label.toLowerCase()} shelves, ${pct} percent. Spotlight segment.`}
                className={`flex w-full items-center gap-2.5 rounded-full border px-3 py-1.5 text-left transition ${
                  isActive ? BAND_STYLE[band].classes : "border-transparent"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEG[band] }} />
                <span className="font-display text-[17px] font-bold tabular-nums text-clay-100">
                  {counts[band]}
                </span>
                <span className="text-[12.5px] text-clay-500">{BAND_STYLE[band].label.toLowerCase()} shelves</span>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-clay-500">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sparkline({ series, band, onHand }: { series: ForecastPoint[]; band: ForecastResult["band"]; onHand: number }) {
  const W = 320;
  const H = 150;
  const pad = { t: 10, r: 8, b: 20, l: 32 };

  const [hover, setHover] = useState<number | null>(null);
  const [showObserved, setShowObserved] = useState(true);
  const [showProjected, setShowProjected] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  const max = Math.max(1, ...series.map((p) => p.demand));
  const n = series.length;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);

  const observed = series.filter((p) => p.observed !== null);
  const projected = series.filter((p) => p.observed === null);
  const splitIndex = observed.length;

  // First projected day whose cumulative demand exhausts the shelf.
  let stockoutIdx: number | null = null;
  {
    let cum = 0;
    for (let j = 0; j < projected.length; j++) {
      cum += projected[j].demand;
      if (cum > onHand) {
        stockoutIdx = splitIndex - 1 + j;
        break;
      }
    }
  }

  const line = (pts: ForecastPoint[], offset = 0) =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i + offset).toFixed(1)},${y(p.demand).toFixed(1)}`)
      .join(" ");

  const stroke =
    band === "critical" ? "#e11d48" : band === "warning" ? "#d97706" : band === "watch" ? "#6b94b5" : "#567263";

  const areaPath = `${line(series)} L${x(n - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

  const indexFromClientX = (clientX: number): number | null => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const vx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((vx - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  const hovered = hover !== null ? series[hover] : null;
  const hoverPct = hover !== null ? (x(hover) / W) * 100 : 0;

  return (
    <div className="pt-card p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-auto text-[11px] font-semibold uppercase tracking-[0.14em] text-clay-500">
          Demand history and projection
        </span>
        {(
          [
            ["observed", showObserved, setShowObserved],
            ["projected", showProjected, setShowProjected],
          ] as const
        ).map(([label, on, set]) => (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => set(!on)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              on
                ? "border-terra-500/50 bg-terra-500/10 text-terra-300"
                : "border-line text-clay-500 hover:text-clay-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        ref={wrapRef}
        className="relative"
        tabIndex={0}
        role="img"
        aria-label={`Demand history and projection. ${hovered ? `Inspecting ${hovered.day}: ${hovered.demand} units, ${hovered.observed !== null ? "observed" : "projected"}.` : "Use left and right arrows to inspect each day."}${stockoutIdx !== null ? ` Projected stockout around ${series[stockoutIdx].day}.` : ""}`}
        onPointerMove={(e) => setHover(indexFromClientX(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            setHover((h) => {
              const base = h ?? (e.key === "ArrowRight" ? -1 : n);
              return Math.max(0, Math.min(n - 1, base + (e.key === "ArrowRight" ? 1 : -1)));
            });
          } else if (e.key === "Escape") {
            setHover(null);
          }
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          <path d={areaPath} fill={stroke} opacity="0.12" />
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(max * f)}
                y2={y(max * f)}
                stroke="#d7d1c5"
                strokeWidth="1"
              />
              <text x={2} y={y(max * f) + 3} fontSize="10" fill="#8a7058">
                {Math.round(max * f)}
              </text>
            </g>
          ))}
          {showObserved && (
            <path d={line(observed)} fill="none" stroke={stroke} strokeWidth="2.2" />
          )}
          {showProjected && (
            <path
              d={line(projected, splitIndex - 1 >= 0 ? splitIndex - 1 : 0)}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeDasharray="5 4"
              opacity="0.85"
            />
          )}
          {stockoutIdx !== null && (
            <g>
              <line
                x1={x(stockoutIdx)}
                x2={x(stockoutIdx)}
                y1={pad.t}
                y2={H - pad.b}
                stroke="#e11d48"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              <circle cx={x(stockoutIdx)} cy={y(series[stockoutIdx].demand)} r="3.5" fill="#e11d48" />
            </g>
          )}
          {hover !== null && hovered && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.t}
                y2={H - pad.b}
                stroke="#943414"
                strokeWidth="1"
                opacity="0.6"
              />
              <circle cx={x(hover)} cy={y(hovered.demand)} r="4" fill="#fff8f6" stroke={stroke} strokeWidth="2" />
            </g>
          )}
          <text x={pad.l} y={H - 5} fontSize="10" fill="#8a7058">
            {series[0]?.day.slice(5)}
          </text>
          <text x={W - pad.r} y={H - 5} fontSize="10" fill="#8a7058" textAnchor="end">
            {series[n - 1]?.day.slice(5)}
          </text>
        </svg>
        {hovered && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-center shadow-[0_8px_24px_rgb(41_37_36/0.16)]"
            style={{ left: `${Math.min(88, Math.max(12, hoverPct))}%` }}
          >
            <div className="font-mono text-[11px] font-semibold text-clay-200">{hovered.day.slice(5)}</div>
            <div className="font-mono text-[12px] tabular-nums text-clay-100">
              {hovered.demand} <span className="text-clay-500">units</span>
            </div>
            <div
              className={`mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${hovered.observed !== null ? "text-clay-500" : "text-terra-300"}`}
            >
              {hovered.observed !== null ? "observed" : "projected"}
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-clay-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2.5px] w-5 rounded-full" style={{ background: stroke }} /> observed
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-[2.5px] w-5"
            style={{ backgroundImage: `repeating-linear-gradient(90deg, ${stroke} 0 5px, transparent 5px 9px)` }}
          />
          projected
        </span>
        {stockoutIdx !== null && (
          <span className="flex items-center gap-1.5 text-rose-300">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
            stockout ≈ {series[stockoutIdx].day.slice(5)}
          </span>
        )}
      </div>
    </div>
  );
}
