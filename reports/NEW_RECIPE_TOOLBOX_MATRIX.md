# New Recipe toolbox matrix

Date: 2026-08-15
Status: implemented locally on `codex/served-staging-self-audit`; served verification pending.
Scope: the explicit `+ Nowa receptura` path only. Saved, historical, library and Production-source recipes never receive these scaffolds.

The starter builder reads the existing approved formulation registry and the exact canonical toolbox bridge. It introduces no new formula system and no flavour/Main identity. Values below are the unmodified registry values for the default account temperature of −12°C and a 1000 g target batch.

| Product type | Product profile | Source template | Starter lines (grams) | Canonical Mapper IDs | Starter mass | Deliberately absent | Result |
|---|---|---|---|---|---:|---|---|
| Gelato | `milk_gelato` | `milk_base_g17_minus12_v1` | milk 600; cream 135; SMP 43; sucrose 86; dextrose 80; inulin 54.1; tara gum 1.9 | `PI-ING-000236`; `PI-ING-000180`; `PI-ING-000270`; `PI-ING-000514`; `PI-ING-000494`; `PI-ING-000456`; `PI-ING-000492` | 1000 g | flavour/Main | READY FOR SERVED QA |
| Sorbet | `sorbet` | `S02` | water 164.2; sucrose 90; dextrose 90; inulin 55; tara gum 0.8 | `PI-ING-001409`; `PI-ING-000514`; `PI-ING-000494`; `PI-ING-000456`; `PI-ING-000492` | 400 g technological scaffold | fruit/Main 600 g, which the user must select | READY FOR SERVED QA; intentionally incomplete until Main selection |
| Vegan | `vegan_gelato` | `vegan_neutral_minus12_final` | water 397.4; oat drink 250; refined coconut oil 52.5; sucrose 145; dextrose 100; inulin 53.1; tara gum 2 | `PI-ING-001409`; `PI-ING-001565`; `PI-ING-000163`; `PI-ING-000514`; `PI-ING-000494`; `PI-ING-000456`; `PI-ING-000492` | 1000 g | flavour/Main; all dairy | READY FOR SERVED QA |
| Protein | `protein_gelato` | `protein_dairy_neutral_minus12_v1` | milk 460; cream 100; Protein Gel WPC 230; water 92; sucrose 30; dextrose 86; tara gum 2 | `PI-ING-000236`; `PI-ING-000180`; `PI-ING-000264`; `PI-ING-001409`; `PI-ING-000514`; `PI-ING-000494`; `PI-ING-000492` | 1000 g | flavour/Main | READY FOR SERVED QA; Protein Contributor remains a separate role |

## Routing and reset contract

- The explicit action detaches the previous saved aggregate and clears the recipe name/version link, Base/Topping lines, Main/Multi-Main state, ProductBehavior snapshots, exclusions, constraint set, Preview, pending Apply, Undo history, Production session, Batch Rescue state, Master Label and temporary ingredient-table state.
- Authentication, account, plan, language, product-specific defaults, private prices, Favorites and market settings are outside the draft reset and are preserved.
- An untouched explicit starter is replaced atomically when the visible product type changes.
- An edited explicit starter requires the exact compact confirmation: `Zmiana typu produktu wymaga przebudowy składników.` with `Przebuduj` / `Anuluj`.
- Saved, historical, library and Production-source recipe loads set no starter identity and therefore retain their stored lines during profile changes.
- Server hydration upgrades each starter line to its exact current Mapper row and ProductBehavior snapshot. The Sorbet scaffold is allowed to remain at 400 g so no fruit/Main is fabricated.

## Evidence and limitations

- Formula source: `src/features/formulation/templateRegistry.ts`.
- Canonical identity source: `src/data/ingredients/canonicalIngredientIdentity.ts`, verified Vegan/Protein toolbox registries, and the existing ProductBehavior resolver.
- Decimal amounts are preserved because they are the current approved registry facts. This change does not invent a new quantity-precision rule or round the scientific template.
- No new library recipe vector is implied by these neutral technological starters.
- Final status remains `READY FOR SERVED QA`, not customer-ready, until the exact staging bundle is deployed and the four product types are opened with an authenticated Pro account.
