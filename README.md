# PharmaTrace

Medicine verification, supply-chain custody and shortage forecasting for the
Nigerian market — a **demo**. Every product, batch, manufacturer and facility in
this repo is fictional, drawn from the clearly-labelled mock registry in
`src/data`. Nothing here is connected to NAFDAC, GS1 or any manufacturer.

## Modes

The app runs behind one `Registry` interface (`src/lib/registry.ts`) with three
interchangeable backends:

| Mode | Selected when | Storage |
| --- | --- | --- |
| `local` | no env configured | bundled `src/data` + `localStorage` |
| `supabase` | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | hosted Postgres |
| `server` | `VITE_USE_SERVER=true` | `server/data/db.json` via `npm run server` |

Live calls fall back per-call to the bundled data: the first failure flips a
module-level degraded flag and the UI shows an honest "showing bundled demo
data" banner instead of failing.

## Run it (Supabase mode)

Seven steps, from an empty folder to a running app on real rows.

1. `npm install`
2. Create a Supabase project and note its ref: it is the first segment of
   `https://<ref>.supabase.co`.
3. `npx supabase login`, then `npx supabase link --project-ref <ref>`
   (one-time; stores the link in `supabase/.temp`, which is gitignored).
4. `npm run db:push` — applies `supabase/migrations/*.sql`. This creates the
   7 tables, their indexes, the two triggers (append-only custody,
   movement → position) and the `hotspot_grid` view.
   Prefer not to install the CLI? Paste
   `supabase/migrations/20261018000000_init_schema.sql` into
   **Database → SQL editor** and run it instead. Same result.
5. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_SUPABASE_URL` — project URL
   - `VITE_SUPABASE_ANON_KEY` — project anon key (client read + scan/movement writes)
   - `VITE_SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) — service-role
     key, used **only** by the seed script, because the anon policies cannot
     insert registry rows. Never ship this key to the browser.
6. `npm run seed` — seeds products → locations → batches → custody chains, then
   stock movements (the trigger derives positions), then reconciles positions so
   the rows match local mode exactly. Seeding is not idempotent: `custody_events`
   is append-only by trigger, so re-seeding a populated project fails on purpose.
   Use a fresh project, or re-apply the migration first.
7. `npm run dev` — the app starts in Supabase mode (badge in the header).

Then `npm run verify:supabase` to prove the wiring end to end (see Gates).

The demo target: a scan writes a row to `scans`, and the custody panel verifies
its hash chain from real `custody_events` rows.

## Layout

| Path | What |
| --- | --- |
| `src/types.ts` | **Frozen contract** — the shared shapes both sides use |
| `src/data/*` | Labelled mock registry (products, batches, locations, demand, custody) |
| `src/lib/registry.ts` | The `Registry` interface + local / supabase / server backends |
| `src/lib/ledger.ts`, `sha256.ts` | Hash-chained custody (`event_hash = sha256(prev_hash \| canonical_payload)`) |
| `supabase/migrations/` | Postgres schema, RLS demo policies, triggers, `hotspot_grid` |
| `scripts/seed-supabase.mts` | `npm run seed` — loads `src/data` into Supabase |
| `scripts/db-push.mts` | `npm run db:push` — applies the migrations via the Supabase CLI |
| `scripts/verify-supabase.mts` | `npm run verify:supabase` — end-to-end gate against a live DB |
| `docs/HARDENING_ROADMAP.md` | What must change before real use (BE-6) |
| `server/` | Optional standalone Express backend (`npm run server`) |

## Gates

```
npm run typecheck        # tsc -b over app, server, scripts
npm run selfcheck        # sha256 NIST vectors
npm run verify:pipeline  # vision + custody-tamper + forecast + decision rules
npm run source-check     # registry boot + degraded fallback
npm run cabinet-check    # household cabinet / dose schedules
npm run verify:supabase  # live end-to-end: real rows, real hashes, real writes
```

`verify:supabase` **skips** (exit 0) when `.env.local` has no credentials, so a
clone without a database still has a green suite. With credentials it checks
that every custody chain verifies from live rows, that reads are not silently
truncated, that the hotspot view and recall drill resolve, and that an
anonymous insert works.

## Honesty notes

- The registry is a mock. Keep the "MOCK REGISTRY" labels on `src/data` files.
- `supabase/migrations/*` allows anonymous scan/movement inserts for the demo.
  Before real use: add auth + role-scoped RLS, make custody append-only at the
  role level, and move registry writes behind a service-role key held by the
  regulator. The full list is `docs/HARDENING_ROADMAP.md`.
- The verify engine is decision support, not proof and not medical advice.
