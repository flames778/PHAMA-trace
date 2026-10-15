import {
  nextDose,
  normalizeEntry,
  sanitizeSchedule,
  groupByMember,
  type CabinetEntry,
} from "../src/lib/cabinet.ts";

/**
 * ME-1 checks: the medicine-cabinet logic behind "My medicines".
 * Dose schedules, household members, and migration of previously saved
 * entries. Run with: npm run cabinet-check
 */

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const at = (h: number, m: number) => new Date(2026, 9, 14, h, m);

console.log("\nnextDose");
check("picks the later time today", nextDose(["08:00", "20:00"], at(7, 0))?.time === "08:00");
check(
  "labels it today",
  nextDose(["08:00", "20:00"], at(7, 0))?.when === "today",
);
check("dose due right now counts as today", nextDose(["08:00", "20:00"], at(8, 0))?.time === "08:00");
check("wraps to first time tomorrow", nextDose(["08:00", "20:00"], at(21, 0))?.time === "08:00");
check(
  "labels the wrap tomorrow",
  nextDose(["08:00", "20:00"], at(21, 0))?.when === "tomorrow",
);
check("tolerates unsorted input", nextDose(["20:00", "08:00"], at(7, 0))?.time === "08:00");
check("empty schedule has no next dose", nextDose([], at(7, 0)) === null);

console.log("\nsanitizeSchedule");
const s = sanitizeSchedule({ timesPerDay: 9, times: ["20:00", "bogus", "08:00", "08:00"] });
check("clamps times per day to 6", s.timesPerDay <= 6, `${s.timesPerDay}`);
check("drops invalid times", !s.times.includes("bogus") && s.times.length === s.timesPerDay);
check("dedupes and sorts", JSON.stringify(s.times.slice(0, 2)) === JSON.stringify(["08:00", "20:00"]));
const empty = sanitizeSchedule({ timesPerDay: 2, times: [] });
check("no valid times falls back to a single morning dose", empty.timesPerDay === 1 && empty.times.length === 1 && empty.times[0] === "08:00", empty.times.join(","));

console.log("\nnormalizeEntry (migration)");
const legacy = {
  productId: "prd-malafem",
  brandName: "Malafem 20/120",
  genericName: "Artemether + Lumefantrine",
  whatItsFor: "Malaria medicine.",
  howToTake: "2 tablets daily.",
  scannedAt: "2026-10-13T10:00:00Z",
  verdict: "genuine",
};
const migrated = normalizeEntry(legacy);
check("legacy entry migrates", migrated?.productId === "prd-malafem");
check("migration defaults member to unassigned", migrated?.memberId === null);
check("migration defaults schedule to none", migrated?.schedule === null);
check("garbage is rejected", normalizeEntry(null) === null && normalizeEntry({}) === null);
check("entry without product is rejected", normalizeEntry({ brandName: "x" }) === null);
check("migrated entries get a stable id", typeof migrated?.id === "string" && migrated.id.length > 0);

console.log("\ngroupByMember");
const members = [
  { id: "m-grandma", name: "Grandma" },
  { id: "m-me", name: "Me" },
];
const entries: CabinetEntry[] = [
  { ...legacy, id: "e1", scannedAt: "t1", verdict: "genuine", memberId: "m-grandma", schedule: null },
  { ...legacy, id: "e2", scannedAt: "t2", verdict: "genuine", memberId: null, schedule: null },
  { ...legacy, id: "e3", scannedAt: "t3", verdict: "genuine", memberId: "m-gone", schedule: null },
];
const groups = groupByMember(entries, members);
check("known member gets a bucket", groups[0]?.member?.id === "m-grandma" && groups[0].entries.length === 1);
check("unassigned bucket comes last", groups[groups.length - 1]?.member === null);
check(
  "null and unknown members land unassigned",
  groups[groups.length - 1]?.entries.length === 2,
  `${groups[groups.length - 1]?.entries.length}`,
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
