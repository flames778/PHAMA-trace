import { useEffect, useState } from "react";
import type { Product, ScanResult } from "../types";
import {
  normalizeEntry,
  sanitizeSchedule,
  groupByMember,
  nextDose,
  newMemberId,
  type CabinetEntry,
  type HouseholdMember,
} from "../lib/cabinet";

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

function loadEntries(): CabinetEntry[] {
  const current = loadJSON<unknown[]>(ENTRIES_KEY);
  if (current) {
    return current
      .map(normalizeEntry)
      .filter((e): e is CabinetEntry => e !== null);
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

const TIME_INPUT = "[color-scheme:dark] rounded-md border border-line bg-ink px-2 py-1 text-[12px] text-slate-200 outline-none focus:border-teal-500/60";

export interface MyMedicinesProps {
  scans: ScanResult[];
  products: Product[];
}

export function MyMedicines({ scans, products }: MyMedicinesProps) {
  const [entries, setEntries] = useState<CabinetEntry[]>(loadEntries);
  const [members, setMembers] = useState<HouseholdMember[]>(loadMembers);
  const [newName, setNewName] = useState("");

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
    setMembers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      saveJSON(MEMBERS_KEY, next);
      return next;
    });
    updateEntries(entries.map((e) => (e.memberId === id ? { ...e, memberId: null } : e)));
  };

  const now = new Date();
  const groups = groupByMember(entries, members);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-ink-soft/40 px-6 py-10 text-center">
        <p className="text-[13px] text-slate-400">No medicines tracked yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-slate-600">
          Scan a medicine pack and it will be added here with a plain-language explanation of
          what it is for and how to take it. Add the people in your household, assign each
          medicine to someone, and set dose times so nobody misses one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[12px] text-slate-500">
          {entries.length} medicine{entries.length !== 1 ? "s" : ""} · {members.length} household
          member{members.length !== 1 ? "s" : ""}
        </p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addMember();
          }}
          placeholder="Add a person (e.g. Grandma)"
          className="w-52 rounded-md border border-line bg-ink px-2.5 py-1.5 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-teal-500/60"
        />
        <button
          type="button"
          onClick={addMember}
          className="rounded-md border border-teal-400/30 bg-teal-400/10 px-2.5 py-1.5 text-[12px] font-medium text-teal-300 hover:bg-teal-400/20"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => updateEntries([])}
          className="text-[11px] text-slate-500 underline-offset-2 hover:text-rose-300 hover:underline"
        >
          Clear all
        </button>
      </div>

      {groups.map((group) => (
        <section key={group.member?.id ?? "unassigned"}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[12px] font-semibold text-slate-200">
              {group.member ? group.member.name : "Unassigned"}
            </h3>
            <span className="text-[11px] text-slate-600">
              {group.entries.length} medicine{group.entries.length !== 1 ? "s" : ""}
            </span>
            {group.member && (
              <button
                type="button"
                onClick={() => removeMember(group.member!.id)}
                className="text-[11px] text-slate-600 hover:text-rose-300"
              >
                remove person
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {group.entries.map((entry) => (
              <EntryCard
                key={`${entry.productId}-${entry.scannedAt}`}
                entry={entry}
                members={members}
                now={now}
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
  genuine: "text-emerald-300 border-emerald-400/30 bg-emerald-400/5",
  suspicious: "text-rose-300 border-rose-400/40 bg-rose-400/10",
  unverifiable: "text-amber-200 border-amber-400/30 bg-amber-400/5",
};

const TIME_DEFAULTS = ["08:00", "13:00", "20:00", "09:00", "18:00", "22:00"];

function EntryCard({
  entry,
  members,
  now,
  onChange,
  onRemove,
}: {
  entry: CabinetEntry;
  members: HouseholdMember[];
  now: Date;
  onChange: (next: CabinetEntry) => void;
  onRemove: () => void;
}) {
  const upcoming = entry.schedule ? nextDose(entry.schedule.times, now) : null;

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
    <li className="rounded-xl border border-line bg-ink-soft/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-slate-100">{entry.brandName}</span>
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

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-slate-500">
              Person{" "}
              <select
                value={entry.memberId ?? ""}
                onChange={(e) => onChange({ ...entry, memberId: e.target.value || null })}
                className="ml-1 rounded-md border border-line bg-ink px-1.5 py-1 text-[11.5px] text-slate-200 outline-none focus:border-teal-500/60"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-2 border-t border-line pt-2">
            {entry.schedule ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-medium text-slate-400">
                    Doses ({entry.schedule.timesPerDay}/day):
                  </span>
                  {entry.schedule.times.map((t, i) => (
                    <span key={`${t}-${i}`} className="flex items-center gap-1">
                      <input
                        type="time"
                        value={t}
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
                        className="text-[11px] text-slate-600 hover:text-rose-300"
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
                      className="rounded-md border border-dashed border-line px-2 py-1 text-[11px] text-slate-400 hover:border-teal-500/50 hover:text-teal-300"
                    >
                      + time
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange({ ...entry, schedule: null })}
                    className="ml-auto text-[11px] text-slate-600 hover:text-rose-300"
                  >
                    remove schedule
                  </button>
                </div>
                {upcoming && (
                  <p className="text-[12px] font-medium text-teal-300">
                    Next dose {upcoming.time} {upcoming.when === "today" ? "today" : "tomorrow"}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onChange({ ...entry, schedule: { timesPerDay: 1, times: ["08:00"] } })}
                className="rounded-md border border-dashed border-line px-2 py-1 text-[11px] text-slate-400 hover:border-teal-500/50 hover:text-teal-300"
              >
                + Set dose times
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
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
  );
}
