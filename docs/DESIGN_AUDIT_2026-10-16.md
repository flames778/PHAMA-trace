# Design Audit — 2026-10-16 (strict)

Scope: full app UI (`src/`, `index.html`) against (a) impeccable audit
dimensions, (b) animation quality, (c) Vercel Web Interface Guidelines
(fetched fresh 2026-10-16), (d) `references/` mockups, (e) grandma /
pharmacist / regulator audiences, (f) modern-web-design currency.
Localhost verified live (200). Detector clean. No code changed in this pass.

## Scores

| Dimension | Score | One-line verdict |
|---|---|---|
| Accessibility | 2/4 | Contrast, labels, keyboard paths exist; page has no h1, no skip link, async status is silent to screen readers |
| Performance | 3/4 | Compositor-only motion, no thrash; 736KB single bundle, no code-split |
| Theming | 3/4 | Token system works; historic dark-era names now lie (`ink` renders paper) |
| Responsive | 3/4 | Card-tables, scrolling strip, 44px targets; no safe-area insets, no touch-action tuning |
| Implementation integrity | 4/4 | Coherent, honest copy, detector clean |
| **Total** | **15/20 Good** | Down from 16: strictness about h1/skip-link/live regions |

Animation scorecard (1–5): feedback 4, timing 4, easing 4, consistency 3,
performance 5, accessibility 4, responsive 4, purpose 4, delight 2,
restraint 5. Good bones; the memorable moments are missing.

Security/design overlap: none blocking (see 94/100 security pass).

## P0 — correctness and accessibility (fix before anything cosmetic)

1. **No h1 on any page.** The header rebuild turned the wordmark into spans
   inside a button. Screen-reader users get no page title landmark.
   Fix: visually-hidden `h1 "PharmaTrace"` in the shell (one line, zero
   visual change).
2. **No skip link.** 6+ tabs plus header/footer before content on every
   keyboard pass. Fix: "Skip to content" link to `<main id>`.
3. **Async status is silent.** Scanner status, demo-step text, stock-logger
   flash, and scan-result arrival have no `aria-live`. A blind user pressing
   "Play demo" hears nothing until they hunt. Fix: `aria-live="polite"`
   on the three status regions; `role="status"` on the verdict container.
4. **"Clear all" wipes a household's medicines with one tap, no confirm.**
   The single most dangerous control in the app for the core audience
   (grandma's cabinet, touch UI). Fix: two-tap confirm
   ("Tap again to delete everything") or an undo window.
5. **theme-color lies.** `index.html` still declares `#0b1120` (dark) while
   the page is paper. Mobile browser chrome mismatches. Fix: `#fff8f6`
   plus `color-scheme: light`.
6. **Touch tuning absent.** No `touch-action: manipulation` (double-tap zoom
   delay on buttons), no `-webkit-tap-highlight-color` (default grey flash
   on every tap), no `env(safe-area-inset-*)` (notched phones crowd the
   header/footer). Three CSS additions, all cheap.

## P1 — craft (the strict part)

7. **Bricolage body text is a legibility gamble.** Bricolage at 22px+
   headlines is distinctive and correct. Bricolage at 12–13px dense UI
   (table cells, reasons, notes) trades the references' readable Jakarta
   for quirk where nobody looks twice. Rule: Bricolage ≥15px and numerals;
   dense text under 15px moves to Inter/system. Keeps the voice, protects
   the reading.
8. **The verdict moment is unchoreographed.** The single most emotional
   screen in the product — genuine vs do-not-dispense — appears with the
   same 260ms rise as a tab switch. It deserves the one orchestrated
   reveal: verdict word scales 0.96→1 + fades in over ~350ms expo-out,
   reasons stagger 40ms, checks follow. Reduced-motion: instant.
9. **Numbers never count.** Donut center, band cards, stat numerals, landing
   stats all render final values. A 600ms count-up on first view is the
   cheapest delight available and directly serves "is it bad?" reading.
10. **Type is fixed-px in 2024.** No `clamp()` anywhere; hero, verdict, and
    landing headlines step abruptly at breakpoints. Fluid type on the three
    display moments.
11. **Token names lie (`ink` renders paper, `teal` renders terracotta).**
    Functional today, a trap for every future contributor (Evans included).
    Rename usages to semantic names in one mechanical pass while the
    mapping is fresh. Not urgent, but interest compounds.
12. **Dead motion code.** `pt-pulse` keyframes + class ship but nothing uses
    them. Delete (~15 lines) or use for the verdict reveal halo.

## P2 — depth (roadmap, not release-blockers)

13. URL reflects nothing: tabs, selected shelf, demo state all die on
    reload/share. Needs a router (or nuqs-style params) — the largest
    architectural gap vs the guidelines.
14. Scan pipeline has no skeleton: "Loading registry…" text and disabled
    buttons only. Skeleton verdict card matching the result layout.
15. Dates are hand-sliced ISO (`slice(0, 16)`); use `Intl.DateTimeFormat`
    (locale-correct, and free).
16. `transition` bare keyword on ~40 selectors animates every animatable
    property. List properties explicitly per the guidelines.
17. Placeholders: "Add a person (e.g. Grandma)" should end with `…` per the
    guidelines' placeholder rule; audit the rest.
18. Table rows have hover but no press state; add `active:` wash for parity
    with buttons.

## Mockup fidelity — strict deltas

Missing vs references (all previously logged as future MEs, still true):
adherence taken-logging, refill requests, transfer console + dispatches,
report-to-regulator flow, consultation history + suggestions, KPI cards on
the map, corridor styling, print dossier. Map tiles still dark (P4).
Where we beat the mockups: real registry counts on landing (theirs are
invented), real helpline email (theirs is a fictional hotline), no invented
testimonials, honest degraded/demo labelling throughout. Keep those wins;
do not "catch up" by inventing data.

## Audience fit — strict notes

- Grandma: verdict word + next-dose lines pass; 12px dense text, English-only
  copy, and the unconfirmed Clear-all are the three risks. Larger-text
  toggle still absent (planned, not built).
- Pharmacist: sortable shelves, runout data, recall warnings all land. The
  shelf table at 360px works via cards; the forecast table's sticky thead
  plus custom scrollbars hold up.
- Regulator: map + feed + export-less stream is demo-credible; the real
  escalation path (Med Safety payload) remains phase 3.

## What stays as-is (deliberate, do not "fix")

Wall-clock expiry, unknown-code conservatism, single light theme, no PWA,
env-only AI config, localStorage-first cabinet, 500/2000 log caps.
