import { useEffect, useMemo, useState } from "react";
import type { Batch, Location, Product, StockPosition } from "../types";
import type { StockMovement } from "../types";

export interface StockLoggerProps {
  batches: Batch[];
  products: Product[];
  locations: Location[];
  positions: StockPosition[];
  defaultLocationId: string;
  onRecord: (m: StockMovement) => Promise<void>;
}

export function StockLogger({
  batches,
  products,
  locations,
  positions,
  defaultLocationId,
  onRecord,
}: StockLoggerProps) {
  const pharmacies = useMemo(() => locations.filter((l) => l.kind === "pharmacy"), [locations]);
  const sellable = useMemo(() => batches.filter((b) => b.status !== "expired"), [batches]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [locationId, setLocationId] = useState(defaultLocationId);
  const [batchId, setBatchId] = useState(sellable[0]?.id ?? "");
  const [kind, setKind] = useState<"received" | "dispensed">("received");
  const [qty, setQty] = useState("50");
  const [day, setDay] = useState("2026-10-13");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashError, setFlashError] = useState(false);

  // The batch list arrives asynchronously (and can change if the registry
  // reloads). Never leave the select pointing at a batch that is gone.
  useEffect(() => {
    if (!sellable.some((b) => b.id === batchId)) setBatchId(sellable[0]?.id ?? "");
  }, [sellable, batchId]);

  const batch = batches.find((b) => b.id === batchId);
  const product = batch ? productById.get(batch.productId) : null;
  const current = positions.find((p) => p.batchId === batchId && p.locationId === locationId);
  const parsed = Number.parseInt(qty, 10);
  const invalid = !Number.isFinite(parsed) || parsed <= 0;

  const submit = async () => {
    if (invalid || !batch) return;
    setSaving(true);
    setFlash(null);
    setFlashError(false);
    try {
      await onRecord({
        batchId,
        locationId,
        day,
        dispensed: kind === "dispensed" ? parsed : 0,
        received: kind === "received" ? parsed : 0,
      });
      setFlash(
        `Logged ${parsed} units ${kind === "received" ? "into" : "out of"} ${
          pharmacies.find((p) => p.id === locationId)?.name ?? "stock"
        }.`,
      );
      setQty(kind === "dispensed" ? "20" : "50");
    } catch (e) {
      setFlashError(true);
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-ink-soft/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pharmacy">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={selectCls}>
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.lga}, {p.state}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Batch">
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={selectCls}>
              {sellable.map((b) => {
                const prod = productById.get(b.productId);
                return (
                  <option key={b.id} value={b.id}>
                    {prod?.brandName ?? b.productId} · {b.batchCode}
                    {b.status === "recalled" ? " (RECALLED)" : ""}
                  </option>
                );
              })}
            </select>
          </Field>

          <Field label="Movement">
            <div className="flex gap-2">
              {(
                [
                  ["received", "Stock received"],
                  ["dispensed", "Dispensed"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                    kind === k
                      ? "bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/40"
                      : "bg-black/25 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Units">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="numeric"
              className={`${selectCls} font-mono`}
            />
          </Field>

          <Field label="Date">
            <input value={day} onChange={(e) => setDay(e.target.value)} type="date" className={selectCls} />
          </Field>

          <Field label="On hand now">
            <div className="rounded-lg bg-black/25 px-3 py-2 font-mono text-[14px] text-slate-200">
              {(current?.onHand ?? 0).toLocaleString()}
              {product && <span className="ml-2 text-[11px] text-slate-500">{product.brandName}</span>}
            </div>
          </Field>
        </div>

        {batch?.status === "recalled" && (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200">
            This batch is under recall. Receiving more of it should not happen — the movement is
            still logged so the audit trail stays complete.
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || invalid}
          className="mt-4 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-teal-950 transition hover:bg-teal-400 disabled:opacity-40"
        >
          {saving ? "Recording…" : `Record ${kind === "received" ? "receipt" : "dispensing"}`}
        </button>

        {flash && (
          <p className={`mt-2 text-[12px] ${flashError ? "text-rose-200" : "text-teal-200"}`}>
            {flashError ? `Could not record: ${flash}` : flash}
          </p>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-slate-500">
        Every movement is appended to the same ledger the forecast reads, so logging a sale today
        changes tomorrow&apos;s stockout estimate. In the Supabase deployment the movement also
        updates <span className="font-mono text-slate-400">stock_positions</span> through a database
        trigger, which keeps the two tables from drifting.
      </p>
    </div>
  );
}

const selectCls =
  "w-full rounded-lg border border-line bg-black/25 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-teal-500/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
