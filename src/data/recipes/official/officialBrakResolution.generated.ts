/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Official Gellatti Recipe Library — owner BRAK crosswalk + FINAL-2541 approval
 * state of the referenced PIs. Regenerate / verify with
 * scripts/importOfficialBrakResolution.mjs.
 *
 * Crosswalk workbook : GELLATTI_75_COUNTRIES_MISSING_INGREDIENTS_SEARCH_WORKLIST_v1.xlsx (sheet 05_BRAK_RESOLUTION_44)
 * Crosswalk SHA-256  : 7227d2c9c4a8faec25c3ffcc2ae6bade9be7271e9eb615abde2512da4f723a46
 * Mapper projection  : docs/ingredients/validation/mapper_basement.csv
 * Mapper SHA-256     : a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6
 *
 * The class is the owner's. A USE_EXISTING_PI row is a proposal applied only at
 * landing — the library line keeps its BRAK identity until then.
 */

export const OFFICIAL_BRAK_CROSSWALK_SOURCE = {
  workbook: "GELLATTI_75_COUNTRIES_MISSING_INGREDIENTS_SEARCH_WORKLIST_v1.xlsx",
  sheet: "05_BRAK_RESOLUTION_44",
  sha256: "7227d2c9c4a8faec25c3ffcc2ae6bade9be7271e9eb615abde2512da4f723a46",
  mapperSha256: "a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6",
} as const;

export type OfficialBrakResolutionClass =
  | "NO_ACTION"
  | "USE_EXISTING_PI"
  | "INTERNAL_SUBRECIPE"
  | "SCAN_PL_LIST"
  | "BUY_PL_SCAN"
  | "EU_IMPORT_REFORMULATE";

export interface OfficialBrakResolution {
  readonly label: string;
  readonly resolutionClass: OfficialBrakResolutionClass;
  readonly actionBucket: string | null;
  readonly queueIds: readonly string[];
  /** USE_EXISTING_PI only: the existing canonical PI the owner crosswalk proposes. */
  readonly targetPi: string | null;
  /** FINAL 2541 approves targetPi for Base and Engines (null without a target). */
  readonly targetApproved: boolean | null;
  readonly exactness: string | null;
}

export const OFFICIAL_BRAK_RESOLUTIONS: readonly OfficialBrakResolution[] = [
  {
    "label": "Wybrany owoc / Main",
    "resolutionClass": "NO_ACTION",
    "actionBucket": "DYNAMIC / NO ARTICLE",
    "queueIds": [],
    "targetPi": null,
    "exactness": "N/A",
    "targetApproved": null
  },
  {
    "label": "Chocolate chips",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-000087",
    "exactness": "PROCESS SUBSTITUTE",
    "targetApproved": true
  },
  {
    "label": "Migdały prażone kawałki",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-002"
    ],
    "targetPi": null,
    "exactness": "EXACT ROLE",
    "targetApproved": null
  },
  {
    "label": "Milk-chocolate coating/ripple",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-000118",
    "exactness": "PROCESS SUBSTITUTE",
    "targetApproved": true
  },
  {
    "label": "Orzech laskowy prażony kawałki",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-000407",
    "exactness": "DIRECT / CLOSE",
    "targetApproved": true
  },
  {
    "label": "Birthday cake pieces",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-004"
    ],
    "targetPi": null,
    "exactness": "TEST SUBSTITUTE",
    "targetApproved": null
  },
  {
    "label": "Cachaca",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-019"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Cajeta",
    "resolutionClass": "INTERNAL_SUBRECIPE",
    "actionBucket": "INTERNAL_BUILD",
    "queueIds": [],
    "targetPi": null,
    "exactness": "AUTHENTIC BUILD",
    "targetApproved": null
  },
  {
    "label": "Cienki wafelek crumble",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-001"
    ],
    "targetPi": null,
    "exactness": "PROCESS SUBSTITUTE",
    "targetApproved": null
  },
  {
    "label": "Color candy pieces",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-003"
    ],
    "targetPi": null,
    "exactness": "EXACT ROLE",
    "targetApproved": null
  },
  {
    "label": "Cookie dough pieces",
    "resolutionClass": "INTERNAL_SUBRECIPE",
    "actionBucket": "INTERNAL_BUILD",
    "queueIds": [],
    "targetPi": null,
    "exactness": "AUTHENTIC BUILD",
    "targetApproved": null
  },
  {
    "label": "Dark cocoa-cookie crumble",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-001567",
    "exactness": "DIRECT",
    "targetApproved": true
  },
  {
    "label": "Fudge variegato",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-001173",
    "exactness": "SUBSTITUTE + ENGINE",
    "targetApproved": true
  },
  {
    "label": "Guma arabska",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-005"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Hojicha",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-006"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Honeycomb / Hokey Pokey crunch",
    "resolutionClass": "INTERNAL_SUBRECIPE",
    "actionBucket": "INTERNAL_BUILD",
    "queueIds": [],
    "targetPi": null,
    "exactness": "AUTHENTIC BUILD",
    "targetApproved": null
  },
  {
    "label": "Kataifi / kadayif crunch",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-017"
    ],
    "targetPi": null,
    "exactness": "EXACT ROLE",
    "targetApproved": null
  },
  {
    "label": "Kirsch",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-018"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Lekki wafelek crumble",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-001"
    ],
    "targetPi": null,
    "exactness": "PROCESS SUBSTITUTE",
    "targetApproved": null
  },
  {
    "label": "Mastiha Chios",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-007"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Migdał prażony kawałki",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-002"
    ],
    "targetPi": null,
    "exactness": "EXACT ROLE",
    "targetApproved": null
  },
  {
    "label": "Milk-chocolate coating/pieces",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-000118",
    "exactness": "PROCESS SUBSTITUTE",
    "targetApproved": true
  },
  {
    "label": "Mleko kozie",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-008"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Orzeszki ziemne prażone kawałki",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-023"
    ],
    "targetPi": null,
    "exactness": "EXACT ROLE",
    "targetApproved": null
  },
  {
    "label": "Owoce kandyzowane",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-001560",
    "exactness": "DIRECT",
    "targetApproved": true
  },
  {
    "label": "Pasta azuki słodka",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-010"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Pasta daktylowa",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-011"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Pasta z czarnego sezamu",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-009"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Pisco",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-020"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Port wine",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-021"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Puffed rice crunch",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-016"
    ],
    "targetPi": null,
    "exactness": "EXACT ROLE",
    "targetApproved": null
  },
  {
    "label": "Roasted almond pieces",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-002"
    ],
    "targetPi": null,
    "exactness": "EXACT ROLE",
    "targetApproved": null
  },
  {
    "label": "Rodzynki",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-001498",
    "exactness": "DIRECT",
    "targetApproved": true
  },
  {
    "label": "Rooibos",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-022"
    ],
    "targetPi": null,
    "exactness": "EXACT RAW MATERIAL",
    "targetApproved": null
  },
  {
    "label": "Saffron",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-024"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Salep",
    "resolutionClass": "EU_IMPORT_REFORMULATE",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-EU-025"
    ],
    "targetPi": null,
    "exactness": "NOT PURE / REFORMULATE",
    "targetApproved": null
  },
  {
    "label": "Salep / salepi",
    "resolutionClass": "EU_IMPORT_REFORMULATE",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-EU-025"
    ],
    "targetPi": null,
    "exactness": "NOT PURE / REFORMULATE",
    "targetApproved": null
  },
  {
    "label": "Szafran",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-024"
    ],
    "targetPi": null,
    "exactness": "EXACT",
    "targetApproved": null
  },
  {
    "label": "Tamarind pulp",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-012"
    ],
    "targetPi": null,
    "exactness": "SUBSTITUTE + ENGINE",
    "targetApproved": null
  },
  {
    "label": "Thai tea concentrate",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-013"
    ],
    "targetPi": null,
    "exactness": "RAW MATERIAL + PROCESS",
    "targetApproved": null
  },
  {
    "label": "Turrón de Jijona / pasta",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-014"
    ],
    "targetPi": null,
    "exactness": "EXACT FLAVOR / PROCESS",
    "targetApproved": null
  },
  {
    "label": "Ube paste",
    "resolutionClass": "BUY_PL_SCAN",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-015"
    ],
    "targetPi": null,
    "exactness": "SUBSTITUTE + ENGINE",
    "targetApproved": null
  },
  {
    "label": "Vanilla-cream ripple",
    "resolutionClass": "USE_EXISTING_PI",
    "actionBucket": "USE_EXISTING_PI_ROUTE",
    "queueIds": [],
    "targetPi": "PI-ING-000651",
    "exactness": "DIRECT / CLOSE",
    "targetApproved": true
  },
  {
    "label": "Wafelek crumble własny",
    "resolutionClass": "SCAN_PL_LIST",
    "actionBucket": "COUNTRY_SEARCH_VIA_QUEUE",
    "queueIds": [
      "IMP-PL-001"
    ],
    "targetPi": null,
    "exactness": "PROCESS SUBSTITUTE",
    "targetApproved": null
  }
];

/** Referenced PIs that FINAL 2541 does not approve for Base and Engines. */
export const OFFICIAL_FINAL_BLOCKED_PIS: readonly {
  readonly pi: string;
  readonly verificationStatus: string;
}[] = [
  {
    "pi": "PI-ING-000618",
    "verificationStatus": "Blocked"
  },
  {
    "pi": "PI-ING-001705",
    "verificationStatus": "Blocked"
  }
];
