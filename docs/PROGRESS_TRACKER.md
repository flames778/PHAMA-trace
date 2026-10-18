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
| `npm run server` (E2E) | PASS — new backend pass: Express server boots on `:3001`, health/products/batches-by-code/custody/hotspots all answer, `POST /api/scans` and `POST /api/movements` persist to `server/data/db.json` across restarts, `POST /api/reset` reseeds. Server compiles under its own `tsconfig.server.json`. |

**Review score: 96/100** (2026-10-15, after audit + 3-shard review + fixes; math in the log entry for `c68a940`). Audit health: 16/20 (Good), up from 13/20.

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
- **Phase 1 — Done.** Backend spine: Supabase provisioned, seeded, env wired, gates
  passing in Supabase mode. Frontend pipeline script fixed, MyMedicines polished.
- **Phase 2 — Done.** Integration: the map reads live `hotspot_grid`, the recall drill
  resolves every custody row, source toggle UX shipped, forecast × MyMedicines paired.
- **Phase 3 — Done.** Demo hardening: the two-scan stage flow verified end to end
  against Supabase, the pitch narrative written up in `docs/DEMO_RUNBOOK.md`, and
  a browser-driven review of every tab at desktop and 390px. Three further bugs
  found and fixed in that pass (below). Remaining Phase 3 work is working
  `docs/HARDENING_ROADMAP.md` down the list that blocks a real pilot.

## 5. Evans' side (backend)

| ID | Task | Acceptance | Status | Evidence |
| --- | --- | --- | --- | --- |
| BE-1 | Provision Supabase project, apply `supabase/schema.sql` | All 7 tables + indexes + 2 triggers + `hotspot_grid` view exist in the hosted DB | Done | `8c1d568`, verified live 2026-10-18: 7 tables RLS-enabled, 2 custody triggers + movement trigger, `hotspot_grid` view present |
| BE-2 | Write missing `scripts/seed-demo.mjs`, run `npm run seed` | Products, batches, locations, custody chains and movements load from `src/data`; every custody chain passes `verifyChain`; positions derive via the movement trigger | Done | `8c1d568`: project seeded (5/25/11, 1698 custody, 8686 movements, 76 positions). All 10 chains verify against live rows; seed script verified idempotent-refusal |
| BE-3 | Add `db:push` script, `.env.local` wiring, README note | Fresh clone can do: create project → `db:push` → `seed` → run in Supabase mode, documented in <10 steps | Done | `8c1d568`: `scripts/db-push.mts` + `supabase/migrations/` + README 7-step path |
| BE-4 | End-to-end pass in Supabase mode | App boots with Supabase badge; a scan inserts a `scans` row; custody verifies from real rows; typecheck + selfcheck + pipeline all green | Done | `8c1d568`: `npm run verify:supabase` green; browser confirmed live Supabase traffic incl. paginated movements |
| BE-5 | Hotspot + recall drill | HotspotMap reads live `hotspot_grid`; a test recall locates 100% of a batch's rows | Done | `8c1d568`: `registry.hotspotGrid()` wired into the map; recall drill covers 69 events / 7 locations |
| BE-6 | Hardening roadmap | Short doc: what changes before real use (auth, RLS roles, append-only custody, service-role writes) — `schema.sql` header already drafts it | Done | `8c1d568`: `docs/HARDENING_ROADMAP.md` |

Notes for Evans: `src/lib/registry.ts` implements the Supabase backend, and
`scripts/seed-supabase.mts` (behind `npm run seed`) inserts products →
locations → batches → custody, then movements so the trigger derives positions,
then reconciles positions so rows match local mode. It needs the service_role
env key per the schema header.
`BE-1 → BE-2 → BE-3 → BE-4` was the required order; all six are now verified
against the live project `bfmbpwkxsspjsoifnhpb`.

**Three live bugs found by the first Supabase-mode run** (all fixed, all now
guarded by `npm run verify:supabase`):

1. **Every custody chain failed verification at event 1.** The same instant
   reaches the app spelled three ways: `2026-03-20T08:12:00Z` (bundled data),
   the same string echoed (Express), `2026-03-20 08:12:00+00` (PostgREST),
   and the hosted seed signed `2026-03-20T08:12:00.000Z`. Hashing the raw
   string produced a different digest per backend. Fixed by normalizing
   timestamps in `canonicalize` (`normalizeStamp` in `src/lib/ledger.ts`), so
   all three backends agree on one digest and no stored row had to be re-signed.
2. **87% of the stock data was silently missing.** PostgREST caps responses at
   1000 rows and says nothing, so `movements()` returned 1000 of 8686 rows and
   the forecast was computed on a fragment that still looked plausible. Fixed
   with explicit pagination; the gate now asserts read count == table count.
3. **`withFallback` dropped the new registry method.** It lists every method by
   hand, so `hotspotGrid()` silently became undefined and the map fell back to
   deriving cells locally. Forwarded now, with a comment warning the next
   person who adds a method.

`Standalone backend` (not Supabase-dependent): `npm run server` boots an
Express API on `:3001` with JSON-file persistence, the Registry has a third
`server` mode behind `VITE_USE_SERVER=true`, and it reuses ME-2's
`withFallback` so a dead server degrades to bundled data. Vite proxies `/api`.

## 6. Ayonife's side (full stack)

| ID | Task | Acceptance | Status | Evidence |
| --- | --- | --- | --- | --- |
| ME-0 | Fix stale `verify:pipeline` script | Script uses IDs present in current `src/data`; all gates green | Done | `aac02ec`, 2026-10-14 |
| ME-1 | MyMedicines polish | Dose schedules + household profiles; entries survive reload | Done | `8e1400d`, 2026-10-15 |
| ME-2 | Source toggle / fallback UX | Mode badge truthful; offline fallback verified by killing env vars | Done | `41a9a49`, 2026-10-15 |
| ME-3 | Forecast × MyMedicines pairing | Personal stockout alerts surface on tracked medicines | Done | `d29db52`, 2026-10-15 |
| ME-4 | Demo script hardening | Genuine-vs-counterfeit two-scan flow lights the hotspot map reliably | Done | `01db8c4`, 2026-10-15 |
| ME-5 | Registry content pass | Code comments cite the real sources (Greenbook fields, GS1, WHO list) per `report.md` | Done | `7d764e2`, 2026-10-15 |

## 7. Doing now (week of 2026-10-18)

- **Every tracked task is Done.** ME-0..ME-5 and BE-1..BE-6 are closed and
  verified; the design audit is at 20/20.
- Backend is no longer a blocker: the live project
  `bfmbpwkxsspjsoifnhpb` is reachable, seeded and passing
  `npm run verify:supabase` on every run.
- Remaining optional polish (deliberately untracked): keyboard access for map
  markers, URL-synced tabs (needs a router), light map tiles (P4),
  MedicineGuide symbol-font pass, translations, PWA.
- Merge rule: each task merges only after joint review; the tracker row flips in the
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
| 2026-10-15 | Ayonife | **Impeccable audit** (`7b306a1`): 13/20 → fixed batch (redacted pass-color class restored, dose-time labels, forecast table overflow, h1 landmark, 23-spot contrast sweep). Detector clean before and after. |
| 2026-10-15 | Ayonife | **Review pass** (`c68a940`): 3 parallel shard reviews (22 + 14 + 18 raw findings) → validated, fixed, re-verified. Headline fixes: AgentRouter key restore (AI tab was dead), code-only verdict cap reorder, null-reference phantom mismatch + fixed prefix map, forecast history alignment, Holt residual, delivery off-by-one, reuse-signal tuning (same-site forgiven), highRisk wiring, RLS gaps (scans SELECT, positions write, idempotent policies), scripts under typecheck (new tsconfig.scripts.json), real write assertion, recall chronology, .env.example. Full suite: typecheck clean, pipeline 42/42, cabinet 20/20, source 13/13, build OK. **Score 96/100** (deductions: map-marker keyboard −1, compact targets −1, single bundle −1, gateway error echo −1; live-Supabase e2e excluded as environmental, owned by BE-4). |
| 2026-10-15 | Ayonife | **Triple review re-run** (no code changes since `c68a940`): code re-verified (typecheck + pipeline 42/42 green, detector clean) — 96/100 stands; new security-review pass — 94/100 (no sinks, no secrets, parameterized queries, validated uploads; deductions are accepted demo posture: open anon RLS −3, no CSP −2, localStorage key storage −1); design re-verified (detector clean, audit fixes intact) — 16/20 Good stands. Dev server running for stage checks. |
| 2026-10-15 | Ayonife | **Mobile artifact pack** (`docs/mobile/`, `f9a9b03`): 4 planning docs for the later mobile build — 00 overview (grandma-first users, goals/non-goals, demo criteria), 01 product design (4 tabs, result/cabinet/alerts/map screens, 7 grandma-first UX rules, empty states), 02 technical plan (Expo recommendation with PWA alternative recorded; reuse table for the pure-TS engine, port table for vision/barcode/camera/storage/maps/notifications, offline-first sync design, budgets, security carry-over), 03 roadmap (gated phases 0–3, backend dependencies on Evans, 4 open decisions). No code; sync verified clean and full gate suite green before pushing. |
| 2026-10-15 | Ayonife | **Design pass** (`677ed46`, skills: impeccable + frontend-design + modern-web-design + micro-interactions + animate + humanizer; trends researched: follow-pill tabs 200ms, senior-first 16px+/redundant cues, card-table patterns): minimal Landing page (wordmark links to it), line tabs with measured follow-pill indicator (transform-only) + scrollable mobile strip, custom Select replacing all 4 native dropdowns, custom scrollbars incl. the forecast table, responsive card-tables, collapsible explainers, Verify bento grid, band donut + senior-readable sparkline, simplified AI panel (no provider settings, env-only), scan CTA in empty cabinet, upgraded footer + helpline steps, real brand icon/logo assets (false trust badge stripped from lockup, favicon set), Bricolage-only type, press/focus motion system, emdash-free UI copy, EmptyVerdict code-chip cut. Full suite green + detector clean. Known interims: dark map tiles (P4), guide emoji (symbol pass), translations. |
| 2026-10-16 | Ayonife | **Stock + registry depth** (`c2cbaea`, from six in-browser comments): interactive demand chart (hover/touch/keyboard inspection with tooltip, observed/projected toggles, projected stockout marker), full-width shelf detail card with band chip and days-of-cover, colorized tap-to-explain stat cards, sortable shelf table (shelf/product/on-hand/days/band, nulls sink, aria-sort), animated donut (mount fill-in, hover/focus pills spotlight segments, live center readout), registry overhaul (summary stats, search, status filters, result count, empty state). Full suite green + detector clean. |
| 2026-10-18 | Ayonife | **Backend coverage gap closed** (`ab66286`, `9637bab`): reviewing the Phase 1-3 work exposed that the Express backend was the one path no check covered, and it was broken twice over. `registry.ts` read env from `import.meta.env` only, so under node it always reported `mode: "local"` and server mode was unreachable from any script; env resolution now lives in one accessor (`src/lib/env.ts`) shared with `supabase.ts` so the two cannot drift again. And changing the hash contract in the previous commit had silently invalidated every stored hash in `server/data/db.json` — the data was never tampered with, it would just fail verification forever — so the store now carries a version stamp, warns on stderr and re-seeds instead of presenting as corruption. Added `npm run verify:server`, proven to fail on a tampered event (pinpoints `bat-mf-0917-006`, exit 1) and to skip cleanly when the API is down. Separately, `movements()` paginated on `day` alone and all 120 days in the table hold more than one row, so offset paging over a non-unique key could repeat or skip rows whenever the stock logger wrote mid-read; ordering by the unique `id` as tiebreaker makes the ordering total. Verified the paged read is exact (8686 = 8686, 0 duplicates, 0 missing) and added that as a gate check. Forecast output unchanged: 10 critical / 1 warning / 4 watch / 61 ok. |
| 2026-10-18 | Ayonife | **Phase 3 + browser review** (`2bcb3a7`): drove every tab in a real browser against live Supabase. Confirmed the stage flow end to end (badge "Supabase", demo plays genuine 98% → counterfeit "do not dispense" → auto-opens the hotspot map, custody panel reads "Ledger verifies across 257 hash-chained events"), and found **three more bugs the headless suites cannot catch**. (1) **Count-up numerals froze at 0 in a background tab**: rAF is throttled to a standstill when hidden, so the band cards read "0 critical shelves" and the donut read "0" — real data displayed as a lie. `useCountUp` and the donut now finish on a timer that browsers still fire when hidden, and jump straight to the value if the page starts hidden. (2) **`verify:supabase` polluted its own live data**: it inserted a probe row to prove anon INSERT works, but anon has no DELETE policy by design, so the junk row sat in the demo scan feed (visible in the UI). The write check now only runs when a service key is present to clean up after it; the stray row was removed. (3) **Mobile tap targets were 19-39px**, far short of the 44px this project targets — footer links 19px, chart toggles 26px, filter chips 32px. Fixed with one mobile-scoped rule (min 44x44, excluding inline sentence links and Leaflet's own chrome) so a future control cannot regress it: undersized targets went 12→2 on Landing, 14→2 on Registry, 22→2 on Stock, 10→2 on My medicines, the 2 remaining being the sr-only skip link and an inline email address. Measured at 390px: no horizontal overflow on any tab, card-tables engage, the primary nav is a working scroll strip (340px visible of 601px, no hamburger). Wrote `docs/DEMO_RUNBOOK.md` with the three-minute flow, the spoken numbers checked against live output, honest answers to the four questions judges actually ask, and a failure-mode table. Full suite green, build clean, detector clean. |
| 2026-10-18 | Ayonife | **BE-1..BE-6 closed** (`8c1d568`): the `supabase-pharmatrace` MCP connected, so the live project `bfmbpwkxsspjsoifnhpb` became reviewable for the first time. Verified BE-1 against the hosted DB (7 tables RLS-enabled, append-only + movement triggers, `hotspot_grid`). Found and fixed **three live bugs** the mock-mode suites could never surface: (1) all 1698 custody events failed verification at event 1 because the same instant is spelled differently by each backend, fixed with `normalizeStamp` in `canonicalize`; (2) `movements()` silently returned 1000 of 8686 rows because PostgREST caps at 1000, fixed with pagination plus a gate that asserts read count == table count; (3) `withFallback` enumerates methods by hand and silently dropped the new `hotspotGrid()`, now forwarded with a warning comment. Shipped BE-3 (`scripts/db-push.mts`, `supabase/migrations/`, 7-step README), BE-4 (`scripts/verify-supabase.mts`, a real end-to-end gate that skips cleanly without credentials; browser confirmed live Supabase traffic and 9 paged movement requests), BE-5 (`registry.hotspotGrid()` feeding the map, recall drill covering 69 events across 7 locations) and BE-6 (`docs/HARDENING_ROADMAP.md`). Also made `supabase.ts` read `process.env` so headless checks can reach Supabase mode at all, and corrected the header banner to "mock registry" (it said "bundled" even when hosted). Full suite green, build clean, detector clean. |
| 2026-10-16 | Ayonife | **20/20 design push** (`be8fbbb`): closed every P0–P1 audit item. Accessibility foundations (sr-only h1, skip link, aria-live status regions, two-tap clear-all, light theme-color/color-scheme, touch-action, tap-highlight, safe-area insets). Honest token rename across 12 files (canvas/card/terra/sage/ochre/clay/steel; zero legacy names, verified by grep). Code-split bundles by tab (main 736→548KB, Leaflet isolated in its own chunk, skeleton fallbacks). Verdict choreography (scale-settle banner, staggered reasons/checks). Count-ups (band cards, donut center, landing + registry stats). Scan skeleton. Intl UTC dates. Placeholder rule. Row press states. Bricolage ≥15px rule (Inter body). Fluid clamp headlines. Full suite green, build emits 8 chunks, detector clean. Remaining: URL-synced tabs (needs router, roadmap), bare-`transition` accepted as Tailwind's bounded subset. |
| 2026-10-15 | Ayonife | **P0 warm theme live** (`217a9ac`): token inversion in `@theme` (paper canvas, terracotta-replaces-teal, sage/umber/deepened amber+rose, warm slate ramp — all existing classes follow, opacities intact), Bricolage Grotesque as display voice via Google Fonts CDN (Newsreader dropped) + Jakarta UI, rebuilt header (honesty utility strip, guilloche seal, Bricolage wordmark, site chip, 4-state mode badge, terracotta pill nav, mobile scroll strip) plus rich 4-column footer with helpline box and legal strip. Decisions recorded: Bricolage-display/J card, rich footer, CDN fonts. Full suite green (typecheck, pipeline 43/43, cabinet 20/20, source 13/13, selfcheck, build) + detector clean. Known interim: map tiles stay dark until P4; sparkline strokes restroke in P3. |
| 2026-10-15 | Session | **Standalone backend** (rebase onto `c842493` included): Express server (`server/index.ts`, `server/store.ts`) with full REST surface - products, locations, batches (incl. code lookup), custody chain, positions, movements, scans, forecast payload, hotspot rollup, health, reset - persisting to gitignored `server/data/db.json`, auto-seeded from `src/data`. Registry gained `server` mode (`VITE_USE_SERVER`) wrapped in ME-2's `withFallback`; Shell badge shows "Server"; Vite dev proxies `/api`. Seed script for Supabase (`scripts/seed-supabase.mts`, `npm run seed`) replaces the never-written `seed-demo.mjs` and orders inserts so the movement trigger derives positions before reconciliation. Fixes while landing: defensive `import.meta.env` read in `registry.ts` (same guard as `supabase.ts` - `source-check.mts` imports registry under plain node), new `tsconfig.server.json` so `server/` is typechecked, `process.env` added to the scripts ambient. Suite: typecheck clean (4 projects), selfcheck, pipeline, cabinet, source-check, build all PASS; server E2E verified (write → restart → read). |
| 2026-10-15 | Joint | **Backend merge + custody chain-order fix** (`862d353`, `b3ab8d5`, `3a1deb6`): integrated Evans' Express backend + Supabase seed + README + DB indexes with the review pass. Live E2E on the server exposed a real defect — timestamp-sorted custody breaks hash linkage on same-day legs (verified broken at event 006) — fixed in all three backends (chain-order seed, no re-sort on serve, id-ordered Supabase query) with a pipeline invariant pinning it. Evans also added `README.md` (run/seed guide) and `batches_product_idx` / `scans_product_idx`. Full suite green after every merge; `main` pushed. |

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
2. ~~`scripts/seed-demo.mjs` and `db:push` are referenced but do not exist~~ — seed
   PARTIALLY RESOLVED: `scripts/seed-supabase.mts` is written and wired to `npm run seed`
   (typechecks under `tsconfig.scripts.json`; runs against a live DB once BE-1 lands).
   `db:push` still does not exist — BE-3. Owner: Evans.
