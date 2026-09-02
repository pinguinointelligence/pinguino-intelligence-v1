# RESTORATION #2 — batch lifecycle / New Recipe / Load Recipe coherence

**Date:** 2026-08-29
**Branch:** `claude/batch-lifecycle-coherence`
**Starting staging SHA:** `4272e749`
**Scope:** recipe/batch lifecycle state coherence only. No Engine, solver, bands,
science, design, language, Scanner, Production or Crown/Main/Direction change.

---

## 1. Root cause

`recipeStore.loadRecipeInput` resolves a `profile` for the draft:

```ts
const defaults = savedRecipe ? null : defaultsFor(productDefaultsKey(visible)) ?? defaultsFor(owner);
const profile  = compatibleMetadata ?? compatibleDefaults;
```

and then spread `profileFields(profile, normalizedItems, input.category)` into the
store. `profileFields` wrote:

```ts
target_batch_grams: profile.targetBatchGrams,   // the ACCOUNT default
batchResizeConflict: null,                      // asserted, never checked
```

while the same `set(...)` wrote `items: normalizedItems` — **the loaded recipe's
original grams, untouched**. The authoritative batch and the Base that is supposed
to realize it were assigned independently, and the result was then positively
reported as coherent.

That produces exactly the owner-reported states:

| state | Base sum | target batch | `batchResizeConflict` | presented as |
| --- | --- | --- | --- | --- |
| reported A | 400 g | 1000 g | `null` | `PROFESSIONAL_DEFAULT` |
| reported B | 982 g | 950 g | `null` | `MACHINE_DEFAULT` |

The Partia cell renders `result.total_batch_g / store.target_batch_grams`, which
is literally the reported **`400 / 1000`**.

The same defect existed in `resetToDemo`, which spread `profileFields(defaults,
base.items, …)` over preset items in the same way.

## 2. The exact stale state that leaked

The **account/product recipe default** (`pinguino-profile-preferences-v1` →
`defaultsByOwner[<user>:<product>]`). Read from the live staging browser profile,
the owner's stored default is:

```json
{ "machineKind": "professional", "machineLabel": "Maszyna profesjonalna",
  "targetBatchGrams": 1000, "targetTemperatureC": -11,
  "visibleProductType": "gelato", "formulationStrategy": "eco" }
```

Working a recipe down to 400 g and then taking any **non-saved** load adopts that
`1000` as the target while the 400 g of Base stays — machine label included.
This reproduces the owner's screen exactly.

Live non-saved caller: `applyStarterRecipeInputToStudio`
(`src/features/studioFlow/applyStarterToStudio.ts:101`). Every other
`loadRecipeInput` caller passes a `savedId`/`savedName`, so `defaults` is `null`
and the saved-reopen contract was never affected.

## 3. Legitimate dirty draft vs stale lifecycle leak

- **Legitimate dirty draft** — the user (or Crown auto-seed) edits grams: the
  target is untouched, Base is honestly `1001 / 1000`, `dirty === true` and
  `awaitingRecalculation === true`. Recalculate reconciles it. **Not a bug, and
  deliberately not auto-resized** — that would destroy user intent.
- **Stale lifecycle leak** — a load/reset/init operation *itself* assigns a new
  authoritative target next to grams it did not touch, and writes
  `batchResizeConflict: null`. Nothing is marked changed; the draft is offered as
  a finished authoritative recipe. **That is the P0.**

## 4. First bad commit

| commit | date | role |
| --- | --- | --- |
| `c6a0ab1b` | 2026-08-09 | **first bad commit** — introduced the non-saved `defaultsFor(...)` adoption feeding `profileFields`, with `target_batch_grams: profile.targetBatchGrams` and no Base resize |
| `e00175d3` | 2026-08-28 | built the atomic `resizeRecipeBatch` authority + `batchResizeConflict`, wired it into `setBatchGrams` / `setMachineSelection` / `setVisibleProductType` — **but not into the load path**, and stamped `batchResizeConflict: null` onto it, turning a silent incoherence into one positively reported as coherent |

`git log -S "target_batch_grams: profile.targetBatchGrams"` returns **exactly one
commit across all branches**: `c6a0ab1b`. The line is present at `c6a0ab1b`,
`e00175d3`, `ee70985c` and at the current head `4272e749`.

**It was never fixed and therefore never re-broken. This is NOT a Design /
Language / rebase restoration of stale code — it is an original P0 that has been
continuously present since 2026-08-09.**

## 5. Fix

One file, `src/stores/recipeStore.ts` (+87 / −14). No new batch authority: the
existing shared `resizeRecipeBatch` is reused.

- `profileBatchSource(profile)` — extracted, byte-identical to the previous
  inline expression.
- `resolveProfileBatch(profile, items, previousBatchGrams)` — returns the
  `{ items, targetBatchGrams, batchSource }` triple. If the profile batch differs
  from the draft's, it goes through `resizeRecipeBatch`. **If that resize is
  impossible (locks), the default is not adopted at all**: the recipe keeps its
  own coherent batch, redescribed as the manual batch it actually is. An
  incoherent Partia is never written.
- `profileFields(..., batch)` now takes the resolved batch instead of computing
  its own.
- `loadRecipeInput` applies the atomic adoption **only** when the batch came from
  account/product defaults (`adoptsAccountBatch`). A saved reopen still restores
  its own persisted batch and grams byte-for-byte.
- `resetToDemo` uses the same resolver.

## 6. Sorbet differential — science is NOT the cause

Same Sorbet fixture (strawberry+lime Multi-Main 60 %, −13 °C), run as
**A** = corrupted (Base 40 % of target) and **B** = coherent:

| | A corrupted | B coherent |
| --- | --- | --- |
| POD / PAC / NPAC | 20.24 / 34.71 / 50.37 | 20.24 / 34.71 / 50.37 |
| ice fraction | 51.77 % | 51.77 % |
| all composition percentages | identical | identical |
| violations | 0 | 0 |
| **`practicalizeRecipeCandidate`** | **`ok=false` `batch_residual_unresolved`** | **`ok=true`** |
| owner-visible Main share | **24 %** | 60 % |

The composition model is scale-invariant and completely unaffected. What fails is
the **batch gate**, and the Main share is misreported by exactly the batch ratio.

**The Sorbet symptom was downstream of batch-state corruption. Sorbet science was
not touched and must not be.**

## 7. Tests

New: `src/stores/recipeStore.batchLifecycleCoherence.test.ts` — 18 cases.

Proved to fail on the pre-fix store and pass after: the 4 P0 cases fail with a
600 g gap (the `400 / 1000` state), a 32 g gap (the `982 / 950` state), broken
ratios, and `expected 10 to be 400` for the impossible-default case. The 11
matrix cases pass before and after, proving no accepted behavior moved.

Owner regression matrix — all green:

1. Professional 1000 → manual 400 → New Recipe = 1000/1000/1000
2. Professional manual 3000 → temperature −13 → −12 = 3000 preserved
3. Professional 3000 → save → reopen SAME recipe = 3000
4. Professional 3000 → New Recipe = 1000
5. Ninja 450 → Professional = 1000
6. Deluxe 670 → Professional = 1000
7. Custom 700 → New Professional recipe = 1000
8. Magimix 950 → profile switch Sorbet = 1240 canonical
9. manual Magimix 1100 → profile + temperature changes = 1100 preserved
10. New Recipe after a manual Magimix state = 1000

Every assertion checks `target == Base sum == Engine total_batch_g`,
`batch_source` and `batchResizeConflict === null` together.
