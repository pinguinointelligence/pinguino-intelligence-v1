# A subsequent gram edit transfers the manual-target anchor to the last-edited line

**Status:** OPEN — evidence only, deliberately NOT fixed (owner instruction,
2026-09-02). Keep out of the Crown-OFF work.
**Severity:** P2 — it silently redirects which ingredient the manual-target
projection optimises, and it is invisible in the UI.

## The mechanism

`recipeStore.setPlannedGrams` rewrites every line on each edit:

```ts
const items = state.items.map((item) => {
  const next = { ...item };
  delete next.user_target_grams;          // <- cleared on EVERY line
  if (item.id !== lineId) return next;
  next.planned_grams = targetGrams;
  next.user_target_grams = targetGrams;   // <- set only on the edited line
  if (targetGrams > 0) next.user_intent_anchor_grams = targetGrams;
  ...
```

`projectManualIngredientTarget` then selects its target as the line carrying
`user_target_grams`:

```ts
for (const item of identityInput.items) {
  if (item.lock_type === 'unlocked' && item.actual_grams === null &&
      item.user_target_grams !== undefined && ... ) targetLine = item;
}
```

So **whichever line is edited last owns the manual-target anchor**, and any later
gram edit — including one the customer did not think of as "the thing I am
asking for" — moves it.

## How it was found

While building the Crown-OFF root-cause harness I set STRAWBERRIES to the
requested amount and then rebalanced a support line to close the batch. That
rebalance was a `setPlannedGrams` call, so MILK 3.5% became the manual target and
the projection enumerated grams for MILK, not STRAWBERRIES — 671 LP evaluations
against the wrong line, in every case of the matrix.

The harness bug is mine and is fixed there by rebalancing first and setting the
Main last. The underlying store behaviour is NOT fixed and is what this note
records.

## Why it matters beyond the harness

Any served flow that adjusts a second line after the customer sets the one they
care about — a rebalance, a support nudge, an automatic closure — will silently
retarget the projection. The customer sees no indication that their anchor moved.

## Not investigated

Whether any served path actually performs such a follow-up edit, and whether the
intended semantic is "last edit wins" (in which case the clearing is correct and
the risk is only that callers must order their edits) or "the anchor belongs to
the line the customer named" (in which case the blanket `delete` is wrong).
That distinction is the first thing to settle.
