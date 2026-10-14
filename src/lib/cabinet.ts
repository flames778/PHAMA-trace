import type { ScanResult } from "../types";

/**
 * Medicine cabinet — the logic behind "My medicines" (ME-1).
 *
 * Pure functions only: dose schedules, household members, and migration of
 * entries saved by earlier versions. Storage and rendering live in the
 * component; everything here is covered by `npm run cabinet-check`.
 */

export interface DoseSchedule {
  timesPerDay: number;
  /** Clock times as "HH:MM", sorted, unique. */
  times: string[];
}

export interface HouseholdMember {
  id: string;
  name: string;
}

export interface CabinetEntry {
  productId: string;
  brandName: string;
  genericName: string;
  whatItsFor: string;
  howToTake: string;
  scannedAt: string;
  verdict: ScanResult["verdict"];
  memberId: string | null;
  schedule: DoseSchedule | null;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function sanitizeSchedule(raw: { timesPerDay: number; times: string[] }): DoseSchedule {
  const distinct = [...new Set(raw.times.filter((t) => TIME_RE.test(t)))].sort();
  if (distinct.length === 0) return { timesPerDay: 1, times: ["08:00"] };
  const want = Math.round(raw.timesPerDay) || distinct.length;
  const timesPerDay = Math.min(6, Math.max(1, Math.min(want, distinct.length)));
  return { timesPerDay, times: distinct.slice(0, timesPerDay) };
}

export interface NextDose {
  time: string;
  when: "today" | "tomorrow";
}

/** Next scheduled dose at or after `now`. Null when the schedule is empty. */
export function nextDose(times: string[], now: Date): NextDose | null {
  const sorted = [...new Set(times.filter((t) => TIME_RE.test(t)))].sort();
  if (sorted.length === 0) return null;
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const later = sorted.find((t) => t >= nowHHMM);
  return later ? { time: later, when: "today" } : { time: sorted[0], when: "tomorrow" };
}

/**
 * Accept a stored entry of any age. Legacy entries (saved before members
 * and schedules existed) get nulls; anything without a productId is junk.
 */
export function normalizeEntry(raw: unknown): CabinetEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.productId !== "string" || e.productId.length === 0) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const verdict =
    e.verdict === "genuine" || e.verdict === "suspicious" || e.verdict === "unverifiable"
      ? e.verdict
      : "unverifiable";
  let schedule: DoseSchedule | null = null;
  if (e.schedule && typeof e.schedule === "object") {
    const s = e.schedule as { timesPerDay?: unknown; times?: unknown };
    if (Array.isArray(s.times)) {
      schedule = sanitizeSchedule({
        timesPerDay: typeof s.timesPerDay === "number" ? s.timesPerDay : s.times.length,
        times: s.times.filter((t): t is string => typeof t === "string"),
      });
    }
  }
  return {
    productId: e.productId,
    brandName: str(e.brandName),
    genericName: str(e.genericName),
    whatItsFor: str(e.whatItsFor),
    howToTake: str(e.howToTake),
    scannedAt: str(e.scannedAt),
    verdict,
    memberId: typeof e.memberId === "string" && e.memberId.length > 0 ? e.memberId : null,
    schedule,
  };
}

export interface MemberGroup {
  member: HouseholdMember | null;
  entries: CabinetEntry[];
}

/** Known members first (in member order), then one unassigned bucket when needed. */
export function groupByMember(entries: CabinetEntry[], members: HouseholdMember[]): MemberGroup[] {
  const known = new Map(members.map((m) => [m.id, m]));
  const buckets = new Map<string, CabinetEntry[]>();
  const unassigned: CabinetEntry[] = [];
  for (const entry of entries) {
    if (entry.memberId && known.has(entry.memberId)) {
      const bucket = buckets.get(entry.memberId) ?? [];
      bucket.push(entry);
      buckets.set(entry.memberId, bucket);
    } else {
      unassigned.push(entry);
    }
  }
  const out: MemberGroup[] = members.map((member) => ({ member, entries: buckets.get(member.id) ?? [] }));
  if (unassigned.length > 0) out.push({ member: null, entries: unassigned });
  return out;
}

export function newMemberId(): string {
  return `m-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
