import { useEffect, useState } from "react";
import type { Product, ScanResult } from "../types";

export interface MyMedicineEntry {
  productId: string;
  brandName: string;
  genericName: string;
  whatItsFor: string;
  howToTake: string;
  scannedAt: string;
  verdict: ScanResult["verdict"];
}

const STORAGE_KEY = "pharmatrace-my-medicines";

function loadEntries(): MyMedicineEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: MyMedicineEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export interface MyMedicinesProps {
  scans: ScanResult[];
  products: Product[];
}

export function MyMedicines({ scans, products }: MyMedicinesProps) {
  const [entries, setEntries] = useState<MyMedicineEntry[]>(loadEntries);

  useEffect(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const existing = new Set(entries.map((e) => `${e.productId}|${e.scannedAt}`));
    const newEntries: MyMedicineEntry[] = [];

    for (const scan of scans) {
      if (!scan.productId) continue;
      const product = productById.get(scan.productId);
      if (!product) continue;
      const key = `${scan.productId}|${scan.createdAt}`;
      if (existing.has(key)) continue;
      newEntries.push({
        productId: product.id,
        brandName: product.brandName,
        genericName: product.genericName,
        whatItsFor: product.whatItsFor,
        howToTake: product.howToTake,
        scannedAt: scan.createdAt,
        verdict: scan.verdict,
      });
    }

    if (newEntries.length > 0) {
      const updated = [...newEntries, ...entries];
      setEntries(updated);
      saveEntries(updated);
    }
  }, [scans, products, entries]);

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    setEntries(updated);
    saveEntries(updated);
  };

  const clearAll = () => {
    setEntries([]);
    saveEntries([]);
  };

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-ink-soft/40 px-6 py-10 text-center">
        <p className="text-[13px] text-slate-400">No medicines tracked yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-slate-600">
          Scan a medicine pack and it will be added here with a plain-language explanation of
          what it is for and how to take it. Useful for keeping track of everything in the
          household.
        </p>
      </div>
    );
  }

  const verdictTone: Record<ScanResult["verdict"], string> = {
    genuine: "text-emerald-300 border-emerald-400/30 bg-emerald-400/5",
    suspicious: "text-rose-300 border-rose-400/40 bg-rose-400/10",
    unverifiable: "text-amber-200 border-amber-400/30 bg-amber-400/5",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-500">
          {entries.length} medicine{entries.length !== 1 ? "s" : ""} tracked
        </p>
        <button
          type="button"
          onClick={clearAll}
          className="text-[11px] text-slate-500 underline-offset-2 hover:text-rose-300 hover:underline"
        >
          Clear all
        </button>
      </div>
      <ul className="space-y-2">
        {entries.map((entry, i) => (
          <li
            key={`${entry.productId}-${entry.scannedAt}`}
            className="rounded-xl border border-line bg-ink-soft/60 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-100">
                    {entry.brandName}
                  </span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${verdictTone[entry.verdict]}`}
                  >
                    {entry.verdict === "unverifiable" ? "unknown" : entry.verdict}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{entry.genericName}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">
                  <span className="font-medium text-slate-200">What it is for: </span>
                  {entry.whatItsFor}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-300">
                  <span className="font-medium text-slate-200">How to take: </span>
                  {entry.howToTake}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(i)}
                className="shrink-0 text-[11px] text-slate-600 hover:text-rose-300"
                aria-label={`Remove ${entry.brandName}`}
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-[10.5px] text-slate-600">
              Scanned {entry.scannedAt.replace("T", " ").slice(0, 16)}Z
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
