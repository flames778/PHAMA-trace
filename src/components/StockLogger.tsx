import { useEffect, useMemo, useState } from "react";
import type { Batch, Location, Product, StockPosition } from "../types";
import type { StockMovement } from "../types";
import { Select } from "./Select";

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
      <div className="pt-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Pharmacy"
            value={locationId}
            onChange={setLocationId}
            options={pharmacies.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.lga}, ${p.state}`,
            }))}
          />

          <Select
            label="Batch"
            value={batchId}
            onChange={setBatchId}
            options={sellable.map((b) => {
              const prod = productById.get(b.productId);
              return {
                value: b.id,
                label: `${prod?.brandName ?? b.productId} · ${b.batchCode}${b.status === "recalled" ? " (RECALLED)" : ""}`,
              };
            })}
          />

          <Field label="Movement">
            <div className="pt-segment flex w-full">
              {(
                [
                  ["received", "Stock received"],
                  ["dispensed", "Dispensed"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className="pt-segment-item"
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
            <div className="rounded-lg bg-terra-500/[0.07] px-3 py-2 font-mono text-[14px] text-clay-200">
              {(current?.onHand ?? 0).toLocaleString()}
              {product && <span className="ml-2 text-[11px] text-clay-500">{product.brandName}</span>}
            </div>
          </Field>
        </div>

        {batch?.status === "recalled" && (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200">
            This batch is under recall. Receiving more of it should not happen. The movement is
            still logged so the audit trail stays complete.
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || invalid}
          className="pt-btn pt-btn-primary mt-4 w-full px-4 py-2.5 text-sm"
        >
          {saving ? "Recording…" : `Record ${kind === "received" ? "receipt" : "dispensing"}`}
        </button>

        {flash && (
          <p role="status" className={`mt-2 text-[12px] ${flashError ? "text-rose-200" : "text-terra-200"}`}>
            {flashError ? `Could not record: ${flash}` : flash}
          </p>
        )}
      </div>

      <details className="pt-details">
        <summary>Why logging matters</summary>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-clay-500">
          Every movement is appended to the same ledger the forecast reads, so logging a sale today
          changes tomorrow&apos;s stockout estimate. In the Supabase deployment the movement also
          updates <span className="font-mono text-clay-400">stock_positions</span> through a database
          trigger, which keeps the two tables from drifting.
        </p>
      </details>
    </div>
  );
}

const selectCls =
  "pt-input w-full px-3 py-2 text-[13px]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-clay-500">
        {label}
      </span>
      {children}
    </label>
  );
}
