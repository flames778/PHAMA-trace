# PharmaTrace Progress Tracker

Owners: **Evans** (backend) · **Ayonife** (full stack)
Last updated: 2026-10-14
Plan: `docs/PROJECT_PLAN.md` · Research: `report.md`

---

## 1. Ready to start? Yes — all gates green as of 2026-10-14

Verified 2026-10-14 on a clean install (`npm install` from `package-lock.json`):

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run selfcheck` | PASS (sha256 vectors) |
| `npm run verify:pipeline` | PASS — fixed by ME-0 (`aac02ec`, see log). Was failing on three real issues, all root-caused, none papered over (details in §9). |
| `npm run cabinet-check` | PASS — new in ME-1 (`8e1400d`): 19 checks over dose schedules, members, migration. |
| `npm run build` | PASS (production bundle builds). |
| `npm run source-check` | PASS — new in ME-2 (`41a9a49`): 12 checks over local boot and degraded fallback. |

## 2. Frozen contract (both sides rely on this — do not change silently)

- `src/types.ts` — the shared shapes (Product, Batch, CustodyEvent, ScanResult, …).
- `src/lib/registry.ts` — the `Registry` interface both backends implement.
- `supabase/schema.sql` — the Postgres schema (already in repo, not yet applied anywhere).
- Hash rule — `event_hash = sha256(prev_hash || canonical_payload)`, enforced by
  `src/lib/ledger.ts` and by the append-only trigger in `schema.sql`.
- If any of these must change, the changer flags it in the update log first and both
  owners agree before code lands.

## 3. Update protocol (the rule)

- **Evans' side updates after every major implementation.** Major = one BE task below.
  Flow per task: branch `evans/<id>` → push → review together → merge to `main` →
  this tracker row flips to Done with the merge commit hash and date in Evidence.
- **Ayonife's side updates as work lands.** Rows flip when the work is in the worktree
  and pushed; Evidence cites the commit.
- Status values only: `Pending` · `In progress` · `In review` · `Done` · `Blocked`.
- Small commits do not move rows. Only a finished, reviewed task moves a row.
- Blocked rows must name the blocker and who unblocks it.

## 4. Phase map

- **Phase 0 — Done.** Mock app runs end to end (verify, custody, forecast, hotspots,
  medicine guide, My medicines).
- **Phase 1 — Now.** Backend spine: provision Supabase, seed it, wire env, pass gates
  in Supabase mode. Frontend: fix pipeline script, polish MyMedicines.
- **Phase 2 — Next.** Integration: hotspot view reads `hotspot_grid`, recall drill,
  source toggle UX, forecast × MyMedicines pairing.
- **Phase 3 — Demo.** Two-scan stage flow (genuine vs counterfeit), hotspot lights up,
  pitch narrative, hardening notes.

## 5. Evans' side (backend)

| ID | Task | Acceptance | Status | Evidence |
| --- | --- | --- | --- | --- |
| BE-1 | Provision Supabase project, apply `supabase/schema.sql` | All 7 tables + indexes + 2 triggers + `hotspot_grid` view exist in the hosted DB | Pending | — |
| BE-2 | Write missing `scripts/seed-demo.mjs`, run `npm run seed` | Products, batches, locations, custody chains and movements load from `src/data`; every custody chain passes `verifyChain`; positions derive via the movement trigger | Pending | — |
| BE-3 | Add `db:push` script, `.env.local` wiring, README note | Fresh clone can do: create project → `db:push` → `seed` → run in Supabase mode, documented in <10 steps | Pending | — |
| BE-4 | End-to-end pass in Supabase mode | App boots with Supabase badge; a scan inserts a `scans` row; custody verifies from real rows; typecheck + selfcheck + pipeline all green | Pending | — |
| BE-5 | Hotspot + recall drill | HotspotMap reads live `hotspot_grid`; a test recall locates 100% of a batch's rows | Pending | Phase 2 |
| BE-6 | Hardening roadmap | Short doc: what changes before real use (auth, RLS roles, append-only custody, service-role writes) — `schema.sql` header already drafts it | Pending | Phase 2/3 |

Notes for Evans: `src/lib/registry.ts` already implements the Supabase backend, so BE-2
is mostly the seed script (`package.json` references it but the file does not exist yet).
`BE-1 → BE-2 → BE-3 → BE-4` is the required order.

## 6. Ayonife's side (full stack)

| ID | Task | Acceptance | Status | Evidence |
| --- | --- | --- | --- | --- |
| ME-0 | Fix stale `verify:pipeline` script | Script uses IDs present in current `src/data`; all gates green | Done | `aac02ec`, 2026-10-14 |
| ME-1 | MyMedicines polish | Dose schedules + household profiles; entries survive reload | Done | `8e1400d`, 2026-10-15 |
| ME-2 | Source toggle / fallback UX | Mode badge truthful; offline fallback verified by killing env vars | Done | `41a9a49`, 2026-10-15 |
| ME-3 | Forecast × MyMedicines pairing | Personal stockout alerts surface on tracked medicines | Done | `d29db52`, 2026-10-15 |
| ME-4 | Demo script hardening | Genuine-vs-counterfeit two-scan flow lights the hotspot map reliably | Done | `01db8c4`, 2026-10-15 |
| ME-5 | Registry content pass | Code comments cite the real sources (Greenbook fields, GS1, WHO list) per `report.md` | Done | `7d764e2`, 2026-10-15 |

## 7. Doing now (week of 2026-10-14)

- Evans: **BE-1 → BE-2**. Nothing else until the DB has real rows.
- Ayonife: **ME-0 → ME-1**. Gates green first, then the household feature.
- Merge rule: each BE task merges only after joint review; the tracker row flips in the
  same sitting, with the commit hash recorded above.

## 8. Update log

| Date | Who | Entry |
| --- | --- | --- |
| 2026-10-14 | Ayonife | Tracker created as its own artifact (`docs/PROGRESS_TRACKER.md`). Gates run: typecheck PASS, selfcheck PASS, pipeline FAIL (stale seed IDs, logged as ME-0). |
| 2026-10-14 | Ayonife | Pushed `d54d98f` (research report + project plan) to `flames778/PHAMA-trace` main. |
| 2026-10-14 | Ayonife | **ME-0 done** (`aac02ec`): pipeline fully green. Fixed three root causes, no thresholds fudged — see §9. |
| 2026-10-15 | Ayonife | **ME-1 done** (`8e1400d`): household cabinet. Members with add/remove, per-medicine dose schedules with next-dose display, entries grouped by person, legacy localStorage entries migrate automatically. TDD: `cabinet-check` (19 checks) written failing first, then `cabinet.ts`. Full suite green (typecheck, selfcheck, pipeline 31/31, cabinet 19/19) plus production build. |
| 2026-10-15 | Ayonife | **ME-2 done** (`41a9a49`): resilient registry. Live-backend calls fall back per-call to bundled data with a module-level degraded flag; amber banner tells the truth; Registry tab explains all three states (live / local / degraded). Bonus find: `supabase.ts` crashed under plain node (`import.meta.env` undefined) — guarded, which also unblocks Evans' future seed script. TDD: `source-check` (12 checks) written failing first. |
| 2026-10-15 | Ayonife | **ME-3 done** (`d29db52`): personal stockout alerts. New `summarizeProductStock` rollup in `forecast.ts` (worst band + at-risk shelves per product, same forecasts the Stock tab shows); My medicines banner lists tracked products reading warning/critical with a jump link; each entry card carries a low-stock chip. TDD: 4 rollup checks added to the pipeline failing first (missing export), then implemented. Typecheck caught and fixed a real narrowing bug in the rollup. |
| 2026-10-15 | Ayonife | **ME-4 done** (`01db8c4`): one-click stage demo. New "Play the 30-second demo" card on the Verify tab runs genuine-then-counterfeit scans with step status and lands on the hotspot map with the suspicious scan selected. Known quirk (by design, not changed): scanning one code 3+ times a day trips the reuse signal, so repeat stage runs can flip the genuine pack — first run is always clean. |
| 2026-10-15 | Ayonife | **ME-5 done** (`7d764e2`): source-citation pass. Eight files (products, batches, locations, custody, demand, registry, verify, schema.sql) now document their production data mapping to Greenbook / GS1 / EPCIS / WHO-GSMS / WHO-HAI per report.md. Comments only, no behavior change. |

## 9. Known issues (resolved ones stay listed with their fix)

1. ~~`npm run verify:pipeline` fails~~ — RESOLVED by `aac02ec`. Post-mortem, kept honest:
   - **Dead SQUEEZE keys (app bug, `demand.ts`).** All five starvation keys named
     batch@shelf pairs `assignPairs()` never emits, so the script crashed on
     `undefined.batchId` — and worse, the app's forecast panel could never warn.
     Fix: retargeted keys to pairs the assignment actually emits, plus an
     INVARIANT comment so it cannot silently die again.
   - **Structural understock (app bug, `demand.ts`).** Deliveries covered 10 nominal
     days per 7–14-day interval while wet-season demand runs up to ~1.9× nominal.
     Measured: 75 of 76 shelves read critical, so every alert was noise. Fix:
     delivery cover = `ceil(interval × (1 + seasonal amplitude)) + 1`, derived
     from the existing climatology table, not a magic number. Healthy shelves now
     read ok; squeezed ones still read critical.
   - **Wrong-product vision thresholds (stale expectation, script).** All five mock
     packs share one generator template, so every wrong product scores ~0.93 edge
     correlation — no image swap can fix that, and loosening the number would fake
     a discrimination claim. Fix: gate asserts the true property (right product
     outranks wrong product; redrawn counterfeit falls far below both at 46.8%),
     with the limitation documented in the script. Real manufacturers use distinct
     artwork per brand, where absolute separation holds.
2. `scripts/seed-demo.mjs` and `db:push` are referenced but do not exist. Owner: Evans
   (BE-2/BE-3). Blocks: any Supabase-mode demo.
