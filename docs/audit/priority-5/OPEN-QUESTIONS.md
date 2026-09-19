# NAPRAWA 5 — OPEN QUESTIONS

Questions that existing authority cannot answer, recorded as the Owner instructed rather than
asked mid-flight. **None of them blocks the project**; each names exactly what it does block.

Nothing here is a reason to tell a customer that a target is physically impossible. A missing
authority is classified as `missing_authority`, never as `genuinely_infeasible`.

---

## Q1 — No published dosage authority for four Starter Pack products

**Question.** What are the normal and controlled dosage ranges, as a percentage of total target
batch mass, for `PI-ING-000494 · Dextrose`, `PI-ING-000270 · SMP 0.8 %`,
`PI-ING-000260 · Cream Powder 42 %` and `PI-ING-001645 · Dried Egg Yolk`?

**Why existing authority cannot answer.** The Owner published a complete dosage authority for
Fructose (`>0–6 %` normal, `>6–8 %` controlled, `8 %` hard maximum) and one already exists for
Inulin (`OWNER_INULIN_POLICY`, 2–8 %) and for the Gellatti Stabilizer (its product-owned per-profile
dose). The other four have none. The pre-existing code used a `1 / 2 / 4 / 8 %` probe grid, which
the Owner has explicitly demoted to "starting probes only" — it was never a dosage claim, and it
cannot be promoted into one.

**Option A (implemented, and the recommendation).** Mark them `capped_technical_window` with a
conservative `8 %` hard cap, identical to the highest published window in the set, and record the
absence in the candidate's own provenance string so it is visible wherever the candidate appears.
The search may probe inside the cap; every probe still passes every hard gate.

**Option B.** Withhold these four from Rescue entirely until a dosage authority is published.

**Recommendation: A.** B silently removes four of seven Starter Pack products and would make
`true infeasible` reachable for reasons that are administrative, not physical — precisely what the
Owner forbade. A is truthful (the gap is labelled), safe (the cap is conservative and every hard
gate still binds) and reversible in one line per ingredient when the authority arrives.

**Product impact.** Under A the doses these four are offered at are bounded by a cap chosen by
engineering, not by the Owner. If the real window is tighter, Rescue could propose a dose the Owner
would not endorse — bounded at 8 % of batch, and only ever as a proposal the customer must accept.

**Affected code.** `src/features/rescue-toolbox/rescueToolboxAuthority.ts` — the `dosageAuthority`
field of the four entries. Changing it is a one-line edit per ingredient plus its test row.

**Blocks:** the dose precision of four candidates. Not the architecture, not the other profiles,
not Fructose, not Inulin, not the stabilizer.

---

## Q2 — Two Owner-listed Starter Pack products have unverified canonical compositions

**Question.** Should `PI-ING-000270 · SMP 0.8 %` and `PI-ING-000260 · Cream Powder 42 %` have their
canonical compositions verified, so they can become executable Rescue lines?

**Why existing authority cannot answer.** Both are on the Owner's Starter Pack list and both are
policy-compatible with dairy Gelato and with the dairy Protein route. But
`canonicalToolboxCompositions` carries them as `verified: false`
(`verification_status: "Estimated / PI Calculated"`), and the identity gate in
`starterPackRescueIngredient` refuses to hydrate an unverified composition into a recipe line. So
CORE can say they are *allowed* and still cannot *add* them. Verifying a composition is a data and
science decision, not an engineering one — this session must not flip a verification flag.

Measured on the current canonical table:

| product | mapper id | verified | status |
| --- | --- | --- | --- |
| Dextrose | `PI-ING-000494` | ✔ | Verified / Global Reference |
| Fructose | `PI-ING-000496` | ✔ | Verified |
| Inulin | `PI-ING-000456` | ✔ | Verified |
| Dried Egg Yolk | `PI-ING-001645` | ✔ | Verified |
| Gellatti Stabilizer | `PI-ING-002114` | ✔ | Verified / PI Calculated |
| **SMP 0.8 %** | `PI-ING-000270` | **✘** | Estimated / PI Calculated |
| **Cream Powder 42 %** | `PI-ING-000260` | **✘** | Estimated / PI Calculated |

**Option A (recommended).** Verify the two compositions in the canonical table, by the same process
that verified the other five. They then become candidates with no code change at all — the
authority already lists them, and the admissibility test that currently pins the gap flips to
pinning the capability.

**Option B.** Leave them unverified and accept that dairy Gelato and the dairy Protein route have
four levers (Dextrose, Fructose, Inulin, Stabilizer) rather than six.

**Recommendation: A**, because the gap is invisible to a customer: today Rescue simply never
mentions two products the Owner sells in the Starter Pack, and the reason is a verification flag
nobody is looking at.

**Product impact.** Under B, dairy-solids and dairy-fat Rescue levers do not exist. Any target that
needed one is reported `missing_authority` — truthful, but it is a smaller product than the Owner
described. No other profile is affected: Sorbet, Vegan and the plant Protein route never receive
these two in any case.

**Affected code / data.** `src/data/ingredients/canonicalToolboxCompositions.ts` (the two rows) and
the pinning test `src/features/rescue-toolbox/rescueToolboxAuthority.test.ts` →
"reports the two unverified dairy powders as a missing authority, never as impossible".

**Blocks:** two of seven candidates on two of six profiles. Nothing else.

---

## Q3 — Design authority session is unreachable from this environment

**Question.** How should the Rescue UI be designed, given that the named design authority cannot be
reached from here?

**Why existing authority cannot answer.** The Owner named the chat/session
`Gellatti Pro mobile scroll stabilization / DESIGN` as the visual and interaction authority and
instructed that the final UI must not be invented by CORE. That session is not reachable from this
environment: `ListAgents` reports no peer session, and the account's session list contains no
session with that title.

**Option A (implemented, per the Owner's own fallback).** Produce a complete, copy-ready handoff at
`docs/design/naprawa-5-rescue/DESIGN_REQUEST.md` covering all sixteen states and every required
deliverable, mark cross-session access `WAITING_EXTERNAL`, finish all non-visual CORE work, and do
not claim the UI complete.

**Option B.** Invent the UI in CORE. **Explicitly forbidden by the Owner.**

**Recommendation: A**, which is what has been done.

**Product impact.** The Rescue CORE, its diagnostics and its contracts can be completed and
delivered; the customer-facing surface cannot ship until the design returns.

**Affected files.** `docs/design/naprawa-5-rescue/DESIGN_REQUEST.md`.

**Blocks:** the UI only. Every CORE deliverable proceeds.
