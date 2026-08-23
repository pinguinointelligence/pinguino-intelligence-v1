# Mapper 2088 Product Behavior Audit

Generated deterministically from the locked Mapper CSV and its immutable process companion. This report does not write to Mapper and does not create flavour science.

## Reconciliation

- Mapper rows: **2088**
- Unique Mapper IDs: **2088**
- Process rows joined: **2088**
- Mapper SHA-256: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` (pinned)
- Process SHA-256: `c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4` (pinned)
- Detailed exhaustive output: [MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv](./MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv)

## Behavior role (separate from policy coverage)

- UNKNOWN_REQUIRES_EVIDENCE: **832**
- STANDARD_ONLY: **455**
- MAIN_ALLOWED: **454**
- STRUCTURAL_ONLY: **119**
- TOPPING_ONLY: **112**
- MAIN_PROFILE_SPECIFIC: **110**
- PROTEIN_CONTRIBUTOR_ONLY: **6**

## Main policy status

- BLOCKED_DATA: **1050**
- NOT_APPLICABLE: **692**
- BLOCKED_SCIENCE: **236**
- COVERED: **110**

Profile-scoped coverage comes from the published server policy registry. Identity-bound policies and their evidence are listed in the Main Flavour Envelope Registry; the audit never promotes a row from technical feasibility alone. Protein Coffee remains deliberately uncovered because infusion input and retained product mass are not equivalent. Flavor candidates without sufficient family/form/concentration evidence are BLOCKED_DATA. Candidates with an identified family and form but without approved sensory limits are BLOCKED_SCIENCE. Neither status changes existing Base/Engine approvals.

## Stable family classification

- UNRESOLVED: **1351**
- fruit: **170**
- chocolate_cocoa: **156**
- nut: **134**
- alcohol: **122**
- bakery_cookie: **49**
- coffee: **30**
- coconut: **26**
- dairy_flavour: **19**
- spice_herb: **15**
- caramel: **9**
- vanilla: **4**
- honey: **3**

UNRESOLVED is retained only where the structured Mapper category/subcategory cannot establish a stable family without guessing. Every unresolved automatic-Main candidate has an exact reason in the CSV.

## Exact reason coverage

- family_evidence_missing: **656**
- standard_product_not_flavour_main: **455**
- form_or_concentration_evidence_missing: **353**
- profile_main_policy_missing: **236**
- structural_product_not_flavour_main: **119**
- post_process_product_not_base_main: **112**
- family_and_form_evidence_missing: **37**
- protein_contributor_not_flavour_main: **6**
- abv_evidence_missing: **4**

## Process evidence

- UNKNOWN: **1389**
- COLD_PROCESS_OK: **636**
- HEAT_REQUIRED_FOR_FUNCTION: **56**
- HEAT_REQUIRED_FOR_SAFETY: **7**

UNKNOWN is preserved fail-closed and does not grant an automatic Main policy. The exhaustive CSV carries the exact immutable source `process_reason_codes`, `process_rule_id` and `process_notes` for every row; an UNKNOWN result is therefore an explicit evidence gap, never a silently processed default.

### Process source reason codes

- PROCESS_DATA_INSUFFICIENT: **1330**
- READY_TO_USE_VARIEGATO: **245**
- COMMERCIAL_ALCOHOL_COLD_HEAT_SENSITIVE: **125**
- FRESH_PRODUCE_WASH_REQUIRED: **64**
- COMMERCIAL_READY_TO_DRINK: **55**
- SOLID_FAT_OR_CHOCOLATE_MELT_REQUIRED: **43**
- COMMON_SWEETENER_COLD_MIXING: **42**
- COOKED_BAKERY_INCLUSION_READY: **42**
- FROZEN_FRUIT_NOT_A_KILL_STEP: **33**
- COCOA_POWDER_MIXING: **20**
- SALT_COLD_SOLUBLE: **10**
- LIQUID_OIL_COLD: **8**
- EXPLICIT_UHT_READY_TO_USE: **7**
- POTABLE_WATER_COLD: **5**
- RAW_FLOUR_PATHOGEN_RISK: **5**
- WPC_PASTEURIZED_BUT_HYDRATION_PROCESS_DEPENDENT: **5**
- EXACT_PRODUCT_HOT_AND_COLD: **4**
- INULIN_SOLUBILITY_GRADE_DEPENDENT: **4**
- NATIVE_STARCH_COLD_INSOLUBLE: **4**
- DAIRY_POWDER_EXACT_PROCESS_MISSING: **3**
- PLANT_PROTEIN_GRADE_DEPENDENT: **3**
- SMP_PROCESS_GRADE_DEPENDENT: **3**
- CHOCOLATE_PASTE_PROCESS_NOT_CONFIRMED: **2**
- DRIED_EGG_PROCESS_NOT_VERIFIED: **2**
- EXACT_BASE_REQUIRES_PASTEURIZATION: **2**
- EXPLICIT_PASTEURIZED_PRODUCT: **2**
- LACTOSE_SOLUBILITY_PROCESS_DEPENDENT: **2**
- LBG_FULL_HYDRATION_REQUIRES_HEAT: **2**
- PASTEURIZED_EGG_READY: **2**
- RAW_EGG_SALMONELLA_RISK: **2**
- SOLID_FAT_MELT_REQUIRED: **2**
- AGAR_DISSOLUTION_REQUIRES_HEAT: **1**
- EGG_PRODUCT_PASTEURIZATION_NOT_CONFIRMED: **1**
- EXACT_PRODUCT_COLD_LATE_ADDITION: **1**
- EXACT_PRODUCT_FOUND_PROCESS_NOT_CONFIRMED: **1**
- EXACT_PRODUCT_HOT_PROCESS: **1**
- GUAR_COLD_SOLUBLE: **1**
- INTERNAL_EXACT_COLD_REST_OR_LOW_HEAT: **1**
- INTERNAL_EXACT_HOT_COLD: **1**
- TARA_FULL_HYDRATION_REQUIRES_WARM_WATER: **1**
- XANTHAN_COLD_SOLUBLE: **1**

## Science boundary

- Exact governed Main coverage: **110 / 2088** identity bindings (profile applicability remains explicit per row).
- Runtime role classification is exhaustive: **2088 / 2088**.
- Automatic-Main unknowns without an exact reason: **0**.
- The audit does not infer compound concentration, coffee retained mass, alcohol ABV or flavour intensity. Sorbet, Vegan and Protein policies are restricted to exact accepted template/calibration identities; every other form remains blocked with its exact missing-data or missing-science reason.
