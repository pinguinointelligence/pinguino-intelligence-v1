# Product status information-only audit

Audit scope: active runtime on staging branch, forward migration `20260815152000_product_status_information_only.sql`, immutable Mapper source SHA-256 `B13F5DB4AFFD9C3BE5CCBE59B40920053197A3697A3FA1BD4A859406E8BAED38`.

## Owner contract

Verification, provenance, confidence and evidence quality select a badge, tooltip and review priority only. They do not authorize or deny search, Base/Topping selection, technical PI, test Save, Owner Review editing or numerical Engine use. Estimated data are never promoted to Verified.

## Gate audit

| Runtime seam | Previous unauthorized predicate | Final authority | Result |
|---|---|---|---|
| `search_products_v1` direct Mapper | `approved_for_base AND approved_for_engines AND Verified%` | visibility = active; Base selectable = active + `approved_for_base` | repaired forward-only |
| Authenticated Mapper search and exact selection | `Verified%` and Engine approval during Base selection | active + `approved_for_base`; Engine checked after grams | repaired |
| Commercial mapped product projection | canonical status plus `Verified%` Mapper target | exact active binding + target Base approval | repaired |
| Catalog classifier | `Verified%` target required to retain mapping | exact active Mapper mapping; provenance retained separately | repaired |
| Admin Mapper decision | `Verified%` target | active exact target and administrator decision evidence | repaired; no fuzzy/form inference |
| Picker | Estimated rendered as red `PRODUCT DATA INCOMPLETE` and disabled | neutral provenance badge; red only for real technical denial | repaired in existing geometry |
| Direct `mapper_reference` | treated like a product needing a second decision | canonical Mapper identity is authoritative | repaired |
| ProductBehavior Base | one Base+Engine/status gate | `BASE_RECIPE` uses Base approval; OPTIMAL/ECO/technical modules use Engine+9 fields | repaired |
| Main | process evidence required for technical Main | technical Main uses actual policy/composition/profile; process remains Process/Production | repaired; Main solver unchanged |
| Save/test recipe | provenance could prevent acquiring a current eligible snapshot | current technical eligibility + exact immutable provenance snapshot | repaired |
| Owner Review handoff | `Verified%` and optional component fields required | Base+Engine approval + 9 numerical fields | repaired; Production/Label overlay retained |
| Substitution | source/verification allowlist | exact identity, complete composition, profile/family/allergen/alcohol/sweetener safety | repaired; provenance warning only |
| Vegan technical eligibility | `Verified%` required | explicit vegan fact + active + Engine approval | repaired; conflicts remain explicit |
| Dosage | unknown could become an availability proxy | add 0 g, require at least 1 g before PI | preserved and regression-covered |
| Price | missing price | technical PI allowed; cost incomplete, ECO cannot claim cheapest | preserved |
| Process/Production | process UNKNOWN could appear as Mapper verification | exact process warning/block only in process-sensitive modules | repaired separation |
| Label/Master Label | legal/allergen completeness | may block only legally represented final label | genuine gate retained |
| Monitor/Nutrition | immutable current facts | exact resolved snapshot; provenance remains visible metadata | genuine currentness gate retained |

## Informational badge semantics

| Source state | Picker badge | Eligibility effect |
|---|---|---|
| `Verified%` | `PINGÜINO — SPRAWDZONY` | none |
| `Estimated%` / `PI Calculated%` | `Dane szacowane` | none |
| any label-review state | `WYMAGA SPRAWDZENIA ETYKIETY` | none for technical use |
| matched commercial identity | `SYSTEM — DOPASOWANY` | none; exact Mapper binding still required for Base |
| customer/manual identity | `DODANY PRZEZ UŻYTKOWNIKA` | none when exact technical mapping is complete |
| actual Base/Engine/composition defect | `PRODUCT DATA INCOMPLETE` | exact module-specific technical block |

## Module matrix

| Module | Technical authority | Provenance effect | Remaining fail-closed boundary |
|---|---|---|---|
| Search | active identity | badge only | none |
| Base add | active + `approved_for_base` + exact identity | badge only | actual Base denial |
| Topping add | mapped technical identity or complete label-only facts | badge only | exact mapping or legal/nutrition facts for label-only path |
| OPTIMAL/ECO PI | Base + Engine approval + 9 fields + grams > 0 + profile/safety constraints | badge only | technical fields, locks, profile and hard constraints |
| Main | same technical facts + exact Main policy | badge only | actual Main policy/profile/constraint |
| Test Save | current eligible technical snapshot | frozen true status | stale/missing technical authority |
| Process/Production | technical facts plus genuine process/safety evidence | badge only | exact process/safety reason |
| Label/Master Label | legally complete nutrition/allergen/product facts | badge only | exact missing legal field |

## Owner Review separation

`OWNER_REVIEW_EDITABLE` requires exact Base identities, exact grams, Base+Engine approval and the 9-field numerical contract. It no longer requires provenance Verified, price, final Toppings or process completeness. The restrictive Owner Review overlay continues to block Production, Process, Label, Master Label and Export until those module-specific facts are supplied; it never elevates server eligibility.

## Immutable boundaries

- No file under `src/engine` is changed.
- No Home/customer-shell component is changed. The shared Mapper adapter gains
  a Pro policy path, while the Home-facing path retains its prior
  Verified+Base+Engine filter, exact-ID hydration filter and paginated result
  set under regression tests.
- No `mapper_basement` row is inserted, updated, deleted, regenerated or promoted.
- Applied migration `20260815143000_catalog_mapper_binding_case_repair.sql` is unchanged; the repair is forward-only.
