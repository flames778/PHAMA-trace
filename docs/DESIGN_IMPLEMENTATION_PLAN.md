# Design Implementation Plan — Warm Editorial Humanist + Header/Nav Rebuild

Companion docs: `docs/DESIGN_ADOPTION.md` (what the references are),
`references/*/DESIGN.md` (token source of truth — identical in all six).
This plan says how the reference system bends to fit OUR text, OUR features,
and OUR honesty rules. No code changes in this pass; this is the build brief.

## 0. Direction check (brief wins, defaults lose)

The brief pins the look: warm paper, terracotta red, serif display. That
combination is also the most common AI-generated default in existence, so
distinctiveness has to come from everywhere else. Our point of view, stated
once and enforced everywhere below: **an apothecary ledger, not a SaaS
dashboard.** Dossier language (manifests, seals, receipts, gazettes over
dashboards, widgets, insights), stamp/seal treatments for verdicts, a
parchment-spine custody timeline, tabular numerals everywhere a count
appears. Nigerian pharmacy vernacular — waybill typography, rubber-stamp
verdicts, market-sign directness — not Silicon Valley chrome. One memorable
thing per screen, everything else quiet.

## 1. Token plan (brief core palette, 6 named values + roles)

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `#fff8f6` | canvas, never pure white |
| `--color-ink` | `#292524` | primary text |
| `--color-terra` | `#b44b2a` | primary actions, active states ONLY |
| `--color-terra-deep` | `#943414` | text/links on paper (AA-safe) |
| `--color-sage` | `#405b4d` | genuine/ok/health |
| `--color-error` | `#ba1a1a` | suspicious/danger text + fills |

Supporting (from DESIGN.md, adopt verbatim): container tiers
`#fbf2f0 → #f5ecea → #efe6e4`, lines `#e4dfd5/#d7d1c5`, umber `#8a7058`
metadata, amber wash `#fbf3ea`, sage wash `#edf3ee`, error wash `#ffdad6`.
Radius/implacement rhythm: 8 controls, 16 cards, 24 features, pill chips.
Type: Bricolage Grotesque (display voice only, ≥20px, optical sizing on) +
Plus Jakarta Sans (UI) + keep the existing mono stack for codes/hashes.
Decision 2026-10-15: Bricolage replaces Newsreader as the display face —
same warmth, far more distinctive, and it retires the generic-serif risk.
Loaded via Google Fonts CDN link tags (variable opsz 12..96 + wght
200..800); Jakarta 400–700 alongside it. Icons migrate from emoji to Material
Symbols Outlined (one icon language; emoji reads as toy next to Newsreader).

Rule: red ink (`terra-deep`) may carry links and warnings; red FILL
(`terra`) means primary action or danger state. Nothing decorative borrows
either. Success green keeps its job (genuine/ok); amber keeps caution.

## 2. The header + navbar rebuild (centerpiece)

Current state: a dark bar with a "PT" tile, name, tagline, mode badge, and a
plain underline tab strip. Serviceable, forgettable, and (post reskin) the
only dark surface left — hence the rebuild, not a repaint.

### Desktop header (three bands, top to bottom)

```
┌──────────────────────────────────────────────────────────────┐
│ strip: ● Demo environment — bundled registry, no regulator   │  11px, umber on paper-dim
│        connection                                  FMOH · PCN │  right: protocol line
├──────────────────────────────────────────────────────────────┤
│ (seal) PharmaTrace                        [mode badge] [user] │  seal 36px + Newsreader 22
│        VERIFY · TRACK · PREDICT · REPORT                      │  11px letterspaced descriptor
├──────────────────────────────────────────────────────────────┤
│ ( Verify )  Stock & forecast   Hotspots   Registry   My…  AI  │  pill nav, active = terra fill
└──────────────────────────────────────────────────────────────┘
```

- **Utility strip (new).** The honesty rule made visible: environment +
  registry state in one line, always present. Replaces fine-print shame
  with upfront trust. Left: status dot + "Demo environment — bundled
  registry". Right, quiet: "FMOH · PCN protocol".
- **Brand band.** Seal mark: a drawn roundel evoking a regulator's guilloche
  seal — concentric geometry + "PT" monogram, terracotta line on paper.
  Explicitly NOT the NAFDAC logo or anything that could read as official.
  Wordmark in Bricolage semibold; descriptor in tracked-out 11px caps.
  Right cluster: mode badge (live = sage wash, local mock = bone, server =
  sky-neutral, degraded = amber wash + banner below) and a clinic/user chip
  (avatar roundel + name + site, from the mockups' Dr.-jump — ours shows
  scan location + role).
- **Tab nav.** Pill container on paper-dim; active tab = terracotta fill,
  pills: active tab = terra fill with white Jakarta 600 text; inactive tabs
  sit on the pill container in ink-soft text, brightening on hover.
  hover = container-high. Keyboard focus ring in terra-deep, never removed.
  Order and names unchanged (Verify · Stock & forecast · Hotspots ·
  Registry · My medicines · AI assistant) — mockup names (Household
  Cabinet, Clinic Stock…) do NOT replace ours; tabs stay task-named per
  our copy rules.

### Mobile header (<640px)

Brand band compresses to seal + wordmark + mode dot; tab bar becomes a
horizontally scrollable pill strip with edge fades (no hamburger — all six
tabs stay one tap away); utility strip collapses to the status dot + "Demo".
Degraded banner full-width under the strip.

### States

Mode badge has four visual states (live/local/server/degraded) + the
degraded banner slot beneath the header on every tab. Loading: skeleton
brand shimmer (respect reduced-motion → static skeleton). No-JS/backend
failure at boot keeps the current error card, restyled.

### Accessibility contract for the header

Terracotta `#b44b2a` fill carries white text (verify ratio ≥ 4.5 at ship;
fallback: deepen to `#943414`). Body links and active-pill text never sit
below AA. Focus-visible ring 2px terra-deep with 2px offset on all nav.

### Footer (built P0 — rich density, decision 2026-10-15)

Four columns on paper-dim, legal strip beneath, riding the same tokens:

1. **Brand column**: small seal + Bricolage wordmark, then the honesty
   paragraph ("fictional registry — nothing connected to NAFDAC"), so the
   disclaimers live in the chrome, not just on one tab.
2. **Regulatory portals**: real links only (NAFDAC Greenbook, NAFDAC HQ);
   PCN/FMOH listed as plain reference text, never fake links.
3. **Product column**: internal tab jumps (Check a pack, My medicines,
   Stock & forecast) — navigation, not decoration.
4. **Helpline box** (rose wash): "Suspect a fake?" → Hotspots tab direction
   + the real `sf.alert@nafdac.gov.ng` mailto. No invented phone numbers,
   ever.
5. **Legal strip**: © line, "Mock registry — all products fictional",
   "Decision support, not medical advice" right-aligned.

## 3. Fitting the system to OUR text and features

Mockup tabs ≠ our tabs. Mapping (ours win on names and copy):

| Mockup | Ours | Adjustments |
|---|---|---|
| Drug Verification | Verify | Use OUR packs/codes (Malafem NG-MF-26-0917…), OUR checks (clarity, palette, template, brand, seal, edge), OUR verdicts; keep their banner+checklist+journey composition |
| Household Cabinet | My medicines | Keep member chips, dose editor, next-dose line; CUT adherence log + refill request + first-aid card to future MEs (engine lacks them); keep weekly-strip idea as a Phase-2 sketch only |
| Clinic Stock | Stock & forecast | Keep band cards, runout table, sparkline, logger; CUT transfer console + dispatch feed to future MEs |
| Safety Map | Hotspots | Keep KPI cards, map, stream feed; map stays Leaflet (switch tiles to light `cavitodb light_all`); corridor styling via tile + marker tint, not custom geography |
| Clinical AI Guide | AI assistant | Keep context cards + quick prompts + counsel-toned answers; CUT consultation history + suggestions to later |
| Landing Page | New page | Build last (Phase 6); OUR stats only (76 shelves, real gate numbers) — never the mockup's invented figures |

Copy rule: OUR product names, OUR batch codes, OUR reason strings flow into
their compositions unchanged. Where mockup copy is better written (e.g.
their decision-support notice), steal the shape, keep our facts.

## 4. Component build list (shared, in this order)

1. Button (primary terra fill / secondary paper+line / tertiary underline),
   Badge/chip (verdict, band, stock — one anatomy, tone props).
2. Card tiers (paper-dim rest, white lift, wash alerts) + Banner (info /
   warn / danger with icon+word, never colour-alone).
3. Input/select/time/date + focus ring + labels above (their input spec).
4. Accordion (guide), Timeline (custody, parchment spine per DESIGN.md),
   Table (registry/stock, sticky head, horizontal scroll <640px).
5. Tabs (header pills), Stat card (KPI), Legend, Sparkline (restroke:
   observed ink, projected dashed terra; bands keep sage/amber/rose).
6. Chat bubbles (user terra fill right, counsel paper left), Empty-state
   block, Skeleton.

## 5. Font + icon loading

- Google Fonts CDN link tags in `index.html` (decision 2026-10-15 — the
  provided links, verbatim): Bricolage Grotesque variable (opsz 12..96,
  wght 200..800) + Plus Jakarta Sans 400–700, with preconnects. CDN over
  self-host because the demo always runs online; revisit fontsource if an
  offline-first build is ever needed.
- Bricolage is display-only (wordmark, headlines, verdict word, KPI
  numerals, seal monogram) with `font-optical-sizing: auto`; 20px minimum
  except the seal monogram drawn at its optical small size.
  Jakarta owns UI text; mono owns codes/hashes/dates. Never set body copy
  in Bricolage.
- Icons: inline SVG for the seal, pin, and status glyphs (offline-safe, no
  extra webfont this pass). Material Symbols migration deferred — emoji in
  MedicineGuide stays until the symbol pass, flagged, not forgotten.
- Anthropic note: their serif/sans pairing (Tiempos/Styrene school) is the
  reason this world feels "wholesome" — both are paid families, so we match
  the feeling with free faces (Bricolage ≈ characterful contemporary
  grotesque with optical sizing; Jakarta ≈ warm humanist sans) at zero
  licensing cost.

## 6. Pre-step (same pass, before any paint): honesty relabels

From `DESIGN_ADOPTION.md`: every fictional registry claim, hotline, stat,
and testimonial becomes a labelled demo placeholder or is cut. The reskin
must never launder mock authority into real-looking authority. Checklist
lives in the adoption doc; verify each ported screen against it.

## 7. Phased build (gates per phase)

- **P0 tokens + fonts + header/nav** (this plan §1–2, §5): @theme rewrite,
  fontsource wiring, icon swap, new shell. Gate: suites green + detector +
  screenshot review desktop/mobile + contrast spot-checks.
- **P1 Verify**: verdict banner, checklist cards, journey timeline,
  guide accordion, demo/play cards, scan states. Gate: pipeline 43/43 +
  screenshots of all four verdict states.
- **P2 Cabinet**: chips, cards, dose editor, banner. Gate: cabinet 20/20.
- **P3 Stock**: band cards, table, sparkline restroke, logger. Gate:
  pipeline forecast section.
- **P4 Map + Registry**: light tiles, markers, legend, feed; registry table
  + honesty card. Gate: visual review + source-check.
- **P5 AI + honesty sweep**: chat surfaces, key settings restyle, full
  relabel audit against §6.
- **P6 Landing page** (new route `/`, app moves to `/app`? or same-page
  hero — decide at P6 kickoff; default: same app, no new route until the
  pitch needs one).

Each phase: behavior contracts frozen (suites assert behavior, not pixels),
one screenshot round desktop+mobile, fix batch, confirm round, stop. No
open-ended polish loops.

## 8. Risks and explicit non-decisions

- Contrast on paper must be measured at ship (terra-on-white for large
  text, terra-deep for body links); fallback deepen rules in §2.
- Leaflet light tiles + our marker palette need a visibility pass (rose on
  pale tiles is fine; sage rings may need deepening).
- Newsreader below 20px is banned (legibility); numerals in tables stay
  tabular Jakarta/mono.
- Translations, dark-mode retention, and PWA are NOT in this plan. The dark
  theme is replaced, not kept alongside — one theme done well.
