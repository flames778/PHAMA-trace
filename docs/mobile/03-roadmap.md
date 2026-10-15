# PharmaTrace Mobile — 03 Roadmap

Phases are gated: a phase starts when its entry criteria hold, not on a date.

## Phase 0 — Foundation (entry: backend BE-1/BE-2 done, registry API stable)

- Expo app shell, 4-tab navigation, design tokens mirroring the web dark
  theme (ink/line/teal/amber/rose), 16sp+ type ramp, Larger-text toggle.
- Shared engine wired in (`types`, `verify`, `forecast`, `ledger`,
  `cabinet`, `registry` interface) — no forks.
- Bundled registry snapshot generated from `src/data` at build time.
- Exit: typecheck + a `mobile-check` script (port the headless suites that
  do not need a DOM) green on CI.

## Phase 1 — Scan + Cabinet (the grandma demo)

- Camera scan with barcode auto-read, manual code entry, demo packs.
- Verdict screen per `01-product-design.md` (one word → name → purpose →
  one action).
- Cabinet: members, assign, dose schedules, next-dose, plain-language
  guide, local reminders (offline-capable).
- Personal low-stock banner via `summarizeProductStock`.
- Exit: the overview's 3 demo criteria pass on a mid-range Android in
  airplane mode.

## Phase 2 — Alerts + Map lite + sync

- "Take now" reminders with Taken ✓ adherence log (device-wins sync).
- "Running low" refill nudges from the forecast rollup.
- Map lite with cached tiles + offline list fallback.
- Background sync worker (pendingSync queue, idempotent keys).
- Exit: 7-day field test with 2 households; zero lost doses, zero lost
  writes, every sync conflict resolved per the documented rule.

## Phase 3 — Reporting + hardening (needs regulator conversation first)

- Suspicious-pack reports (photo + location, EXIF stripped) queued to the
  official channel shape (Med Safety / sf.alert compatible payload).
- Household medicine-guide translations (Hausa, Yoruba, Igbo) — option,
  not promise.
- Supabase Auth + SecureStore sessions, cert pinning, cloud backup behind
  an optional account.
- Exit: a regulator or NGO partner reviews the report payload and the
  escalation path. No integration claims before that conversation.

## Backend dependencies (Evans' track)

| Need | Owner | Status |
|---|---|---|
| Stable REST surface (products → scans, custody in chain order) | Evans | Landed (`server/`), chain-order verified |
| Supabase project + seed (`BE-1`, `BE-2`) | Evans | Pending — mobile reuses the same rows |
| Delta sync + push-token endpoints (phase 2) | Evans | Not started — only when mobile needs them |
| Auth + role RLS (phase 3) | Evans | Roadmap in schema header |

## Open decisions (do not block phases 0–1)

1. Expo vs PWA for maximum reach — recommendation recorded (Expo), PWA kept
   as a zero-install companion, revisited if reminder reliability is waived.
2. On-device vs server-side vision for low-end phones — default on-device
   with code-only fallback; measure in phase 1 field test.
3. Adherence data ownership — device-first, cloud backup opt-in; confirm
   with a pharmacist advisor before phase 2.
4. Translation priority order across Hausa/Yoruba/Igbo — ask the field
   test households, do not guess.
