# PharmaTrace Project Plan

Last updated: 2026-10-14
Owner message drafted for: Evans (backend) and [your name] (full stack)

---

## 1. What we are building

PharmaTrace is a demo app that verifies medicines, tracks them through the supply chain,
predicts shortages, and reports suspicious activity on a hotspot map. The app already runs
end to end on a bundled mock registry (see `src/data` and `src/lib`). The goal is to make it
feel and behave like a real product while staying honest that the data is a labeled mock.

Current stack on the frontend and types is fixed and should not churn. Backend work is the
active track right now.

## 2. Databases we are fetching from (research context)

None of the sources below is currently wired into the app. The app uses the bundled mock
registry. This section documents the real, available sources that a production version would
consume, so everyone on the team uses the same vocabulary.

| Source | What it provides | Access |
| --- | --- | --- |
| NAFDAC Greenbook (greenbook.nafdac.gov.ng) | Nigeria's official registered product list: product name, active ingredients, NAFDAC Reg. No., applicant, form, strengths, status. ~6,400+ pharma products. | Web GUI, no official public API. Integrations scrape it (e.g. github.com/lodum-AI/nafdac-api) or need a data sharing agreement. |
| NAFDAC Public Alerts / Recalls / Blacklist | Confirmed falsified/substandard products with batch numbers (e.g. falsified Cikatem, Tecentriq, Augmentin). Great seed for the "suspicious" side of the registry. | Public web pages, no API. |
| GS1 Verified by GS1 / GEPIR | Validates that a scanned code is a real GS1 issued identifier owned by a company. Catches copied or never-issued codes. | Free limited lookup, API is paid/member-only. |
| WHO prequalification list | ~655 finished medicines, downloadable CSV with strength, dosage form, therapeutic area, applicant, date. | Free CSV download, public domain. |
| openFDA / Drugs@FDA / NDC | US product master: labels, active ingredients, manufacturer, code. Public domain (CC0 export) and API. | Free API + downloads, public domain. |
| RxNorm / DailyMed (NLM) | Normalized drug names, brand/generic, dosage form, packaging imagery. | Free API + downloads, ODbl license. |
| DrugBank | Rich drug info for patient education: indications, dosing, interactions. | API free for academic, paid otherwise. |

Shortage and stockout data has no open Nigerian feed. We generate our own signal from the
stock logger. Ground truth method is WHO/HAI availability surveys.

## 3. Tracking techniques (what the plan assumes)

- GS1 DataMatrix encodes GTIN, batch/lot, expiry and a unique serial number per pack.
- EPCIS is the standard for sharing custody events (ship, receive, dispense) between partners.
- GS1 Lightweight Verification Messaging Standard is the query/response protocol for
  "is this pack real" checks.
- US DSCSA and EU FMD both require pack level serialization with a scan at point of dispense.
  Our scan + custody model mirrors that.
- Nigeria runs a real program: NAFDAC TIS + Scan2Verify on GS1, with phased compliance by
  2027 to 2029 (antibiotics and antimalarials by 2028). Our mock ledger uses the same shapes.
- Blockchain (MediLedger) is an optional tamper-evidence layer. Our hash-chained custody
  ledger already fits that idea without needing a chain.

## 4. Research results (what we learned)

From the deep research pass (breadth 4, depth 3), saved in report.md unless noted:

1. Verification data is real and rich, but no official API in Nigeria. Greenbook is the
   reference registry; GS1 validates code identity; WHO prequalification and openFDA/RxNorm
   fill in product details and plain language content.
2. Tracking is dominated by the GS1 stack (DataMatrix, EPCIS, Digital Link) and by
   serialization laws (EU FMD, US DSCSA). Nigeria has its own program with concrete dates.
3. Reporting has a global backbone (WHO GSMS Medical Product Alerts, Rapid Alert System,
   VigiBase) plus Nigeria's Med Safety app and sf.alert@nafdac.gov.ng. A VigiBase algorithm
   can flag substandard products from reporting patterns, relevant to our hotspot feature.
4. Prediction has no open Nigerian feed. Use WHO/HAI method and our own logged stock data.
   OpenFDA drug/shortages and EMA's catalogue are reference signals only.
5. Honesty rule from the pitch: keep the mock registry labeled, describe rather than claim
   regulator and GS1 connections, and frame every output as decision support.

## 5. Progress tracker

### Evans side (backend, updates on push, review, merge)

| Item | Status | Notes |
| --- | --- | --- |
| Supabase schema | Pending | Tables mirror src/types.ts |
| Seed data from mock src/data | Pending | Keep fictional brands |
| registry.ts against Supabase | Pending | Must match frontend contract |
| Custody ledger hashes | Pending | Unchanged rules from src/lib/ledger.ts |
| Scan persistence | Pending | Insert + refresh endpoint |
| Supabase env config | Pending | .env, README note |
| typecheck / selfcheck / pipeline pass | Pending | Gates |

### My side (full stack, updates on progress made)

| Item | Status | Notes |
| --- | --- | --- |
| Medicine package verifier UI | Done | Verify tab, VerdictPanel |
| My medicines feature | In progress | MedicineGuide + MyMedicines exist, polish next |
| Plain language data for all products | Done | src/data/products.ts |
| Hotspot map + scan feed | Done | Hotspots tab |
| Registry mode staging | Pending | Flip between mock and real source cleanly |

## 6. Path forward with my tasks and what we are doing now

Right now (this week):
- Evans builds the backend schema, seed, and verification data layer on Supabase.
- I polish save and update features on the frontend: MedicineGuide, MyMedicines tab, hotspots.

Immediate track:
1. I land the MyMedicines improvements (dose capture, household profile).
2. Evans seeds and wires registry objects to Supabase with hash ledger.
3. Merge: review and merge each of Evans' pushes into our shared branch before moving on.

This order is why:
- Backend registry is the spine. Everything else reads from it.
- Frontend features already exist on mock data, so nothing blocks.
- Priority sequence: verification first, then custody, then scan persistence, then coverage of
  shortage signals, then pairing with MyMedicines.

## 7. Owner message for Evans (the short version)

Full message is in my reply. Context: Evans owns backend. Tasks: Supabase schema and seed,
registry data layer, hash ledger, scan persistence, env config, gate passes like typecheck
and selfcheck. The registry contract in src/types.ts stays fixed.

---

## Sources
- report.md in this repo
- See report.md for full source list (WHO, NAFDAC, GS1, openFDA, RxNorm, EMA, openAFRICA)
