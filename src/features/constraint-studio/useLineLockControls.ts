/**
 * Per-line §17 lock controls for the ingredient rows (SPEC §12.3 „[AI /
 * kłódka]”). Builds the view model the row renders and wraps the row actions
 * so a lock-dropdown change reconciles the constraint set (a manual lock-type
 * override consciously drops the §17 constraint). Row REMOVAL needs no
 * wrapper (owner FINAL CLOSURE C3): `removeItem` is ONE atomic transaction —
 * the store bridge drops the removed line's constraint entry synchronously
 * inside that same setState, with EXACTLY one draftRevision bump.
 */
import type { EffectiveRecipeItem } from '@/engine';
import type {
  IngredientRowActions,
  IngredientRowLockView,
} from '@/features/ingredient-builder/IngredientRow';
import { constraintStudioCopy as copy, formatGramsPl } from './constraintStudioCopy';
import { useConstraintStudioStore } from './constraintStudioStore';

/** The row's padlock view model — defined by the row, produced here. */
export type LineLockView = IngredientRowLockView;

export interface LineLockControls {
  lockFor: (item: EffectiveRecipeItem) => LineLockView;
  wrapActions: (actions: IngredientRowActions) => IngredientRowActions;
}

export function useLineLockControls(): LineLockControls {
  const constraints = useConstraintStudioStore((state) => state.constraints);
  const toggleLock = useConstraintStudioStore((state) => state.toggleLock);
  const onLineLockTypeChanged = useConstraintStudioStore((state) => state.onLineLockTypeChanged);

  const lockFor = (item: EffectiveRecipeItem): LineLockView => {
    const constraint = constraints.byLineId[item.id];
    const name = item.ingredient.name;
    const hasActuals = item.actual_grams !== null;

    if (constraint?.mode === 'locked') {
      const gramsLabel = formatGramsPl(constraint.grams);
      return {
        state: 'locked',
        lockedGramsLabel: gramsLabel,
        ariaLabel: copy.lock.unlockAria(name),
        title: copy.lock.lockedTitle(gramsLabel),
        badge: copy.lock.lockedBadge,
        plannedDisabled: true,
        toggleDisabled: false,
        onToggle: () => toggleLock(item.id),
      };
    }

    if (constraint?.mode === 'range') {
      return {
        state: 'range',
        lockedGramsLabel: `${formatGramsPl(constraint.minGrams)} – ${formatGramsPl(constraint.maxGrams)}`,
        ariaLabel: copy.lock.lockAria(name),
        title: copy.range.note,
        badge: copy.lock.rangeBadge,
        plannedDisabled: false,
        toggleDisabled: false,
        onToggle: () => toggleLock(item.id),
      };
    }

    return {
      state: 'ai',
      lockedGramsLabel: null,
      ariaLabel: copy.lock.lockAria(name),
      title: hasActuals ? copy.lock.actualsTitle : copy.lock.aiTitle,
      badge: null,
      plannedDisabled: false,
      toggleDisabled: hasActuals,
      onToggle: () => toggleLock(item.id),
    };
  };

  const wrapActions = (actions: IngredientRowActions): IngredientRowActions => ({
    ...actions,
    setLockType: (lineId, lockType) => {
      onLineLockTypeChanged(lineId, lockType);
      actions.setLockType(lineId, lockType);
    },
    // removeItem passes through untouched: the atomic store transaction +
    // bridge own the §17 cleanup (owner FINAL CLOSURE C3).
  });

  return { lockFor, wrapActions };
}
