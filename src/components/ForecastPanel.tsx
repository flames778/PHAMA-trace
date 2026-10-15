import { useMemo, useState } from "react";
import type { Batch, Location, Product, StockMovement, StockPosition } from "../types";
import { forecastAll, type ForecastPoint, type ForecastResult } from "../lib/forecast";

const BAND_STYLE: Record<ForecastResult["band"], { label: string; classes: string }> = {
  critical: { label: "CRITICAL", classes: "border-rose-400/50 bg-rose-400/10 text-rose-300" },
  warning: { label: "WARNING", classes: "border-amber-400/50 bg-amber-400/10 text-amber-200" },
  watch: { label: "WATCH", classes: "border-sky-400/40 bg-sky-400/10 text-sky-300" },
  ok: { label: "OK", classes: "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" },
};

export interface ForecastPanelProps {
  movements: StockMovement[];
  positions: StockPosition[];
  batches: Batch[];
  products: Product[];
  locations: Location[];
  today: Date;
}

export function ForecastPanel({
  movements,
  positions,
  batches,
  products,
  locations,
  today,
}: ForecastPanelProps) {
  const results = useMemo(() => {
    const batchById = new Map(batches.map((b) => [b.id, b]));
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
  }, [movements, positions, batches, today]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    results.find((r) => `${r.batchId}|${r.locationId}` === selectedKey) ?? results[0] ?? null;

  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const atRisk = results.filter((r) => r.band === "critical" || r.band === "warning");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {(["critical", "warning", "watch", "ok"] as const).map((band) => {
          const n = results.filter((r) => r.band === band).length;
          const style = BAND_STYLE[band];
          return (
            <div key={band} className={`rounded-xl border px-3.5 py-3 ${style.classes}`}>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-80">
                {style.label}
              </div>
              <div className="font-display mt-1 text-2xl font-bold tabular-nums">{n}</div>
              <div className="text-[11px] opacity-70">shelves</div>
            </div>
          );
        })}
      </div>

      <BandDonut results={results} />

      {atRisk.length > 0 && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3">
          <p className="text-[12.5px] text-amber-100/90">
            <span className="font-semibold">{atRisk.length} shelves</span> will empty before their
            next scheduled delivery at the current rate. Forecast uses Holt smoothing on
            deseasonalised dispensing, with the wet-season malaria peak applied as an explicit
            climatology prior.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="pt-scroll max-h-[430px] overflow-auto">
            <table className="pt-cards w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-ink-soft">
                <tr className="text-[10.5px] uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">Shelf</th>
                  <th className="px-3 py-2.5 font-semibold">Product</th>
                  <th className="px-3 py-2.5 text-right font-semibold">On hand</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Days</th>
                  <th className="px-3 py-2.5 font-semibold">Band</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((r) => {
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
                      className={`cursor-pointer transition ${
                        active ? "bg-teal-500/10" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <td data-label="Shelf" className="px-3 py-2.5">
                        <div className="font-medium text-slate-200">{loc?.name ?? r.locationId}</div>
                        <div className="text-[10.5px] text-slate-500">
                          {loc?.lga} · {loc?.state}
                        </div>
                      </td>
                      <td data-label="Product" className="px-3 py-2.5">
                        <div className="text-slate-300">{product?.brandName ?? "—"}</div>
                        <div className="font-mono text-[10.5px] text-slate-500">{batch?.batchCode}</div>
                      </td>
                      <td data-label="On hand" className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">
                        {r.onHand.toLocaleString()}
                      </td>
                      <td data-label="Days" className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span
                          className={
                            r.band === "critical"
                              ? "font-semibold text-rose-300"
                              : r.band === "warning"
                                ? "text-amber-200"
                                : "text-slate-300"
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

        <div className="space-y-3">
          {selected ? (
            <>
              <div className="rounded-xl border border-line bg-ink-soft/60 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  {locationById.get(selected.locationId)?.name}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-slate-100">
                  {productById.get(selected.productId)?.brandName}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{selected.note}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <Stat label="Daily demand" value={selected.dailyDemand.toFixed(1)} />
                  <Stat label="On hand" value={selected.onHand.toLocaleString()} />
                  <Stat
                    label="Confidence"
                    value={`${Math.round(selected.confidence * 100)}%`}
                  />
                </div>
              </div>
              <Sparkline series={selected.series} band={selected.band} />
              <p className="text-[11px] leading-relaxed text-slate-500">
                The dashed section is the projection. Seasonality is applied from a documented prior
                rather than fitted — 120 days of history cannot identify a 365-day cycle, and saying
                otherwise would be dishonest.
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-line bg-ink-soft/60 px-4 py-8 text-center text-[12.5px] text-slate-500">
              No dispensing history loaded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold text-slate-200">{value}</div>
    </div>
  );
}

/**
 * Band donut: the four shelf counts as one readable figure. Built for older
 * eyes — big numerals, thick segments, high-contrast legend, no thin
 * chartjunk. Pure SVG, no library.
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

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-ink-soft/60 px-5 py-4">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label={`Shelf bands: ${counts.critical} critical, ${counts.warning} warning, ${counts.watch} watch, ${counts.ok} ok`}>
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="17" stroke="currentColor" opacity="0.12" />
        {arcs.map((s) => (
          <circle
            key={s.band}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={SEG[s.band]}
            strokeWidth="17"
            strokeDasharray={`${Math.max(0, s.frac * C - 2)} ${C}`}
            strokeDashoffset={-s.offset * C}
            strokeLinecap="butt"
            transform="rotate(-90 70 70)"
          />
        ))}
        <text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="800" fill="currentColor" className="font-display tabular-nums">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.65">
          shelves
        </text>
      </svg>
      <ul className="min-w-40 flex-1 space-y-1.5">
        {(Object.keys(counts) as ForecastResult["band"][]).map((band) => (
          <li key={band} className="flex items-baseline gap-2.5 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEG[band] }} />
            <span className="font-display text-[17px] font-bold tabular-nums text-slate-100">
              {counts[band]}
            </span>
            <span className="text-slate-500">{BAND_STYLE[band].label.toLowerCase()} shelves</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sparkline({ series, band }: { series: ForecastPoint[]; band: ForecastResult["band"] }) {
  const W = 320;
  const H = 132;
  const pad = { t: 8, r: 6, b: 18, l: 30 };

  const max = Math.max(1, ...series.map((p) => p.demand));
  const n = series.length;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);

  const observed = series.filter((p) => p.observed !== null);
  const projected = series.filter((p) => p.observed === null);
  const splitIndex = observed.length;

  const line = (pts: ForecastPoint[], offset = 0) =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i + offset).toFixed(1)},${y(p.demand).toFixed(1)}`)
      .join(" ");

  const stroke =
    band === "critical" ? "#e11d48" : band === "warning" ? "#d97706" : band === "watch" ? "#6b94b5" : "#567263";

  const areaPath = `${line(series)} L${x(n - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

  return (
    <div className="rounded-xl border border-line bg-ink-soft/60 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Demand history and projection">
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
        <path d={line(observed)} fill="none" stroke={stroke} strokeWidth="2.2" />
        <path
          d={line(projected, splitIndex - 1 >= 0 ? splitIndex - 1 : 0)}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeDasharray="5 4"
          opacity="0.85"
        />
        {splitIndex > 0 && (
          <line
            x1={x(splitIndex - 1)}
            x2={x(splitIndex - 1)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        )}
        <text x={pad.l} y={H - 5} fontSize="10" fill="#8a7058">
          {series[0]?.day.slice(5)}
        </text>
        <text x={W - pad.r} y={H - 5} fontSize="10" fill="#8a7058" textAnchor="end">
          {series[n - 1]?.day.slice(5)}
        </text>
      </svg>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4" style={{ background: stroke }} /> observed
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-[2px] w-4"
            style={{ backgroundImage: `repeating-linear-gradient(90deg, ${stroke} 0 4px, transparent 4px 7px)` }}
          />
          projected
        </span>
      </div>
    </div>
  );
}
