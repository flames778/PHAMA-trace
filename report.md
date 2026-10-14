# PharmaTrace — Data Sources & Techniques Research Report

## Executive summary

This report identifies the open / freely-available data that can populate PharmaTrace's registry
and the techniques for **tracking** and **reporting** medicines. Key takeaways:

- **Nigeria has a real, running traceability program to align with** — NAFDAC's Traceability
  Information System (TIS) + Scan2Verify app, built on GS1 standards, with phased compliance
  dates through 2029. PharmaTrace's mock ledger/registry can credibly mirror this and describe
  how a real integration would plug in, rather than claiming an integration that doesn't exist.
- **Three classes of open data cover "matching & verification"**: (1) national registered-product
  lists (NAFDAC Greenbook), (2) global identifier/barcode truth (GS1 Verified by GS1), and
  (3) rich product master data (WHO prequalification list, openFDA/Drugs@FDA/NDC, RxNorm, DailyMed,
  DrugBank). None is a turnkey API for Nigeria — the Greenbook is a web GUI, so a mock is still
  warranted, but the data and the integration shape are real.
- **Track**: GS1 DataMatrix (GTIN + lot/batch + expiry + serial), EPCIS event sharing, serialisation-
  at-point-of-dispense (EU FMD, US DSCSA), optional blockchain (MediLedger) for tamper-evidence.
- **Report**: WHO GSMS Medical Product Alerts, WHO Rapid Alert System, VigiBase pharmacovigilance,
  and Nigeria's MedSafety App + sf.alert@nafdac.gov.ng. An algorithm from VigiBase reporting
  patterns can flag substandard products — directly relevant to the hotspot feature.
- **Predict**: no open, national Nigerian shortage feed exists, but methodology (WHO/HAI surveys)
  and regional datasets (openFDA drug/shortages, EMA shortages catalogue) provide grounding; the
  system must stand up its own data via its stock logger.

Openness caveat: most regulator data is published via web GUIs, not open APIs, and some (VigiBase,
Raw GS1 lookup) are license-restricted or rate-limited. All of it can be referenced as the "how a
real connection would work" layer behind a clearly-labeled mock registry.

---

## Theme 1 — Open / available data to populate the registry (matching & verification)

### Nigeria national product registry
- **NAFDAC Greenbook** (`greenbook.nafdac.gov.ng`, also `nafdac.emdex.ng`) — Nigeria's official,
  publicly-searchable database of registered products. ~6,432+ registered pharmaceutical products.
  Fields per record: product name, active ingredients, NAFDAC Reg. No. (NRN), applicant name,
  approval date, product category (+ category ID), synonym, form, route of administration, strengths,
  status. Includes ATC classification, active-ingredient index, applicants and manufacturers listings.
  Downloadable as an app and via a "Download NAFDAC Greenbook" resource page. **This is the closest
  thing to a national registry PharmaTrace would match against.** Caveat: it is a web GUI, not a
  documented public API.
- **NAFDAC NAPAMS** (`registration.nafdac.gov.ng`) — official public "Verify your product by NAFDAC
  number" portal (drugs, water, veterinary, food). Useful as the authoritative verification endpoint.
- **NAFDAC Public Alerts / Recalls & Safety Alerts / Blacklist of Companies / Market Authorization
  Withdrawals** (`nafdac.gov.ng`) — structured, batch-level data on **confirmed** falsified and
  substandard products. Real examples: Cikatem (Artemether/Lumefantrine) suspension bearing a
  falsified NRN A11-100025; counterfeit Tecentriq injection batch B0033B03; falsified Augmentin 625mg
  batch AC3N. Each such alert is uploaded to the WHO Global Surveillance & Monitoring System (GSMS).
  These are ideal seed data for the "suspicious/confirmed" side of a registry.

### Global identifier / barcode truth
- **GS1 Verified by GS1** — look up and verify any GS1 identifier: GTIN, UPC, EAN, GLN, SSCC.
  Answers "is this code properly structured, issued by GS1, and licensed to a real company?" Used by
  regulators and industry. Free limited lookups; API access requires GS1 member subscription.
- **GS1 GTIN Check API / GS1 Database (GEPIR)** — verify GTIN integrity and company-prefix ownership
  (GS1 US: ~30 free searches/day; unlimited via paid Data Hub).
- This is the layer that catches **copied/never-issued codes** even before registry lookup — directly
  supporting the pitch's "a code alone can be copied" concern.

### Rich product master data (for matching + the "what is this medicine for" content)
- **WHO Prequalification list** — ~655 finished pharmaceutical products, available as a **downloadable
  CSV**. Fields: reference number, INN + dosage + strength, product type, therapeutic area, applicant,
  dosage form, basis of listing (Full / Abridged / Alternative), date of prequalification. Strong
  quality signal for the essential medicines PharmaTrace targets (antimalarials, antibiotics, TB,
  HIV). Public domain.
- **openFDA** (US FDA) — free API + downloadable datasets in **public domain / CC0** export. Relevant
  endpoints: `drug/ndc` (National Drug Code Directory, updated daily), `drug/label`, `drug/drugshortages`,
  and **Drugs@FDA** (approved products since 1939, downloadable, incl. labels/approval letters). NDC maps
  product code → labeler (manufacturer), active ingredients, dosage form. Caveat: not validated for
  clinical use; US-centric; good as a broad product master, not a Nigerian authenticity source.
- **RxNorm / RxNav / DailyMed** (US National Library of Medicine) — free, normalized drug terminology.
  RxNorm API (`getNDCs`, `getNDCProperties`) links brand/generic names to NDC codes, dosage forms,
  packaging data, and imagery via DailyMed (Structured Product Labels). ODbl-licensed. Great for
  standardizing names and for pill/packaging reference images.
- **DrugBank** — comprehensive drug database incl. indications, interactions, dosing; API available
  (free academic, paid commercial). Strong source for the plain-language "what it is for / how to take"
  educational content PharmaTrace already displays.

### Community / derived API availability (honest caveat)
- **lodum-AI/nafdac-api (GitHub)** — open-source project that automates NAFDAC's public verification
  page into a JSON HTTP API (with cache, auth, Telegram bot). Demonstrates that the Greenbook/NAPAMS
  data is real but not officially exposed as an API — hence the need for a scrape layer or an official
  data-sharing agreement.
- **VerifyProduct.ng** — a consumer product-verification site that searches NAFDAC registration numbers
  (self-described as organizing publicly available info, independent of NAFDAC). Shows the consumer
  use-case is already being chased.

---

## Theme 2 — Techniques for TRACKING medicines (chain of custody / anti-counterfeit)

### The GS1 standards stack (the de-facto global baseline)
- **Identification keys**: GTIN (product), GLN (location), SSCC (logistic unit).
- **Encoding**: **GS1 DataMatrix** 2D barcode that packs GTIN + batch/lot + expiry + unique serial —
  readable omni-directionally; GS1-128 for linear. Europe's eTACT uses GTIN + EPCIS.
- **Data sharing**: **EPCIS** (Electronic Product Code Information Services) — ISO/GS1 standard that
  captures and exchanges supply-chain event data (ship, receive, dispense) between partners near
  real-time. Backbone of DSCSA chain-of-custody implementation. **GS1 Digital Link** encodes identifiers
  as URLs (`.../gtin/…/lot/…/ser/…?exp=…`), enabling web lookup. **GDSN** syncs master product data.
- **GS1 Lightweight Verification Messaging Standard** — a query/response protocol for verifying product
  identifiers, designed for pharmaceuticals. Model for the "scan → query registry → verdict" flow.
- **GS1 Traceability Standard (GTS)** and e-pedigree define full trace & recall records.

### Serialisation-at-point-of-dispense (regulatory patterns to mirror)
- **EU Falsified Medicines Directive (FMD, 2019)** and **US DSCSA (2023)** both require **pack-level
  serialization** and **scanning at the point of dispense** to verify and decommission each pack.
- These are the authoritative real-world blueprints for PharmaTrace's "verify then log custody" loop.

### Blockchain / deterrence layer (optional, for tamper-evidence)
- **MediLedger DSCSA pilot** (FDA) and a PMC review of "Blockchain technology in the pharmaceutical
  industry" document using permissioned DLT + EPCIS for tamper-evident traceability.
- PharmaTrace already implements a **hash-chained custody ledger** (`ledger.ts`), which is the right
  shape: EPCIS-style event records chained for tamper-evidence, interoperable in spirit with GS1.

### Nigeria's real traceability program (the credibility goldmine)
- **Nigeria National Pharmaceutical Traceability Strategy** (FMOH + NAFDAC, 2019) — five-year roadmap
  built on GS1 standards.
- **NAFDAC Pharmaceutical Products Traceability Regulation (Oct 2024)** — legal framework; **MoU with
  GS1 Nigeria** (77 Awolowo Way, Ikeja, Lagos) for training (e.g., trained Juhel Nigeria).
- **Operational backbone**: NAFDAC **Traceability Information System (TIS)** + **Scan2Verify** mobile
  app — health workers scan GS1 2D DataMatrix codes, verify against the Greenbook, and capture custody
  changes in real time.
- **Phased compliance dates**: 1 Jan 2027 narcotics/controlled substances; 1 Jan 2028 MNCH products
  incl. **all antibiotics and antimalarials**; 1 Jan 2029 all finished pharmaceuticals. (Antibiotics
  and antimalarials are exactly PharmaTrace's demo categories — strong alignment.)
- **Proven results**: COVID-19 vaccine pilot (Mar 2021–Jun 2022) commissioned 1M+ packs across 358
  locations — the **first serialised vaccine scanners in Africa** (with Rwanda), via the **TRVST**
  (Traceability & Verification System) global repository under the **Verification & Traceability
  Initiative (VTI)** (UNICEF, Gavi, Gates Foundation, Global Fund, USAID, WHO). GS1 Nigeria reports
  NAFDAC located **100% of recalled COVID-19 vaccines within 1 hour** using GS1 standards (Feb 2026).
  The MNCH+N pilot began 2025.
- **English**: This means PharmaTrace's mock registry can be framed honestly as: *"We mirror the
  fields of NAFDAC's Greenbook and the GS1/EPCIS custody-event model; a production deployment would
  read from the Greenbook / TIS and write custody events compatible with EPCIS and the GS1 lightweight
  verification protocol."*

---

## Theme 3 — Techniques for REPORTING medicines (pharmacovigilance, falsified reports, hotspots)

### Falsified / substandard reporting (global)
- **WHO Global Surveillance & Monitoring System (GSMS) for substandard and falsified (SF) medical
  products** — receives national reports and issues **Medical Product Alerts** (e.g., Alert N°1/2026
  on substandard contrast media; N°3/2026 falsified Darzalex; N°1/2025 falsified OxyContin) identifying
  specific products, batches, and visual discrepancies. Reporting email: `rapidalert@who.int`.
  GSMS activity report (Aug 2017–Dec 2021): **877 incidents**, average +36.3%/year.
- **WHO Rapid Alert System (RAS)** — the mechanism National Regulatory Authorities (incl. NAFDAC) use
  to nominate SF products. NAFDAC explicitly adopts RAS and uploads each Public Alert to the GSMS.

### Pharmacovigilance (adverse-event reporting)
- **VigiBase** — WHO/UMC global database of adverse-event reports for medicines & vaccines (40M+
  reports, 160+ countries, coded in WHODrug + MedDRA). **Data access is license-restricted** (aggregate
  only, per the Caveat Document; no case-level redistribution).
- **Relevant technique**: Juhlin et al. (2015), *"Using VigiBase to Identify Substandard Medicines"* —
  an algorithm that flags reporting patterns suggestive of substandard products in spontaneous
  reporting. This is a real, citable signal-detection approach directly analogous to PharmaTrace's
  "suspicious scans accumulate into hotspots."

### Nigeria national reporting channels (the integration target)
- **Med Safety App / Med Safety platform** (`nafdac.medsafety.io`) — NAFDAC's official, WHO-backed app
  (Android/iOS + web) for reporting **adverse drug reactions** and **substandard/falsified products**,
  with photo upload, watchlists, and offline reports. NAFDAC launched an improved version (May 2026) to
  strengthen SF reporting.
- Other channels: `sf.alert@nafdac.gov.ng`, `pharmacovigilance@nafdac.gov.ng`, phone 0800-162-3322 /
  0800-1-NAFDAC, NAFDAC e-reporting platforms, and Public Alert Notices (`nafdac.gov.ng/safety-alerts`).
- **Positioning**: PharmaTrace's "Report" feature is credible as **decision support** that compiles a
  location-aware hotspot and **escalates to** these official channels — not as a substitute for NAFDAC.

---

## Theme 4 — Data & methods for PREDICTING shortages / stockouts

### Established measurement methodology
- **WHO / Health Action International (HAI) standardized method** for measuring medicine availability,
  prices, and affordability in facilities — the field standard PharmaTrace's stockout logic can mirror.

### Nigeria-specific surveys (mostly one-off studies, not live feeds)
- **Abuja medicines availability/price study** (PLOS ONE, 2021) — 49 CVD/diabetes/global medicines;
  mean availability ≈ **69.1% private, 60% public hospitals, 44.2% private hospitals** for the 37 EML
  medicines surveyed. Full dataset deposited on **Dryad (DOI: 10.5061/dryad.vhhmgqntn)**.
- **Essential (maternal/RH) medicines availability** (Int'l J Health & Allied Sciences, 2019) — overall
  mean availability **58.8%**, with stark regional/urban-rural gaps (many lifesaving drugs <25%).
- **ACTwatch supply-chain surveys** (LSHTM/SFH, 2009–12) — antimalarial wholesaler availability, prices,
  and mark-ups in Nigeria.
- **MSF MDR-TB PSM study** (PLOS ONE, 2015) — Nigeria's WHO-based **early-warning indicators** for drug
  stockout/overstock (e.g., % of quantity used vs available; % of sites receiving full/on-time orders).
  This is the quantitative "predict shortage" template.

### Public shortage feeds (US & EU — useful as reference signals/architecture)
- **openFDA `drug/drugshortages`** — downloadable dataset (CC0, ~0.4 MB, updated ~weekly) of current and
  resolved shortages reported by manufacturers.
- **EMA shortages catalogue** + **European Shortages Monitoring Platform** — ongoing/resolved shortages,
  downloadable tables and JSON; plus national shortage registers across EU states. **Open-EMA** provides
  a public explorer/API.
- **Honest caveat**: there is **no open, national, real-time shortage feed for Nigeria**. PharmaTrace
  therefore must generate its own shortage signal from the supply-chain data it logs (its `StockLogger` /
  `ForecastPanel`) — which is exactly what the app already does — and can optionally blend WHO/HAI-derived
  availability baselines and reference the method above.

### Complementary open geospatial/analytics data
- **openAFRICA (Code for Africa)** — Nigeria datasets incl. **Nigerian Pharmacy Stores GeoJSON**
  (eHealth Africa), NBS health/spend datasets. Useful for seeding a facility/geography layer for the
  hotspot map.
- **DrugStoc** (Lagos, Series A, 2015–) — a Nigerian healthtech doing pharmacy B2B e-commerce and
  supply-chain software. Signals both the market and a potential partner/competitive frame.

---

## Practical recommendations for PharmaTrace

1. **Registry (match & verify)** — Build the production story on, in order of authority:
   (a) **NAFDAC Greenbook** fields as the canonical "registered product" table; (b) **GS1 Verified by
   GS1** to validate that a scanned code is a real issued identifier; (c) **WHO prequalification +
   openFDA/Drugs@FDA + RxNorm** for rich product/master data and the plain-language medicine content;
   (d) NAFDAC **Public Alerts** as the "confirmed bad" list. Keep the demo on the mock registry but
   document exactly which of these a live connection would consume, since none is an open, official API
   today.
2. **Track** — Model the custody ledger on **GS1 DataMatrix fields (GTIN · lot · expiry · serial)** and
   **EPCIS-style events**, and cite the **NAFDAC TIS / Scan2Verify** program and phased compliance dates
   (2027–2029) as the alignment target. The existing hash-chained ledger already matches this shape.
3. **Report** — Position the hotspot feature as decision support ascending to official channels:
   **Med Safety app** and `sf.alert@nafdac.gov.ng`, and reference the **WHO GSMS Medical Product Alert**
   pattern and the **VigiBase substandard-detection** approach.
4. **Predict** — Keep generating shortage signals from logged supply-chain data; adopt WHO/HAI-style
   availability measurement; reference (don't depend on) openFDA/EU shortage feeds as evidence that
   shortage reporting is a recognized category.
5. **Be honest** (per the pitch): the registry stays a labeled mock; describe, don't claim, regulator
   and GS1 connections; present all outputs as decision support, not medical or legal proof.

---

## Sources

**Nigeria / NAFDAC**
- NAFDAC Greenbook search: https://greenbook.nafdac.gov.ng/ and https://nafdac.emdex.ng/
- Download NAFDAC Greenbook: https://nafdac.gov.ng/regulatory-resources/download-nafdac-greenbook/
- NAFDAC unveils Greenbook (6,432 products): https://govserv.ng/nafdac-unveiled-registered-drugs-database
- NAFDAC NAPAMS: https://registration.nafdac.gov.ng/
- NAFDAC Pharmaceutical Traceability: https://nafdac.gov.ng/traceability
- NAFDAC traceability explainer: https://nafdac.gov.ng/nafdac-traceability-find-out-all-you-need-to-know-here/
- NAFDAC Med Safety App announcement: https://nafdac.gov.ng/nafdac-introduces-improved-med-safety-app-for-reporting-substandard-and-falsified-medical-products
- NAFDAC Med Safety Platform: https://nafdac.medsafety.io/
- Public Alert (falsified Cikatem): https://nafdac.gov.ng/public-alert-no-05-2025-alert-on-the-circulation-of-falsified-cikatem-artemether-180mg-lumefantrine-1080mg-with-falsified-nafdac-registration-number-nrn-a11-100025
- Public Alert (counterfeit Tecentriq): https://nafdac.gov.ng/public-alert-no-029-2024-alert-on-confirmed-counterfeit-of-tecentriq-injection-in-nigeria
- Fake Augmentin (The Sun): https://thesun.ng/fake-augmentin-625mg-tablets-circulating-in-nigeria-nafdac
- Curbing SF medicines (NAFDAC, RAS/GSMS): https://nafdac.gov.ng/curbing-substandard-falsified-sfs-and-counterfeit-medicines
- lodum-AI/nafdac-api: https://github.com/lodum-AI/nafdac-api
- VerifyProduct.ng: https://verifyproducts.ng/
- GS1 Nigeria: https://www.gs1ng.org/ and https://gs1ng.org/2026/08/24/pharmaceutical-traceability

**GS1 / identifiers / track & trace**
- GS1 Verified by GS1: https://www2.gs1.org/services/verified-by-gs1
- GS1 GTIN Check API: https://www.gs1uk.org/standards-services/data-services/gtin-check-api
- GS1 Database (GEPIR): https://www.gs1us.org/tools/gs1-company-database-gepir
- GS1 DataMatrix (healthcare): https://www.gs1.org/docs/healthcare/MC07_GS1_Datamatrix.pdf
- GS1 Lightweight Verification Messaging Standard: https://www.gs1.org/docs/epc/GS1_Lightweight_Verification_Messaging_Standard.pdf
- GS1 Digital Link: https://www.gs1.org/standards/gs1-digital-link
- DSCSA traceability pilot (J&J/AmerisourceBergen) with EPCIS: https://www.gs1.org/system/files/gs1_healthcare_reference_book_2017-18-us-piloting-traceability-of-prescription-drugs-with-gs1-standards.pdf
- GS1 US chain-of-custody guideline (EPCIS): https://www.gs1us.org/industries-and-insights/media-center/press-releases/new-gs1-us-implementation-guideline-helps-pharmaceutical-industry-capture-and-share-chain-of-custody-data
- GS1 UK — first serialised vaccine scanned in Africa (TRVST/VTI): https://www.gs1uk.org/insights/news/first-serialised-vaccine-scanned-in-Africa
- MediLedger DSCSA pilot (FDA): https://www.fda.gov/media/168283/download
- Blockchain in pharma (PMC review): https://pmc.ncbi.nlm.nih.gov/articles/PMC9137953

**Global product data**
- WHO Prequalification — finished medicines list (CSV download): https://extranet.who.int/prequal/medicines/prequalified/finished-pharmaceutical-products
- openFDA API: https://open.fda.gov/apis/ and Drug NDC: https://open.fda.gov/apis/drug/ndc
- openFDA Drug Shortages: https://open.fda.gov/data/drugshortages
- RxNorm/RxNav API: https://mor.nlm.nih.gov/RxNav/ and https://www.nlm.nih.gov/research/umls/rxnorm/
- DrugBank API: https://docs.drugbank.com/v1

**Reporting / pharmacovigilance**
- WHO GSMS activity report 2017–2021: https://www.who.int/publications/i/item/9789240097513
- WHO GSMS & Medical Product Alerts: https://www.who.int/health-topics/substandard-and-falsified-medical-products
  - Alert N°1/2026: https://cdn.who.int/media/docs/default-source/substandard-and-falsified/n1_2026_contrast-media_en.pdf
  - Alert N°3/2026 (Darzalex): https://cdn.who.int/media/docs/default-source/substandard-and-falsified/n3_2026_darzalex_en.pdf
  - Alert N°1/2025 (OxyContin): https://cdn.who.int/media/docs/default-source/substandard-and-falsified/n1_2025_oxycontin_en.pdf
- VigiBase caveat document: https://who-umc.org/media/yzpnzmdv/umc_caveat.pdf
- Using VigiBase to Identify Substandard Medicines (Juhlin 2015): https://pmc.ncbi.nlm.nih.gov/articles/PMC4544545
- WHO pharmacovigilance overview: https://who.int/tools/monitoring-and-evaluation/surveillance

**Shortages / availability**
- EMA medicine shortages & downloads: https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/medicine-shortages-availability-issues
- Open-EMA shortage explorer: https://www.open-ema.org/ui/medicine-shortages
- Abuja availability/prices study (PLOS ONE, Dryad): https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0255567
- Essential medicines availability (maternal/RH, Nigeria): https://www.ovid.com/jnls/jhas/fulltext/10.55691/2278-344x.1053~availability-of-essential-medicines-in-healthcare-facilities
- MSF MDR-TB PSM early-warning indicators (Nigeria): https://scienceportal.msf.org/api/pdf-proxy?t=_R_4ld5fiv5ubsdb_&url=https%3A%2F%2Fapi.scienceportal.msf.org%2Fapi%2Fv1%2Fblobs%2F10344
- ACTwatch Nigeria supply-chain survey: https://researchonline.lshtm.ac.uk/id/eprint/2869486/1/SC%20Nigeria_20120215%20FINAL.pdf
- Nigerian Pharmacy Stores (GeoJSON, eHealth Africa/openAFRICA): https://open.africa/dataset/nigerian-pharmacy-stores1

*Compiled with an in-session deep-research loop (breadth 4, depth 3). Web-search results were condensed;
facts reflect what search snippets reported as of the research date and should be verified before
production use.*
