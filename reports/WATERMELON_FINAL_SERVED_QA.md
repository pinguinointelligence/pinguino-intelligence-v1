# Watermelon final served QA

Target: `https://staging.pinguinoai.com` only. Production is out of scope and must remain unchanged.

Final served SHA, deployment ID and bundle are **PENDING_FINAL_STAGING_DEPLOY**. This report is deliberately not marked PASS before the forward migration, app bundle and authenticated browser QA are all on the same SHA.

## Exact identity table

| Product ID | Product version | Product / form | Mapper ID | Immutable provenance | Expected final badge | Binding transfer |
|---|---|---|---|---|---|---|
| `e3264816-1050-d2a6-cc55-149e0d363bbf` | `009d5b8a-f0bd-4c19-958b-3feec2f045f9` | WATERMELON · Fresh Fruit / fresh | `PI-ING-000405` | Estimated · confidence 92 | `Dane szacowane` | exact fresh only |
| `54188c6b-c1c7-332d-5c60-ed30b6c4d89d` | `18894ccb-76d0-410f-8619-8e7567dee5b2` | MALIBU WATERMELON / alcoholic beverage | `PI-ING-001764` | Verified / PI Calculated | `PINGÜINO — SPRAWDZONY` | never fresh |
| `f94ca5c0-181e-fc85-3547-cb2a7e126d62` | `10c7fe54-54fa-4292-bf94-9844bfc9c32e` | RED BULL RED EDITION WATERMELON / energy drink | `PI-ING-001787` | Verified / PI Calculated | `PINGÜINO — SPRAWDZONY` | never fresh |
| `48e9321f-55c5-65ff-d44e-54a5cf1dfacd` | `7ea539af-5a7d-4660-8c13-8a4e3ccdb266` | RED BULL WATERMELON SUGARFREE / energy drink | `PI-ING-001788` | Verified / PI Calculated | `PINGÜINO — SPRAWDZONY` | never fresh/regular |
| `c02d67da-6a60-d79d-2409-04ad28512f19` | `c4a2183c-9464-42b4-bfd8-07f151a11ed9` | SIMPLE WATERMELON Fabbri Base Mix / powder | `PI-ING-000676` | Verified | `PINGÜINO — SPRAWDZONY` | never fresh |
| `c6eda2c3-6654-90bc-71e1-36f91b6e1513` | `6437a281-10d1-4eb3-86d5-fa51bf6ac72b` | Campisi Citrus Juice Frozen / juice | `PI-ING-000360` | Verified | `PINGÜINO — SPRAWDZONY` | never fresh |
| `826369d8-6a65-8e1c-ce72-f65142dc45e8` | `36fcc7dd-0f8b-47bd-a060-57a13eeb3f01` | Master Martini Powder Mix / powder | `PI-ING-001630` | Verified | `PINGÜINO — SPRAWDZONY` | never fresh |
| `576d8597-757c-858c-8093-b511be5df8fd` | `929a7b5b-738c-4f87-ba32-9775487143fa` | EFFECT WATERMELON SPLASH / energy drink | `PI-ING-001818` | Estimated / Needs Label Review | `WYMAGA SPRAWDZENIA ETYKIETY` | never fresh |
| `437fea0a-e6a3-24ef-357c-a8d847bcbe52` | `635689d6-1607-4d53-99ea-b6e6318e0385` | MONSTER ULTRA WATERMELON / energy drink | `PI-ING-001927` | Estimated / Needs Label Review | `WYMAGA SPRAWDZENIA ETYKIETY` | never fresh |
| `c124a6c2-d85a-71e4-e3ec-02e9e0073aab` | `422c9dca-ac02-4ee6-ac30-43ee096efe2c` | ROCKSTAR WATERMELON KIWI ZERO / energy drink | `PI-ING-001973` | Estimated / Needs Label Review | `WYMAGA SPRAWDZENIA ETYKIETY` | never fresh |
| `bb0b2840-67a9-3d5b-9bb2-b664918c9528` | `e985b999-377c-437c-b2c9-4d55e7871284` | PRIME STRAWBERRY WATERMELON / sports drink | `PI-ING-002082` | Estimated / Needs Label Review | `WYMAGA SPRAWDZENIA ETYKIETY` | never fresh |

## Required final served checks

| Check | Status | Evidence required before PASS |
|---|---|---|
| WM-01 authenticated `watermelon` search | PENDING_FINAL_SERVED_CAPTURE | all 11 exact rows, safe DOM IDs/version/Mapper/form/status |
| WM-02 Fresh selection and Base add | PENDING_FINAL_SERVED_CAPTURE | selectable, exact Estimated badge, no Mapper-missing message |
| WM-03 unknown dosage | PENDING_FINAL_SERVED_CAPTURE | initial 0 g and exact Polish dosage instruction |
| WM-04 200 g technical PI | PENDING_FINAL_SERVED_CAPTURE | visible Preview/no-change/real technical result; no provenance refusal |
| WM-05 form separation | PENDING_FINAL_SERVED_CAPTURE | all alcohol/juice/powder/energy/sports forms retain their own IDs |
| Save snapshot | PENDING_FINAL_SERVED_CAPTURE | exact Fresh snapshot remains Estimated and retains product/version/Mapper IDs |

Fresh Watermelon has complete required numerical facts, `approved_for_base=true`, `approved_for_engines=true`, and `COLD_PROCESS_OK / WASH_AND_PREP`. Its missing verified dosage changes only the initial grams. It must enter Base at 0 g and become technically calculable after the Owner enters at least 1 g.
