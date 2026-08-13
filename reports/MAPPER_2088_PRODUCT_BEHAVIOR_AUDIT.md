# Mapper 2088 Product Behavior Audit

Generated deterministically from the locked Mapper CSV and its immutable process companion. This report does not write to Mapper and does not create flavour science.

## Reconciliation

- Mapper rows: **2088**
- Unique Mapper IDs: **2088**
- Process rows joined: **2088**
- Mapper SHA-256: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`
- Process SHA-256: `c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4`
- Detailed exhaustive output: [MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv](./MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv)

## Behavior role (separate from policy coverage)

- UNKNOWN_REQUIRES_EVIDENCE: **1387**
- STANDARD_ONLY: **456**
- STRUCTURAL_ONLY: **119**
- TOPPING_ONLY: **112**
- MAIN_PROFILE_SPECIFIC: **8**
- PROTEIN_CONTRIBUTOR_ONLY: **6**

## Main policy status

- BLOCKED_DATA: **833**
- NOT_APPLICABLE: **693**
- BLOCKED_SCIENCE: **554**
- COVERED: **8**

Eight exact identities have profile-scoped Main coverage: three owner-provisional dairy fixtures and seven exact PINGUINO-calibrated Sorbet/Vegan fixture policies (Strawberry is shared by all three profiles). Flavor candidates without sufficient family/form/concentration evidence are BLOCKED_DATA. Candidates with an identified family and form but without approved sensory limits are BLOCKED_SCIENCE. Neither status changes existing Base/Engine approvals.

## Stable family classification

- UNRESOLVED: **1353**
- fruit: **170**
- chocolate_cocoa: **155**
- nut: **134**
- alcohol: **122**
- bakery_cookie: **49**
- coffee: **30**
- coconut: **26**
- dairy_flavour: **19**
- spice_herb: **15**
- caramel: **9**
- honey: **3**
- vanilla: **3**

UNRESOLVED is retained only where the structured Mapper category/subcategory cannot establish a stable family without guessing. Every unresolved automatic-Main candidate has an exact reason in the CSV.

## Exact reason coverage

- process_evidence_missing: **1389**
- family_evidence_missing: **657**
- profile_main_policy_missing: **554**
- standard_product_not_flavour_main: **456**
- form_or_concentration_evidence_missing: **139**
- structural_product_not_flavour_main: **119**
- post_process_product_not_base_main: **112**
- family_and_form_evidence_missing: **37**
- protein_contributor_not_flavour_main: **6**
- protein_flavour_envelope_not_sensory_calibrated: **5**

## Process evidence

- UNKNOWN: **1389**
- COLD_PROCESS_OK: **636**
- HEAT_REQUIRED_FOR_FUNCTION: **56**
- HEAT_REQUIRED_FOR_SAFETY: **7**

## Science boundary

- Exact governed Main coverage: **8 / 2088** identity bindings (profile applicability remains explicit per row).
- Runtime role classification is exhaustive: **2088 / 2088**.
- Automatic-Main unknowns without an exact reason: **0**.
- The audit does not infer compound concentration, coffee retained mass, alcohol ABV or flavour intensity. Sorbet/Vegan policies are restricted to exact accepted template fixtures. Protein flavour fixtures remain explicitly blocked because the accepted calibration proves protein-target feasibility, not a sensory Main envelope.
