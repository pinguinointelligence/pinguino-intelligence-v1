# OPTIMAL and ECO Formulation Strategy Specification

Status: product-layer strategy is integrated; ECO search breadth remains bounded and partial.

## Frozen customer contract

There are exactly two customer strategies:

- OPTIMAL: Najlepsza receptura. Koszt nie steruje skladem.
- ECO: Najnizszy koszt przy zachowaniu technologii i smaku.

Pro exposes the selector. Home is functionally OPTIMAL and does not receive a second formulation strategy selector.

Historical values migrate deterministically:

- historical eco becomes eco;
- classic, premium, signature, missing, and invalid values become optimal.

## Engine boundary

Both strategies execute the existing neutral Engine mode classic. Strategy is stored separately in RecipeGoals.formulation_strategy.

No Engine formula, scientific target band, technical score, serving routing, or product profile is changed. Price cannot influence the public technical score.

The six approved serving choices remain unchanged: -11 C, -12 C, -13 C, Swieze, Ninja Gelato, and Ninja Swirl. Existing routing remains the source of truth.

## OPTIMAL

OPTIMAL uses the accepted formulation and current-draft optimization path. It ignores price when choosing composition. A price edit therefore refreshes economics only.

## ECO

ECO starts from the canonical current draft and performs a deterministic bounded coordinate sweep over eligible existing non-Main lines.

A candidate is admissible only when all of these remain true:

1. native Engine violation count and severity do not worsen;
2. exact locks, exclusions, availability, canonical identity, and batch invariants pass;
3. Main and Multi-Main contracts pass;
4. Flavor Floor and no-new-booster rules pass;
5. all compared prices are complete in EUR;
6. the whole-recipe effective cost is strictly lower.

The accepted candidate is selected by complete lower cost, then deterministic movement and identity tie-breaks. Missing price is not free. If no cheaper proven-valid candidate exists, the canonical baseline remains unchanged.

Preview and Apply use the existing single workflow. Flavor Floor is checked at Preview and checked again during verified Apply. Strategy is part of the canonical input/fingerprint, so switching strategy invalidates stale work.

## Explicit current limit

The current ECO implementation is a bounded current-draft cost sweep. It does not yet search a verified alternate-ingredient candidate pool and therefore cannot claim the globally cheapest possible recipe across the whole Mapper catalogue.

Until bounded alternate pools, canonical substitution identities, and full profile validation are connected, the honest claim is:

- cheaper proven-valid composition among the evaluated current-draft coordinates;
- otherwise unchanged OPTIMAL/current baseline.

No database call occurs inside the optimization loop.
