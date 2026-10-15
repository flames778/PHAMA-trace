# PharmaTrace Mobile — 00 Overview

Status: planning only. No mobile code exists yet; the web app (`src/`, `server/`)
is the reference implementation. This pack exists so the mobile build starts
from decisions, not discovery.

## Why a mobile app

The web app proves the engine. But the users who need it most — patients like
the grandmother who cannot tell her pills apart, and pharmacists behind a
counter — live on phones, often on patchy networks. The mobile app is the
consumer face of PharmaTrace; the web app remains the regulator/pharmacy
console.

## Primary users

1. **Patients and caregivers (grandma-first).** Scan a pack, get a plain answer
   ("this is real" / "do not take this"), know what the medicine is for, and
   get reminded when to take it. Must work for low-literacy, low-vision,
   shaky-hands users.
2. **Pharmacists on the go.** Verify at the counter, log stock from the shelf,
   see shortage alerts for their area.
3. **Field reporters (later).** Suspicious-scan reporting with photos for
   regulators and NGOs. Phase 3.

## Goals

- G1: A first-time user can scan a pack and understand the answer in under a
  minute, with no account and no network (bundled registry fallback).
- G2: A household can track every member's medicines, doses, and refill needs
  in one cabinet.
- G3: Dose reminders fire reliably offline.
- G4: Everything the app concludes mirrors the web engine exactly (same
  `verify()`, same forecasts) — one truth, two faces.

## Non-goals (explicit)

- No mobile stock-management back office (that stays web).
- No diagnosis or prescribing advice — decision support only, same as web.
- No feature-phone/USSD channel in scope (recorded as a future option for
  reach, not committed).
- No NAFDAC or manufacturer integration claims; same honesty rules as the web
  app (see `report.md`).

## Success criteria for the first mobile demo

1. Airplane mode on: scan the two demo packs, get genuine then suspicious,
   in under a minute.
2. Add "Grandma", assign her malaria medicine, set 8am/8pm doses, receive a
   reminder.
3. A tracked medicine running low in her area raises an alert before the
   printed refill date.

## Map of this pack

- `01-product-design.md` — screens, flows, grandma-first UX rules.
- `02-technical-plan.md` — recommended stack, what reuses, what gets ported.
- `03-roadmap.md` — phases, backend dependencies, open decisions.
