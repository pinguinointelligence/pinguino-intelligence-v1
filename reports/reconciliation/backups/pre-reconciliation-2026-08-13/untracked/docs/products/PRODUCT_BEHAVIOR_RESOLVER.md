# Product Behavior Resolver

## RPC

`resolve_product_behavior_v1(entity_kind, entity_id, context)` is `SECURITY DEFINER`, requires authentication, and loads server-controlled facts/bindings/policies. The caller supplies context only.

Context:

- account;
- immutable product version or locked Mapper identity;
- product profile and serving temperature;
- `optimal` or `eco`;
- `BASE_FORMULATION` or `POST_PROCESS_ADDON`;
- `STANDARD` or `MAIN`;
- module: Search, Base, Main, OPTIMAL, ECO, Topping, Substitution, Cost, Monitor, Production, Label, Nutrition or Save.

The result includes immutable product/binding/taxonomy versions, catalog status, provenance, exact Mapper authority, family/subfamily/form, Vegan and Protein behavior, process evidence, module matrix, Main policy and block reasons.

## Resolution order

1. exact catalog-version policy;
2. exact Mapper policy;
3. subfamily + form + profile;
4. family + form + profile;
5. explicit approved fallback;
6. blocked/unknown.

Names are search evidence, never runtime policy authority.

## Module matrix

| Module | Base technical authority required | Label facts sufficient | Main policy required |
|---|---:|---:|---:|
| Search | no | no | no |
| Base recipe | yes | no | no |
| Main / OPTIMAL / ECO | yes | no | yes |
| Topping | no | yes | no |
| Substitution | yes | no | destination Main policy when applicable |
| Cost | no | no | no |
| Monitor | Base snapshot for technical metrics | topping summary only | no |
| Production | exact saved scope snapshot | yes for topping | no reinterpretation |
| Nutrition / Label | known facts only | yes | no |
| Save/version | executable scope snapshot | yes for label-only topping | no |

## Snapshot and stale protection

`ProductBehaviorSnapshot` is product-layer metadata and never enters Engine formulas. It contains product version, facts fingerprint, binding/taxonomy/policy versions, exact envelope values, scope, module eligibility and warnings. The Preview stores the deterministic snapshot fingerprint. Apply recomputes it and rechecks the actual whole-gram vector.

Unknown/malformed server results fail closed in the picker with a concise visible reason.
