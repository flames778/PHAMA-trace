# Design Adoption — Warm Editorial Humanist

Source: `references/` (6 mockups, each with `code.html` + `screen.png` + shared
`DESIGN.md`). The `code.html` files are static Tailwind-CDN mockups — visual
reference and token source, not portable components. Our port target is the
Tailwind v4 `@theme` in `src/index.css` plus component classes.

## The system being adopted

**Warm Editorial Humanist** (their name): warm paper surfaces, burnt
terracotta primary, serif display + humanist sans body, tonal (not shadow)
elevation, editorial spacing, muted status badges.

Token core (from DESIGN.md front-matter):

| Role | Value | Our current equivalent |
|---|---|---|
| Canvas / surface | `#fff8f6` warm paper (never pure white) | `#0b1120` dark ink — full inversion |
| Primary action | `#b44b2a` burnt terracotta (deep `#943414`) | teal-400/500 — brand swap |
| Success / genuine | `#405b4d` sage pine (+ `#edf3ee` wash) | emerald-300 — close, re-tint |
| Warning | umber `#8a7058` / amber wash `#fbf3ea` | amber-200 — close, re-tint |
| Danger / suspicious | `#ba1a1a` error red | rose-300 — strengthen |
| Ink text tiers | `#292524` / `#635e59` / `#8c857e` | slate-100/400/500 — warm swap |
| Lines | `#e4dfd5` / `#d7d1c5` warm bone | `#1e293b` line — invert |
| Display type | Newsreader (serif, headlines/names) | Inter everywhere — add family |
| Body type | Plus Jakarta Sans | Inter — swap or keep Inter for data density |
| Radius | 8 controls / 16 cards / 24 features / pill chips | same scale already — keep |
| Elevation | tonal steps + warm ambient shadow only | layered dark cards — restyle |

Shape language, chip anatomy, and spacing rhythm transfer almost 1:1; color
and type are the port.

## Mockup → app mapping

| Mockup | Our surface | Fit |
|---|---|---|
| Landing Page | None (new) | Pitch/advocacy page: hero, guardrails, 30-sec story, impact stats, CTA, footer |
| Drug Verification | Verify tab | Sample-pack cards with statuses, verdict banner, 4 packaging checks, decision notice, custody journey, care guide, receipt actions |
| Household Cabinet | My medicines tab | Member sections, weekly adherence strip, dose logging, refill warning, first-aid card |
| Clinic Stock | Stock & forecast tab | Facility cards, depletion donut, per-facility bars, medicine runout table with recommendations, transfer console, dispatch feed |
| Safety Map | Hotspots tab | KPI cards, territory map with corridors, surveillance stream, report button, corridor notice |
| AI Assistant (Clinical AI Guide) | AI assistant tab | Context cards, quick prompts, chat, consultation history, suggested inquiries, decision-support standard |

## Honesty flags (must fix before any demo of the new skin)

The mockups assert integrations we do not have, in copy that looks official:
"Verified against NAFDAC Safety Registry", "National Registry Connected",
"NAFDAC Green Book Registry" links, toll-free `0800-NAFDAC-VERIFY`, "Federal
Ministry of Health" alignment. Per the pitch's honesty rule these ship only
as clearly-labelled demo placeholders (e.g. "Demo registry — not connected
to NAFDAC") or they do not ship. Same for every statistic (48,000+ packs,
1,420 clinics) and testimonial — all fictional until real.

## Feature gaps the mockups reveal (future work, not committed)

Adherence taken-logging, refill request flow, inter-facility transfer
console, report-to-regulator flow, landing page, consultation history,
export/report dossier, translations. Log as candidate MEs; the current engine
already supports the data behind most of them.

## Port order (mechanical, after Evans' backend lands)

Shell + tokens → Verify → Cabinet → Stock → Map → AI → Landing (new).
Each port keeps every behavior and copy contract, changes only the visual
system. Gate each with the existing suites (they assert behavior, not
pixels) plus one screenshot review.
