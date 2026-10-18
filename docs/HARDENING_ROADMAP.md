# Before Real Use — Hardening Roadmap (BE-6)

What has to change between this demo and something a pharmacy, a
manufacturer or a regulator could actually rely on. Ordered by how much it
matters, not by effort.

The short version: **the schema is honest about being a demo.** Every table
allows anonymous writes that a real system must attribute to a named party.

---

## 1. Identity and roles (blocking)

Today every table is reachable by anyone holding the anon key, which is
public in the client bundle. That is deliberate for the hackathon demo: no
login wall between a judge and the app. It is the first thing to fix.

- Add Supabase Auth. `pharmacies` and `regulators` become real accounts.
- Replace `using (true)` read policies with role-scoped ones. A pharmacy
  reads its own stock movements; it does not read a competitor's.
- Replace the anonymous INSERT policies on `scans` and `stock_movements`
  with `auth.uid() is not null`, and store the uid as the actor.
- The AI assistant (env-configured, no UI) must sit behind the same check.

## 2. Custody integrity (blocking)

`custody_events` is already append-only at the database level: the
`custody_events_append_only` trigger rejects UPDATE and DELETE. That is the
one guarantee in this schema worth keeping exactly as it is.

Still needed:

- The trigger currently guards the table, not the *writer*. A service-role
  client can still insert a forged event. Sign hashes with a key the
  database holds (pgcrypto + a KMS-held secret), not with a value the app
  computes on the client.
- Detect gaps, not just edits. The chain proves events were not altered;
  it does not prove none were withheld. Periodically reconcile the chain
  against the expected shipment count.
- Store `occurred_at` and a separate `recorded_at`. Right now the only
  timestamp is attacker-supplied, so a forged event can claim any date.

## 3. Data provenance (blocking for any claim of realness)

The registry in this repo is hand-built to mirror the shape of the NAFDAC
Greenbook. **Nothing here is connected to NAFDAC, to any manufacturer, or to
any real recall notice.** Making it real means:

- Greenbook/NAPAMS ingestion on a schedule, with the source URL and fetch
  date stored per row so a regulator can audit where a product came from.
- Manufacturer artwork stored as a versioned asset with a hash, so a
  re-registered pack cannot silently pass a visual check.
- Recalls sourced from NAFDAC Public Alerts, with the notice reference
  attached. Today `batches.recall_reason` is a hand-written string.
- Barcode validation against GS1 Verified by GS1, so a well-formed code is
  not mistaken for an issued one.

## 4. Forecast honesty (important)

The forecaster is a seasonal weighted average. It is fine for a demo and
wrong for a procurement decision.

- Show the model and its error rate in the UI, not just the band.
- Backtest against held-out history before anyone stocks to a prediction.
- Absent demand is currently treated as zero demand. A shelf with no sales
  is more often a stockout, and the two need separating.

## 5. Operational (before any pilot)

- Rate limiting and pagination on public reads. PostgREST caps responses at
  1000 rows by default; the app now paginates explicitly, but a public
  endpoint with no rate limit is an availability risk.
- Offline behaviour on purpose. The app is localStorage-first so the demo
  survives a dead network. In production, local medical records need
  encryption at rest and a defined sync conflict rule.
- Audit log for every registry write: who, when, what, from where.
- Backups and a tested restore. An append-only ledger is only as good as the
  ability to recover it.

## 6. What is already right (keep it)

- `custody_events` is append-only at the database layer.
- Custody is served in **chain order, not timestamp order**. Several legs of
  one journey share a day, and sorting by time scrambles the hash linkage.
  Enforced in all three backends and guarded by
  `npm run verify:supabase`.
- Timestamps are normalized to one canonical form before hashing, so the
  same custody fact hashes identically whether it arrives from the bundled
  data, the Express store or PostgREST.
- Registry reads are truth-labelled. The mode badge says which backend is
  live, and a degraded backend says so instead of quietly serving mocks.
- No scan is presented as NAFDAC-verified. The app verifies against its own
  mock registry and says exactly that.

---

Tracked as BE-6 in `PROGRESS_TRACKER.md`. The schema header in
`supabase/migrations/20261018000000_init_schema.sql` carries the short
version of items 1 and 2.