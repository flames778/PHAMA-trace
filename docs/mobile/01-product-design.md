# PharmaTrace Mobile — 01 Product Design

Mode: Operate (task completion) with a Read layer (plain-language medicine
info). Grandma-first: if she cannot use it on a dim screen with shaky hands,
it is not done.

## App shape: 4 tabs

Scan (hero) · Cabinet · Alerts · Map. Bottom tabs, 56px minimum height,
labels always visible — no icon-only navigation anywhere.

### Tab 1 — Scan (home)

- One hero button, half the screen: **"Check this medicine"** with a camera
  glyph. Below it, two quieter paths: "Type the code" and "Demo packs".
- Camera view: full-screen viewfinder, batch-code auto-read from the barcode
  (vision-camera code scanner), big capture button as fallback. The photo is
  analysed on-device where possible.
- Result screen (the money screen): one word first — **REAL** (green) /
  **DO NOT TAKE** (red) / **CAN'T TELL** (amber) — then the medicine name,
  then "What is this for?" in one sentence, then a single primary action:
  - REAL → "Add to Grandma's cabinet" (or the chosen member).
  - DO NOT TAKE → "Report this pack" (photo + location, queued offline).
  - CAN'T TELL → "Ask your pharmacist", with the reasons collapsed.
- Secondary link: "Why this answer?" opens the ranked reasons (the same list
  the web VerdictPanel shows, shortened to the top 3 with "show all").

### Tab 2 — Cabinet (My medicines)

- Member switcher across the top as large chips: All, Grandma, Me, … plus
  "Add person". Tapping a chip filters; the list groups by person exactly
  like the web tab.
- Each medicine card: brand + generic, one-line purpose, next-dose line
  ("Next dose 8:00 PM today" — large, high contrast), low-stock chip when the
  forecast flags it.
- Tapping a card opens the full plain-language guide (what for, how to take,
  side effects, who should not take, storage, missed dose) plus the dose-time
  editor (time rows with big touch targets, minimum 48px).
- Dose reminders are set from the schedule screen with one toggle per
  medicine: "Remind me". Times can be edited; reminders follow.

### Tab 3 — Alerts

- Two sections, plain words: **"Take now"** (doses due within the hour, with
  a "Taken ✓" button that logs adherence) and **"Running low"** (tracked
  medicines reading warning/critical anywhere stocked, with nearest-shelf
  hint and a "Remind me to refill" toggle).
- Adherence log: per medicine, last 7 days as dots. No streak shaming, no
  gamification — this is medication, not fitness.

### Tab 4 — Map (lite)

- Suspicious-scan hotspots near the user plus their own scan history pins.
  Read-only in phase 1; reporting escalation UI arrives in phase 3.
- Must work with cached tiles or a simplified list view when offline.

## Grandma-first UX rules (non-negotiable)

1. Minimum body text 16sp; critical answers 28sp+. A "Larger text" toggle in
   settings scales everything one step up (uses system font scaling, never
   fixed pixels for text).
2. Every destructive or medical action confirms in plain words ("Stop taking
   Malafem? This only removes the reminder — ask your pharmacist before
   stopping any medicine.").
3. No timeouts on any screen. No session expiry. No account required for
   scan + cabinet (account only ever gates cloud backup, phase 3).
4. Colour is never the only signal: every verdict pairs colour with a word
   and an icon (REAL ✓ / DO NOT TAKE ✕ / CAN'T TELL ?).
5. All copy at primary-school reading level. Medicine names stay exact;
   everything around them is plain language (reuse the web guide strings).
6. Works offline first: scan, cabinet, doses, and alerts all function in
   airplane mode against the bundled registry; syncing is a background
   detail, never a blocker.
7. Language: ship English first; Hausa, Yoruba, and Igbo medicine-guide
   translations are a listed phase-3 option, not a promise.

## Empty states (designed, not defaulted)

- No scans yet → illustration + "Check your first medicine" button.
- No members → "Who takes medicine in your house?" + add-person field.
- No alerts → "All clear. We'll nudge you when something needs attention."
- Offline map → list view of nearby hotspots with the same data.
