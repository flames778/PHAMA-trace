# Demo Runbook — the three-minute stage flow

Everything below was verified against the live Supabase project on 2026-10-18,
not against bundled data. Timings assume the app is already open and the first
tab load has happened (cold start on a conference wifi is the one thing that
can still bite you: give it a minute).

## Before you walk on

- `npm run verify:supabase` — if this is green, the demo will work. If it is
  red, **do not start**. It catches chain corruption, truncated reads and a
  dead backend in about eight seconds.
- `npm run dev`, open `localhost:5173`.
- **Check the badge in the header says "Supabase".** If it says "Local mock
  registry", the env did not load and you are demoing the bundled copy. The
  app will still work, but the custody numbers will be the mock ones.
- Put the browser window at roughly half the screen so the responsive layout
  is not accidentally the thing you are showing.

## The flow

### 1. Land (20s)

The landing page is the promise: *know your medicine is real*. One sentence,
three claims, no scrolling. Do not read it aloud. Point at "Check a pack".

### 2. The genuine pack (45s)

Press **Play the 30-second demo**, or click the **Genuine Malafem** card
directly if you want to skip the build-up.

The demo runs the whole chain on its own. What to say while it works:

> "It read the barcode off a photo, then compared the print against the
> registered artwork. Both, because a code on its own can be copied."

Expected on screen: **GENUINE, 98%**, and the reasons list ending with:

> *Ledger verifies across 257 hash-chained events. Last custodian: Marian
> Road Pharmacy on 2026-10-12.*

**That line is the whole pitch.** Stop and let it land. Every custody event
the manufacturer recorded is in a hash chain; change one character of one row
and every hash after it breaks. Say the number out loud: 257.

### 3. The counterfeit (45s)

The demo plays it next. Expected: **SUSPICIOUS**, and a headline that says
**do not dispense**. Three independent things failed: the serial is one
character off anything registered, the seal was redrawn, and the ink is wrong.

> "Three separate checks failed. A counterfeiter has to get all three right,
> and we only need one."

Then the packaging panel: capture quality, print clarity, colour palette,
artwork template. The palette number is the one that gets a reaction: the
ink distribution does not match the registered artwork.

### 4. The map (30s)

The demo opens the hotspot map itself. One pharmacy now sits in rose because
of the scan you just made. The scan feed underneath shows both scans with
timestamps.

> "The moment a pharmacy photographs a suspicious pack, it shows up here.
> That is the earliest a regulator can learn about a bad batch without
> waiting for a formal report."

### 5. Shortage forecast (30s) — optional, only if time allows

Go to **Stock & forecast**. Eleven shelves are emptying before their next
delivery. Ten are critical.

> "The same registry tells a pharmacy what is about to run out. This one has
> zero on hand and is serving fifty-one units a day."

Sort the table by days-to-stockout if the table is not already sorted.

### 6. The recall (20s) — only if a regulator is in the room

Registry tab, filter to **Recalled (1)**. Amoxaclear NG-AC-25-0442, recall
reason: *assay 61% of label claim on post-market sampling (spec: 90-110%)*.
That is a real regulatory scenario: not a fake, a **subpotent** one, which is
more dangerous because it looks fine.

---

## Questions you will get, and honest answers

**"Is this connected to NAFDAC?"**
No. Say so immediately and plainly. The registry is fictional, modelled on the
shape of the NAFDAC Greenbook, so the same tables could be filled by the real
feed later. Claiming a connection we do not have is the fastest way to lose a
regulator in the room.

**"Where does the data come from?"**
Hand-built mock in `src/data`, mirroring Greenbook fields, GS1 EPCIS business
steps and the WHO-GSMS flag set. Every product, batch and manufacturer is
fictional.

**"What happens if the network drops?"**
The app degrades to bundled data and *says so* in the header, rather than
showing an empty screen or pretending the data is live. That honesty badge is
deliberate.

**"Can someone edit a custody record?"**
Not through the database: the table is append-only by trigger, so UPDATE and
DELETE are rejected outright. What we have not done yet is stop a service-role
client from *inserting* a forged event. That is written up as the first item
in `HARDENING_ROADMAP.md`, and it is the right answer to give: you know your
own gap and you have written it down.

**"How good is the forecast?"**
A seasonal weighted average. Good enough to show the shape, not good enough to
stock to. Say that. The roadmap says to backtest it before anyone acts on it.

## Failure modes and what to do

| Symptom | Cause | Do |
| --- | --- | --- |
| Badge says "Local mock registry" | `.env.local` missing, or dev server started before it existed | Restart `npm run dev` |
| Custody line says fewer than 257 events | Wrong batch loaded | Re-run the demo from the Verify tab |
| Map tiles grey | No network to the tile server | The rest of the map still works; say "tiles are cached, the data is live" |
| Scan feels slow first time | Pack images decoding, lazy chunk loading | Scan the second one live; it is noticeably faster |
| Anything looks broken | — | Press **Skip to content** check, or just reload. Reload is safe. |

## What is deliberately not demoed

- **Transfers.** There is no push, no SMS, no regulator dashboard.
- **Auth.** Anyone can log a scan. That is on the roadmap, and it is the first
  thing to fix before a pilot.
- **Editing.** Nothing in this app edits the registry.
- **The real Greenbook.** No connection, see above.

## Accepted rough edges (do not be surprised)

- Leaflet's own zoom buttons and attribution links are under 44px. They are
  third-party chrome; we do not override them. Every control we wrote is 44px
  or larger on a phone.
- The map tiles are still the dark default set (P4 in the design plan).
- Chart-heavy panels lazy-load, so the very first visit to a tab can show a
  skeleton for a moment.