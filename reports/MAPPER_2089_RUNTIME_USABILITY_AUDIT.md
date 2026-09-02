# Mapper 2089 runtime usability audit

Generated deterministically by `scripts/auditMapperRuntimeUsability.mjs`. The source Mapper CSV is read-only and its SHA is pinned.

| Metric | Before | After | Explanation |
|---|---:|---:|---|
| Active Mapper rows | 2089 | 2089 | Immutable SHA-256 057375CD60CEFE613892FF1D9F8F7EDA880FF0EB06732F9229051FC37D8DECA7 |
| Searchable rows | 2089 | 2089 | Every active direct Mapper reference remains visible |
| Selectable Base rows | 1713 | 2076 | After = active + approved_for_base |
| Engine-calculable rows | 1713 | 2075 | After = Engine approval + 9 required numerical fields + grams > 0 |
| Blocked solely by provenance | 362 | 0 | Badge/tooltip only after repair |
| Blocked solely by confidence | 0 | 0 | No direct confidence predicate is authorized |
| Blocked solely by process UNKNOWN for technical PI | 0 | 0 | Process is informational only |
| Missing dosage | 1836 | 1836 | Informational; the user enters grams |
| Missing price | 1544 | 1544 | Cost incomplete only |
| Actual technical-data blockers | 14 | 14 | Unique Engine-ineligible set; technical missing overlaps it |
| approved_for_base=false | 13 | 13 | Real Base block |
| approved_for_engines=false | 14 | 14 | Real PI block |
| Missing bindings | 2089 | 2089 | Requires authenticated staging authority export for final zero proof |
| Verified status | 1714 | 1714 | Informational |
| Estimated status | 350 | 350 | Informational |
| Needs Label Review | 273 | 273 | Informational for technical use |

## Additional exact census

- Approved for Base: **2076**.
- Approved for Engine: **2075**.
- Technical composition incomplete under the 9-field contract: **1** (PI-ING-002113: POD/PAC).
- ProductBehavior UNKNOWN_REQUIRES_EVIDENCE: **832**.
- Process UNKNOWN: **1389**.
- Dosage UNKNOWN: **1836**.
- Price missing: **1544**.
- Customer-added Mapper references: **0**.
- System-matched Mapper references: **0**.
- Product version IDs pending authenticated served capture: **2089**.
- Binding IDs pending authenticated served capture: **2089**.

## Real remaining gates

1. `approved_for_base=false` blocks Base only.
2. `approved_for_engines=false` or one of the nine missing numerical fields blocks technical PI.
3. Zero grams blocks the PI click until the user enters at least 1 g; unknown dosage itself does not block anything.
4. Process UNKNOWN is preserved as product information and blocks nothing — not selection, not the Engine, not Production.
5. Missing price leaves cost incomplete and prevents an honest cheapest-result claim; technical calculation remains available.

The exhaustive CSV preserves every simultaneous module-scoped reason instead of collapsing it into a single status.
