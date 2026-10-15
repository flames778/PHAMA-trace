# PharmaTrace Mobile — 02 Technical Plan

Recommendation: **Expo (React Native, TypeScript)**. One language with the
web app, one team skill set, EAS builds for the demo and the stores, and the
web engine ports instead of being rewritten. The alternative — a PWA wrapping
the existing Vite app — stays on the table for zero-install reach, but it
cannot do reliable background dose reminders or proper barcode scanning, which
are the point of the mobile app. Decision recorded; revisit only if reminder
reliability stops mattering.

## What reuses as-is (pure TypeScript, no DOM)

These web modules have zero browser dependencies and move over unchanged:

| Module | Role on mobile |
|---|---|
| `src/types.ts` | Frozen contract, shared verbatim |
| `src/lib/verify.ts` (+ `decide`) | The verdict engine — same answers as web, guaranteed |
| `src/lib/forecast.ts` (+ `summarizeProductStock`) | Stockouts + personal alerts, same math |
| `src/lib/ledger.ts`, `sha256.ts` | Chain build/verify for custody screens |
| `src/lib/cabinet.ts` | Members, schedules, next-dose, migration |
| `src/lib/registry.ts` (interface + `withFallback`) | Same interface; only the transports are new (REST below) |

Rule: engine changes land in the shared modules and both faces consume them.
Never fork the decision math per platform.

## What gets a mobile port (same contract, native APIs)

| Web implementation | Mobile equivalent |
|---|---|
| `vision.ts` (ImageData, canvas, `createImageBitmap`) | Port the pipeline to operate on raw RGBA buffers from `expo-image-manipulator`; replace canvas letterboxing with a resize + manual stride loop. Keep thresholds identical; re-run the pipeline numbers as the acceptance gate. |
| `barcode.ts` (Browser `BarcodeDetector`) | `vision-camera-code-scanner` (or Expo Camera barcode path): continuous scan, longest-payload-wins, same `BarcodeHit` shape. |
| Camera capture (`getUserMedia` + canvas) | `expo-camera`, full-screen viewfinder, capture to file URI. |
| `localStorage` cabinet/scans | `AsyncStorage` for settings + cabinet; `expo-sqlite` for scans/movements ledger once the log grows (same cap discipline: 500 scans, 2000 movements). |
| Leaflet map | `react-native-maps` (Google/provider tiles) with cached region + offline list fallback. |
| In-app status text | `expo-notifications` for dose + refill reminders; all scheduling local-first so airplane mode still reminds. |
| `agentRouter.ts` chat | Same fetch client; key in SecureStore instead of localStorage. |

## Backend: reuse Evans' track, add a mobile transport

- The mobile app talks to the **same backends** through the same `Registry`
  interface: a `serverRegistry()` already exists over REST (`server/index.ts`
  endpoints). Mobile adds no new endpoints in phase 1 — it consumes
  products/locations/batches/custody/positions/movements/scans as-is.
- Phase-2 additions (only when needed): push-token registration for refill
  nudges, delta sync (`?since=`) for the bundled registry, photo upload for
  reports.
- `withFallback` + degraded banner carry over: airplane mode serves the
  bundled registry with the same honest labelling.
- Auth: none in phases 1–2 (same demo posture as web). Phase 3 adds
  Supabase Auth + role-scoped RLS per the schema header's roadmap; mobile
  holds the session token in SecureStore.

## Offline design (local-first, sync second)

1. Bundle the registry snapshot in the binary (generated from `src/data` at
   build time — same script that seeds Evans' backends).
2. Every write (scan, movement, report, taken-dose) lands in the local store
   first with a `pendingSync` flag.
3. A background sync worker pushes pending rows when connectivity returns,
   oldest first, idempotent keys (`scn_` ids / `(batch, location, day)`).
4. Conflicts resolve server-wins for registry facts, device-wins for
   personal facts (schedules, adherence). Documented, not silent.

## Performance + size budget

- Cold start to tappable Scan under 2.5s on a mid-range Android (Tecno/Itel
  class, the actual market).
- Vision pipeline under 3s per photo on-device; fall back to code-only +
  server-side analysis when the device is slow (same unverifiable honesty).
- Binary under 60MB; JS bundle split by tab after phase 1.

## Security notes (carry the 94/100 forward)

- No secrets in the binary: anon key ships (public by design), service keys
  never leave the backend.
- AI key in SecureStore, masked display, same as web.
- Photo reports strip EXIF location before upload; location is attached as
  an explicit field the user can see and remove.
- Same CSP/transport posture as web; certificate pinning listed for phase 3.
