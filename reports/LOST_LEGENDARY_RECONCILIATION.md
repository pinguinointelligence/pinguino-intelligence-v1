# Lost & Legendary — reconciliation of historical and current data

Audit date: 2026-08-15
Working baseline: `origin/staging` at `7de5bcac28e7e8d7cf292dab98ba95df6091c87e`
Historical selection commit: `34e2be80e46a0bdb867d3446fe74926abbcddb29`
Historical branch: `codex/lost-legendary-inspiration`

## Result

The 19-item Lost & Legendary **research-candidate set** from commit `34e2be80e46a0bdb867d3446fe74926abbcddb29` survives on current staging. Its candidate payload was reconciled by `c6a0ab1b4deb0f81ee2047249beb168e2113b22c`; the later change to `src/data/recipes/curatedCollections.ts` only replaced the old pre-publication boolean with the explicit `customer | owner_review` visibility contract. Commit `5b931ff139253e9c6acead18f4d88b2791fd5f13` then enabled Owner QA only on staging.

This is not an executable recipe registry. `CuratedRecipeCandidate` has no template version, exact Base/Topping lines, grams, ProductBehaviorSnapshots, Main identities or technical result. `candidateStartIntent()` serializes only a product direction and known Mapper IDs to `/start`; `src/data/recipes/inspirationHandoff.ts` explicitly forbids grams, doses, formulas, roles and Engine results. The existing regression test likewise requires that this handoff contains “never final grams”. Therefore the three entries marked `MAPPER_READY` and `can_open_in_workbench: true` are still intent handoffs, not real recipes under the Recipe Library V1 contract.

The required Polish entry, `Polska / Śmietankowe na żółtkach`, is absent from every inspected historical and current source. No exact historical executable composition was recovered. It must not be implemented from guessed grams.

## Reconciliation table

“Historical” and “Current” below describe candidate metadata only. They do not imply an executable formula.

| Country | Recipe | Historical | Current | Missing | Action |
| --- | --- | --- | --- | --- | --- |
| Hiszpania | Aguas heladas de la Mata | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Specific flavour, canonical recipe vector, exact grams, Engine/process proof | Preserve as Owner Review research; do not present as an executable recipe |
| Francja | Glace au pain de seigle | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Validated rye-bread infusion, canonical recipe vector, exact grams, Engine/process proof | Preserve research; no formula reconstruction without source data |
| Indie / Pakistan | Kulfi w zamkniętej formie | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Special-process execution contract, exact grams, Engine/process proof | Preserve research; do not route through ordinary Gelato |
| Iran | Faloodeh Shirazi | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Faloodeh noodles, verified rosewater, canonical recipe vector, exact grams | Preserve research; keep blocked |
| Turcja / Lewant | Dövme dondurma — adaptacja | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Certified lawful salep, protected-name review, exact adapted recipe vector and process proof | Preserve declared adaptation only; keep blocked |
| Japonia | Amazura shaved ice | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Historically verified amazura and exact historical/executable composition | Preserve `RESEARCH_REQUIRED`; no reconstruction |
| Indonezja / Filipiny / Tajlandia | Nusantara coconut pot ice — adaptacja | Present at `34e2be8`; `MAPPER_READY`; intent handoff only | Preserved, same candidate ID/stage and `PI-ING-000149` | Exact regional variant, Base/Topping vector, grams, Engine/kitchen/process proof | Preserve Owner Review intent; do not call it a real recipe |
| Iran | Bastani sonnati — adaptacja | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Verified rosewater, saffron infusion, exact Base/add-on vector and grams | Preserve research; no inferred formula |
| Włochy | Sorbetto di cioccolata napoletano | Present at `34e2be8`; `MAPPER_READY`; intent handoff only | Preserved, same candidate ID/stage and `PI-ING-000020` | Exact canonical recipe vector, grams, Main policy binding, Engine/process proof | Preserve Owner Review intent; formulate only in a separately evidenced task |
| Włochy | Scursunera al gelsomino | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Stronger primary source, food-grade jasmine/dose, exact recipe vector | Preserve `RESEARCH_REQUIRED`; keep blocked |
| Maroko / Hiszpania historyczna | Sharab maghribi-andaluzyjski | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Verified historical frozen form and exact formula | Preserve `RESEARCH_REQUIRED`; no frozen-product claim |
| Chiny | Su shan — interpretacja | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Historically verified dairy medium, exact interpretation vector/process | Preserve declared interpretation research; no executable template |
| Korea Południowa | Tarak royal milk — hipoteza mrożona | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Evidence for a historical frozen form and exact recipe | Preserve `RESEARCH_REQUIRED`; do not turn the hypothesis into a recipe |
| Turcja | Karsambaç / kar helvası — adaptacja | Present at `34e2be8`; `RESEARCHED` | Preserved, same candidate ID/stage | Validated regional syrup, special-process contract and exact vector | Preserve adaptation research; no standard-workbench fallback |
| Peru | Queso helado arequipeño | Present at `34e2be8`; `MAPPER_READY`; intent handoff only | Preserved, same candidate ID/stage and three Mapper IDs | Exact canonical recipe vector, grams, Engine and metal-bowl process proof | Preserve Owner Review intent; do not call it executable |
| Wielka Brytania | Curry soufflés à la Ripon | Present at `34e2be8`; `NOT_SUITABLE` | Preserved as an explicit rejected decision | Safe validated formulation and product value intentionally absent | Keep rejected; do not surface as a selectable recipe |
| Wieloregionalne | Ambergris and musk perfumed ices | Present at `34e2be8`; `NOT_SUITABLE` | Preserved as an explicit rejected decision | Lawful food-grade materials intentionally absent | Keep rejected; do not formulate or publish |
| Egipt | Egyptian fermented barley bûza | Present at `34e2be8`; `NOT_SUITABLE` | Preserved as an explicit rejected decision | Validated frozen identity intentionally absent | Keep rejected; prevent category/name collision |
| Wieloregionalne | Pan-Asian shaved ice family | Present at `34e2be8`; `NOT_SUITABLE` | Preserved as an explicit rejected decision | One honest country, identity and formula intentionally absent | Keep rejected; do not flatten distinct traditions |
| **Polska** | **Śmietankowe na żółtkach** | **Not present in commit `34e2be8`, its parent/branch history, integration commits, all refs, or recoverable unreachable Git objects** | **Absent from current registry and Recipe Store templates** | **Historical template ID/version; exact Base and optional Topping lines; whole-gram amounts and batch total; canonical product/Mapper IDs; process scopes; Main identities; product profile and serving temperature; ProductBehaviorSnapshots; technical result; provenance; publication state** | **STOP for this recipe. Obtain the exact previously selected historical recipe definition; do not substitute Krówka, vanilla, Sernik, Piernik or invented grams** |

## Evidence inspected

1. `codex/lost-legendary-inspiration` and commit `34e2be80e46a0bdb867d3446fe74926abbcddb29`.
2. The exact historical files:
   - `src/data/recipes/curatedCollections.ts`;
   - `src/data/recipes/curatedCollections.test.ts`;
   - `src/data/recipes/inspirationHandoff.ts`;
   - `docs/recipes/LOST_LEGENDARY_GLOBAL_RESEARCH.md`;
   - `docs/recipes/LOST_LEGENDARY_FEASIBILITY_MATRIX.md`.
3. Temporary integration commit `d6803df50706f445937366703d56efe30fa35f00`.
4. Reconciliation commit `c6a0ab1b4deb0f81ee2047249beb168e2113b22c` and staging review fix `5b931ff139253e9c6acead18f4d88b2791fd5f13`.
5. Current `origin/staging` at `7de5bcac28e7e8d7cf292dab98ba95df6091c87e`, including `docs/recipes/LOST_LEGENDARY_PRODUCT_REVIEW.md`.
6. Pickaxe/search across all refs for the exact Polish title and ASCII variants: no commit hit.
7. Git recovery sweep: 91 unreachable commits and 313 unreachable blobs; no exact Polish title or variant hit.
8. Available Codex pasted-text attachments: the title appears only as a requirement in the Recipe Library V1 prompt, never with a composition or grams.

## Exact blocker and required external action

The exact historical source object for `Śmietankowe na żółtkach` is missing. To resume implementation without fabrication, provide one authoritative artifact containing at least the exact ingredient lines and whole-gram amounts, or identify the commit/file/database row where that vector was stored. Once recovered, it can be translated into the current canonical template contract, verified against current Mapper identities and Engine, kept Owner Review/non-production, and opened through the normal recipe architecture.

No registry, fixture, UI, Mapper data, recipe state or production path was changed by this reconciliation because the executable source data does not exist in the inspected evidence.
