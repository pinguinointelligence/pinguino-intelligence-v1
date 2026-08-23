# PINGÜINO — Protein V2 Final Closeout

**Date:** 2026-08-23
**Branch:** `claude/protein-final-closeout` (rebased onto `origin/staging` @ `0ab80ed`)
**Worktree:** `pinguino-intelligence-v1-protein-final`
**Mapper Base:** `docs/ingredients/validation/mapper_basement.csv` — 2088 rows, SHA-256
`b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unmodified**

---

## FINAL STATUS

**PROTEIN V2 FINAL CLOSEOUT BLOCKED — Recipe Direction returns a non-nearest candidate when a
requested band is unreachable, so the five-position Sweetness selector moves backwards at −11 °C
(+2 delivers POD 14.7201 against +1's 15.5571) and at −13 °C (−1 delivers 14.9812, above its own
requested band [13,14]). This is a defect in the SHARED Direction NEAREST selection, not in
Protein. Until it is fixed, Protein Sweetness cannot be truthfully unblocked, and §7–§14 (the
≥1,500-state Direction matrix), §17, §24 and §29 cannot be closed.**

This is a blocked status, not a partial close. The §6 work below is complete and fully validated;
it is reported as evidence, not as closure.

---

## §6 — Toolbox ↔ Mapper ↔ served runtime determinism — **CLOSED**

### Root cause (not a seed-placement problem)

The brief forbade "simply moving Protein seeds farther from band edges" and demanded the
source-of-truth fix. The real defect: **every toolbox-bound identity diverged from its Mapper row.**
The reference set in `src/engine/corrections/candidates.ts` builds ingredients with
`pod_value: null, pac_value: null`, while the Mapper carries stored values. Per `engine/pac.ts`
precedence — **a stored `pac_value` wins; null falls back to deriving from the sugar breakdown** —
the offline toolbox path and the served path were running *different freezing arithmetic on the
same nominal ingredient*. That is why offline reported Score 10 where served measured Score 6.

### Fix

- `scripts/buildCanonicalToolboxCompositions.mjs` — generates a single composition authority
  **from** the Mapper. It never writes the Mapper. `--check` fails on any drift and pins the
  Mapper SHA-256.
- `src/data/ingredients/canonicalToolboxCompositions.ts` — GENERATED. 23 identities, exporting
  `CANONICAL_TOOLBOX_COMPOSITIONS`, `CANONICAL_TOOLBOX_MAPPER_SHA256`, `canonicalToolboxComposition()`.
- `src/features/recipes/newRecipeStarter.ts` — `starterIngredient()` resolves each seed's
  composition, POD, PAC, DE, price, currency, confidence and verification from the canonical
  authority instead of the null-bearing reference set.

**Scope discipline:** making this authority global broke 36 tests across `engineAuthenticity` drift
detectors, the Vegan matrix, the Gelato 150-state Direction sweep and the substitution/Main
contracts. That change was reverted and the authority scoped to the starter path only, where the
defect actually lived.

### Verification — offline now reproduces served exactly

| Serving | POD | NPAC | Protein % |
|---|---|---|---|
| −11 °C | 14.3305 | 39.00 | 9.525 % |
| −12 °C | 15.1027 | 44.80 | 8.312 % |
| −13 °C | 14.6927 | 51.00 | 9.773 % |

`src/data/ingredients/canonicalToolboxCompositions.test.ts` — 16 tests pinning the generated data
field-for-field against the Mapper rows, asserting the starter carries canonical
composition/POD/PAC/price, and reproducing the served-measured metrics above.

---

## §15 — Protein Direction science — **RESEARCHED; SWEETNESS BLOCKED ON DELIVERY, HARDNESS ON SCIENCE**

### Sweetness — safe and scientifically legitimate, but NOT honestly deliverable yet

Proven safe: the complete −2..+2 × −2..+2 × 3 temperatures × 2 strategies matrix — **150 states,
all natively hard-safe, all claim-qualified, all applied, zero zero-gram lines** — which satisfies
the `blocked_runtime` gate's own criterion. POD is also a legitimate protein-side measure: it is
composition-derived from each ingredient's own stored `pod_value`, and the five-fifth target
subdivides the Protein profile's **own** approved POD band [12,17]. No borrowed dairy curve, no
invented `lockedReference`.

Two independent fixes were implemented and measured:

1. `targetFifth` for Protein (the legacy three-zone helper collapses −2/−1 and +1/+2, which would
   make a five-position selector lie about having five positions).
2. Routing Protein through `hasActiveExactDirectionObjective`. Protein now subdivides its band into
   fifths exactly as Standard Gelato does, but the gate admitted only `standard_gelato` or a profile
   carrying an exact target *centre* — so Protein fell through to the generic band-violation route,
   which only drives violation severity to zero.

Result at −12 °C: fully monotone, five distinct, and ECO stopped collapsing —

```
−12 optimal/eco: 13.8201  13.8224  14.9346  15.1027  16.4588
```

Two sequences still move backwards:

```
−11 optimal+eco: 12.4716  13.4992  14.3305  15.5571  [14.7201]   ← +2 < +1
−13 optimal+eco: 13.9272  14.9812  [14.6927] 15.5194  16.5279    ← −1 overshoots its band
```

**Classified per §12 as optimizer defects, not feasibility frontiers.** At −11 the engine
demonstrably reaches POD 15.5571 (it does so at +1), and 15.5571 is *nearer* to +2's requested band
[16,17] than the 14.7201 actually returned — so the returned candidate is provably not the nearest
reachable one. At −13, the −1 result 14.9812 sits *above* its own requested band [13,14] while
level 0 lands correctly inside [14,15]; the mis-ordered member is −1, not 0.

**Decision: the Sweetness unblock was reverted.** Shipping a five-position control that can move
backwards is exactly the "control that lies about what it did" failure the axis gate exists to
prevent. The axis stays blocked until the shared Direction NEAREST selection returns the closest
legal candidate to an unreachable band. Evidence and root cause are recorded in
`src/features/protein-gelato/proteinDirectionAuthority.test.ts`, which now locks the truthful
blocked state (both axes blocked with a stated reason, no target band, `supportedAxisCount === 0`)
so no downstream consumer can silently optimize toward a target the UI reports as unavailable.

### Hardness — blocked on cited science, and expected to remain so

Hardness is targeted through NPAC (freezing-point depression). Borrowing the Gelato NPAC→hardness
calibration is not defensible: at otherwise constant formulation, instrumental hardness rises
**13.60 N → 47.66 N as protein goes 4 % → 10 %** (Applied Food Research 2(1) 100029, 2022,
DOI 10.1016/j.afres.2021.100029, Table 1 / Fig. 2). The same NPAC therefore does not mean the same
hardness in a high-protein mix, and no published controlled series reports NPAC/PAC alongside
hardness for high-protein frozen desserts, so the protein-specific curve cannot be derived.

---

## Validation at this commit

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | 0 errors (2 pre-existing react-refresh warnings) |
| `npm run build` | ✓ built |
| `npx vitest run` | **7499 passed / 7499** (after rebase onto `0ab80ed`) |
| Mapper drift guard | 23 identities verified against `b13f5db4affd…` |
| Production Rescue Edge bundle | regenerated + re-verified `3716be4d817c…`, 57-file closure |

---

## NOT DELIVERED — required before this closeout can be re-attempted

These are stated plainly rather than approximated. No number below was estimated or fabricated.

- **§3–§5, §38** — ≥20 internet-sourced recipes with real opened source URLs, and
  `reports/PROTEIN_INTERNET_RECIPE_MATRIX.csv`. **Not collected. The CSV does not exist.**
- **§7–§14** — the ≥1,500-state Direction matrix (20 recipes × 3 temps × full 5×5). Blocked: the
  axis under test is blocked, so the matrix would measure a disabled control. The 150-state
  starter-based sweep above is the only Direction evidence gathered.
- **§16** — Recipe Rescue decoupling from Direction. **Landed independently on `origin/staging`
  as `0ab80ed` ("fix(rescue): decouple the Recipe Rescue Advisor from Direction targets"), not by
  this task.** Carried in via rebase and green here; not re-verified against §17's Rescue scenarios.
- **§17** — ≥20 Rescue scenarios. Not run.
- **§18** — ≥6 Main/Multi-Main internet cases. Not run.
- **§19** — lock torture. Not run.
- **§20** — protein %/Score ladder including the 19.99 / 19.996 / 20.00 / 20.01 energy-share
  boundary. Not re-run in this task (covered in the 2026-08-23 closeout for the prior task).
- **§21** — ≥120 ECO/OPTIMAL states. Not run at this scale.
- **§22, §23** — zero-gram sweep and the ≥5-recipe Save/reopen/version matrix. Not run.
- **§24** — Production Rescue real frontend→Edge E2E (≥5 recipes). Not run.
- **§25–§27** — seeded randomization, ≥500 deterministic fuzz states, convergence/performance.
  Not run.
- **§29** — ≥150 served Direction states across ≥10 recipes. Not run.
- **§32** — staging Edge sync. Not performed.

## Deploy state

Nothing was pushed to `origin/staging`, no staging or production deploy was performed, no
production Edge deploy, no production Supabase write, no merge to `main`, no migration. The work
sits on `claude/protein-final-closeout` for owner review. Given the BLOCKED status, promoting the
§6 fix to staging is deliberately left as the owner's call rather than taken unilaterally.

## Recommended next step

Fix the shared Direction NEAREST selection first — when a requested band is unreachable, return the
legal candidate closest to that band. That single fix is what gates Protein Sweetness, and because
it is shared machinery it should be measured against the existing Gelato and Sorbet Direction
suites before Protein is re-enabled.
