import { useEffect, useState } from "react";
import type { Product, ScanResult } from "../types";
import type { ProductStockSummary } from "../lib/forecast";
import {
  normalizeEntry,
  sanitizeSchedule,
  groupByMember,
  nextDose,
  newMemberId,
  type CabinetEntry,
  type HouseholdMember,
} from "../lib/cabinet";
import { Select } from "./Select";
import { formatStamp } from "../lib/format";

const ENTRIES_KEY = "pharmatrace:cabinet:entries:v1";
const MEMBERS_KEY = "pharmatrace:cabinet:members:v1";
/** Key used before members and schedules existed — read once, then migrate. */
const LEGACY_KEY = "pharmatrace-my-medicines";

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — the demo still works, it just will not persist */
  }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadEntries(): CabinetEntry[] {
  const raw = readRaw(ENTRIES_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeEntry).filter((e): e is CabinetEntry => e !== null);
      }
    } catch {
      // A corrupt blob must never silently wipe the cabinet: quarantine it
      // for inspection and fall through to legacy migration.
      saveJSON(`${ENTRIES_KEY}:corrupt`, raw);
    }
  }
  const legacy = loadJSON<unknown[]>(LEGACY_KEY) ?? [];
  const migrated = legacy
    .map(normalizeEntry)
    .filter((e): e is CabinetEntry => e !== null);
  if (migrated.length > 0) saveJSON(ENTRIES_KEY, migrated);
  return migrated;
}

function loadMembers(): HouseholdMember[] {
  const raw = loadJSON<unknown[]>(MEMBERS_KEY) ?? [];
  return raw
    .filter(
      (m): m is HouseholdMember =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as HouseholdMember).id === "string" &&
        typeof (m as HouseholdMember).name === "string",
    )
    .map((m) => ({ id: m.id, name: m.name }));
}

const TIME_INPUT = "[color-scheme:light] rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-clay-200 outline-none focus:border-terra-500/60";

export interface MyMedicinesProps {
  scans: ScanResult[];
  products: Product[];
  stockByProduct: Map<string, ProductStockSummary>;
  onViewStock?: () => void;
  onScanPack?: () => void;
}

export function MyMedicines({ scans, products, stockByProduct, onViewStock, onScanPack }: MyMedicinesProps) {
  const [entries, setEntries] = useState<CabinetEntry[]>(loadEntries);
  const [members, setMembers] = useState<HouseholdMember[]>(loadMembers);
  const [newName, setNewName] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // Fold new scans in. Functional update so this effect only depends on
  // incoming data, never on the entries it writes.
  useEffect(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    setEntries((prev) => {
      const have = new Set(prev.map((e) => `${e.productId}|${e.scannedAt}`));
      const fresh: CabinetEntry[] = [];
      for (const scan of scans) {
        if (!scan.productId) continue;
        const product = productById.get(scan.productId);
        if (!product) continue;
        if (have.has(`${scan.productId}|${scan.createdAt}`)) continue;
        fresh.push({
          id: newMemberId(),
          productId: product.id,
          brandName: product.brandName,
          genericName: product.genericName,
          whatItsFor: product.whatItsFor,
          howToTake: product.howToTake,
          scannedAt: scan.createdAt,
          verdict: scan.verdict,
          memberId: null,
          schedule: null,
        });
      }
      if (fresh.length === 0) return prev;
      const next = [...fresh, ...prev];
      saveJSON(ENTRIES_KEY, next);
      return next;
    });
  }, [scans, products]);

  const updateEntries = (next: CabinetEntry[]) => {
    setEntries(next);
    saveJSON(ENTRIES_KEY, next);
  };

  const addMember = () => {
    const name = newName.trim();
    if (!name) return;
    const next = [...members, { id: newMemberId(), name }];
    setMembers(next);
    saveJSON(MEMBERS_KEY, next);
    setNewName("");
  };

  const removeMember = (id: string) => {
    // Both updates are functional: a scan folding in on the same tick cannot
    // silently drop either write.
    setMembers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      saveJSON(MEMBERS_KEY, next);
      return next;
    });
    setEntries((prev) => {
      const next = prev.map((e) => (e.memberId === id ? { ...e, memberId: null } : e));
      saveJSON(ENTRIES_KEY, next);
      return next;
    });
  };

  const now = new Date();
  const groups = groupByMember(entries, members);

  // ME-3: personal stockout alerts — one line per tracked product that reads
  // warning or critical anywhere it is stocked.
  const alerts = (() => {
    const seen = new Map<string, { brand: string; summary: ProductStockSummary }>();
    for (const e of entries) {
      const summary = stockByProduct.get(e.productId);
      if (!summary || (summary.worst !== "critical" && summary.worst !== "warning")) continue;
      if (!seen.has(e.productId)) seen.set(e.productId, { brand: e.brandName, summary });
    }
    return [...seen.values()];
  })();
  const anyCritical = alerts.some((a) => a.summary.worst === "critical");

  if (entries.length === 0) {
    return (
      <div className="pt-card px-6 py-12 text-center">
        <p className="font-display text-[17px] font-bold text-clay-100">Your cabinet is empty</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-clay-500">
          Scan a medicine pack and it lands here with a plain-language
          explanation of what it is for and how to take it. Add the people in
          your household, assign each medicine to someone, and set dose times
          so nobody misses one.
        </p>
        {onScanPack && (
          <button
            type="button"
            onClick={onScanPack}
            className="pt-btn pt-btn-primary mt-4 px-4 py-2 text-[13px]"
          >
            Scan your first pack
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div
          className={`rounded-xl border px-4 py-3 ${
            anyCritical
              ? "border-rose-400/40 bg-rose-400/10"
              : "border-ochre-400/25 bg-ochre-400/5"
          }`}
        >
          <p className={`text-[12.5px] ${anyCritical ? "text-rose-200" : "text-ochre-100"}`}>
            <span className="font-semibold">Running low:</span>{" "}
            {alerts
              .map(
                (a) =>
                  `${a.brand} is ${a.summary.worst} in ${a.summary.atRisk.length} place${a.summary.atRisk.length !== 1 ? "s" : ""}`,
              )
              .join(" · ")}
            . Refill before the shelf empties.
          </p>
          {onViewStock && (
            <button
              type="button"
              onClick={onViewStock}
              className={`mt-1.5 text-[12px] font-semibold underline underline-offset-2 hover:no-underline ${
                anyCritical ? "text-rose-200" : "text-ochre-100"
              }`}
            >
              Check stock &amp; forecast →
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[12px] text-clay-500">
          {entries.length} medicine{entries.length !== 1 ? "s" : ""} · {members.length} household
          member{members.length !== 1 ? "s" : ""}
        </p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addMember();
          }}
          placeholder="Add a person, e.g. Grandma…"
          className="pt-input w-52 px-2.5 py-1.5 text-[12px]"
        />
        <button
          type="button"
          onClick={addMember}
          className="rounded-md border border-terra-400/30 bg-terra-400/10 px-2.5 py-1.5 text-[12px] font-medium text-terra-300 hover:bg-terra-400/20"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirmClear) {
              updateEntries([]);
              setConfirmClear(false);
            } else {
              setConfirmClear(true);
            }
          }}
          onBlur={() => setConfirmClear(false)}
          className="text-[11px] text-clay-500 underline-offset-2 hover:text-rose-300 hover:underline"
        >
          {confirmClear ? "Tap again to delete everything" : "Clear all"}
        </button>
      </div>

      {groups.map((group) => (
        <section key={group.member?.id ?? "unassigned"}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[12px] font-semibold text-clay-200">
              {group.member ? group.member.name : "Unassigned"}
            </h3>
            <span className="text-[11px] text-clay-500">
              {group.entries.length} medicine{group.entries.length !== 1 ? "s" : ""}
            </span>
            {group.member && (
              <button
                type="button"
                onClick={() => removeMember(group.member!.id)}
                className="text-[11px] text-clay-500 hover:text-rose-300"
              >
                remove person
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {group.entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                members={members}
                now={now}
                stock={stockByProduct.get(entry.productId)}
                onChange={(next) =>
                  updateEntries(entries.map((e) => (e === entry ? next : e)))
                }
                onRemove={() =>
                  updateEntries(entries.filter((e) => e !== entry))
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const verdictTone: Record<ScanResult["verdict"], string> = {
  genuine: "text-sage-300 border-sage-400/30 bg-sage-400/5",
  suspicious: "text-rose-300 border-rose-400/40 bg-rose-400/10",
  unverifiable: "text-ochre-200 border-ochre-400/30 bg-ochre-400/5",
};

const TIME_DEFAULTS = ["08:00", "13:00", "20:00", "09:00", "18:00", "22:00"];

function EntryCard({
  entry,
  members,
  now,
  stock,
  onChange,
  onRemove,
}: {
  entry: CabinetEntry;
  members: HouseholdMember[];
  now: Date;
  stock?: ProductStockSummary;
  onChange: (next: CabinetEntry) => void;
  onRemove: () => void;
}) {
  const upcoming = entry.schedule ? nextDose(entry.schedule.times, now) : null;
  const lowStock = stock && (stock.worst === "critical" || stock.worst === "warning") ? stock : null;

  const setTimes = (times: string[]) => {
    onChange({ ...entry, schedule: sanitizeSchedule({ timesPerDay: times.length, times }) });
  };

  const addTime = () => {
    const current = entry.schedule?.times ?? [];
    if (current.length >= 6) return;
    const fallback = TIME_DEFAULTS.find((t) => !current.includes(t)) ?? "12:00";
    setTimes([...current, fallback]);
  };

  return (
    <li className="rounded-xl border border-line bg-card/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-clay-100">{entry.brandName}</span>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${verdictTone[entry.verdict]}`}
            >
              {entry.verdict === "unverifiable" ? "unknown" : entry.verdict}
            </span>
            {lowStock && (
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${
                  lowStock.worst === "critical"
                    ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
                    : "border-ochre-400/30 bg-ochre-400/5 text-ochre-200"
                }`}
                title={`${lowStock.atRisk.length} stocked shelf${lowStock.atRisk.length !== 1 ? "s" : ""} at ${lowStock.worst} band`}
              >
                Low stock · {lowStock.worst}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-clay-500">{entry.genericName}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-clay-300">
            <span className="font-medium text-clay-200">What it is for: </span>
            {entry.whatItsFor}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-clay-300">
            <span className="font-medium text-clay-200">How to take: </span>
            {entry.howToTake}
          </p>

          <div className="mt-2.5 max-w-xs">
            <Select
              label="Person"
              value={entry.memberId ?? ""}
              onChange={(v) => onChange({ ...entry, memberId: v || null })}
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>

          <div className="mt-2 border-t border-line pt-2">
            {entry.schedule ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-medium text-clay-400">
                    Doses ({entry.schedule.timesPerDay}/day):
                  </span>
                  {entry.schedule.times.map((t, i) => (
                    <span key={`${t}-${i}`} className="flex items-center gap-1">
                      <input
                        type="time"
                        value={t}
                        aria-label={`Dose ${i + 1} time`}
                        onChange={(e) => {
                          const next = [...entry.schedule!.times];
                          next[i] = e.target.value;
                          setTimes(next);
                        }}
                        className={TIME_INPUT}
                      />
                      <button
                        type="button"
                        onClick={() => setTimes(entry.schedule!.times.filter((_, j) => j !== i))}
                        className="rounded p-1 text-[11px] leading-none text-clay-500 hover:text-rose-300"
                        aria-label={`Remove dose ${t}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {entry.schedule.times.length < 6 && (
                    <button
                      type="button"
                      onClick={addTime}
                      className="rounded-md border border-dashed border-line px-2 py-1 text-[11px] text-clay-400 hover:border-terra-500/50 hover:text-terra-300"
                    >
                      + time
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange({ ...entry, schedule: null })}
                    className="ml-auto text-[11px] text-clay-500 hover:text-rose-300"
                  >
                    remove schedule
                  </button>
                </div>
                {upcoming && (
                  <p className="text-[12px] font-medium text-terra-300">
                    Next dose {upcoming.time} {upcoming.when === "today" ? "today" : "tomorrow"}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onChange({ ...entry, schedule: { timesPerDay: 1, times: ["08:00"] } })}
                className="rounded-md border border-dashed border-line px-2 py-1 text-[11px] text-clay-400 hover:border-terra-500/50 hover:text-terra-300"
              >
                + Set dose times
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-[11px] leading-none text-clay-500 hover:text-rose-300"
          aria-label={`Remove ${entry.brandName}`}
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-[10.5px] text-clay-500">
        Scanned {formatStamp(entry.scannedAt)}
      </p>
    </li>
  );
}
