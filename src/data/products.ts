import type { Product } from "../types";

/**
 * MOCK REGISTRY — products
 * ------------------------
 * Brands and manufacturers below are fictional and exist only so the demo can
 * run end-to-end without anyone's real commercial data. Nothing here is
 * published by, endorsed by, or connected to NAFDAC or any manufacturer.
 */
export const PRODUCTS: Product[] = [
  {
    id: "prd-malafem",
    brandName: "Malafem 20/120",
    genericName: "Artemether + Lumefantrine",
    strength: "20mg / 120mg",
    form: "Dispersible tablets, 6-pack",
    manufacturer: "Kano BioPharm Ltd",
    category: "antimalarial",
    artworkRef: "/packs/refs/malafem.png",
    highRisk: true,
    whatItsFor:
      "This is a malaria medicine. It kills the malaria parasite in your blood. It is for treating malaria that has been diagnosed — it does not prevent malaria and it is not for fever from other causes like typhoid or a cold.",
    howToTake:
      "Take all 6 tablets over 3 days. Day 1: 2 tablets. Day 2: 2 tablets. Day 3: 2 tablets. Take each dose with food or a fatty drink like milk — the medicine absorbs much better. If you vomit within 1 hour of taking a dose, take that dose again.",
    commonSideEffects:
      "Feeling tired, dizzy, or weak is common for a day or two. Some people get mild stomach upset or lose their appetite. These usually pass as the malaria clears.",
    whoShouldNotTake:
      "Do not take in the first 3 months of pregnancy unless a doctor says so. Do not take if you have ever had a serious reaction to artemether or lumefantrine. Tell the pharmacist if you have heart rhythm problems or are on other medicines.",
    storage: "Keep in the original pack, below 25°C, away from sunlight and damp. Do not use after the expiry date on the pack.",
    missedDose:
      "Take the missed dose as soon as you remember, then continue the normal schedule. Do not double the next dose to catch up.",
  },
  {
    id: "prd-amoxaclear",
    brandName: "Amoxaclear 500",
    genericName: "Amoxicillin trihydrate",
    strength: "500mg",
    form: "Hard capsules, 10x10 blister",
    manufacturer: "Lagos Therapeutics Plc",
    category: "antibiotic",
    artworkRef: "/packs/refs/amoxaclear.png",
    highRisk: true,
    whatItsFor:
      "This is an antibiotic. It kills bacteria that cause infections like pneumonia, ear infections, throat infections, and urinary tract infections. It does NOT work on viruses — it will not help a cold, flu, or COVID-19.",
    howToTake:
      "Usually 1 capsule every 8 hours (3 times a day) for 5 to 7 days. Take with or without food. Finish the whole course even if you feel better after 2 days — stopping early lets the bacteria come back stronger.",
    commonSideEffects:
      "Loose stomach or mild diarrhoea is common. Some people get a mild rash. Drink plenty of water. If you get severe diarrhoea, a widespread rash, or swelling of the face, stop and see a doctor immediately.",
    whoShouldNotTake:
      "Do not take if you are allergic to penicillin or any cephalosporin antibiotic. If you get a rash or itching with penicillin, tell the pharmacist before taking this. Use caution if you have glandular fever or kidney problems.",
    storage: "Keep in the blister pack until you take it. Store below 25°C in a dry place. Do not use after the expiry date — old amoxicillin can break down and cause stomach upset.",
    missedDose:
      "Take it as soon as you remember. If it is nearly time for the next dose, skip the missed one and continue normally. Never take two doses at once.",
  },
  {
    id: "prd-sulfix",
    brandName: "Sulfix 500",
    genericName: "Sulfadoxine + Pyrimethamine",
    strength: "500mg / 25mg",
    form: "Film-coated tablets, 3-pack",
    manufacturer: "Kano BioPharm Ltd",
    category: "antimalarial",
    artworkRef: "/packs/refs/sulfix.png",
    highRisk: true,
    whatItsFor:
      "This is a malaria prevention medicine. It is taken once a week to stop you getting malaria in areas where it is common. It is for prevention only — it does not treat malaria you already have.",
    howToTake:
      "Take 3 tablets once a week, on the same day each week. Take with plenty of water. Start 1 to 2 weeks before entering a malaria area, keep taking it while you are there, and continue for 4 weeks after leaving.",
    commonSideEffects:
      "Most people have no problems. Some get mild nausea, headache, or itching. Rarely, a severe skin rash can occur — if you get a rash, stop and see a doctor.",
    whoShouldNotTake:
      "Do not take if you are allergic to sulfa drugs. Not recommended in the first 3 months of pregnancy or for babies under 2 months. Do not take if you have severe kidney or liver disease. Tell the pharmacist if you are on other medicines.",
    storage: "Keep in the original pack, below 25°C, away from sunlight and damp. Do not use after the expiry date.",
    missedDose:
      "Take the missed dose as soon as you remember, then return to your normal weekly day. Do not take two doses in one week.",
  },
  {
    id: "prd-paraxp",
    brandName: "ParaXP 500",
    genericName: "Paracetamol",
    strength: "500mg",
    form: "Tablets, 1000-pack bulk",
    manufacturer: "Nile Chemicals Ltd",
    category: "analgesic",
    artworkRef: "/packs/refs/paraxp.png",
    highRisk: false,
    whatItsFor:
      "This is a pain and fever reducer. It helps with headaches, toothache, body pain, period pain, and fever. It does not treat the cause of the pain — it just makes you feel better while your body heals.",
    howToTake:
      "Adults: 1 to 2 tablets every 4 to 6 hours as needed. Do not take more than 8 tablets (4 grams) in 24 hours. Can be taken with or without food. For children, use a children's paracetamol product with the right strength for their age.",
    commonSideEffects:
      "Paracetamol is very safe when taken at the right dose. The danger is taking too much — overdose can seriously damage the liver. Do not take other medicines that also contain paracetamol at the same time.",
    whoShouldNotTake:
      "Use caution if you have liver or kidney problems. Do not drink alcohol heavily while taking paracetamol — the combination can damage the liver. If you are under 16, use a children's formulation.",
    storage: "Keep in the original pack, below 25°C, away from children. Do not use after the expiry date.",
    missedDose:
      "If you are taking it regularly and miss a dose, take it when you remember. If the pain has gone, you do not need to catch up. Do not take extra to make up for a missed dose.",
  },
  {
    id: "prd-rehydra",
    brandName: "Rehydra-ORS",
    genericName: "Oral rehydration salts",
    strength: "20.5g / L",
    form: "Sachets, box of 10",
    manufacturer: "Delta Health Products",
    category: "other",
    artworkRef: "/packs/refs/rehydra.png",
    highRisk: false,
    whatItsFor:
      "This is for dehydration. It replaces water and salts lost through diarrhoea, vomiting, or sweating. It does not stop diarrhoea — it keeps you hydrated while the illness runs its course. It is especially important for children and the elderly.",
    howToTake:
      "Dissolve 1 sachet in 1 litre of clean, safe water. Do not boil the water after adding the sachet. Sip small amounts frequently — a few mouthfuls every few minutes. Use a clean cup or spoon. Make a fresh batch every 24 hours.",
    commonSideEffects:
      "None when mixed correctly. If you use too little water (making it too strong), it can make nausea worse. Always measure the water properly.",
    whoShouldNotTake:
      "If the person cannot drink at all, is unconscious, or has severe dehydration (very dry mouth, no urine, sunken eyes), they need hospital treatment immediately — ORS is not enough on its own.",
    storage: "Keep sachets in a dry place. Once mixed, cover and keep in a cool place and use within 24 hours. Do not use after the expiry date.",
    missedDose:
      "There is no fixed schedule — just keep sipping it throughout the day while diarrhoea or vomiting continues. Drink more after each loose stool or vomit.",
  },
];

export const productById = new Map(PRODUCTS.map((p) => [p.id, p]));
