# PINGUINO — Next Implementation Roadmap

_Created 2026-07-05 alongside [PINGUINO_SPINE.md](PINGUINO_SPINE.md). Sequencing map from the
current repo state to the locked Spine v1.0 architecture. The locked documents in
[`docs/pinguino-spine/`](pinguino-spine/) define **what** each module must do; this file only
orders the work. The owner's official planning document remains
[PINGUINO_MASTERPLAN_V1.md](PINGUINO_MASTERPLAN_V1.md)._

Two independent critical paths exist today:

- **Human path (A → B):** Mapper calibration. Blocked on the team/owner; no code work unlocks it.
- **Code path (C → D → E):** the Spine's Recipe-Intelligence layer. Pure contracts + config on top
  of the frozen Base Engine; it does **not** wait for Mapper calibration and can start immediately.

They merge at Phase E (Studio uses both matched products and the new Spine flow).

---

## Phase A — Team calibration (HUMAN — the current gate)

**Goal:** turn the 12 staged reference proposals into approved locked references, and resolve the
4 owner picks.

- Work from [mapper/OWNER_TEAM_CALIBRATION_HANDOFF.md](mapper/OWNER_TEAM_CALIBRATION_HANDOFF.md)
  (proposal table, owner-pick options with engine consequences, after-fill workflow, do-not list).
- Team fills PAC/POD per proposal (calibration pack export exists at `/dev/reference-proposals`).
- Owner decides the 4 parked picks (incl. the POD-spread and pac-variant ties).
- Output: values + picks handed back → seed-migration PREVIEW built → owner approval → **human**
  applies the insert (the only approved `mapper_basement` write path).

**Done when:** new PI-ING references exist in the locked basement and the 4 picks are recorded.
**Safety:** no app write path is ever added for this; product PAC/POD stays NULL regardless.

## Phase B — Mapper completion (after A)

**Goal:** finish product matching using the new references.

- Rerun the matcher over the 43 null products (band/tiebreak pre-narrowing already implemented).
- Confirm newly unlocked products (~17 expected from the staged proposals) via the review flow.
- Re-verify invariants: PR/PI code split, PAC/POD 0/N on products, snapshots appended, basement
  count matches the approved insert exactly.
- Revisit the remaining nulls: new gap proposals if real coverage gaps remain.

**Done when:** every product is matched, rejected, or covered by a documented open proposal.

## Phase C — Spine implementation (CODE — start any time)

**Goal:** build the Recipe-Intelligence layer as pure, tested modules, in the locked order. No
engine math changes; no UI dependency yet.

1. **Contracts first:** `NormalizedRecipeIntent` (contractVersion 1.0.0), `RecipeDesignPlan`,
   `AccessContext`/`AccessCapabilities`, gate/warning code types — exactly as written in the docs.
2. **Product Profile Registry:** the 4 active profiles, alias normalization (unsupported inputs
   warn — never silently mapped), gate tables, profile→engine-category mapping.
3. **`normalizeRecipeIntent()`:** pure; explicit input → saved defaults → system defaults;
   `RecipeGoals` vocabulary mapped via the locked table (e.g. `normal` → `balanced`), not renamed.
4. **Designer:** intent → strategy + optimizer constraints; flavor-driven routing (chocolate/
   sorbet/vegan detection); hero-ingredient policy by quality tier; slices D1–D8 per the doc.
5. **Temperature Regulator:** per-product × per-temperature **config registry** (−11/−12/−13 from
   the four regulator docs; −11 = zero-delta base). One shared Base Engine — never per-temp engines.
6. **Integration Flow router:** the 16-step execution order incl. decision routing
   (final/warning/tradeoff/impossible) and the rerun-verification loop.
7. **Optimizer extensions:** profile-aware correction families, batch-volume decision consumption,
   stock-shortage options — extending the existing solver, never bypassing its verify-by-recalc.
8. **Acceptance tests** (groups A–M from the Acceptance Tests doc) implemented alongside each step,
   not at the end.

**Done when:** the full chain runs headless (intent → plan → profile → engine → regulator →
router → optimizer → verified result) with acceptance tests green.
**Safety:** ENGINE math frozen; CONFIG_VERSION bumps only for additive config registries.

## Phase D — Engine expansion (with C5, after C1–C4)

**Goal:** make −12/−13 first-class calibrated outputs.

- Ice-curve anchors beyond `milk_gelato@−11` (currently the only seeded domain) as calibration
  data arrives; regulator bands stay interpretation-only on top.
- Golden recipes per product × temperature; regression suite extended (no-NPAC rule preserved).
- Version stamping: CONFIG_VERSION history entries per registry addition.

**Done when:** all four profiles evaluate at all three temperatures with locked bands and goldens.

## Phase E — Studio / UI on the Spine

**Goal:** replace the current single-form Studio flow with the locked User Flow.

- Conversational intake: first question `Jakie lody dziś robimy?`; product recognition +
  confirmation copy; question order product → batch size → temperature → texture → sweetness →
  style → boosters; saved-defaults offer.
- Batch-size step (1/5/10/25/50 kg/custom → `target_batch_grams`) before final generation.
- Actual-batch rescue UI (the 5 explicit options) and stock-shortage UI (5 options).
- Output shaping by capabilities: demo shows direction/warnings, never exact grams/Auto Fix;
  paid shows the full recipe. Redaction stays at source (already in the solver).
- Labels / print / export from the final verified recipe.

**Done when:** the User Flow acceptance list (39 items) and Account Access list (43 items) pass.

## Phase F — Commercial wiring

**Goal:** connect live auth/plans/billing as the **external capability provider**.

- Auth + subscription state → resolved `AccessContext` (Recipe Intelligence never implements
  login/billing itself — locked boundary).
- Server/API-side capability enforcement (client-side hiding is not sufficient — locked Rule 1).
- Free Preview → demo capabilities mapping; upgrade-reason codes surfaced, price-neutral copy.

**Done when:** demo/paid boundary holds end-to-end against the Account Access acceptance list.

## Phase G — Franchise / SOP / future

- Franchise + SOP layer per [PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md](PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md).
- Future profiles (granita, protein, fresh, −18 °C storage, frozen drinks) — each requires its own
  locked document set (profile + regulator + designer sections) before any code.
- PU/Umami extension — future documents required; not active.
- Multi-language beyond PL/EN copy as markets demand.

---

## Standing rules that bind every phase

```text
Locked docs are the spec — if a rule is missing, stop and ask; never guess values.
AI explains and routes; AI never calculates exact recipe values.
One shared Base Engine — temperature/product differences live in config + regulator only.
mapper_basement inserts: human-approved seed migrations only.
Product PAC/POD: NULL until independently measured AND explicitly approved.
Demo never shows exact grams / exact Auto Fix / exact before-after values.
Never name external benchmark tools in code, docs, prompts or UI.
No new dependencies without explicit approval.
```
