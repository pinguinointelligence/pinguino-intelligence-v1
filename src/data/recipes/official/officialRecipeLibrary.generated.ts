/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Official Gellatti Recipe Library: 177 canonical recipes.
 * Regenerate / verify with scripts/importOfficialRecipeLibrary.mjs.
 *
 * Source workbook : GELLATTI_RECEPTURY.xlsx
 * Source sheets   : 01_RECEPTURY + 03_SKLAD_RECEPTUR
 * Source SHA-256  : a85e32a42a8a2e18a375647f8606c3d20c77f7f37a178273f557445579c76dfb
 * Library version : official-177-v1
 *
 * Ingredient identity is the canonical Mapper PI only. The workbook's older
 * "Exact Mapper name" is not carried; current names come from the Mapper
 * runtime by PI. BRAK lines keep their label and grams with no PI.
 */
import type { OfficialRecipe } from './officialRecipeTypes';

export const OFFICIAL_RECIPE_LIBRARY_VERSION = 'official-177-v1';
export const OFFICIAL_RECIPE_SOURCE_WORKBOOK = 'GELLATTI_RECEPTURY.xlsx';
export const OFFICIAL_RECIPE_SOURCE_SHA256 = 'a85e32a42a8a2e18a375647f8606c3d20c77f7f37a178273f557445579c76dfb';

export const OFFICIAL_RECIPE_SOURCE: readonly OfficialRecipe[] = [
  {
    "recipeId": "classic-dark-chocolate",
    "number": 1,
    "photoId": "GEL-001",
    "name": "Ciemna czekolada",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Francja / Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 6,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 490,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 2,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 3,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 4,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 5,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 6,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 7,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 8,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 9,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-salted-caramel",
    "number": 2,
    "photoId": "GEL-002",
    "name": "Słony karmel",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Francja / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 7,
    "lines": [
      {
        "line": 1,
        "sourceRow": 10,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 549,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 11,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 12,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 13,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 14,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 15,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 16,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 160,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 17,
        "label": "Sól",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000458"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 18,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-yogurt",
    "number": 3,
    "photoId": "GEL-003",
    "name": "Greek Yogurt",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Grecja / Europa",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 8,
    "lines": [
      {
        "line": 1,
        "sourceRow": 19,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 450,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 20,
        "label": "Jogurt grecki",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000204"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 21,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 22,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 23,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 24,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 25,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 26,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-cream",
    "number": 4,
    "photoId": "GEL-004",
    "name": "Śmietankowe",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Polska / Europa",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 9,
    "lines": [
      {
        "line": 1,
        "sourceRow": 27,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 575,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 28,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 180,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 29,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 30,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 31,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 32,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 68,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 33,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-amarena",
    "number": 5,
    "photoId": "GEL-005",
    "name": "Amarena",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 10,
    "lines": [
      {
        "line": 1,
        "sourceRow": 34,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 35,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 36,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 37,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 38,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 39,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 40,
        "label": "Amarena / wiśniowe variegato",
        "stage": "SWIRL",
        "grams": 105,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001133"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 41,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-crema",
    "number": 6,
    "photoId": "GEL-006",
    "name": "Crema / Custard",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 11,
    "lines": [
      {
        "line": 1,
        "sourceRow": 42,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 590,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 43,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 160,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 44,
        "label": "Żółtko jaja kurzego w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001645"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 45,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 46,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 85,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 47,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 48,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 49,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-gianduja",
    "number": 7,
    "photoId": "GEL-007",
    "name": "Gianduja",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 12,
    "lines": [
      {
        "line": 1,
        "sourceRow": 50,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 535,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 51,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 52,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 53,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 54,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 55,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 56,
        "label": "Pasta z orzecha laskowego 100%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000419"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 57,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 58,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-fior",
    "number": 8,
    "photoId": "GEL-008",
    "name": "Fior di Latte",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 13,
    "lines": [
      {
        "line": 1,
        "sourceRow": 59,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 60,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 135,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 61,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 62,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 86,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 63,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 64,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 54,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 65,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-coffee",
    "number": 9,
    "photoId": "GEL-009",
    "name": "Kawowe / Espresso",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 14,
    "lines": [
      {
        "line": 1,
        "sourceRow": 66,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 565,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 67,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 68,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 69,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 70,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 71,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 72,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 73,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-hazelnut",
    "number": 10,
    "photoId": "GEL-010",
    "name": "Orzech laskowy / Nocciola",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 15,
    "lines": [
      {
        "line": 1,
        "sourceRow": 74,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 575,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 75,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 76,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 77,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 85,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 78,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 79,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 80,
        "label": "Pasta z orzecha laskowego 100%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000419"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 81,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-pistachio",
    "number": 11,
    "photoId": "GEL-011",
    "name": "Pistacjowe",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 16,
    "lines": [
      {
        "line": 1,
        "sourceRow": 82,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 565,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 83,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 84,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 85,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 85,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 86,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 87,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 88,
        "label": "Pasta pistacjowa 100%",
        "stage": "MIX",
        "grams": 140,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000624"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 89,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-stracciatella",
    "number": 12,
    "photoId": "GEL-012",
    "name": "Stracciatella",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 17,
    "lines": [
      {
        "line": 1,
        "sourceRow": 90,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 570,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 91,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 92,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 93,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 94,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 95,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 96,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 97,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-banana",
    "number": 13,
    "photoId": "GEL-013",
    "name": "Bananowe",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 18,
    "lines": [
      {
        "line": 1,
        "sourceRow": 98,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 530,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 99,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 100,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 101,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 102,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 103,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 104,
        "label": "Puree bananowe",
        "stage": "MIX",
        "grams": 175,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001589"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 105,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-chocolate",
    "number": 14,
    "photoId": "GEL-014",
    "name": "Czekoladowe",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 19,
    "lines": [
      {
        "line": 1,
        "sourceRow": 106,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 107,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 108,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 109,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 110,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 111,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 112,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 113,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 114,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-vanilla",
    "number": 15,
    "photoId": "GEL-015",
    "name": "Wanilia / Vanilla",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 20,
    "lines": [
      {
        "line": 1,
        "sourceRow": 115,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 595,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 116,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 135,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 117,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 118,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 86,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 119,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 120,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 54,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 121,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 122,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-coconut",
    "number": 16,
    "photoId": "GEL-016",
    "name": "Kokosowe",
    "collection": "classics",
    "subcategory": "Core Classic",
    "origin": "Tropiki / global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 21,
    "lines": [
      {
        "line": 1,
        "sourceRow": 123,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 124,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 125,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 126,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 127,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 128,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 129,
        "label": "Pasta kokosowa",
        "stage": "MIX",
        "grams": 195,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000151"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 130,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-maple-walnut",
    "number": 17,
    "photoId": "GEL-017",
    "name": "Maple Walnut",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Canada / North America",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 22,
    "lines": [
      {
        "line": 1,
        "sourceRow": 131,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 540,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 132,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 133,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 134,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 135,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 136,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 137,
        "label": "Maple syrup",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001642"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 138,
        "label": "Walnut pieces",
        "stage": "LATE ADD",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000448"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 139,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-maple-pecan",
    "number": 18,
    "photoId": "GEL-018",
    "name": "Maple Pecan",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Canada / USA",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 23,
    "lines": [
      {
        "line": 1,
        "sourceRow": 140,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 540,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 141,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 142,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 143,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 144,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 145,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 146,
        "label": "Maple syrup",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001642"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 147,
        "label": "Pekany prażone",
        "stage": "LATE ADD",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001570"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 148,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-banana-pudding",
    "number": 19,
    "photoId": "GEL-019",
    "name": "Banana Pudding",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 24,
    "lines": [
      {
        "line": 1,
        "sourceRow": 149,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 150,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 151,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 152,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 153,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 154,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 155,
        "label": "Puree bananowe",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001589"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 156,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 157,
        "label": "Wafer pieces",
        "stage": "LATE ADD",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000829"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 158,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-birthday-cake",
    "number": 20,
    "photoId": "GEL-020",
    "name": "Birthday Cake",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 25,
    "lines": [
      {
        "line": 1,
        "sourceRow": 159,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 575,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 160,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 161,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 162,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 163,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 164,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 165,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 166,
        "label": "Birthday cake pieces",
        "stage": "LATE ADD",
        "grams": 75,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 167,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-butter-pecan",
    "number": 21,
    "photoId": "GEL-021",
    "name": "Butter Pecan",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 26,
    "lines": [
      {
        "line": 1,
        "sourceRow": 168,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 169,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 170,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 171,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 172,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 173,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 174,
        "label": "Masło niesolone",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000176"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 175,
        "label": "Pekany prażone",
        "stage": "LATE ADD",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001570"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 176,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-cookie-dough",
    "number": 22,
    "photoId": "GEL-022",
    "name": "Cookie Dough",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 27,
    "lines": [
      {
        "line": 1,
        "sourceRow": 177,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 178,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 179,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 180,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 181,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 182,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 63,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 183,
        "label": "Cookie dough pieces",
        "stage": "LATE ADD",
        "grams": 80,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 184,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-pb-cup",
    "number": 23,
    "photoId": "GEL-023",
    "name": "Peanut Butter Cup",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 28,
    "lines": [
      {
        "line": 1,
        "sourceRow": 185,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 525,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 186,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 187,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 188,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 189,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 190,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 191,
        "label": "Pasta orzechowa / peanut 100%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000437"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 192,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 193,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-rocky-road",
    "number": 24,
    "photoId": "GEL-024",
    "name": "Rocky Road",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 29,
    "lines": [
      {
        "line": 1,
        "sourceRow": 194,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 460,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 195,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 196,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 197,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 198,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 199,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 200,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 201,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 202,
        "label": "Marshmallow kawałki",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-002076"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 203,
        "label": "Migdały prażone kawałki",
        "stage": "LATE ADD",
        "grams": 50,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 204,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-mint-chip",
    "number": 25,
    "photoId": "GEL-025",
    "name": "Mint Chocolate Chip",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA / UK / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 30,
    "lines": [
      {
        "line": 1,
        "sourceRow": 205,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 570,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 206,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 207,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 208,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 209,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 210,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 211,
        "label": "Pasta miętowa",
        "stage": "MIX",
        "grams": 8,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000238"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 212,
        "label": "Chocolate chips",
        "stage": "LATE ADD",
        "grams": 60,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 213,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-blueberry-cheesecake",
    "number": 26,
    "photoId": "GEL-026",
    "name": "Blueberry Cheesecake",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 31,
    "lines": [
      {
        "line": 1,
        "sourceRow": 214,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 480,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 215,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 216,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 217,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 218,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 219,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 220,
        "label": "Cream cheese",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001450"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 221,
        "label": "Blueberry puree",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001543"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 222,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-brownie-fudge",
    "number": 27,
    "photoId": "GEL-027",
    "name": "Brownie Fudge",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 32,
    "lines": [
      {
        "line": 1,
        "sourceRow": 223,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 535,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 224,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 225,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 226,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 227,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 228,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 229,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 230,
        "label": "Brownie variegato",
        "stage": "SWIRL",
        "grams": 95,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000994"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 231,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-cheesecake",
    "number": 28,
    "photoId": "GEL-028",
    "name": "Cheesecake",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 33,
    "lines": [
      {
        "line": 1,
        "sourceRow": 232,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 233,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 234,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 235,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 236,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 237,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 238,
        "label": "Cream cheese",
        "stage": "MIX",
        "grams": 205,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001450"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 239,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-chocolate-chip",
    "number": 29,
    "photoId": "GEL-029",
    "name": "Chocolate Chip",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 34,
    "lines": [
      {
        "line": 1,
        "sourceRow": 240,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 570,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 241,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 242,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 243,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 244,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 245,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 246,
        "label": "Chocolate chips",
        "stage": "LATE ADD",
        "grams": 75,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 247,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-cookies-cream",
    "number": 30,
    "photoId": "GEL-030",
    "name": "Cookies & Cream",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 35,
    "lines": [
      {
        "line": 1,
        "sourceRow": 248,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 545,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 249,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 250,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 251,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 252,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 253,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 63,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 254,
        "label": "Dark cookie crumble",
        "stage": "LATE ADD",
        "grams": 85,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001567"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 255,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-fudge-swirl",
    "number": 31,
    "photoId": "GEL-031",
    "name": "Fudge Swirl",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 36,
    "lines": [
      {
        "line": 1,
        "sourceRow": 256,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 257,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 258,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 259,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 260,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 261,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 262,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 15,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 263,
        "label": "Fudge variegato",
        "stage": "SWIRL",
        "grams": 95,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 264,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-speculoos",
    "number": 32,
    "photoId": "GEL-032",
    "name": "Speculoos",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Belgium / Netherlands / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 37,
    "lines": [
      {
        "line": 1,
        "sourceRow": 265,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 266,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 267,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 268,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 269,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 270,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 271,
        "label": "Speculoos paste",
        "stage": "MIX",
        "grams": 165,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001091"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 272,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-creme-brulee",
    "number": 33,
    "photoId": "GEL-033",
    "name": "Crème Brûlée",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "France / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 38,
    "lines": [
      {
        "line": 1,
        "sourceRow": 273,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 274,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 140,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 275,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 276,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 277,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 278,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 279,
        "label": "Creme brulee paste",
        "stage": "MIX",
        "grams": 105,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000921"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 280,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-panna-cotta",
    "number": 34,
    "photoId": "GEL-034",
    "name": "Panna Cotta Vanilla",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Italy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 39,
    "lines": [
      {
        "line": 1,
        "sourceRow": 281,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 598,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 282,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 220,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 283,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 284,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 285,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 286,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 15,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 287,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 288,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-chocolate-orange",
    "number": 35,
    "photoId": "GEL-035",
    "name": "Chocolate Orange",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "UK / Europe / global",
    "continent": "Europa",
    "productType": "Chocolate Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 40,
    "lines": [
      {
        "line": 1,
        "sourceRow": 289,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 290,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 291,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 292,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 293,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 294,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 295,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 296,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 297,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-tiramisu",
    "number": 36,
    "photoId": "GEL-036",
    "name": "Tiramisù",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 41,
    "lines": [
      {
        "line": 1,
        "sourceRow": 298,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 299,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 300,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 301,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 302,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 303,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 304,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 305,
        "label": "Mascarpone",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000231"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 306,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 307,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-apple-pie",
    "number": 37,
    "photoId": "GEL-037",
    "name": "Apple Pie",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Europe / USA",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 42,
    "lines": [
      {
        "line": 1,
        "sourceRow": 308,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 309,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 310,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 311,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 312,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 313,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 314,
        "label": "Apple pie paste",
        "stage": "MIX",
        "grams": 135,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000758"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 315,
        "label": "Biscuit crumble",
        "stage": "LATE ADD",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000563"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 316,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-white-choc-raspberry",
    "number": 38,
    "photoId": "GEL-038",
    "name": "White Chocolate Raspberry",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Europe / global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 43,
    "lines": [
      {
        "line": 1,
        "sourceRow": 317,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 318,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 319,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 320,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 321,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 322,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 323,
        "label": "Biała czekolada",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000142"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 324,
        "label": "Puree malinowe",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001545"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 325,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-neapolitan",
    "number": 39,
    "photoId": "GEL-039",
    "name": "Neapolitan",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "Italy / USA / global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 44,
    "lines": [
      {
        "line": 1,
        "sourceRow": 326,
        "label": "Mleko 3.5%",
        "stage": "VANILLA THIRD",
        "grams": 200,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 327,
        "label": "Śmietanka 30%",
        "stage": "VANILLA THIRD",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 328,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "VANILLA THIRD",
        "grams": 15,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 329,
        "label": "Sacharoza",
        "stage": "VANILLA THIRD",
        "grams": 29,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 330,
        "label": "Dekstroza",
        "stage": "VANILLA THIRD",
        "grams": 27,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 331,
        "label": "Inulina",
        "stage": "VANILLA THIRD",
        "grams": 16,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 332,
        "label": "Pasta waniliowa",
        "stage": "VANILLA THIRD",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 333,
        "label": "Guma tara",
        "stage": "VANILLA THIRD",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 334,
        "label": "Mleko 3.5%",
        "stage": "CHOCOLATE THIRD",
        "grams": 175,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 335,
        "label": "Śmietanka 30%",
        "stage": "CHOCOLATE THIRD",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 336,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "CHOCOLATE THIRD",
        "grams": 10,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 12,
        "sourceRow": 337,
        "label": "Sacharoza",
        "stage": "CHOCOLATE THIRD",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 13,
        "sourceRow": 338,
        "label": "Dekstroza",
        "stage": "CHOCOLATE THIRD",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 14,
        "sourceRow": 339,
        "label": "Inulina",
        "stage": "CHOCOLATE THIRD",
        "grams": 13,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 15,
        "sourceRow": 340,
        "label": "Czekolada ciemna",
        "stage": "CHOCOLATE THIRD",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 16,
        "sourceRow": 341,
        "label": "Kakao odtłuszczone 12%",
        "stage": "CHOCOLATE THIRD",
        "grams": 29,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 17,
        "sourceRow": 342,
        "label": "Guma tara",
        "stage": "CHOCOLATE THIRD",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 18,
        "sourceRow": 343,
        "label": "Mleko 3.5%",
        "stage": "STRAWBERRY THIRD",
        "grams": 165,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 19,
        "sourceRow": 344,
        "label": "Śmietanka 30%",
        "stage": "STRAWBERRY THIRD",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 20,
        "sourceRow": 345,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "STRAWBERRY THIRD",
        "grams": 10,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 21,
        "sourceRow": 346,
        "label": "Sacharoza",
        "stage": "STRAWBERRY THIRD",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 22,
        "sourceRow": 347,
        "label": "Dekstroza",
        "stage": "STRAWBERRY THIRD",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 23,
        "sourceRow": 348,
        "label": "Inulina",
        "stage": "STRAWBERRY THIRD",
        "grams": 13,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 24,
        "sourceRow": 349,
        "label": "Puree truskawkowe",
        "stage": "STRAWBERRY THIRD",
        "grams": 64,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001435"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 25,
        "sourceRow": 350,
        "label": "Guma tara",
        "stage": "STRAWBERRY THIRD",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-lemon-meringue",
    "number": 40,
    "photoId": "GEL-040",
    "name": "Lemon Meringue Pie",
    "collection": "classics",
    "subcategory": "Dessert & Parlour",
    "origin": "UK / USA / global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 45,
    "lines": [
      {
        "line": 1,
        "sourceRow": 351,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 470,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 352,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 353,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 354,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 355,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 356,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 357,
        "label": "Lemon curd",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000725"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 358,
        "label": "Meringue cream",
        "stage": "SWIRL",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000233"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 359,
        "label": "Biscuit crumble",
        "stage": "LATE ADD",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000563"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 360,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-guava-sorbet",
    "number": 41,
    "photoId": "GEL-041",
    "name": "Guava Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Latin America / global",
    "continent": "Ameryka Południowa",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 46,
    "lines": [
      {
        "line": 1,
        "sourceRow": 361,
        "label": "Guava",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000364"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 362,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 363,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 364,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 365,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 366,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-tamarind-chili",
    "number": 42,
    "photoId": "GEL-042",
    "name": "Tamarind Chili Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Mexico / Latin America",
    "continent": "Ameryka Północna",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 47,
    "lines": [
      {
        "line": 1,
        "sourceRow": 367,
        "label": "Tamarind pulp",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 368,
        "label": "Woda",
        "stage": "MIX",
        "grams": 513,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 369,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 370,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 371,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 372,
        "label": "Ground chili",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001658"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 373,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-lychee-sorbet",
    "number": 43,
    "photoId": "GEL-043",
    "name": "Lychee Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Asia / global",
    "continent": "Azja",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 48,
    "lines": [
      {
        "line": 1,
        "sourceRow": 374,
        "label": "Lychee puree",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001521"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 375,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 376,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 377,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 378,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 379,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-yuzu-sorbet",
    "number": 44,
    "photoId": "GEL-044",
    "name": "Yuzu Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Japan / global",
    "continent": "Azja",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 49,
    "lines": [
      {
        "line": 1,
        "sourceRow": 380,
        "label": "Yuzu paste",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000620"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 381,
        "label": "Sok z cytryny",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000368"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 382,
        "label": "Woda",
        "stage": "MIX",
        "grams": 514,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 383,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 384,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 385,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 386,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-raspberry",
    "number": 45,
    "photoId": "GEL-045",
    "name": "Malina / Raspberry Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Francja / Europa",
    "continent": "Europa",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 50,
    "lines": [
      {
        "line": 1,
        "sourceRow": 387,
        "label": "Puree malinowe",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001545"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 388,
        "label": "Woda",
        "stage": "MIX",
        "grams": 214,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 389,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 390,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 391,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 392,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-blood-orange-sorbet",
    "number": 46,
    "photoId": "GEL-046",
    "name": "Blood Orange Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Italy / Mediterranean",
    "continent": "Europa",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 51,
    "lines": [
      {
        "line": 1,
        "sourceRow": 393,
        "label": "Blood orange juice",
        "stage": "MIX",
        "grams": 450,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000358"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 394,
        "label": "Woda",
        "stage": "MIX",
        "grams": 314,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 395,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 396,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 397,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 398,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-blackcurrant-sorbet",
    "number": 47,
    "photoId": "GEL-047",
    "name": "Blackcurrant Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "UK / Northern Europe",
    "continent": "Europa",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 52,
    "lines": [
      {
        "line": 1,
        "sourceRow": 399,
        "label": "Blackcurrant puree",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001590"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 400,
        "label": "Woda",
        "stage": "MIX",
        "grams": 214,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 401,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 402,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 403,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 404,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-lemon",
    "number": 48,
    "photoId": "GEL-048",
    "name": "Cytrynowe / Lemon Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Włochy / Francja / global",
    "continent": "Europa",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 53,
    "lines": [
      {
        "line": 1,
        "sourceRow": 405,
        "label": "Sok z cytryny",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000368"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 406,
        "label": "Woda",
        "stage": "MIX",
        "grams": 474,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 407,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 408,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 95,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 409,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 58,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 410,
        "label": "Sól",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000458"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 411,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-mango",
    "number": 49,
    "photoId": "GEL-049",
    "name": "Mango Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 54,
    "lines": [
      {
        "line": 1,
        "sourceRow": 412,
        "label": "Puree mango",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000340"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 413,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 414,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 415,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 416,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 417,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-peach-sorbet",
    "number": 50,
    "photoId": "GEL-050",
    "name": "Peach Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 55,
    "lines": [
      {
        "line": 1,
        "sourceRow": 418,
        "label": "Peach puree",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000384"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 419,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 420,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 421,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 422,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 423,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-strawberry",
    "number": 51,
    "photoId": "GEL-051",
    "name": "Truskawkowe / Strawberry Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 56,
    "lines": [
      {
        "line": 1,
        "sourceRow": 424,
        "label": "Puree truskawkowe",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001435"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 425,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 426,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 427,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 428,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 429,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-watermelon-sorbet",
    "number": 52,
    "photoId": "GEL-052",
    "name": "Watermelon Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Mediterranean / global",
    "continent": "Global",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 57,
    "lines": [
      {
        "line": 1,
        "sourceRow": 430,
        "label": "Watermelon juice",
        "stage": "MIX",
        "grams": 650,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000360"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 431,
        "label": "Woda",
        "stage": "MIX",
        "grams": 114,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 432,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 433,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 434,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 435,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-pineapple-sorbet",
    "number": 53,
    "photoId": "GEL-053",
    "name": "Pineapple Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Tropics / global",
    "continent": "Global",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 58,
    "lines": [
      {
        "line": 1,
        "sourceRow": 436,
        "label": "Puree ananasowe",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000389"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 437,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 438,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 439,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 440,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 441,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-passion",
    "number": 54,
    "photoId": "GEL-054",
    "name": "Marakuja / Passion Fruit Sorbet",
    "collection": "classics",
    "subcategory": "Fruit & Sorbet",
    "origin": "Tropiki / global",
    "continent": "Global",
    "productType": "Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 59,
    "lines": [
      {
        "line": 1,
        "sourceRow": 442,
        "label": "Puree marakuja",
        "stage": "MIX",
        "grams": 350,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000383"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 443,
        "label": "Woda",
        "stage": "MIX",
        "grams": 414,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 444,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 445,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 446,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 447,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-rooibos-granadilla",
    "number": 55,
    "photoId": "GEL-055",
    "name": "Rooibos & Granadilla",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "RPA",
    "continent": "Afryka",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 60,
    "lines": [
      {
        "line": 1,
        "sourceRow": 448,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 449,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 450,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 451,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 452,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 453,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 454,
        "label": "Puree marakuja",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000383"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 455,
        "label": "Rooibos",
        "stage": "MIX",
        "grams": 20,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 456,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-dulce-granizado",
    "number": 56,
    "photoId": "GEL-056",
    "name": "Dulce de Leche Granizado",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Argentyna",
    "continent": "Ameryka Południowa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 61,
    "lines": [
      {
        "line": 1,
        "sourceRow": 457,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 458,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 459,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 460,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 461,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 462,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 463,
        "label": "Dulce de leche",
        "stage": "MIX",
        "grams": 190,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000576"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 464,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 465,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-frutilla-crema",
    "number": 57,
    "photoId": "GEL-057",
    "name": "Frutilla a la Crema",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Argentyna",
    "continent": "Ameryka Południowa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 62,
    "lines": [
      {
        "line": 1,
        "sourceRow": 466,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 467,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 468,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 469,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 470,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 471,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 472,
        "label": "Puree truskawkowe",
        "stage": "MIX",
        "grams": 205,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001435"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 473,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-sambayon",
    "number": 58,
    "photoId": "GEL-058",
    "name": "Sambayón",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Argentyna",
    "continent": "Ameryka Południowa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 63,
    "lines": [
      {
        "line": 1,
        "sourceRow": 474,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 558,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 475,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 140,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 476,
        "label": "Żółtko jaja kurzego w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001645"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 477,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 478,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 85,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 479,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 480,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 481,
        "label": "Marsala Dolce 18%",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000027"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 482,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-dulce",
    "number": 59,
    "photoId": "GEL-059",
    "name": "Dulce de Leche",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Argentyna / Ameryka Łacińska",
    "continent": "Ameryka Południowa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 64,
    "lines": [
      {
        "line": 1,
        "sourceRow": 483,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 540,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 484,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 485,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 486,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 487,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 488,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 489,
        "label": "Dulce de leche",
        "stage": "MIX",
        "grams": 200,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000576"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 490,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-choc-almond",
    "number": 60,
    "photoId": "GEL-060",
    "name": "Chocolate con Almendras",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Argentyna / global",
    "continent": "Ameryka Południowa",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 65,
    "lines": [
      {
        "line": 1,
        "sourceRow": 491,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 492,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 493,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 494,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 495,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 496,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 497,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 498,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 499,
        "label": "Migdały prażone kawałki",
        "stage": "LATE ADD",
        "grams": 80,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 500,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-brigadeiro",
    "number": 61,
    "photoId": "GEL-061",
    "name": "Brigadeiro Chocolate",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Brazil",
    "continent": "Ameryka Południowa",
    "productType": "Chocolate Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 66,
    "lines": [
      {
        "line": 1,
        "sourceRow": 501,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 490,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 502,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 503,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 504,
        "label": "Sweetened condensed milk",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000274"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 505,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 506,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 507,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 508,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 509,
        "label": "Masło niesolone",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000176"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 510,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-cajeta",
    "number": 62,
    "photoId": "GEL-062",
    "name": "Cajeta",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Mexico",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 67,
    "lines": [
      {
        "line": 1,
        "sourceRow": 511,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 580,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 512,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 513,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 514,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 515,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 516,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 517,
        "label": "Cajeta",
        "stage": "MIX",
        "grams": 145,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 518,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-mexican-chocolate",
    "number": 63,
    "photoId": "GEL-063",
    "name": "Mexican Chocolate",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Mexico",
    "continent": "Ameryka Północna",
    "productType": "Chocolate Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 68,
    "lines": [
      {
        "line": 1,
        "sourceRow": 519,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 520,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 521,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 522,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 523,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 524,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 525,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 526,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 527,
        "label": "Cynamon",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001661"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 528,
        "label": "Ground chili",
        "stage": "MIX",
        "grams": 3,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001658"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 529,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-horchata",
    "number": 64,
    "photoId": "GEL-064",
    "name": "Horchata Cinnamon",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Mexico / Spain / Latin America",
    "continent": "Ameryka Północna",
    "productType": "Vegan Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 69,
    "lines": [
      {
        "line": 1,
        "sourceRow": 530,
        "label": "Rice drink",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001566"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 531,
        "label": "Woda",
        "stage": "MIX",
        "grams": 127,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 532,
        "label": "Olej kokosowy rafinowany",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000163"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 533,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 534,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 535,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 536,
        "label": "Cynamon",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001661"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 537,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-dates-cardamom",
    "number": 65,
    "photoId": "GEL-065",
    "name": "Daktyle & Kardamon",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Bliski Wschód",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 70,
    "lines": [
      {
        "line": 1,
        "sourceRow": 538,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 568,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 539,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 540,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 541,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 542,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 543,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 544,
        "label": "Pasta daktylowa",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 545,
        "label": "Kardamon",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001671"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 546,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-dubai",
    "number": 66,
    "photoId": "GEL-066",
    "name": "Dubai Chocolate",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Bliski Wschód / global",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 71,
    "lines": [
      {
        "line": 1,
        "sourceRow": 547,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 450,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 548,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 549,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 550,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 551,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 552,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 553,
        "label": "Pasta pistacjowa 100%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000624"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 554,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 555,
        "label": "Tahini",
        "stage": "MIX",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001403"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 556,
        "label": "Kataifi / kadayif crunch",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 557,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-hojicha",
    "number": 67,
    "photoId": "GEL-067",
    "name": "Hojicha",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Japonia",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 72,
    "lines": [
      {
        "line": 1,
        "sourceRow": 558,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 640,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 559,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 560,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 561,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 562,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 563,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 564,
        "label": "Hojicha",
        "stage": "MIX",
        "grams": 15,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 565,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-black-sesame",
    "number": 68,
    "photoId": "GEL-068",
    "name": "Black Sesame",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Japonia / Azja",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 73,
    "lines": [
      {
        "line": 1,
        "sourceRow": 566,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 570,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 567,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 568,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 569,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 570,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 571,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 572,
        "label": "Pasta z czarnego sezamu",
        "stage": "MIX",
        "grams": 135,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 573,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-matcha",
    "number": 69,
    "photoId": "GEL-069",
    "name": "Matcha",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Japonia / global",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 74,
    "lines": [
      {
        "line": 1,
        "sourceRow": 574,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 645,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 575,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 576,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 577,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 578,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 579,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 580,
        "label": "Matcha",
        "stage": "MIX",
        "grams": 10,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000169"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 581,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-date-tahini",
    "number": 70,
    "photoId": "GEL-070",
    "name": "Date Tahini",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Middle East",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 75,
    "lines": [
      {
        "line": 1,
        "sourceRow": 582,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 583,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 584,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 585,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 586,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 587,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 588,
        "label": "Dried dates",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000351"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 589,
        "label": "Tahini",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001403"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 590,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-halva-sesame",
    "number": 71,
    "photoId": "GEL-071",
    "name": "Halva Sesame",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Middle East / Eastern Mediterranean",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 76,
    "lines": [
      {
        "line": 1,
        "sourceRow": 591,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 592,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 593,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 594,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 595,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 596,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 597,
        "label": "Tahini",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001403"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 598,
        "label": "Honey",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001454"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 599,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-rose-pistachio",
    "number": 72,
    "photoId": "GEL-072",
    "name": "Rose Pistachio",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Middle East / South Asia",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 77,
    "lines": [
      {
        "line": 1,
        "sourceRow": 600,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 555,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 601,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 602,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 603,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 604,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 605,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 606,
        "label": "Pasta pistacjowa 100%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000624"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 607,
        "label": "Rose paste",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000618"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 608,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-saffron-pistachio",
    "number": 73,
    "photoId": "GEL-073",
    "name": "Saffron Pistachio",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Middle East / South Asia",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 78,
    "lines": [
      {
        "line": 1,
        "sourceRow": 609,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 594.5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 610,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 611,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 612,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 613,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 614,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 615,
        "label": "Pasta pistacjowa 100%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000624"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 616,
        "label": "Saffron",
        "stage": "MIX",
        "grams": 0.5,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 617,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-ube",
    "number": 74,
    "photoId": "GEL-074",
    "name": "Ube",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Philippines / Southeast Asia",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 79,
    "lines": [
      {
        "line": 1,
        "sourceRow": 618,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 565,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 619,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 620,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 621,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 622,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 623,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 63,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 624,
        "label": "Ube paste",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 625,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-thai-tea",
    "number": 75,
    "photoId": "GEL-075",
    "name": "Thai Tea",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Thailand / Southeast Asia",
    "continent": "Azja",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 80,
    "lines": [
      {
        "line": 1,
        "sourceRow": 626,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 580,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 627,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 628,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 629,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 630,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 631,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 58,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 632,
        "label": "Thai tea concentrate",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 633,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-black-cherry",
    "number": 76,
    "photoId": "GEL-076",
    "name": "Black Cherry",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "USA / Europe",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 81,
    "lines": [
      {
        "line": 1,
        "sourceRow": 634,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 635,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 636,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 637,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 638,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 639,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 640,
        "label": "Black cherry variegato",
        "stage": "SWIRL",
        "grams": 105,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000172"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 641,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "classic-hokey",
    "number": 77,
    "photoId": "GEL-077",
    "name": "Hokey Pokey",
    "collection": "classics",
    "subcategory": "Regional Classic",
    "origin": "Nowa Zelandia",
    "continent": "Oceania",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 82,
    "lines": [
      {
        "line": 1,
        "sourceRow": 642,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 555,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 643,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 644,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 645,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 646,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 647,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 648,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 649,
        "label": "Honeycomb / Hokey Pokey crunch",
        "stage": "LATE ADD",
        "grams": 95,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 650,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-oreyo",
    "number": 78,
    "photoId": "GEL-078",
    "name": "Dark Cookie Vanilla Cream",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "ENGINE_BASE_VALID_BLOCKED",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 83,
    "lines": [
      {
        "line": 1,
        "sourceRow": 651,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 566,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 652,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 109,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 653,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 27,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 654,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 77,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 655,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 41,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 656,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 657,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 36,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 658,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 659,
        "label": "Sól",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000458"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 660,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 661,
        "label": "Dark cocoa-cookie crumble",
        "stage": "LATE ADD",
        "grams": 64,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 12,
        "sourceRow": 662,
        "label": "Vanilla-cream ripple",
        "stage": "SWIRL",
        "grams": 27,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-knickers",
    "number": 79,
    "photoId": "GEL-079",
    "name": "Peanut Caramel Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "USA / global",
    "continent": "Ameryka Północna",
    "productType": "Standard Gelato",
    "sourceStatus": "ENGINE_BASE_VALID_BLOCKED",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 84,
    "lines": [
      {
        "line": 1,
        "sourceRow": 663,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 483,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 664,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 665,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 22,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 666,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 52,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 667,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 668,
        "label": "Pasta orzechowa / peanut 100%",
        "stage": "MIX",
        "grams": 89,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000437"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 669,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 72,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 670,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 52,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 671,
        "label": "Sól",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000458"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 672,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 673,
        "label": "Orzeszki ziemne prażone kawałki",
        "stage": "MIX",
        "grams": 31,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 12,
        "sourceRow": 674,
        "label": "Caramel ripple",
        "stage": "SWIRL",
        "grams": 49,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000309"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 13,
        "sourceRow": 675,
        "label": "Milk-chocolate coating/pieces",
        "stage": "LATE ADD",
        "grams": 27,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-raphaello",
    "number": 80,
    "photoId": "GEL-080",
    "name": "Coconut Almond White Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "ENGINE_BASE_VALID_BLOCKED",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 85,
    "lines": [
      {
        "line": 1,
        "sourceRow": 676,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 522,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 677,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 82,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 678,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 23,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 679,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 73,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 680,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 681,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 41,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 682,
        "label": "Pasta kokosowa",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000151"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 683,
        "label": "Pasta migdałowa",
        "stage": "MIX",
        "grams": 27,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001512"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 684,
        "label": "Biała czekolada",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000142"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 685,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 686,
        "label": "Wiórki kokosowe",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000146"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 12,
        "sourceRow": 687,
        "label": "Lekki wafelek crumble",
        "stage": "LATE ADD",
        "grams": 27,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 13,
        "sourceRow": 688,
        "label": "Migdał prażony kawałki",
        "stage": "MIX",
        "grams": 18,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-kidi-bueno",
    "number": 81,
    "photoId": "GEL-081",
    "name": "Hazelnut Cream Wafer",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "ENGINE_BASE_VALID_BLOCKED",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 86,
    "lines": [
      {
        "line": 1,
        "sourceRow": 689,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 513,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 690,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 92,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 691,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 28,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 692,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 69,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 693,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 33,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 694,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 41,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 695,
        "label": "Pasta z orzecha laskowego 100%",
        "stage": "MIX",
        "grams": 72,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000419"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 696,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 697,
        "label": "Biała czekolada",
        "stage": "MIX",
        "grams": 15,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000142"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 698,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 699,
        "label": "Cienki wafelek crumble",
        "stage": "LATE ADD",
        "grams": 46,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 12,
        "sourceRow": 700,
        "label": "Orzech laskowy prażony kawałki",
        "stage": "MIX",
        "grams": 18,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 13,
        "sourceRow": 701,
        "label": "Milk-chocolate coating/ripple",
        "stage": "SWIRL",
        "grams": 18,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-rocero",
    "number": 82,
    "photoId": "GEL-082",
    "name": "Hazelnut Praline Wafer",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Włochy / global",
    "continent": "Europa",
    "productType": "Standard Gelato",
    "sourceStatus": "ENGINE_BASE_VALID_BLOCKED",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 87,
    "lines": [
      {
        "line": 1,
        "sourceRow": 702,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 521,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 703,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 73,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 704,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 26,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 705,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 58,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 706,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 36,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 707,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 46,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 708,
        "label": "Pasta z orzecha laskowego 100%",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000419"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 709,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 67,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 710,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 711,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 712,
        "label": "Wafelek crumble własny",
        "stage": "LATE ADD",
        "grams": 41,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 12,
        "sourceRow": 713,
        "label": "Orzech laskowy prażony kawałki",
        "stage": "MIX",
        "grams": 23,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 13,
        "sourceRow": 714,
        "label": "Milk-chocolate coating/ripple",
        "stage": "SWIRL",
        "grams": 27,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-almond-nougat-chocolate",
    "number": 83,
    "photoId": "GEL-083",
    "name": "Almond Nougat Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 88,
    "lines": [
      {
        "line": 1,
        "sourceRow": 715,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 515,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 716,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 717,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 718,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 719,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 720,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 721,
        "label": "Nougat cream",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001496"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 722,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 723,
        "label": "Pasta migdałowa",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001512"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 724,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-almond-toffee-crunch",
    "number": 84,
    "photoId": "GEL-084",
    "name": "Almond Toffee Crunch",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 89,
    "lines": [
      {
        "line": 1,
        "sourceRow": 725,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 555,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 726,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 727,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 728,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 729,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 730,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 731,
        "label": "Pasta migdałowa",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001512"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 732,
        "label": "Toffee variegato",
        "stage": "SWIRL",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000911"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 733,
        "label": "Roasted almond pieces",
        "stage": "LATE ADD",
        "grams": 35,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 734,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-brownie-caramel-chocolate",
    "number": 85,
    "photoId": "GEL-085",
    "name": "Brownie Caramel Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 90,
    "lines": [
      {
        "line": 1,
        "sourceRow": 735,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 736,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 737,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 738,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 739,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 740,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 741,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 742,
        "label": "Brownie variegato",
        "stage": "SWIRL",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000994"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 743,
        "label": "Karmel",
        "stage": "SWIRL",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 744,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-caramel-biscuit-cream",
    "number": 86,
    "photoId": "GEL-086",
    "name": "Caramel Biscuit Cream",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 91,
    "lines": [
      {
        "line": 1,
        "sourceRow": 745,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 746,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 747,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 748,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 749,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 750,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 751,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 752,
        "label": "Speculoos paste",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001091"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 753,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-caramel-nougat-chocolate",
    "number": 87,
    "photoId": "GEL-087",
    "name": "Caramel Nougat Milk Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 92,
    "lines": [
      {
        "line": 1,
        "sourceRow": 754,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 755,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 756,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 757,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 758,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 759,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 760,
        "label": "Nougat cream",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001496"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 761,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 762,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 763,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-choc-caramel-biscuit",
    "number": 88,
    "photoId": "GEL-088",
    "name": "Chocolate Caramel Biscuit",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 93,
    "lines": [
      {
        "line": 1,
        "sourceRow": 764,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 765,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 766,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 767,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 768,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 769,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 770,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 771,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 772,
        "label": "Wafer pieces",
        "stage": "LATE ADD",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000829"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 773,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-coconut-dark-chocolate",
    "number": 89,
    "photoId": "GEL-089",
    "name": "Coconut Dark Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 94,
    "lines": [
      {
        "line": 1,
        "sourceRow": 774,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 775,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 776,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 777,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 778,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 779,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 780,
        "label": "Pasta kokosowa",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000151"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 781,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 782,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-color-candy-chocolate",
    "number": 90,
    "photoId": "GEL-090",
    "name": "Color Candy Chocolate Crunch",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 95,
    "lines": [
      {
        "line": 1,
        "sourceRow": 783,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 550,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 784,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 785,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 786,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 787,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 788,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 789,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 790,
        "label": "Color candy pieces",
        "stage": "LATE ADD",
        "grams": 75,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 791,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-cookie-milk-choc",
    "number": 91,
    "photoId": "GEL-091",
    "name": "Cookie Milk Chocolate Crunch",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 96,
    "lines": [
      {
        "line": 1,
        "sourceRow": 792,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 545,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 793,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 794,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 795,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 796,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 797,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 798,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 799,
        "label": "Dark cookie crumble",
        "stage": "LATE ADD",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001567"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 800,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-hazelnut-cocoa-spread",
    "number": 92,
    "photoId": "GEL-092",
    "name": "Hazelnut Cocoa Cream",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 97,
    "lines": [
      {
        "line": 1,
        "sourceRow": 801,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 555,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 802,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 803,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 804,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 805,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 806,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 807,
        "label": "Pasta z orzecha laskowego 100%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000419"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 808,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 809,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 810,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-milk-wafer-crunch",
    "number": 93,
    "photoId": "GEL-093",
    "name": "Milk Chocolate Wafer Crunch",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 98,
    "lines": [
      {
        "line": 1,
        "sourceRow": 811,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 812,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 813,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 814,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 815,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 816,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 817,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 818,
        "label": "Wafer pieces",
        "stage": "LATE ADD",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000829"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 819,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-mint-chocolate-thin",
    "number": 94,
    "photoId": "GEL-094",
    "name": "Mint Chocolate Thin",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 99,
    "lines": [
      {
        "line": 1,
        "sourceRow": 820,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 580,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 821,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 822,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 823,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 824,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 825,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 826,
        "label": "Pasta miętowa",
        "stage": "MIX",
        "grams": 8,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000238"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 827,
        "label": "Czekolada ciemna",
        "stage": "LATE ADD",
        "grams": 67,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 828,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-orange-dark-chocolate",
    "number": 95,
    "photoId": "GEL-095",
    "name": "Orange Dark Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 100,
    "lines": [
      {
        "line": 1,
        "sourceRow": 829,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 830,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 831,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 832,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 833,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 834,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 835,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 836,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 837,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-peanut-butter-chocolate",
    "number": 96,
    "photoId": "GEL-096",
    "name": "Peanut Butter Milk Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 101,
    "lines": [
      {
        "line": 1,
        "sourceRow": 838,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 535,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 839,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 840,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 841,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 842,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 843,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 844,
        "label": "Pasta orzechowa / peanut 100%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000437"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 845,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 846,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-peanut-nougat-chocolate",
    "number": 97,
    "photoId": "GEL-097",
    "name": "Peanut Nougat Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 102,
    "lines": [
      {
        "line": 1,
        "sourceRow": 847,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 848,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 849,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 850,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 851,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 852,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 853,
        "label": "Pasta orzechowa / peanut 100%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000437"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 854,
        "label": "Nougat cream",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001496"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 855,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 856,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-praline-wafer-crunch",
    "number": 98,
    "photoId": "GEL-098",
    "name": "Praline Wafer Crunch",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 103,
    "lines": [
      {
        "line": 1,
        "sourceRow": 857,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 545,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 858,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 859,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 860,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 861,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 862,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 863,
        "label": "Pasta z orzecha laskowego 100%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000419"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 864,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 865,
        "label": "Wafer pieces",
        "stage": "LATE ADD",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000829"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 866,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-puffed-rice-caramel",
    "number": 99,
    "photoId": "GEL-099",
    "name": "Puffed Rice Caramel Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 104,
    "lines": [
      {
        "line": 1,
        "sourceRow": 867,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 545,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 868,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 869,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 870,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 871,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 872,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 873,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 874,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 875,
        "label": "Puffed rice crunch",
        "stage": "LATE ADD",
        "grams": 25,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 876,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-salted-pretzel-chocolate",
    "number": 100,
    "photoId": "GEL-100",
    "name": "Salted Pretzel Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 105,
    "lines": [
      {
        "line": 1,
        "sourceRow": 877,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 525,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 878,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 879,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 880,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 881,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 882,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 883,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 884,
        "label": "Chocolate pretzel variegato",
        "stage": "SWIRL",
        "grams": 95,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000836"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 885,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-soft-nougat-caramel",
    "number": 101,
    "photoId": "GEL-101",
    "name": "Soft Nougat Caramel Chocolate",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 106,
    "lines": [
      {
        "line": 1,
        "sourceRow": 886,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 530,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 887,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 888,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 889,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 890,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 891,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 892,
        "label": "Nougat cream",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001496"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 893,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 894,
        "label": "Czekolada mleczna",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000118"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 895,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "icon-white-hazelnut-wafer",
    "number": 102,
    "photoId": "GEL-102",
    "name": "White Chocolate Hazelnut Wafer",
    "collection": "icons",
    "subcategory": "Confectionery Icon",
    "origin": "Global",
    "continent": "Global",
    "productType": "Standard Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 107,
    "lines": [
      {
        "line": 1,
        "sourceRow": 896,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 555,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 897,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 898,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 899,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 900,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 901,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 902,
        "label": "Pasta z orzecha laskowego 100%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000419"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 903,
        "label": "Biała czekolada",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000142"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 904,
        "label": "Wafer pieces",
        "stage": "LATE ADD",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000829"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 905,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-mojito",
    "number": 103,
    "photoId": "GEL-103",
    "name": "Mojito",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Kuba / global",
    "continent": "Ameryka Północna",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 108,
    "lines": [
      {
        "line": 1,
        "sourceRow": 906,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 220,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 907,
        "label": "Woda",
        "stage": "MIX",
        "grams": 489,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 908,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 909,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 910,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 911,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 912,
        "label": "Mięta świeża",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001561"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 913,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-strawberry-daiquiri",
    "number": 104,
    "photoId": "GEL-104",
    "name": "Strawberry Daiquiri",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Kuba / global",
    "continent": "Ameryka Północna",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 109,
    "lines": [
      {
        "line": 1,
        "sourceRow": 914,
        "label": "Puree truskawkowe",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001435"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 915,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 916,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 917,
        "label": "Woda",
        "stage": "MIX",
        "grams": 129,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 918,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 95,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 919,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 920,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 921,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-margarita",
    "number": 105,
    "photoId": "GEL-105",
    "name": "Margarita",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Meksyk / global",
    "continent": "Ameryka Północna",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 110,
    "lines": [
      {
        "line": 1,
        "sourceRow": 922,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 260,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 923,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 924,
        "label": "Tequila",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001761"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 925,
        "label": "Likier Curaçao",
        "stage": "MIX",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000024"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 926,
        "label": "Woda",
        "stage": "MIX",
        "grams": 363,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 927,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 928,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 929,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 930,
        "label": "Sól",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000458"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 931,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-pina-colada",
    "number": 106,
    "photoId": "GEL-106",
    "name": "Piña Colada",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Puerto Rico / Karaiby",
    "continent": "Ameryka Północna",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 111,
    "lines": [
      {
        "line": 1,
        "sourceRow": 932,
        "label": "Puree ananasowe",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000389"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 933,
        "label": "Mleko kokosowe",
        "stage": "MIX",
        "grams": 200,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000149"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 934,
        "label": "Woda",
        "stage": "MIX",
        "grams": 79,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 935,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 936,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 937,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 938,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 939,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-champagne-strawberry",
    "number": 107,
    "photoId": "GEL-107",
    "name": "Sparkling Wine Strawberry",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Francja / global",
    "continent": "Europa",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 112,
    "lines": [
      {
        "line": 1,
        "sourceRow": 940,
        "label": "Puree truskawkowe",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001435"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 941,
        "label": "Prosecco",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000019"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 942,
        "label": "Woda",
        "stage": "MIX",
        "grams": 184,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 943,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 944,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 945,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 946,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-sangria",
    "number": 108,
    "photoId": "GEL-108",
    "name": "Sangria",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Hiszpania",
    "continent": "Europa",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 113,
    "lines": [
      {
        "line": 1,
        "sourceRow": 947,
        "label": "Czerwone wino",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000033"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 948,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 200,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 949,
        "label": "Puree czerwonych owoców",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001437"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 950,
        "label": "Woda",
        "stage": "MIX",
        "grams": 222,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 951,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 952,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 953,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 954,
        "label": "Cynamon",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001661"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 955,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-gin-tonic",
    "number": 109,
    "photoId": "GEL-109",
    "name": "Gin & Tonic",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Wielka Brytania / global",
    "continent": "Europa",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 114,
    "lines": [
      {
        "line": 1,
        "sourceRow": 956,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 957,
        "label": "Tonic water",
        "stage": "MIX",
        "grams": 300,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001900"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 958,
        "label": "Gin",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001608"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 959,
        "label": "Woda",
        "stage": "MIX",
        "grams": 274,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 960,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 961,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 962,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 963,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-aperol-spritz",
    "number": 110,
    "photoId": "GEL-110",
    "name": "Orange Bitter Spritz",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Włochy",
    "continent": "Europa",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 115,
    "lines": [
      {
        "line": 1,
        "sourceRow": 964,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 965,
        "label": "Bitter aperitivo 11%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000002"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": true,
        "note": "Public display is generic; exact Mapper product remains internal."
      },
      {
        "line": 3,
        "sourceRow": 966,
        "label": "Prosecco",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000019"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 967,
        "label": "Woda",
        "stage": "MIX",
        "grams": 384,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 968,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 969,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 970,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 971,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-bellini",
    "number": 111,
    "photoId": "GEL-111",
    "name": "Bellini",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 116,
    "lines": [
      {
        "line": 1,
        "sourceRow": 972,
        "label": "Peach puree",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000384"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 973,
        "label": "Prosecco",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000019"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 974,
        "label": "Woda",
        "stage": "MIX",
        "grams": 214,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 975,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 976,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 977,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 978,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-caipirinha",
    "number": 112,
    "photoId": "GEL-112",
    "name": "Caipirinha",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 117,
    "lines": [
      {
        "line": 1,
        "sourceRow": 979,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 980,
        "label": "Cachaca",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 981,
        "label": "Woda",
        "stage": "MIX",
        "grams": 474,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 982,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 983,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 984,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 985,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-classic-daiquiri",
    "number": 113,
    "photoId": "GEL-113",
    "name": "Classic Daiquiri",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 118,
    "lines": [
      {
        "line": 1,
        "sourceRow": 986,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 300,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 987,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 988,
        "label": "Woda",
        "stage": "MIX",
        "grams": 424,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 989,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 990,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 991,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 992,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-cosmopolitan",
    "number": 114,
    "photoId": "GEL-114",
    "name": "Cosmopolitan",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 119,
    "lines": [
      {
        "line": 1,
        "sourceRow": 993,
        "label": "Cranberry cordial",
        "stage": "MIX",
        "grams": 200,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001864"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 994,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 995,
        "label": "Wódka",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000037"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 996,
        "label": "Orange liqueur",
        "stage": "MIX",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001766"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 997,
        "label": "Woda",
        "stage": "MIX",
        "grams": 414,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 998,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 999,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1000,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1001,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-dark-rum-ginger",
    "number": 115,
    "photoId": "GEL-115",
    "name": "Dark Rum & Ginger",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 120,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1002,
        "label": "Ginger beer",
        "stage": "MIX",
        "grams": 350,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001831"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1003,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1004,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1005,
        "label": "Woda",
        "stage": "MIX",
        "grams": 354,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1006,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1007,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1008,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1009,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-hugo",
    "number": 116,
    "photoId": "GEL-116",
    "name": "Elderflower Lime Spritz",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 121,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1010,
        "label": "Prosecco",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000019"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1011,
        "label": "Elderflower cordial",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001863"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1012,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1013,
        "label": "Woda",
        "stage": "MIX",
        "grams": 574,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1014,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1015,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1016,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1017,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-limoncello-lemon",
    "number": 117,
    "photoId": "GEL-117",
    "name": "Limoncello Lemon",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 122,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1018,
        "label": "Sok z cytryny",
        "stage": "MIX",
        "grams": 300,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000368"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1019,
        "label": "Limoncello",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001770"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1020,
        "label": "Woda",
        "stage": "MIX",
        "grams": 414,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1021,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1022,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1023,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1024,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-mai-tai",
    "number": 118,
    "photoId": "GEL-118",
    "name": "Mai Tai",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 123,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1025,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 180,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1026,
        "label": "Rum",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1027,
        "label": "Orange liqueur",
        "stage": "MIX",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001766"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1028,
        "label": "Pasta migdałowa",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001512"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1029,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1030,
        "label": "Woda",
        "stage": "MIX",
        "grams": 404,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1031,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1032,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1033,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1034,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-mimosa",
    "number": 119,
    "photoId": "GEL-119",
    "name": "Mimosa",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 124,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1035,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1036,
        "label": "Prosecco",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000019"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1037,
        "label": "Woda",
        "stage": "MIX",
        "grams": 204,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1038,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1039,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1040,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1041,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-moscow-mule",
    "number": 120,
    "photoId": "GEL-120",
    "name": "Moscow Mule",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 125,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1042,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 180,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1043,
        "label": "Ginger beer",
        "stage": "MIX",
        "grams": 300,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001831"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1044,
        "label": "Wódka",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000037"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1045,
        "label": "Woda",
        "stage": "MIX",
        "grams": 324,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1046,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1047,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1048,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1049,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-negroni-orange",
    "number": 121,
    "photoId": "GEL-121",
    "name": "Negroni Orange",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 126,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1050,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1051,
        "label": "Gin",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001608"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1052,
        "label": "Bitter aperitivo 25%",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001400"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1053,
        "label": "Sweet vermouth",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001620"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1054,
        "label": "Woda",
        "stage": "MIX",
        "grams": 454,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1055,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1056,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1057,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1058,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-paloma",
    "number": 122,
    "photoId": "GEL-122",
    "name": "Paloma",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 127,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1059,
        "label": "Grapefruit juice",
        "stage": "MIX",
        "grams": 350,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000362"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1060,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1061,
        "label": "Tequila",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001761"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1062,
        "label": "Woda",
        "stage": "MIX",
        "grams": 314,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1063,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1064,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1065,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1066,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-passion-martini",
    "number": 123,
    "photoId": "GEL-123",
    "name": "Passion Fruit Martini",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 128,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1067,
        "label": "Puree marakuja",
        "stage": "MIX",
        "grams": 400,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000383"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1068,
        "label": "Wódka",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000037"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1069,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1070,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1071,
        "label": "Woda",
        "stage": "MIX",
        "grams": 289,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1072,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1073,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1074,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1075,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-pisco-sour",
    "number": 124,
    "photoId": "GEL-124",
    "name": "Pisco Sour",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 129,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1076,
        "label": "Sok z cytryny",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000368"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1077,
        "label": "Pisco",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1078,
        "label": "Woda",
        "stage": "MIX",
        "grams": 464,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1079,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1080,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1081,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1082,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-rose-berry",
    "number": 125,
    "photoId": "GEL-125",
    "name": "Rosé Berry",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 130,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1083,
        "label": "Puree czerwonych owoców",
        "stage": "MIX",
        "grams": 400,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001437"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1084,
        "label": "Rose wine",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000042"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1085,
        "label": "Woda",
        "stage": "MIX",
        "grams": 264,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1086,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1087,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1088,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1089,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-rum-cola",
    "number": 126,
    "photoId": "GEL-126",
    "name": "Rum & Cola",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 131,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1090,
        "label": "Cola",
        "stage": "MIX",
        "grams": 350,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001834"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1091,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1092,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1093,
        "label": "Woda",
        "stage": "MIX",
        "grams": 409,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1094,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1095,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1096,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1097,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-tequila-sunrise",
    "number": 127,
    "photoId": "GEL-127",
    "name": "Tequila Sunrise",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 132,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1098,
        "label": "Sok pomarańczowy",
        "stage": "MIX",
        "grams": 400,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000379"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1099,
        "label": "Pomegranate juice",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001524"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1100,
        "label": "Tequila",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001761"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1101,
        "label": "Woda",
        "stage": "MIX",
        "grams": 254,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1102,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1103,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1104,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1105,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-tom-collins",
    "number": 128,
    "photoId": "GEL-128",
    "name": "Tom Collins",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 133,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1106,
        "label": "Sok z cytryny",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000368"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1107,
        "label": "Gin",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001608"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1108,
        "label": "Woda",
        "stage": "MIX",
        "grams": 464,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1109,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1110,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1111,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1112,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-whisky-cola",
    "number": 129,
    "photoId": "GEL-129",
    "name": "Whisky & Cola",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": true,
    "processNotice": "Tara — składnik podlega obróbce cieplnej. Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
    "sourceRow": 134,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1113,
        "label": "Cola",
        "stage": "MIX",
        "grams": 350,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001834"
        },
        "marketAudit": "required",
        "processWarning": "Odgazuj napój przed użyciem. Mieszaj lub pozostaw otwarty, aż przestanie intensywnie się pienić. Do receptury użyj dopiero odgazowanego napoju.",
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1114,
        "label": "Whisky 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000038"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1115,
        "label": "Sok z limonki",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001525"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1116,
        "label": "Woda",
        "stage": "MIX",
        "grams": 409,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1117,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1118,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1119,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1120,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-whisky-sour",
    "number": 130,
    "photoId": "GEL-130",
    "name": "Whisky Sour",
    "collection": "cocktails_spirits",
    "subcategory": "Cocktail Sorbet",
    "origin": "Global",
    "continent": "Global",
    "productType": "Cocktail Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 135,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1121,
        "label": "Sok z cytryny",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000368"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1122,
        "label": "Whisky 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000038"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1123,
        "label": "Woda",
        "stage": "MIX",
        "grams": 464,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1124,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1125,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1126,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1127,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-brandy-cherry",
    "number": 131,
    "photoId": "GEL-131",
    "name": "Brandy Cherry",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Europa / global",
    "continent": "Europa",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 136,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1128,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 510,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1129,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1130,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1131,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1132,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1133,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1134,
        "label": "Puree wiśniowe",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001542"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1135,
        "label": "Brandy 36%",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000007"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1136,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-irish-coffee",
    "number": 132,
    "photoId": "GEL-132",
    "name": "Irish Coffee",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Irlandia",
    "continent": "Europa",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 137,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1137,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 525,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1138,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1139,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1140,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1141,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1142,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1143,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1144,
        "label": "Whisky 40%",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000038"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1145,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-port-fig",
    "number": 133,
    "photoId": "GEL-133",
    "name": "Port Wine & Fig",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Portugalia",
    "continent": "Europa",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 138,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1146,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1147,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1148,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1149,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1150,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1151,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1152,
        "label": "Figi świeże",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000354"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1153,
        "label": "Port wine",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1154,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "cocktail-espresso-martini",
    "number": 134,
    "photoId": "GEL-134",
    "name": "Espresso Martini",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Wielka Brytania / global",
    "continent": "Europa",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 139,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1155,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 518,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1156,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1157,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1158,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1159,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1160,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1161,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1162,
        "label": "Wódka",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000037"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1163,
        "label": "Likier kawowy",
        "stage": "MIX",
        "grams": 15,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000023"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1164,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-amaretto-almond",
    "number": 135,
    "photoId": "GEL-135",
    "name": "Amaretto Almond",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 140,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1165,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1166,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1167,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1168,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1169,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1170,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1171,
        "label": "Pasta migdałowa",
        "stage": "MIX",
        "grams": 105,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001512"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1172,
        "label": "Amaretto liqueur",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001768"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1173,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-amaretto-coffee",
    "number": 136,
    "photoId": "GEL-136",
    "name": "Amaretto Coffee",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 141,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1174,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1175,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1176,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1177,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1178,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1179,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1180,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1181,
        "label": "Amaretto liqueur",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001768"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1182,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-bourbon-caramel",
    "number": 137,
    "photoId": "GEL-137",
    "name": "Bourbon Caramel",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 142,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1183,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 540,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1184,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1185,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1186,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1187,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1188,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1189,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 135,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1190,
        "label": "Bourbon 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001737"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1191,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-bourbon-vanilla",
    "number": 138,
    "photoId": "GEL-138",
    "name": "Bourbon Vanilla",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 143,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1192,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 625,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1193,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1194,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1195,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1196,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1197,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1198,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1199,
        "label": "Bourbon 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001737"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1200,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-coffee-cream-liqueur",
    "number": 139,
    "photoId": "GEL-139",
    "name": "Coffee Cream Liqueur",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 144,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1201,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1202,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1203,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1204,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1205,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1206,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1207,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1208,
        "label": "Coffee cream liqueur",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000022"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1209,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-cognac-chocolate",
    "number": 140,
    "photoId": "GEL-140",
    "name": "Cognac Chocolate",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 145,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1210,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1211,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1212,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1213,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1214,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1215,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1216,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1217,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1218,
        "label": "Brandy Cognac",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001398"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1219,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-limoncello-cream",
    "number": 141,
    "photoId": "GEL-141",
    "name": "Limoncello Cream",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 146,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1220,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 570,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1221,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1222,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1223,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1224,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1225,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1226,
        "label": "Lemon curd",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000725"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1227,
        "label": "Limoncello",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001770"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1228,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-orange-dark-choc",
    "number": 142,
    "photoId": "GEL-142",
    "name": "Orange Liqueur Dark Chocolate",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 147,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1229,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 540,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1230,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1231,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1232,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1233,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1234,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1235,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1236,
        "label": "Orange liqueur",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001766"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1237,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-rum-raisin",
    "number": 143,
    "photoId": "GEL-143",
    "name": "Rum & Raisin",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 148,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1238,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 545,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1239,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1240,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1241,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1242,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1243,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1244,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1245,
        "label": "Raisins",
        "stage": "LATE ADD",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001498"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1246,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-rum-chocolate",
    "number": 144,
    "photoId": "GEL-144",
    "name": "Rum Chocolate",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 149,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1247,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1248,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1249,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1250,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1251,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1252,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1253,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1254,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1255,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1256,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-rum-coconut",
    "number": 145,
    "photoId": "GEL-145",
    "name": "Rum Coconut",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 150,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1257,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 520,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1258,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1259,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1260,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1261,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1262,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1263,
        "label": "Pasta kokosowa",
        "stage": "MIX",
        "grams": 160,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000151"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1264,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1265,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-rum-coffee",
    "number": 146,
    "photoId": "GEL-146",
    "name": "Rum Coffee",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 151,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1266,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1267,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1268,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1269,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1270,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1271,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1272,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1273,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1274,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-whisky-caramel",
    "number": 147,
    "photoId": "GEL-147",
    "name": "Whisky Caramel",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 152,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1275,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 540,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1276,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1277,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1278,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1279,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1280,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1281,
        "label": "Karmel",
        "stage": "MIX",
        "grams": 135,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000308"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1282,
        "label": "Whisky 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000038"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1283,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-whisky-chocolate",
    "number": 148,
    "photoId": "GEL-148",
    "name": "Whisky Chocolate",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 153,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1284,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 500,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1285,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1286,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1287,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1288,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1289,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1290,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1291,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1292,
        "label": "Whisky 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000038"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1293,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-whisky-coffee",
    "number": 149,
    "photoId": "GEL-149",
    "name": "Whisky Coffee",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 154,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1294,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1295,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1296,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1297,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1298,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1299,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1300,
        "label": "Espresso",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001591"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1301,
        "label": "Whisky 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000038"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1302,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "spirit-whisky-vanilla",
    "number": 150,
    "photoId": "GEL-150",
    "name": "Whisky Vanilla",
    "collection": "cocktails_spirits",
    "subcategory": "Spirit Gelato",
    "origin": "Global",
    "continent": "Global",
    "productType": "Spirit Gelato",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 155,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1303,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 625,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1304,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1305,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1306,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1307,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1308,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1309,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1310,
        "label": "Whisky 40%",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000038"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1311,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-ar-sambayon",
    "number": 151,
    "photoId": "GEL-151",
    "name": "Sambayón",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Argentyna",
    "continent": "Ameryka Południowa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 156,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1312,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 558,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1313,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 140,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1314,
        "label": "Żółtko jaja kurzego w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001645"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1315,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1316,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 85,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1317,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1318,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1319,
        "label": "Marsala Dolce 18%",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000027"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1320,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-ec-paila-mora",
    "number": 152,
    "photoId": "GEL-152",
    "name": "Helado de Paila — Mora",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Ekwador",
    "continent": "Ameryka Południowa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 157,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1321,
        "label": "Puree jeżyn / mora",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001544"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1322,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1323,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1324,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1325,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1326,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-pe-queso-helado",
    "number": 153,
    "photoId": "GEL-153",
    "name": "Queso Helado Arequipeño",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Peru",
    "continent": "Ameryka Południowa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 158,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1327,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 634,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1328,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1329,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1330,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1331,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1332,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 45,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1333,
        "label": "Pasta kokosowa",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000151"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1334,
        "label": "Cynamon",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001661"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1335,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1336,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-mx-nieve-mango",
    "number": 154,
    "photoId": "GEL-154",
    "name": "Nieve de Garrafa — Mango",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Meksyk",
    "continent": "Ameryka Północna",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 159,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1337,
        "label": "Puree mango",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000340"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1338,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1339,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1340,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1341,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1342,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-us-rocky-road",
    "number": 155,
    "photoId": "GEL-155",
    "name": "Rocky Road",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "USA",
    "continent": "Ameryka Północna",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 160,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1343,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 460,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1344,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1345,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1346,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1347,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1348,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 38,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1349,
        "label": "Czekolada ciemna",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000087"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1350,
        "label": "Kakao odtłuszczone 12%",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001579"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1351,
        "label": "Marshmallow kawałki",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-002076"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1352,
        "label": "Migdały prażone kawałki",
        "stage": "LATE ADD",
        "grams": 50,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 11,
        "sourceRow": 1353,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-in-kulfi",
    "number": 156,
    "photoId": "GEL-156",
    "name": "Kesar Pista Kulfi",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Indie",
    "continent": "Azja",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": null,
    "sourceRow": 161,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1354,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 642,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1355,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1356,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1357,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1358,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1359,
        "label": "Pasta pistacjowa 100%",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000624"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1360,
        "label": "Szafran",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1361,
        "label": "Kardamon",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001671"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-jp-matcha-azuki",
    "number": 157,
    "photoId": "GEL-157",
    "name": "Matcha Azuki",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Japonia",
    "continent": "Azja",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 162,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1362,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 570,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1363,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1364,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1365,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1366,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 60,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1367,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1368,
        "label": "Matcha",
        "stage": "MIX",
        "grams": 12,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000169"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1369,
        "label": "Pasta azuki słodka",
        "stage": "MIX",
        "grams": 83,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1370,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-tr-maras",
    "number": 158,
    "photoId": "GEL-158",
    "name": "Maraş Dondurma",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Turcja",
    "continent": "Azja",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": null,
    "sourceRow": 163,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1371,
        "label": "Mleko kozie",
        "stage": "MIX",
        "grams": 842,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1372,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1373,
        "label": "Salep",
        "stage": "MIX",
        "grams": 6,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1374,
        "label": "Guma arabska",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-fr-plombieres",
    "number": 159,
    "photoId": "GEL-159",
    "name": "Plombières",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Francja",
    "continent": "Europa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 164,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1375,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1376,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1377,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1378,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1379,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1380,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1381,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1382,
        "label": "Kirsch",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1383,
        "label": "Owoce kandyzowane",
        "stage": "MIX",
        "grams": 70,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 10,
        "sourceRow": 1384,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-gr-kaimaki",
    "number": 160,
    "photoId": "GEL-160",
    "name": "Kaimaki",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Grecja",
    "continent": "Europa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": null,
    "sourceRow": 165,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1385,
        "label": "Mleko pełne",
        "stage": "MIX",
        "grams": 704,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1386,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 140,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1387,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1388,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1389,
        "label": "Salep / salepi",
        "stage": "MIX",
        "grams": 4,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1390,
        "label": "Mastiha Chios",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-es-turron",
    "number": 161,
    "photoId": "GEL-161",
    "name": "Turrón de Jijona",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Hiszpania",
    "continent": "Europa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 166,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1391,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 560,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1392,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1393,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1394,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1395,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1396,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1397,
        "label": "Turrón de Jijona / pasta",
        "stage": "MIX",
        "grams": 160,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1398,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-pl-yolk-v2",
    "number": 162,
    "photoId": "GEL-162",
    "name": "Śmietankowe na żółtkach",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Polska",
    "continent": "Europa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "CORRECTION_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 167,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1399,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 595,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1400,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 180,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1401,
        "label": "Żółtko jaja kurzego w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001645"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1402,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1403,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1404,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1405,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 13,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1406,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-gb-rum-raisin",
    "number": 163,
    "photoId": "GEL-163",
    "name": "Rum & Raisin",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Wielka Brytania",
    "continent": "Europa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 168,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1407,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 570,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1408,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 120,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1409,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1410,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 75,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1411,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1412,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 48,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1413,
        "label": "Rum",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000035"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1414,
        "label": "Rodzynki",
        "stage": "LATE ADD",
        "grams": 60,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1415,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-it-zabaione",
    "number": 164,
    "photoId": "GEL-164",
    "name": "Zabaione al Marsala",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Włochy",
    "continent": "Europa",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 169,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1416,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 568,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1417,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1418,
        "label": "Żółtko jaja kurzego w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001645"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1419,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 25,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1420,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 85,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1421,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 65,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1422,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1423,
        "label": "Marsala Dolce 18%",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000027"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1424,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "lost-nz-hokey-pokey",
    "number": 165,
    "photoId": "GEL-165",
    "name": "Hokey Pokey",
    "collection": "lost_legendary",
    "subcategory": "Heritage",
    "origin": "Nowa Zelandia",
    "continent": "Oceania",
    "productType": "Heritage Gelato / Sorbet",
    "sourceStatus": "NEW_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 170,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1425,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 555,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1426,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1427,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 40,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1428,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1429,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1430,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1431,
        "label": "Pasta waniliowa",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001705"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 8,
        "sourceRow": 1432,
        "label": "Honeycomb / Hokey Pokey crunch",
        "stage": "LATE ADD",
        "grams": 95,
        "identity": {
          "kind": "unresolved",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 9,
        "sourceRow": 1433,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-protein-11",
    "number": 166,
    "photoId": "GEL-166",
    "name": "Protein −11°C",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "VERIFIED_EXISTING",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 171,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1434,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1435,
        "label": "Protein Gel WPC",
        "stage": "MIX",
        "grams": 247,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000264"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1436,
        "label": "Woda",
        "stage": "MIX",
        "grams": 505,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1437,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1438,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 56,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1439,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-protein-12-v2",
    "number": 167,
    "photoId": "GEL-167",
    "name": "Protein −12°C — correction v2",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "CORRECTION_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 172,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1440,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1441,
        "label": "Protein Gel WPC",
        "stage": "MIX",
        "grams": 247,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000264"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1442,
        "label": "Woda",
        "stage": "MIX",
        "grams": 505,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1443,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1444,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 86,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1445,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-protein-13-v2",
    "number": 168,
    "photoId": "GEL-168",
    "name": "Protein −13°C — correction v2",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "CORRECTION_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 173,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1446,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 110,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1447,
        "label": "Protein Gel WPC",
        "stage": "MIX",
        "grams": 247,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000264"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1448,
        "label": "Woda",
        "stage": "MIX",
        "grams": 505,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1449,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 20,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1450,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 116,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1451,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-sorbet-11",
    "number": 169,
    "photoId": "GEL-169",
    "name": "Sorbet −11°C scaffold / 600 g Main",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "SCAFFOLD_RECALC_BY_MAIN",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 174,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1452,
        "label": "Wybrany owoc / Main",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "dynamic_main",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1453,
        "label": "Woda",
        "stage": "MIX",
        "grams": 181,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1454,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 104,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1455,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 59,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1456,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1457,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-sorbet-12",
    "number": 170,
    "photoId": "GEL-170",
    "name": "Sorbet −12°C scaffold / 600 g Main",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "SCAFFOLD_RECALC_BY_MAIN",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 175,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1458,
        "label": "Wybrany owoc / Main",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "dynamic_main",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1459,
        "label": "Woda",
        "stage": "MIX",
        "grams": 164,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1460,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1461,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 90,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1462,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1463,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-sorbet-13",
    "number": 171,
    "photoId": "GEL-171",
    "name": "Sorbet −13°C scaffold / 600 g Main",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "SCAFFOLD_RECALC_BY_MAIN",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 176,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1464,
        "label": "Wybrany owoc / Main",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "dynamic_main",
          "sourceIdStatus": "BRAK"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1465,
        "label": "Woda",
        "stage": "MIX",
        "grams": 146,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1466,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 78,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1467,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1468,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 50,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1469,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 1,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-gelato-11",
    "number": 172,
    "photoId": "GEL-172",
    "name": "Standard Gelato −11°C",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "VERIFIED_EXISTING",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 177,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1470,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 670,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1471,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1472,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 35,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1473,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 130,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1474,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 30,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1475,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 5,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-gelato-12",
    "number": 173,
    "photoId": "GEL-173",
    "name": "Standard Gelato −12°C — G17",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "VERIFIED_EXISTING",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 178,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1476,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 600,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1477,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 135,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1478,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1479,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 86,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1480,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 80,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1481,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 54,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1482,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-gelato-13-v2",
    "number": 174,
    "photoId": "GEL-174",
    "name": "Standard Gelato −13°C — correction v2",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "CORRECTION_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 179,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1483,
        "label": "Mleko 3.5%",
        "stage": "MIX",
        "grams": 602,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000236"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1484,
        "label": "Śmietanka 30%",
        "stage": "MIX",
        "grams": 125,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000180"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1485,
        "label": "Odtłuszczone mleko w proszku",
        "stage": "MIX",
        "grams": 43,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000270"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1486,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 72,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1487,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 112,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1488,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 44,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1489,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-vegan-11-v2",
    "number": 175,
    "photoId": "GEL-175",
    "name": "Vegan −11°C — correction v2",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "CORRECTION_TO_ENGINE",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 180,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1490,
        "label": "Woda",
        "stage": "MIX",
        "grams": 412,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1491,
        "label": "Napój owsiany",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001565"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1492,
        "label": "Olej kokosowy rafinowany",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000163"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1493,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 175,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1494,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 55,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1495,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1496,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-vegan-12",
    "number": 176,
    "photoId": "GEL-176",
    "name": "Vegan −12°C",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "VERIFIED_EXISTING",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 181,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1497,
        "label": "Woda",
        "stage": "MIX",
        "grams": 397,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1498,
        "label": "Napój owsiany",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001565"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1499,
        "label": "Olej kokosowy rafinowany",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000163"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1500,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 145,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1501,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 100,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1502,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1503,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  },
  {
    "recipeId": "tech-vegan-13",
    "number": 177,
    "photoId": "GEL-177",
    "name": "Vegan −13°C",
    "collection": "technical_bases",
    "subcategory": "Technical",
    "origin": null,
    "continent": null,
    "productType": "Technical Base",
    "sourceStatus": "VERIFIED_EXISTING",
    "sourceTotalGrams": 1000,
    "degassingRequired": false,
    "processNotice": "Tara — składnik podlega obróbce cieplnej.",
    "sourceRow": 182,
    "lines": [
      {
        "line": 1,
        "sourceRow": 1504,
        "label": "Woda",
        "stage": "MIX",
        "grams": 397,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001409"
        },
        "marketAudit": "local_raw_material",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 2,
        "sourceRow": 1505,
        "label": "Napój owsiany",
        "stage": "MIX",
        "grams": 250,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-001565"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 3,
        "sourceRow": 1506,
        "label": "Olej kokosowy rafinowany",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000163"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 4,
        "sourceRow": 1507,
        "label": "Sacharoza",
        "stage": "MIX",
        "grams": 95,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000514"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 5,
        "sourceRow": 1508,
        "label": "Dekstroza",
        "stage": "MIX",
        "grams": 150,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000494"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 6,
        "sourceRow": 1509,
        "label": "Inulina",
        "stage": "MIX",
        "grams": 53,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000456"
        },
        "marketAudit": "required",
        "processWarning": null,
        "publicLabelOnly": false,
        "note": null
      },
      {
        "line": 7,
        "sourceRow": 1510,
        "label": "Guma tara",
        "stage": "MIX",
        "grams": 2,
        "identity": {
          "kind": "mapped",
          "mapperIngredientId": "PI-ING-000492"
        },
        "marketAudit": "required",
        "processWarning": "Tara — składnik podlega obróbce cieplnej.",
        "publicLabelOnly": false,
        "note": null
      }
    ]
  }
];
