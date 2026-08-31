# HOME-FUNC-COMPLETENESS — control inventory

Owner note (2026-08-31): *"Many visible actions/buttons still do not have their final
functional flows. Do not treat the current visual pass as final approval."*

Every visible HOME control, from source at staging `0c5763a2`.
`control → expected action → current action → functional? → served QA`.

Legend — **Functional?** ✅ complete · ⚠️ works but incomplete/limited · ❌ no-op.

## Intent stage

| Control | Expected action | Current action | Functional? | Served QA |
| --- | --- | --- | --- | --- |
| `home-intent-input` | Capture the idea | Captures; parsed on submit, not per keystroke | ✅ | PASS |
| `home-intent-cta` | Submit → resolve identities → match | `submitIntent` → `resolveOne` → `runMatching` | ✅ | PASS |
| `home-intent-voice` | Dictate the idea | `voice.toggle`; disabled where unsupported | ⚠️ | NOT RUN |
| `home-intent-scan` | Scan a product | **`onScan={() => {}}`** — deliberately unwired (Phase 2) | ❌ | n/a |
| `home-intent-chip` / `-remove` | Show/remove a resolved ingredient | Removes the chip | ✅ | PASS |
| `home-identity-choice` | §23 disambiguation | Resolves the chip, re-runs matching | ✅ | PASS |

## Match popup

| Control | Expected action | Current action | Functional? | Served QA |
| --- | --- | --- | --- | --- |
| `home-match-option-*` | Adopt a Community recipe | Canonical derivation, opens in HOME | ✅ | PASS |
| `home-match-create-my-own` | Decline, keep creating | Dismisses; generation resumes once | ✅ | PASS |
| `home-match-backdrop` / Esc | Same as decline | Routes to `onCreateMyOwn` | ✅ | PASS |
| `home-match-derivation-error` | Honest refusal | Renders the typed refusal | ✅ | PASS (over-cap) |

## Profile / machine / amount

| Control | Expected action | Current action | Functional? | Served QA |
| --- | --- | --- | --- | --- |
| `home-section-profile` choices | Pick gelato/sorbet/… | Sets profile, advances | ✅ | PASS |
| Machine list | Pick a machine | `setMachineSelection` + batch | ✅ | PASS |
| `home-machine-other` | Enter capacity manually | `setForceMachineStage(true)` | ⚠️ | NOT RUN |
| `home-machine-change` / `-done` | Reopen / confirm | Toggles the stage | ✅ | PASS |
| `home-containers-plus/minus`, `home-amount-*` | Set batch | Updates amount; `USER_OVERRIDE` when ready | ⚠️ | NOT RUN |

## Recipe stage

| Control | Expected action | Current action | Functional? | Served QA |
| --- | --- | --- | --- | --- |
| `home-recipe-name` | Rename | Local override, saved with the recipe | ✅ | PASS |
| `home-add-ingredient` | Open the canonical picker | `ProductPickerPopover` (BASE) — **now attached to the list** | ✅ | THIS PR |
| `home-add-topping` | Open the topping picker | `ProductPickerPopover` (POST_PROCESS_ADDON) | ⚠️ see HOME-UX-TOPPING-GATE | THIS PR |
| `home-row-menu` → remove | Remove a line | `removeItem` | ✅ | PASS |
| `home-row-menu` → **substitute** | Swap for an alternative | **`onSubstitute={() => undefined}`** | ❌ | n/a |
| `home-row-menu` → unavailable | Mark unavailable | `markIngredientUnavailable` | ⚠️ | NOT RUN |
| `home-sweetness-*` | Sweeter/less sweet | Canonical Direction axis | ✅ | PASS |
| `home-recalc-run` | Recalculate | Canonical PI recalculation | ⚠️ **HOME-FUNC-RECALCULATE** | FAILS — see forensic |
| `home-recalc-apply` / `-cancel` | Apply / discard preview | Canonical apply / cancel | ⚠️ blocked behind the above | NOT RUN |
| `home-save-recipe` | Save | Routes on the canonical blocker; opens auth when `signin` | ✅ | PASS (cap refusal) |
| `home-lets-make-it` | Start preparation | `startPreparation()` | ⚠️ | NOT RUN |
| `home-share-community` | Publish to Community | **`onShare={() => undefined}`, `canShare={false}`** | ❌ | n/a |
| `home-pro-switch` | HOME↔PRO | Present per §11–§16 | ⚠️ §11C: missing on the PRO side | PARTIAL |

## Summary

- **❌ Not wired (3):** `home-intent-scan`, row-menu **substitute**, `home-share-community`.
- **⚠️ Needs served QA or is limited (9)** — including `home-recalc-run`, the one the owner hit.
- **✅ Verified (14).**

Final OWNER QA is **WAITING** and freeze is **OPEN** until the ❌ rows are wired and the
⚠️ rows have served QA. This inventory is the tracking list; it is not a claim that HOME
is complete.
