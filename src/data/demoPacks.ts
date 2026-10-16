export interface DemoPack {
  label: string;
  code: string;
  src: string;
  note: string;
  expected: "genuine" | "suspicious" | "unverifiable";
}

/**
 * The three sample packs that make the stage demo work. Each one is a
 * generated PNG in `public/packs` with a real Code 128 barcode, so the demo
 * exercises exactly the same code path as a phone photo would.
 *
 * Lives in `data/` (not in the Scanner component) so the app shell can
 * reference the demo flow without pulling the whole scanner — including the
 * barcode detector — into the initial bundle.
 */
export const DEMO_PACKS: DemoPack[] = [
  {
    label: "Genuine Malafem",
    code: "NG-MF-26-0917",
    src: "/packs/malafem-sample.png",
    note: "Registered batch, artwork matches.",
    expected: "genuine",
  },
  {
    label: "Counterfeit Malafem",
    code: "NG-MF-26-0917X",
    src: "/packs/malafem-counterfeit.png",
    note: "Serial one character off; seal redrawn; wrong ink.",
    expected: "suspicious",
  },
  {
    label: "Recalled Amoxaclear",
    code: "NG-AC-25-0442",
    src: "/packs/amoxaclear-recalled.png",
    note: "Registered, then withdrawn: sub-potent batch.",
    expected: "suspicious",
  },
];
