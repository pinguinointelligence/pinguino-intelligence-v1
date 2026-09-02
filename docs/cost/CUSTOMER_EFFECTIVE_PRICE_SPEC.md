# Customer Effective Price Specification

Status: implemented for the signed-in user scope; production-history integration remains partial.

## Scope and ownership

Customer prices are private to the authenticated user (owner_user_id = auth.uid()). The current repository has no workspace, company-membership, or workspace-RLS model, so this implementation does not claim company-wide sharing.

customer_ingredient_prices is the sole source of the current Moja cena override. Existing ingredient_cost_entries remain purchase-history records. Mapper reference data stays read-only and is never rewritten.

## Identity and precedence

An override may be stored only for a verified Mapper canonical ingredient ID (PI-ING-\*). Display names, private row IDs, generic requirement IDs, and aliases are not accepted as persistence keys.

Every live cost consumer uses one precedence rule:

1. matching customer override in the current owner scope;
2. current Mapper reference price;
3. missing.

A stored override with a mismatched canonical identity or currency fails closed. Missing never becomes zero. Explicit zero remains a valid price.

## Currency

The current product decision is fixed EUR. Mapper currency is read honestly. There is no FX conversion and no account-level currency setting. A non-EUR or unknown Mapper price is not silently treated as EUR.

## Live behavior

The effective-price projection is transient. It supplies the ingredient row, line contribution, live recipe total, Preview, and ECO ranking. It must not be written back into the canonical recipe store or serialized RecipeInput.

Changing price:

- in OPTIMAL refreshes cost only and does not change grams or recipe revision;
- in ECO refreshes cost, invalidates pricing-dependent work, and requests recalculation without changing grams.

Reset deletes the override and immediately reveals the current Mapper reference price.

## Persistence and history

Migration 0037_customer_ingredient_prices.sql creates one current override per owner and canonical ingredient, with owner RLS and immutable ownership/identity fields. The migration is committed only; it has not been applied to any remote environment.

Recipe versions must keep canonical formulation inputs, not transient customer prices. Immutable cost snapshots are the separate historical economics seam.

Known blockers before trusted final-production costing:

- planned and actual production lines do not yet carry a separate canonical ingredient ID end to end;
- substitutions do not yet retain a trusted canonical substitute ID;
- final actual-production snapshots do not yet freeze full price-source provenance;
- existing child-table RLS in older migrations should be hardened to verify referenced parent ownership and relationship consistency.

## UI rules

The Pro row displays effective EUR/kg and the exact line contribution. Customer overrides use a small neutral Moja badge; incomplete pricing uses an honest missing state. The editor accepts comma or dot decimal input, finite values at least zero, and up to four decimals.

Home reuses the same account data only after its selected ingredient has a verified canonical Mapper ID. Until then, the price editor stays unavailable rather than saving against a generic line identity.
