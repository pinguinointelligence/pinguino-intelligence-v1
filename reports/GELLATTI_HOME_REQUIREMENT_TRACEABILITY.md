# GELLATTI HOME — REQUIREMENT TRACEABILITY (§7)

Every requirement ID in `GELLATTI_HOME_MASTER_CHECKLIST.md` points here to source,
test, proof or an explicit reason. **No requirement disappears silently.**

Status vocabulary is the checklist's. `SERVED VERIFIED` is reserved for evidence from
`staging.pinguinoai.com`; local browser proof is recorded as `IMPLEMENTED`.

## Implemented and traced

| IDs | Source | Test | Proof |
| --- | --- | --- | --- |
| H-01-1/2 | `homeViewMode.ts`, `homeViewStore.ts` | `homeArchitectureBoundary.test.ts` (4) | guard reads real files; forbids the 7 named `Home*` authorities, deep `@/engine/*` imports, and re-implemented score/band/POD/PAC math |
| H-02-2, H-120-1 | — | `npm run guard:owner-locked`, `guard:protected-paths` | both `OK` |
| H-03-3 | `supabase/migrations/2026083010/11/12*` | `likesFavorites.migration.test.ts` (20) | additive, forward-only; applied to `tunabqqrwabacxjcxxkz` only |
| H-09-1, H-09-2 | `router.tsx`, `RoleAwareEntryRoute.tsx` | `routes.test.tsx`, `RoleAwareEntryRoute.test.ts` | screenshot: creator at `/`, 375×812 |
| H-10-1/2/4 | `AppShell.tsx` (`stickyHeader`), `HomeProSwitch.tsx` | `routes.test.tsx` | screenshot: left ☰, wordmark, HOME\|PRO |
| H-11-1…4 | `homeViewMode.ts` | `homeViewMode.test.ts` (16) | HOME black/white, PRO greige/black, no dots |
| H-12-2/3 | `account_profiles.default_experience`, `accountExperience.ts`, `roleAwareEntry.ts` | `RoleAwareEntryRoute.test.ts` | column + CHECK verified on staging |
| H-13-1/2 | `HomeSubscriberProRedirect.tsx` | `homeViewMode.test.ts`, `routes.test.tsx` | — |
| H-14-1/2 | `homeViewStore.ts` | `homeArchitectureBoundary.test.ts` | store imports no recipe store — structural |
| H-16-1…4, H-42-1/2 | `homeMachinePresentation.ts` | `homeMachinePresentation.test.ts` (8) | screenshot: 9 machines, no Professional |
| H-17-1/2/3, H-18-1/2/3 | `HomeIntentSection.tsx`, `homeCreatorCopy.ts` | `homeCreatorCopy.test.ts` (6) | screenshot: headline, question, one input, no tiles |
| H-19-1, H-20-1/2, H-21-1, H-25-1/2 | `homeIntentParsing.ts`, `useVoiceIntent.ts` | `homeIntentParsing.test.ts` (16) | owner's own cases pass: strawberry/truskawka/fresa/Erdbeere; whisky cola variants; mojito/mochito/mojitto |
| H-22-1/2, H-23-1, H-24-1 | `homeIdentityResolution.ts`, `homeIntentResolutionService.ts` | `homeIdentityResolution.test.ts` (8), `homeIntentResolutionService.test.ts` (5) | — |
| H-31-1/2, H-41-2 | `homeIntentParsing.detectProfile`, `homeStageFlow.ts` | `homeStageFlow.test.ts` (17) | served: `presentedStages` = `["intent","machine"]` — profile never shown |
| H-32-2/3, H-33-1/2, H-34-1…3, H-35-1…4, H-40-1 | `homeRecipeMatching.ts` | `homeRecipeMatching.test.ts` (18) | the §111 matrix |
| H-38-1 | `20260830110000_community_root_creator_dna.sql` | `likesFavorites.migration.test.ts` | applied; all 17 card keys pinned |
| H-44-1, H-45-1, H-46-1/2 | `homeAmountAuthority.ts` | `homeAmountAuthority.test.ts` (9) | owner's 450 g split examples pinned |
| H-48-1 | `HomeCreatorPage.generateRecipe` → `rebuildNewRecipeStarter` | `homeMachineSurvivesStarter.test.ts` (4) | served: 5-line Sorbet base |
| H-53-1 | `homeRecipeName.ts` | `homeRecipeName.test.ts` (5) | served: "Truskawka Sorbet" |
| H-54-2, H-71-1 | `HomeRecipeSection.GramCell` | `homeCreatorCopy.test.ts` | served: `🔒 ••• g`, digit-free by test |
| H-59-1 | `useHomeRecipeResult.ts` | — | served: `4/10 Wyraźnie niezbalansowana` |
| H-61-1, H-62-1/2, H-63-1 | `homeSweetness.ts` | `homeSweetness.test.ts` (8) | project/tap split so viewing cannot flatten a Pro ±2 |
| H-82-1/2, H-83-1/2/3, H-84-1, H-86-1 | `homeStageFlow.ts`, `HomeSection.tsx` | `homeStageFlow.test.ts` | no nested scroll, no 100vh cap, no dots/stepper |
| H-89-1 | — | `likesFavorites.migration.test.ts` | no comment table or UI exists |
| H-90-1, H-91-1, H-94-1 | `20260830120000_*.sql`, `communitySocial.ts` | `likesFavorites.migration.test.ts` (20) | applied; advisors show no ERROR and no missing policy |
| H-99-2, H-102-1/2 | `homeCreatorCopy.ts`, `tokens.css` | `homeCreatorCopy.test.ts` | PL/EN key parity enforced |

## Explicitly not done, with the reason

| IDs | Reason |
| --- | --- |
| H-26-*, H-27-*, H-28-*, H-29-*, H-30-1 | Scanner pre-check not built. The scan button is deliberately wired to **nothing** rather than to a fake result. |
| H-32-1, H-36-*, H-37-*, H-96-1 | The matching ENGINE and its 18 acceptance cases are done and green; the official-library + Top100 QUERIES and the match popup UI are not built, so no candidate reaches it yet. |
| H-49-*, H-50-1, H-55-*, H-56-1, H-57-*, H-58-1, H-60-* | Add ingredient / topping / substitute / Recalculate are rendered but not wired. **The user's own flavour is therefore not yet a line in the generated recipe** — the largest functional gap. |
| H-65-1, H-66-1, H-67-*, H-68-1, H-69-1 | Save and the whole HOME preparation + Rescue surface are not built. |
| H-72-*, H-73-1, H-115-1 | Paywalls not built. |
| H-76-1, H-77-1, H-79-1, H-80-1 | The draft store exists and persists; the Continue card and replacement confirmation UI are not built. |
| H-87-*, H-88-1, H-93-1, H-95-1, H-107-*, H-108-1, H-109-1, H-110-1 | Community publishing UI, DNA chain and Partner-timing runs not exercised. |
| H-98-* | Admin support not built. |
| H-103-*, H-104-*, H-105-*, H-106-1 | **50 QA publications and 10 QA accounts not created.** Staging currently holds 1 publication, 0 lineage rows, 1 creator. |
| H-121-1, H-122-1, H-123-1, H-124-1 | Served QA on staging not run — the branch is not merged. |

## Infrastructure finding (owner action may be wanted)

`Solver time contracts (isolated)` fails on this PR with
`Error: Test timed out in 5000ms` on **`recipeVectorProximity.test.ts`** — a wall-clock
timeout, not an assertion. The same case runs in **2386 ms locally** (whole file 23/23
in 17.7 s). CI history shows this failing repeatedly on `staging` itself
(15:18, 14:44, 14:11, 13:44, 12:50, 10:55, 10:39 on 2026-08-30) and on unrelated
branches. This branch touches no solver code and the protected-path guard confirms it.

**It was not "fixed" by relaxing the test.** Raising a solver timing budget to make a
PR green is precisely the failure mode AGENTS.md rule 11 exists to prevent.
