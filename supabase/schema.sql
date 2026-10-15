-- ============================================================================
-- PharmaTrace — Supabase schema
-- ============================================================================
-- PASTE THIS FILE ONCE into the Supabase SQL editor (Database -> SQL editor).
-- It creates the structure only; the demo seed loader is tracked as BE-2
-- (scripts/seed-demo.mjs) and must connect with the service_role key,
-- because the anon policies below deliberately cannot write registry rows.
--
-- IMPORTANT — this is a demo schema.
--   * Every table allows anonymous INSERT into `scans` and `stock_movements`
--     so the hackathon build works without auth. That is fine for a demo and
--     wrong for anything real.
--   * Before real use: add Supabase Auth, give pharmacies a role, restrict
--     INSERT on `scans` to signed-in users, make `custody_events` append-only
--     via a trigger (see the bottom of this file), and move the registry
--     writes behind a service-role key held by the regulator.
--   * Nothing here is connected to NAFDAC or to any manufacturer's systems.
--   * TABLE MODEL (see report.md): products/batches mirror the NAFDAC
--     Greenbook row (name, actives, NRN, applicant, form, strengths, status);
--     custody_events mirrors GS1 EPCIS business steps; scans carry the
--     WHO-GSMS-shaped flag set the verify engine produces.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ products

create table if not exists products (
  id            text primary key,
  brand_name    text not null,
  generic_name  text not null,
  strength      text,
  form          text,
  manufacturer  text not null,
  category      text not null check (category in ('antimalarial','antibiotic','analgesic','other')),
  artwork_ref   text,
  high_risk     boolean not null default false,
  what_its_for        text,
  how_to_take         text,
  common_side_effects text,
  who_should_not_take text,
  storage             text,
  missed_dose         text
);

-- ----------------------------------------------------------------- locations

create table if not exists locations (
  id    text primary key,
  name  text not null,
  kind  text not null check (kind in ('manufacturer','distributor','pharmacy','regulator')),
  lat   double precision not null,
  lng   double precision not null,
  lga   text not null,
  state text not null
);

create index if not exists locations_kind_idx on locations (kind);

-- ------------------------------------------------------------------- batches

create table if not exists batches (
  id                text primary key,
  batch_code        text not null unique,
  product_id        text not null references products (id),
  manufactured_on   date not null,
  expires_on        date not null,
  quantity_released bigint not null,
  status            text not null default 'active'
                      check (status in ('active','recalled','expired')),
  recall_reason     text,
  registered_at     timestamptz not null default now()
);

create index if not exists batches_code_idx on batches (batch_code);
create index if not exists batches_product_idx on batches (product_id);
create index if not exists batches_status_idx on batches (status);

-- ------------------------------------------------------------- custody_events
-- Append-only, hash-chained. Each row commits to the previous row's hash:
--     event_hash = sha256(prev_hash || canonical_payload)
-- Any edit or deletion breaks every hash downstream of it.

create table if not exists custody_events (
  id                text primary key,
  batch_id          text not null references batches (id),
  event_type        text not null
                      check (event_type in ('released','shipped','received','dispensed','returned','flagged','recalled')),
  from_location_id  text references locations (id),
  to_location_id    text references locations (id),
  quantity          bigint not null default 0,
  occurred_at       timestamptz not null,
  actor             text not null,
  note              text,
  prev_hash         text not null,
  event_hash        text not null,
  created_at        timestamptz not null default now()
);

create index if not exists custody_batch_idx on custody_events (batch_id, occurred_at);
create index if not exists custody_hash_idx on custody_events (event_hash);

-- Enforce append-only in the database, not just in application code.
create or replace function reject_custody_mutation() returns trigger as $$
begin
  raise exception 'custody_events is append-only; historical rows cannot be changed or deleted';
end;
$$ language plpgsql;

drop trigger if exists custody_events_append_only on custody_events;
create trigger custody_events_append_only
  before update or delete on custody_events
  for each row execute function reject_custody_mutation();

-- ------------------------------------------------------------ stock_positions

create table if not exists stock_positions (
  batch_id    text not null references batches (id),
  location_id text not null references locations (id),
  on_hand     bigint not null default 0 check (on_hand >= 0),
  updated_at  timestamptz not null default now(),
  primary key (batch_id, location_id)
);

-- ------------------------------------------------------------ stock_movements

create table if not exists stock_movements (
  id          bigint generated always as identity primary key,
  batch_id    text not null references batches (id),
  location_id text not null references locations (id),
  day         date not null,
  dispensed   integer not null default 0 check (dispensed >= 0),
  received    integer not null default 0 check (received >= 0),
  unique (batch_id, location_id, day)
);

create index if not exists stock_movements_loc_idx on stock_movements (location_id, day);
create index if not exists stock_movements_day_idx on stock_movements (day);

-- Keep the position table in step with the movement ledger.
-- Movements are append-only by convention (the app only ever inserts, and
-- the unique key on (batch, location, day) rejects duplicates), so the
-- trigger handles INSERT only. An UPDATE/DELETE path would need a full
-- recompute — out of scope for the demo; reseed instead of editing rows.
create or replace function apply_stock_movement() returns trigger as $$
begin
  insert into stock_positions (batch_id, location_id, on_hand, updated_at)
  values (new.batch_id, new.location_id, new.received - new.dispensed, new.day::timestamptz)
  on conflict (batch_id, location_id) do update
    set on_hand = greatest(0, stock_positions.on_hand + excluded.on_hand),
        updated_at = excluded.updated_at;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stock_movements_apply on stock_movements;
create trigger stock_movements_apply
  after insert on stock_movements
  for each row execute function apply_stock_movement();

-- --------------------------------------------------------------------- scans

create table if not exists scans (
  id         text primary key,
  batch_code text,
  product_id text references products (id),
  batch_id   text references batches (id),
  verdict    text not null check (verdict in ('genuine','suspicious','unverifiable')),
  confidence double precision not null,
  headline   text not null,
  reasons    jsonb not null default '[]'::jsonb,
  evidence   jsonb not null default '{}'::jsonb,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists scans_created_idx on scans (created_at desc);
create index if not exists scans_code_idx on scans (batch_code);
create index if not exists scans_product_idx on scans (product_id);
create index if not exists scans_verdict_idx on scans (verdict);

-- Live hotspot rollup used by the regulator dashboard.
create or replace view hotspot_grid as
select
  round(lat::numeric, 2)::double precision as lat_cell,
  round(lng::numeric, 2)::double precision as lng_cell,
  count(*)                                              as total,
  count(*) filter (where verdict = 'suspicious')        as suspicious,
  count(*) filter (where verdict = 'genuine')           as genuine,
  count(*) filter (where verdict = 'unverifiable')      as unverifiable,
  max(created_at)                                       as last_seen
from scans
group by 1, 2;

-- ----------------------------------------------------------------- row level

alter table products          enable row level security;
alter table locations         enable row level security;
alter table batches           enable row level security;
alter table custody_events    enable row level security;
alter table stock_positions   enable row level security;
alter table stock_movements   enable row level security;
alter table scans             enable row level security;

-- Demo policy set: anyone holding the anon key may read the registry and
-- may append a scan or a stock movement. Replace with role-scoped policies
-- before real use. Every statement below is re-runnable: policies are
-- dropped first, matching the trigger guards above.
--
-- Two gaps this block deliberately closes (both broke Supabase mode):
--   * scans needs a SELECT policy or the scan feed and hotspot reads fail;
--   * the stock trigger writes stock_positions as the anon caller, so that
--     table needs INSERT + UPDATE policies, not just SELECT.
-- Deliberately absent: INSERT on the registry tables (products, batches,
-- locations, custody_events) — seeding uses the service_role key (BE-2).
-- The append-only custody trigger cannot stop TRUNCATE (row triggers never
-- fire for it): reseed by re-pasting this file, never by truncating tables.

drop policy if exists "registry is publicly readable" on products;
create policy "registry is publicly readable"  on products        for select using (true);
drop policy if exists "locations are publicly readable" on locations;
create policy "locations are publicly readable" on locations      for select using (true);
drop policy if exists "batches are publicly readable" on batches;
create policy "batches are publicly readable"  on batches        for select using (true);
drop policy if exists "custody is publicly readable" on custody_events;
create policy "custody is publicly readable"   on custody_events for select using (true);
drop policy if exists "stock is publicly readable" on stock_positions;
create policy "stock is publicly readable"     on stock_positions for select using (true);
drop policy if exists "positions maintained by movement trigger" on stock_positions;
create policy "positions maintained by movement trigger" on stock_positions for insert with check (true);
drop policy if exists "positions updated by movement trigger" on stock_positions;
create policy "positions updated by movement trigger" on stock_positions for update using (true) with check (true);
drop policy if exists "movements are publicly readable" on stock_movements;
create policy "movements are publicly readable" on stock_movements for select using (true);
drop policy if exists "scans are publicly readable" on scans;
create policy "scans are publicly readable" on scans for select using (true);
drop policy if exists "anyone may log a scan" on scans;
create policy "anyone may log a scan"          on scans          for insert with check (true);
drop policy if exists "anyone may log stock movement" on stock_movements;
create policy "anyone may log stock movement"  on stock_movements for insert with check (true);
