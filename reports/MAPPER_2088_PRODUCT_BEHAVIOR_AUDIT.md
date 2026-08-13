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

- MAIN_PROFILE_SPECIFIC: **3**
- NOT_MAIN: **119**
- UNKNOWN: **1966**

Only three exact owner fixtures have a provisional Main policy binding. Structural categories are deterministically NOT_MAIN. Every other row remains UNKNOWN_REQUIRES_REVIEW; no family, form, concentration or policy is guessed.

## Process evidence

- COLD_PROCESS_OK: **636**
- HEAT_REQUIRED_FOR_FUNCTION: **56**
- HEAT_REQUIRED_FOR_SAFETY: **7**
- UNKNOWN: **1389**

## Coverage limitations

- Governed family/subfamily/form/profile policy coverage: **3 / 2088** exact reviewed bindings.
- All 2088 rows are present; UNKNOWN rows are never removed by an inner join.
- Protein percentages are preserved as evidence. Positive protein is not promoted to a final behavior except as an explicit contributor candidate.
- Runtime active catalog counts require the service-only `catalog_product_behavior_audit_v1` view on a migrated database. The linked staging migration ledger is currently unreconciled, so catalog counts are not fabricated here.
