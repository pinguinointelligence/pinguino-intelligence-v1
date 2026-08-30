/**
 * GELLATTI HOME — binds the pure stage flow to the live stores.
 *
 * Everything this hook reports is DERIVED from state that already exists: the draft's
 * own answers and `recipeStore`. It stores no duplicate of the recipe and computes no
 * formulation, so HOME and PRO can never disagree about what the recipe is (§1, §14).
 */
import { useMemo } from 'react';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeDraftStore } from './homeDraftStore';
import {
  activeStage,
  backTarget,
  isStageReachable,
  visibleStages,
  type HomeFlowAnswers,
  type HomeStage,
} from './homeStageFlow';
import { intentProfileFor } from './homeProfileMapping';

export interface HomeFlow {
  readonly answers: HomeFlowAnswers;
  readonly stages: readonly HomeStage[];
  readonly active: HomeStage;
  readonly backFrom: (stage: HomeStage) => HomeStage | null;
  readonly canReach: (stage: HomeStage) => boolean;
}

export function useHomeFlow(input: {
  /** True when matching produced candidates the user must choose between (§35). */
  readonly requiresMatchChoice: boolean;
  readonly matchResolved: boolean;
  /** True when a machine is known — saved preference, chosen, or inherited (§42, §16). */
  readonly hasMachine: boolean;
}): HomeFlow {
  const chips = useHomeDraftStore((state) => state.chips);
  const intentSubmitted = useHomeDraftStore((state) => state.intentSubmitted);
  const draftProfile = useHomeDraftStore((state) => state.profile);
  const presentedStages = useHomeDraftStore((state) => state.presentedStages);
  const recipeReady = useHomeDraftStore((state) => state.recipeReady);
  const preparationStarted = useHomeDraftStore((state) => state.preparationStarted);
  // §31: a profile already carried by the live recipe counts as known — a Pro recipe
  // opened in HOME must not be asked what it is.
  const recipeVisibleType = useRecipeStore((state) => state.visibleProductType);

  const answers = useMemo<HomeFlowAnswers>(
    () => ({
      hasIntent: chips.length > 0,
      intentSubmitted,
      requiresMatchChoice: input.requiresMatchChoice,
      matchResolved: input.matchResolved,
      hasProfile: draftProfile !== null || (recipeReady && recipeVisibleType !== undefined),
      hasMachine: input.hasMachine,
      recipeReady,
      preparationStarted,
      presentedStages,
    }),
    [
      chips.length,
      intentSubmitted,
      input.requiresMatchChoice,
      input.matchResolved,
      input.hasMachine,
      draftProfile,
      recipeReady,
      recipeVisibleType,
      preparationStarted,
      presentedStages,
    ],
  );

  return useMemo(
    () => ({
      answers,
      stages: visibleStages(answers),
      active: activeStage(answers),
      backFrom: (stage: HomeStage) => backTarget(stage, answers),
      canReach: (stage: HomeStage) => isStageReachable(stage, answers),
    }),
    [answers],
  );
}

/** The profile in force: the draft's stated one, else the live recipe's family. */
export function useEffectiveProfile() {
  const draftProfile = useHomeDraftStore((state) => state.profile);
  const visible = useRecipeStore((state) => state.visibleProductType);
  const recipeReady = useHomeDraftStore((state) => state.recipeReady);
  return draftProfile ?? (recipeReady ? intentProfileFor(visible) : null);
}
