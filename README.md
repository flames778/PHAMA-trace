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

1. Create a Supabase project.
2. Open **Database → SQL editor**, paste the whole of `supabase/schema.sql`, run it.
   This creates the 7 tables, their indexes, the two triggers (append-only
   custody, movement → position) and the `hotspot_grid` view.
3. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_SUPABASE_URL` — project URL
   - `VITE_SUPABASE_ANON_KEY` — project anon key (client read + scan/movement writes)
   - `VITE_SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) — service-role
     key, used **only** by the seed script, because the anon policies cannot
     insert registry rows. Never ship this key to the browser.
4. `npm install`
5. `npm run seed` — seeds products → locations → batches → custody chains, then
   stock movements (the trigger derives positions), then reconciles positions so
   the rows match local mode exactly.
6. `npm run dev` — the app starts in Supabase mode (badge in the header).

The demo target: a scan writes a row to `scans`, and the custody panel verifies
its hash chain from real `custody_events` rows.

## Layout

| Path | What |
| --- | --- |
| `src/types.ts` | **Frozen contract** — the shared shapes both sides use |
| `src/data/*` | Labelled mock registry (products, batches, locations, demand, custody) |
| `src/lib/registry.ts` | The `Registry` interface + local / supabase / server backends |
| `src/lib/ledger.ts`, `sha256.ts` | Hash-chained custody (`event_hash = sha256(prev_hash \| canonical_payload)`) |
| `supabase/schema.sql` | Postgres schema, RLS demo policies, triggers, `hotspot_grid` |
| `scripts/seed-supabase.mts` | `npm run seed` — loads `src/data` into Supabase |
| `server/` | Optional standalone Express backend (`npm run server`) |

## Gates

```
npm run typecheck       # tsc -b over app, server, scripts
npm run selfcheck       # sha256 NIST vectors
npm run verify:pipeline # vision + custody-tamper + forecast + decision rules
npm run source-check    # registry boot + degraded fallback
npm run cabinet-check   # household cabinet / dose schedules
```

## Honesty notes

- The registry is a mock. Keep the "MOCK REGISTRY" labels on `src/data` files.
- `supabase/schema.sql` allows anonymous scan/movement inserts for the demo. Before
  real use: add auth + role-scoped RLS, make custody append-only at the role level,
  and move registry writes behind a service-role key held by the regulator.
- The verify engine is decision support, not proof and not medical advice.
