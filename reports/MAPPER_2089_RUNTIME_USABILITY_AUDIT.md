# Mapper FINAL 2541 runtime usability audit

Generated deterministically by `scripts/auditMapperRuntimeUsability.mjs`. The source Mapper CSV is read-only and its SHA is pinned. The legacy report filename is retained for downstream compatibility.

| Metric | Before | After | Explanation |
|---|---:|---:|---|
| Active Mapper rows | 2541 | 2541 | Immutable SHA-256 A6A849A596ACEF75E0760992353BDDF5CBCA24FF37744E36414DA18CA45556F6 |
| Searchable rows | 2541 | 2541 | Every active direct Mapper reference remains visible |
| Selectable Base rows | 1578 | 2491 | After = active + approved_for_base |
| Engine-calculable rows | 1578 | 2491 | After = Engine approval + 9 required numerical fields + grams > 0 |
| Blocked solely by provenance | 913 | 0 | Badge/tooltip only after repair |
| Blocked solely by confidence | 0 | 0 | No direct confidence predicate is authorized |
| Blocked solely by process UNKNOWN for technical PI | 0 | 0 | Process is informational only |
| Missing dosage | 2287 | 2287 | Informational; the user enters grams |
| Missing price | 1996 | 1996 | Cost incomplete only |
| Actual technical-data blockers | 50 | 50 | Unique Engine-ineligible set; technical missing overlaps it |
| approved_for_base=false | 50 | 50 | Real Base block |
| approved_for_engines=false | 50 | 50 | Real PI block |
| Missing bindings | 2541 | 2541 | Requires authenticated staging authority export for final zero proof |
| Verified status | 1578 | 1578 | Informational |
| Estimated status | 836 | 836 | Informational |
| Needs Label Review | 272 | 272 | Informational for technical use |

## Additional exact census

- Approved for Base: **2491**.
- Approved for Engine: **2491**.
- Technical composition incomplete under the 9-field contract: **4**.
- ProductBehavior UNKNOWN_REQUIRES_EVIDENCE: **1284**.
- Process UNKNOWN: **1841**.
- Dosage UNKNOWN: **2287**.
- Price missing: **1996**.
- Customer-added Mapper references: **0**.
- System-matched Mapper references: **0**.
- Product version IDs pending authenticated served capture: **2541**.
- Binding IDs pending authenticated served capture: **2541**.

## Real remaining gates

1. `approved_for_base=false` blocks Base only.
2. `approved_for_engines=false` or one of the nine missing numerical fields blocks technical PI.
3. Zero grams blocks the PI click until the user enters at least 1 g; unknown dosage itself does not block anything.
4. Process UNKNOWN is preserved as product information and blocks nothing — not selection, not the Engine, not Production.
5. Missing price leaves cost incomplete and prevents an honest cheapest-result claim; technical calculation remains available.

The exhaustive CSV preserves every simultaneous module-scoped reason instead of collapsing it into a single status.
