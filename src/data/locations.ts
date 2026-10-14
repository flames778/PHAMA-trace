import type { Location } from "../types";

/**
 * MOCK REGISTRY — locations
 * -------------------------
 * Coordinates are real city/LGA centroids so the hotspot map is geographically
 * plausible. The facility names are fictional.
 *
 * Each site stands in for a GS1 Global Location Number (GLN): manufacturer,
 * distributor, pharmacy and regulator roles with a fixed identity, which is
 * what custody events and the route-plausibility check anchor to.
 */
export const LOCATIONS: Location[] = [
  { id: "loc-mfg-kano", name: "Kano BioPharm Ltd (plant)", kind: "manufacturer", lat: 12.0022, lng: 8.592, lga: "Nassarawa", state: "Kano" },
  { id: "loc-mfg-lagos", name: "Lagos Therapeutics Plc (plant)", kind: "manufacturer", lat: 6.4478, lng: 3.2631, lga: "Ojo", state: "Lagos" },
  { id: "loc-mfg-nile", name: "Nile Chemicals Ltd (plant)", kind: "manufacturer", lat: 9.0579, lng: 7.4951, lga: "Chikun", state: "Kaduna" },
  { id: "loc-mfg-delta", name: "Delta Health Products (plant)", kind: "manufacturer", lat: 5.5145, lng: 5.8039, lga: "Uvwie", state: "Delta" },

  { id: "loc-dist-kaduna", name: "Northgate Drug Distributors", kind: "distributor", lat: 10.5222, lng: 7.4384, lga: "Kaduna North", state: "Kaduna" },
  { id: "loc-dist-marina", name: "Marina Health Logistics", kind: "distributor", lat: 6.4541, lng: 3.3947, lga: "Lagos Island", state: "Lagos" },
  { id: "loc-dist-phc", name: "Delta Pharma Distribution", kind: "distributor", lat: 4.8242, lng: 7.0498, lga: "Port Harcourt", state: "Rivers" },
  { id: "loc-dist-abuja", name: "Unity Medical Wholesale", kind: "distributor", lat: 9.0765, lng: 7.3986, lga: "Abuja Municipal", state: "FCT" },

  { id: "loc-reg-sw", name: "Regulator Desk — South-West (demo)", kind: "regulator", lat: 6.6018, lng: 3.3515, lga: "Ikeja", state: "Lagos" },

  { id: "loc-ph-ikeja", name: "Adeniyi Jones Pharmacy", kind: "pharmacy", lat: 6.6143, lng: 3.3485, lga: "Ikeja", state: "Lagos" },
  { id: "loc-ph-surulere", name: "Surulere Community Pharmacy", kind: "pharmacy", lat: 6.4969, lng: 3.3481, lga: "Surulere", state: "Lagos" },
  { id: "loc-ph-yaba", name: "Yaba Primary Care Pharmacy", kind: "pharmacy", lat: 6.5158, lng: 3.3898, lga: "Yaba", state: "Lagos" },
  { id: "loc-ph-dala", name: "Dala Road Pharmacy", kind: "pharmacy", lat: 12.005, lng: 8.52, lga: "Dala", state: "Kano" },
  { id: "loc-ph-nassarawa", name: "Nassarawa Wellness Chemist", kind: "pharmacy", lat: 12.008, lng: 8.598, lga: "Nassarawa", state: "Kano" },
  { id: "loc-ph-rumuola", name: "Rumuola Drug Mart", kind: "pharmacy", lat: 4.8156, lng: 7.03, lga: "Port Harcourt", state: "Rivers" },
  { id: "loc-ph-ogbete", name: "Ogbete Main Pharmacy", kind: "pharmacy", lat: 6.4433, lng: 7.543, lga: "Enugu North", state: "Enugu" },
  { id: "loc-ph-barnawa", name: "Barnawa Pharmacy", kind: "pharmacy", lat: 10.472, lng: 7.438, lga: "Kaduna South", state: "Kaduna" },
  { id: "loc-ph-bodija", name: "Bodija Health Pharmacy", kind: "pharmacy", lat: 7.436, lng: 3.912, lga: "Ibadan North", state: "Oyo" },
  { id: "loc-ph-shehu", name: "Shehu Road Chemist", kind: "pharmacy", lat: 11.84, lng: 13.16, lga: "Maiduguri", state: "Borno" },
  { id: "loc-ph-ringroad", name: "Ring Road Pharmacy", kind: "pharmacy", lat: 6.335, lng: 5.62, lga: "Oredo", state: "Edo" },
  { id: "loc-ph-aba", name: "Aba Road Drug Store", kind: "pharmacy", lat: 5.12, lng: 7.33, lga: "Aba North", state: "Abia" },
  { id: "loc-ph-kware", name: "Kware Road Pharmacy", kind: "pharmacy", lat: 13.062, lng: 5.24, lga: "Sokoto North", state: "Sokoto" },
  { id: "loc-ph-jos", name: "Ahmadu Bello Way Pharmacy", kind: "pharmacy", lat: 9.93, lng: 8.89, lga: "Jos North", state: "Plateau" },
  { id: "loc-ph-marian", name: "Marian Road Pharmacy", kind: "pharmacy", lat: 4.82, lng: 8.33, lga: "Calabar South", state: "Cross River" },
  { id: "loc-ph-highlevel", name: "High Level Pharmacy", kind: "pharmacy", lat: 7.74, lng: 8.54, lga: "Makurdi", state: "Benue" },
];

export const locationById = new Map(LOCATIONS.map((l) => [l.id, l]));
export const PHARMACIES = LOCATIONS.filter((l) => l.kind === "pharmacy");
export const DISTRIBUTORS = LOCATIONS.filter((l) => l.kind === "distributor");
