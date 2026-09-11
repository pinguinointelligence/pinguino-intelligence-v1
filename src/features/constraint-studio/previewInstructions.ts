/**
 * INTERACTIVE RECALCULATION PREVIEW — the customer's provisional instructions.
 *
 * OWNER 2026-09-11: inside the recalculation preview the customer may change a
 * proposed amount and/or its padlock and ask Gellatti to recalculate, and the
 * recipe on screen must not change until „Zastosuj zmiany". This module is the
 * ONE pure definition of what such an instruction means for the solver input.
 * The preview builder, the Apply door (which re-derives the same adjusted draft
 * from the untouched recipe) and the lock-conflict diagnostic all use it, so
 * the three can never disagree about what the customer asked for.
 *
 * The semantics are the recipe row's own, nothing new:
 *  - a CHANGED amount is the customer's amount, exactly as if it were typed
 *    into the row (`recipeStore.setPlannedGrams`): planned grams, the typed
 *    soft target and the user-intent anchor;
 *  - `locked: true` is the exact padlock at that amount (`toggleLock` →
 *    `setGramLock`): the solver must keep it;
 *  - `locked: false` is no padlock. An edit never creates a hidden lock, and
 *    an unchanged amount with the padlock released is a plain unlock — the
 *    same as pressing the padlock in the row.
 */
import type { LockType, RecipeInput, RecipeItem } from '@/engine';
import {
  clampOwnerStabilizerComponentGrams,
  type ConstraintSet,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import {
  withCrownBootstrap,
  withoutCrownBootstrap,
} from '@/features/formulation/crownBootstrapProvenance';

export interface PreviewLineInstruction {
  readonly lineId: string;
  /** Whole grams, at least 1 g (a Base line below 1 g is not a dose). */
  readonly grams: number;
  /** TRUE = exact padlock at `grams`; FALSE = no padlock. */
  readonly locked: boolean;
  /**
   * PACKAGE 2A (owner OD-1, 2026-09-11) — HOME's solver bootstrap, never the
   * customer's amount. A HOME priority line at 0 g enters the provisional copy at
   * 1 g carrying the Crown bootstrap provenance (#290), with no typed target and
   * no intent anchor, so the Main search sizes it. The recipe keeps 0 g until
   * „Zastosuj zmiany", and the instruction is never written as a row edit.
   */
  readonly bootstrap?: true;
}

/** Engine-native locks the padlock layer never overrides (§18.1). */
const ENGINE_KEPT_LOCKS: ReadonlySet<LockType> = new Set(['main', 'already_added', 'required']);

/** Lines whose amount is not the customer's to change inside a preview. */
const NON_EDITABLE_LOCKS: ReadonlySet<LockType> = new Set(['already_added', 'required']);

export type PreviewInstructionsRejection =
  | 'line_missing'
  | 'invalid_grams'
  | 'physical_actual'
  | 'duplicate_line'
  | 'engine_held_line'
  | 'invalid_bootstrap';

export type PreviewInstructionsResult =
  | { ok: true; input: RecipeInput; constraints: ConstraintSet }
  | { ok: false; reason: PreviewInstructionsRejection; lineId: string };

/** A line the preview may offer an amount control and a padlock for. */
export function isPreviewEditableLine(item: RecipeItem): boolean {
  return item.actual_grams === null && !NON_EDITABLE_LOCKS.has(item.lock_type);
}

/** The customer's own quantity lock on a line: a §17 padlock/percent/range
 * constraint, or a bare engine `grams` lock inherited from a saved recipe. */
export function hasCustomerQuantityLock(item: RecipeItem, constraints: ConstraintSet): boolean {
  const constraint = constraints.byLineId[item.id];
  if (constraint !== undefined && constraint.mode !== 'ai') return true;
  return item.lock_type === 'grams' || item.lock_type === 'percent';
}

const withoutQuantitySidecars = (item: RecipeItem): RecipeItem => {
  const next = { ...item };
  delete next.range_constraint;
  delete next.percent_constraint;
  delete next.grams_constraint;
  return next;
};

/**
 * Applies the instructions IN ORDER to a copy of the draft. Pure and
 * deterministic; the input objects are never mutated. Returns the adjusted
 * solver input and constraint set, or the first reason an instruction cannot
 * be honoured (never a partial result).
 */
export function applyPreviewInstructions(
  input: RecipeInput,
  constraints: ConstraintSet,
  instructions: readonly PreviewLineInstruction[],
): PreviewInstructionsResult {
  let items: RecipeItem[] = input.items.map((item) => ({ ...item }));
  const byLineId: Record<string, IngredientConstraint> = { ...constraints.byLineId };
  const seen = new Set<string>();

  for (const instruction of instructions) {
    if (seen.has(instruction.lineId)) {
      return { ok: false, reason: 'duplicate_line', lineId: instruction.lineId };
    }
    seen.add(instruction.lineId);
    const index = items.findIndex((item) => item.id === instruction.lineId);
    const current = index >= 0 ? items[index]! : undefined;
    if (current === undefined) {
      return { ok: false, reason: 'line_missing', lineId: instruction.lineId };
    }
    if (current.actual_grams !== null) {
      return { ok: false, reason: 'physical_actual', lineId: instruction.lineId };
    }
    if (NON_EDITABLE_LOCKS.has(current.lock_type)) {
      return { ok: false, reason: 'engine_held_line', lineId: instruction.lineId };
    }
    if (instruction.bootstrap) {
      // Only a HOME priority line with no amount yet, and only at the 1 g bootstrap.
      if (
        current.lock_type !== 'main' ||
        current.planned_grams !== 0 ||
        instruction.grams !== 1 ||
        instruction.locked
      ) {
        return { ok: false, reason: 'invalid_bootstrap', lineId: instruction.lineId };
      }
      const bootstrapped = withCrownBootstrap({ ...current, planned_grams: 1 });
      delete bootstrapped.user_target_grams;
      delete bootstrapped.user_intent_anchor_grams;
      items = items.map((item, position) => (position === index ? bootstrapped : item));
      continue;
    }
    if (!Number.isInteger(instruction.grams) || instruction.grams < 1) {
      return { ok: false, reason: 'invalid_grams', lineId: instruction.lineId };
    }

    // 1. The amount. Only a CHANGED amount is a typed amount; the row writes
    //    nothing when the value is left as it was.
    let edited: RecipeItem = { ...current };
    if (!Object.is(instruction.grams, current.planned_grams)) {
      // PINGÜINO's own stabilizer system still bounds a component, exactly as
      // the row's grams write does. Everything else gets the amount asked for.
      const grams = clampOwnerStabilizerComponentGrams(
        { ...input, items },
        instruction.lineId,
        instruction.grams,
      ).grams;
      // One typed soft target at a time — the row clears every other line's.
      items = items.map((item) => {
        if (item.user_target_grams === undefined) return item;
        const next = { ...item };
        delete next.user_target_grams;
        return next;
      });
      // A typed amount is never the PRO Crown bootstrap, whatever its value.
      edited = withoutCrownBootstrap({
        ...items[index]!,
        planned_grams: grams,
        user_target_grams: grams,
      });
      if (grams > 0) edited.user_intent_anchor_grams = grams;
      else delete edited.user_intent_anchor_grams;
    }

    // 2. The padlock.
    if (instruction.locked) {
      edited = {
        ...withoutCrownBootstrap(withoutQuantitySidecars(edited)),
        lock_type: ENGINE_KEPT_LOCKS.has(edited.lock_type) ? edited.lock_type : 'grams',
        grams_constraint: { grams: edited.planned_grams },
      };
      byLineId[instruction.lineId] = { mode: 'locked', grams: edited.planned_grams };
    } else {
      const existing = byLineId[instruction.lineId];
      if (existing !== undefined && existing.mode !== 'ai') delete byLineId[instruction.lineId];
      edited = withoutQuantitySidecars(edited);
      if (edited.lock_type === 'grams' || edited.lock_type === 'percent') {
        edited.lock_type = 'unlocked';
      }
    }
    items = items.map((item, position) => (position === index ? edited : item));
  }

  return { ok: true, input: { ...input, items }, constraints: { byLineId } };
}

/**
 * The session's instruction list after a new round of edits: the latest
 * instruction per line wins and moves to the end, so the order always reflects
 * the order in which the customer last touched each line.
 */
export function mergePreviewInstructions(
  existing: readonly PreviewLineInstruction[],
  edits: readonly PreviewLineInstruction[],
): PreviewLineInstruction[] {
  const editedIds = new Set(edits.map((edit) => edit.lineId));
  const latest = new Map<string, PreviewLineInstruction>();
  for (const edit of edits) latest.set(edit.lineId, edit);
  return [
    ...existing.filter((instruction) => !editedIds.has(instruction.lineId)),
    ...[...latest.values()].map((instruction) => ({ ...instruction })),
  ];
}

export function previewInstructionsFingerprint(
  instructions: readonly PreviewLineInstruction[],
): string {
  return JSON.stringify(
    instructions.map((instruction) => [instruction.lineId, instruction.grams, instruction.locked]),
  );
}

export function samePreviewInstructions(
  left: readonly PreviewLineInstruction[],
  right: readonly PreviewLineInstruction[],
): boolean {
  return previewInstructionsFingerprint(left) === previewInstructionsFingerprint(right);
}
