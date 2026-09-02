# Watermelon final served QA

Target: `https://staging.pinguinoai.com` only. Production is out of scope and must remain unchanged.

Runtime-fix SHA: `7b88ddde5c7f7aefa5b8f61f6922b75041392380`. Its verified Vercel deployment: `dpl_CpUZduoM7phiRRBdC2a7yCqSKZd8` (`READY`). Served bundle: `assets/index-DfTHAuSG.js` (3,115,834 bytes). Applied staging migrations: `20260815152000` and forward audit projection repair `20260815153000`. A later evidence-only commit may redeploy the byte-equivalent application; the final ledger records that deployment separately.

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
| WM-01 authenticated `watermelon` search | PASS | 11 exact rows captured with distinct product UUID, version UUID, Mapper ID and form |
| WM-02 Fresh selection and Base add | PASS | row enabled; `Dane szacowane`; exact Fresh identity; no Mapper-missing message |
| WM-03 unknown dosage | PASS | added as 0 g; PI showed `Podaj gramaturę dla: WATERMELON · Fresh Fruit. Minimalna ilość to 1 g.` |
| WM-04 200 g technical PI | PASS WITH DRAFT QUALIFICATION | Fresh was accepted by normal authenticated resolver as `eligible` / ECO `eligible`, Estimated, COLD_PROCESS_OK and no block reasons. The browser run at 200 g named only stale bindings of pre-existing Colina22 lines; Watermelon was not refused. A clean-draft Preview remains part of Owner retest so the existing unsaved draft is not destroyed. |
| WM-05 form separation | PASS | all 11 rows retained their own UUID/version/Mapper/form; no Fresh transfer |
| Save snapshot | AUTOMATED + AUTHORITY PASS / OWNER UI RETEST | persistence and terminal-authority suites preserve Estimated plus exact product/version/Mapper IDs; no destructive save was made over the Owner's existing unsaved Colina22 draft |

Fresh Watermelon has complete required numerical facts, `approved_for_base=true`, `approved_for_engines=true`, and `COLD_PROCESS_OK / WASH_AND_PREP`. Its missing verified dosage changes only the initial grams. It must enter Base at 0 g and become technically calculable after the Owner enters at least 1 g.

Authenticated staging resolver proof for Fresh Watermelon: `state=eligible`, `catalogStatus=estimated`, `mapperVerificationStatus=Estimated`, `moduleEligibility.ECO=eligible`, `processBehavior.decision=COLD_PROCESS_OK`, `recommendedDose=null`, binding `9542978c-7729-4388-83dc-1c52b7728d0a`, and no block reasons. The exhaustive authenticated audit returned 2,088 unique rows with zero missing product versions and zero missing bindings.
