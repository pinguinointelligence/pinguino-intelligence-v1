# Mapper 2088 Product Behavior Audit

Generated deterministically from the locked Mapper CSV and its immutable process companion. This report does not write to Mapper.

## Reconciliation

- Mapper rows: **2088**
- Unique Mapper IDs: **2088**
- Process rows joined: **2088**
- Mapper SHA-256: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`
- Process SHA-256: `c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4`
- Detailed exhaustive output: [MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv](./MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv)

## Main eligibility

- MAIN_BLOCKED_POLICY: **1314**
- MAIN_PROFILE_SPECIFIC: **3**
- NOT_MAIN: **765**
- PROTEIN_CONTRIBUTOR_ONLY: **6**

Only three exact owner fixtures have a provisional Main policy binding. Genuine flavour/product-form candidates without approved science are deterministically MAIN_BLOCKED_POLICY: they remain usable as Standard where Mapper permits, but cannot be optimized as Main. Protein-category rows are PROTEIN_CONTRIBUTOR_ONLY. Every other row is deterministically NOT_MAIN. No family, form, concentration or limit is guessed.

## Process evidence

- COLD_PROCESS_OK: **636**
- HEAT_REQUIRED_FOR_FUNCTION: **56**
- HEAT_REQUIRED_FOR_SAFETY: **7**
- UNKNOWN: **1389**

## Coverage limitations

- Governed Main envelope coverage: **3 / 2088** exact reviewed bindings.
- All 2088 rows have a deterministic ordinary behavior; generic runtime UNKNOWN is zero.
- Protein percentages are preserved as evidence. Positive protein is not promoted to a final behavior except as an explicit contributor candidate.
- Runtime active catalog counts require the service-only `catalog_product_behavior_audit_v1` view on a migrated database. The linked staging migration ledger is currently unreconciled, so catalog counts are not fabricated here.
