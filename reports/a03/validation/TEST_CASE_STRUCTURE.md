# Country-base validation — test-case structure (prepared by SHOP, D-33)

SHOP prepares the structure only. The Engine/Recipe validation workstream implements and runs it, after the Owner's
complete Excel has been reconciled. SHOP does not implement or modify any Engine harness.

## One case per market × profile

| part | content | source |
|---|---|---|
| id | `COUNTRY-BASE-<ISO2>-GELATO-v<n>` | manifest |
| input | the manifest (`country_validation_manifest.schema.json`): exact products per slot (PI, PR, EAN, facts per 100 g with truth per field), starting grams from the Owner Excel, profile, locale variants | Owner Excel + reconciliation + PR facts |
| precondition | every product row reconciled with verdict OK (s1–s9); no REPORT_BACK open for the market | `tooling/reconcile_owner_excel.py` |
| action | run the actual profile Engine/Solver on the production path — the same Solver/Constraint Studio the app uses | Engine/Recipe workstream |
| expected | solver stop reason `all_bands_in_range`; every required band/gate of the GELATO profile in range; no hidden calibration/fallback warnings; the UI/result shows acceptance 10/10 | D-33 |
| on success | freeze the exact country grams as a versioned base; record engine/config versions and the hashes of the Owner Excel, the Mapper 2541 and each PR's facts | manifest `freeze` |
| on failure | status `ENGINE_NOT_ACCEPTED`, with the out-of-band bands and warnings. The failure goes back to the Owner. No product is swapped and no grams are forced inside the case. | D-26, D-27 |

## Rules the cases must keep

- 10/10 is the production acceptance state (all required bands/gates in range). No internal 0–100 score stands in for it.
- The stabilizer line uses the product and PI actually selected. The 3 g TARA reference never carries over to GUAR, LBG
  or a blend (D-15, D-18).
- Sucrose is the global PI with the approved local consumer term per locale. It carries no brand and no EAN (D-8, D-32).
- Label facts are normalized with 1 ml = 1 g, and the raw basis is kept (owner-frozen rule).
- Multilingual markets: one validated base, rendered in every supported locale variant (D-32).

## Files

- `country_validation_manifest.schema.json` — the manifest contract.
- `country_validation_manifest_template.csv` — one row per market, every status `PENDING_OWNER_EXCEL`.
- `../VERIFICATION_CHECKLIST_75.csv` — the 9 reconciliation steps per market × slot.
