# Vegan qualification campaign

`npm run vegan:campaign`

## Why it is not in `npm test`

The campaign drives **thousands of real solver states** — the full 5×5 Direction
matrix across the internet recipe corpus, the ECO/OPTIMAL base matrix, the Rescue
torture set and a seeded fuzz pass. It takes roughly an hour. Keeping it in the
default suite would add that hour to every developer and CI run.

It is **not deleted and not weakened**. It runs in full through
`vitest.campaign.config.ts` (`src/**/*.campaign.test.{ts,tsx}`) and **exits
non-zero on any contract violation**. It is not informational-only.

## The rule

> **CAMPAIGN DISCOVERS. DEFAULT SUITE PREVENTS REGRESSION.**

Every defect the campaign finds must also get a small deterministic test in the
default suite, so it can never silently come back. Finding a defect in the
campaign and fixing it without adding that test is an incomplete fix.

## When it must be run

- **before a Vegan final closeout**
- **after any material Vegan / Direction / solver change**
- **before a production release**
- optionally as an extended / nightly CI job

## What runs where

| Default `npm test`                                                          | `npm run vegan:campaign`                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `veganDirectionNearestRegression.test.ts` — the two proven ok:false states  | `veganPhase5.campaign.test.ts` — ECO/OPTIMAL matrix + 1800-state Direction matrix |
| `veganCampaignContracts.test.ts` — corpus/Mapper identity, Rescue⊥Direction | `veganRescueAndFuzz.campaign.test.ts` — Rescue torture set + seeded fuzz          |
| `veganPersistenceContract.test.ts` — 15 persistence flows across 3 adapters |                                                                                   |
| `veganFallbackAuthority.test.ts` — VEGAN_CONFLICT fail-closed               |                                                                                   |
| plus all Vegan Engine / Direction / Preview / Apply / Rescue unit tests     |                                                                                   |

## Regressions extracted so far

| Found by                    | Now pinned in the default suite                                               |
| --------------------------- | ----------------------------------------------------------------------------- |
| 1800-state Direction matrix | **R12 caramel −11, sweetness −1 / hardness 0** returned `unsafe_proposal`     |
| 1800-state Direction matrix | **R13 salted caramel −11, sweetness −1 / hardness −2** returned `no_proposal` |

Both were **natively safe drafts** (zero starting violations) that still dead-ended
with no recipe at all, which falsified the assumption the RC-2c retry guard was
scoped on. An unreachable preference must always degrade to a truthful NEAREST
preview. Both regression tests were verified to FAIL on the pre-fix code and PASS
after it.

## Evidence written by a run

`reports/VEGAN_DIRECTION_STATE_MATRIX.csv`, `reports/VEGAN_ECO_OPTIMAL_MATRIX.csv`,
`reports/VEGAN_RESCUE_MATRIX.csv`, `reports/VEGAN_FUZZ_MATRIX.csv`.
