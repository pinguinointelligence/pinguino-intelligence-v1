# GELLATTI — recipe packs 01 + 02 baseline

Date: 2026-09-13

Target: staging only

Staging project read: `tunabqqrwabacxjcxxkz`

Starting git SHA: `cc87626e655e5e05c94f4887a80499c3e3cc0610` (`origin/staging`)

Final rebased staging base SHA: `b0b3ec794809c1eec96cc99367fb278bc340c958`

Working branch: `codex/gellatti-packs-01-02`

## Source authority

- Immutable workbook baseline: `official-177-v1`, SHA-256 `a85e32a42a8a2e18a375647f8606c3d20c77f7f37a178273f557445579c76dfb`.
- Pack 01 SHA-256: `3aaf67b17f91739c158393eeecc01dc2aceb40e7af36131e99f6080f14ddfa51`.
- Pack 02 SHA-256: `9e265967238636eebf7369e46c18d2cd1d89e255ac8ce9695729dfcb92bec9b2`.
- Combined pack SHA-256: `fb2d6ec0d0421c476cdf0ffc340bd478551ee6823c3ea649a71d552e7baa8a0f`.
- Current layered registry: `official-185-v2`, composite SHA-256 `5aeb4248cfc49dfab7082e67dff8ad30bf097b3fb5d74812c3b2d1cd16113d91`.
- The generated workbook module, historical saved recipes and immutable production snapshots are not edited. Current #039 is rebound to a new recipe identity/version; the baseline #039 Neapolitan record remains in the immutable baseline export.

## Completion ledger by recipe

| Card | Collection / subcategory | Library no. | recipe_id / version | Binding status | Missing requirement | Existing product limitation (not changed) | Next photo files |
|---|---|---:|---|---|---|---|---|
| Crema di Buontalenti | Classics / Dessert & Parlour | 039 | `classic-crema-di-buontalenti` / 2 | complete MAIN, computed `READY` | none | none found in the static Mapper approval gate | `GEL-039-480.webp`, `GEL-039-960.webp` (must replace the old Neapolitan art before `photoStatus` becomes available) |
| Plombir | Classics / Regional Classic | 178 | `classic-plombir` / 1 | complete MAIN, computed `READY` | none | native starch requires its existing hot-process authority | `GEL-178-480.webp`, `GEL-178-960.webp` |
| Porter Ice Cream | Classics / Dessert & Parlour | 179 | `classic-porter-ice-cream` / 1 | complete MAIN, computed `READY` | none | `PI-ING-001615` has `BLOCKED_SCIENCE` Main policy; the recipe does not override it and uses normal STANDARD/Base resolution; alcohol/degassing notices retained | `GEL-179-480.webp`, `GEL-179-960.webp` |
| Eiskaffee | Classics / Dessert & Parlour | 180 | `classic-eiskaffee` / 1 | #015 vanilla v1 reference expanded to 120 g MAIN; additions separate; computed `OTHER_EXPLICIT_BLOCKER` | none | inherited #015 `PI-ING-001705` is not approved for Base/Engine on staging | `GEL-180-480.webp`, `GEL-180-960.webp` |
| Spaghettieis | Classics / Dessert & Parlour | 181 | `classic-spaghettieis` / 1 | #015 vanilla v1 reference expanded to 120 g MAIN; additions separate; computed `OTHER_EXPLICIT_BLOCKER` | none | inherited #015 `PI-ING-001705` is not approved for Base/Engine on staging; mandatory press notice is visible | `GEL-181-480.webp`, `GEL-181-960.webp` |
| Pistachio White Chocolate Praline | Icons / Confectionery Icon | 182 | `icon-pistachio-white-chocolate-praline` / 1 | 1000 g MAIN + 115.5 g add-ons, computed `READY` | none | current bindings include `BLOCKED_DATA`/unknown process evidence for selected pistachio forms; no policy is overridden | `GEL-182-480.webp`, `GEL-182-960.webp` |
| Red Velvet Cheesecake Chunk | Icons / Confectionery Icon | 183 | `icon-red-velvet-cheesecake-chunk` / 1 | formula retained, computed `PRODUCT_BLOCKED` | 150 g baked Red Velvet cake without frosting/filling | cream cheese/variegato retain current evidence and behavior status; no substitute used | `GEL-183-480.webp`, `GEL-183-960.webp` |
| Milky Hazelnut Chocolate Crunch | Icons / Confectionery Icon | 184 | `icon-milky-hazelnut-chocolate-crunch` / 1 | formula retained, computed `PRODUCT_BLOCKED` | 120 g original milk-chocolate Kinder Schoko-Bons | chocolate/hazelnut bindings retain current evidence and behavior status; no Bueno/Chocolate/Country/White/Crispy substitute used | `GEL-184-480.webp`, `GEL-184-960.webp` |
| Parmesan Ice Cream | Lost & Legendary / Heritage | 185 | `heritage-parmesan-ice-cream` / 1 | complete MAIN, computed `READY` | none | parmesan retains its current `UNKNOWN_REQUIRES_EVIDENCE` Main behavior; no policy is overridden | `GEL-185-480.webp`, `GEL-185-960.webp` |

All nine current package cards have `photoStatus: pending`; the runtime does not emit a recipe image URL for them. Missing exact products are shown in the photo area and remain real unresolved TOPPING lines.

## Staging read baseline

- All 30 referenced canonical PI IDs exist and are active on staging.
- 29/30 are currently approved for Base and Engine. `PI-ING-001705` (the immutable vanilla #015 paste) is active but not approved for Base/Engine.
- Exact catalog search for `Red Velvet` and `Schoko-Bons` returned no matching product; both requirements remain unresolved.
- Existing ProductBehavior statuses were read, not changed. Selected pistachio, chocolate, cream-cheese, coffee and parmesan records carry `BLOCKED_DATA`, `BLOCKED_SCIENCE` or `UNKNOWN_REQUIRES_EVIDENCE` in Main/process authority. Runtime resolution remains fail-closed.
- Security advisor baseline reported RLS disabled on `public._main_authority_baseline_20260823`; the current advisor also reports 10 `SECURITY DEFINER` views at `ERROR`, 43 RLS-without-policy notices and further existing function/auth warnings. See the [Supabase database linter remediation guide](https://supabase.com/docs/guides/database/database-linter). The package adds no database migration and does not alter these unrelated objects.

## Executed verification

- `npm run typecheck` — PASS.
- Focused Vitest run covering pack data, immutable baseline, readiness, library UI, handoff and HOME matching — PASS, 7 files / 112 tests.
- `npm run test:contracts` — PASS, 24 files / 234 tests.
- `npm run lint` — PASS with 8 pre-existing warnings outside the changed implementation.
- `npm run build` — PASS; Vite emitted the existing large-chunk warning.
- `npm run guard:protected-paths` — PASS.
- `npm run guard:owner-locked` after commit — PASS; no accepted owner contract modified.
- `npm run recipes:validate` — PASS for the repository flavour-catalogue generated manifest.
- `git diff --check` — PASS.
- `node ./node_modules/vitest/vitest.mjs run src/data/recipes/official/officialRecipeImages.test.ts` — 31 PASS / 1 FAIL. Existing `GEL-155-480.webp` SHA is `a390a7ec…`, while the baseline manifest expects `16b9d917…`; neither file nor manifest is changed by these packs.
- `npm ci` completed with 4 dependency audit findings (3 moderate, 1 high) and two pending install-script approvals; dependency files were not changed.

## Stable verification IDs

- `GRP-DATA-01` — registry count/identity, #039 replacement, #066 and #086 unchanged.
- `GRP-DATA-02` — pack-01 MAIN vectors and 1000 g totals.
- `GRP-DATA-03` — exact vanilla #015 v1 expansion and serving additions.
- `GRP-DATA-04` — Icons MAIN/add-on/final totals and scopes.
- `GRP-DATA-05` — unresolved exact product lines, grams and fail-closed state.
- `GRP-DATA-06` — no image URL for any package card.
- `GRP-CARD-039`, `GRP-CARD-178`…`GRP-CARD-185` — collection card opens its own standard detail route.
- `GRP-UI-01` — #039 has new content and neutral placeholder.
- `GRP-UI-02` — missing Red Velvet cake is visible in photo area and TOPPING list.
- `GRP-UI-03` — dessert phases, vanilla reference, totals and Spätzlepresse notice.
- `GRP-HANDOFF-01` — complete Icons recipe materializes MAIN to Engine and add-ons to `POST_PROCESS_ADDON`.
- `GRP-HANDOFF-02` — unresolved exact add-on blocks before a partial recipe can materialize.
- `GRP-HOME-01` — HOME candidate keeps add-on roles and null pending image.
- `GRP-BASELINE-IMG-01` — immutable 177-image byte/hash audit (pre-existing failure on `GEL-155-480.webp`).

No tasting, production yield, safety, shelf-life, complete-label or production-readiness claim is part of this baseline.
