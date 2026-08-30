/**
 * GELLATTI HOME — the sequential stage flow (§82–§86). PURE: no React, no IO, no store.
 *
 * HOME is not a dashboard and not one overloaded screen. It is a short sequence of calm
 * sections under a fixed header. This module owns WHICH sections exist, which are
 * REACHABLE, and what a CTA advances to — so the page component only renders.
 *
 * Two rules make the flow honest rather than decorative:
 *
 *  §84 A required-but-unanswered stage cannot be skipped. Reachability is derived from
 *      the answers, never from "how far did they scroll" — so a deep link, a Back, or a
 *      refresh can never land someone past a question the recipe depends on.
 *
 *  §85 Revisiting an EARLIER answered stage never replays the flow. Changing the machine
 *      or profile updates the SAME recipe and returns to the live recipe position.
 */

export type HomeStage = 'intent' | 'match' | 'profile' | 'machine' | 'recipe' | 'preparation';

/** Declaration order — also the document order of the sections on the page. */
export const HOME_STAGES: readonly HomeStage[] = [
  'intent',
  'match',
  'profile',
  'machine',
  'recipe',
  'preparation',
];

/**
 * Everything the flow needs to know about what the user has answered so far.
 * Deliberately booleans + counts: the flow decides ORDER, never content.
 */
export interface HomeFlowAnswers {
  /** At least one resolved intent chip exists. */
  readonly hasIntent: boolean;
  /** `Create my recipe` was pressed — intent collection is closed (§18). */
  readonly intentSubmitted: boolean;
  /** Matching ran and produced candidates that require a choice (§35). */
  readonly requiresMatchChoice: boolean;
  /** A match choice was made, or `Create my own` was taken. */
  readonly matchResolved: boolean;
  /** The profile is known — stated, implied, or inherited from an adopted recipe (§31). */
  readonly hasProfile: boolean;
  /** A machine is known — saved preference, chosen, or inherited from PRO (§42, §16). */
  readonly hasMachine: boolean;
  /** The first recipe has been generated; everything is live from here (§51). */
  readonly recipeReady: boolean;
  /** `Let's make it` was pressed (§66). */
  readonly preparationStarted: boolean;
  /**
   * The stages this flow ACTUALLY put on screen.
   *
   * This cannot be derived from the answers, and that is the whole point: a profile
   * that was IMPLIED by the user's words (§31) and a profile the user PICKED both
   * leave `hasProfile: true`. Only the first must leave no section behind — "do not
   * ask again" also means "do not show the question you never asked".
   */
  readonly presentedStages: readonly HomeStage[];
}

export const EMPTY_HOME_FLOW_ANSWERS: HomeFlowAnswers = Object.freeze({
  hasIntent: false,
  intentSubmitted: false,
  requiresMatchChoice: false,
  matchResolved: false,
  hasProfile: false,
  hasMachine: false,
  recipeReady: false,
  preparationStarted: false,
  presentedStages: [],
});

/**
 * Is a stage part of THIS user's journey at all?
 *
 * §31/§42: a known profile or a saved machine removes its stage entirely — the owner
 * rule is "do not ask again", and a stage that renders as an already-answered summary
 * is still asking.
 */
export function isStageRequired(stage: HomeStage, answers: HomeFlowAnswers): boolean {
  switch (stage) {
    case 'intent':
      return true;
    case 'match':
      return answers.requiresMatchChoice;
    case 'profile':
      return !answers.hasProfile;
    case 'machine':
      return !answers.hasMachine;
    case 'recipe':
      return true;
    case 'preparation':
      return answers.preparationStarted;
  }
}

/**
 * §84: can the user be at this stage right now? A stage is reachable once every
 * REQUIRED stage before it has been answered.
 */
export function isStageReachable(stage: HomeStage, answers: HomeFlowAnswers): boolean {
  switch (stage) {
    case 'intent':
      return true;
    case 'match':
      return answers.intentSubmitted && answers.requiresMatchChoice;
    case 'profile':
      return (
        answers.intentSubmitted &&
        (!answers.requiresMatchChoice || answers.matchResolved) &&
        !answers.hasProfile
      );
    case 'machine':
      return (
        answers.intentSubmitted &&
        (!answers.requiresMatchChoice || answers.matchResolved) &&
        answers.hasProfile &&
        !answers.hasMachine
      );
    case 'recipe':
      return answers.recipeReady;
    case 'preparation':
      return answers.recipeReady && answers.preparationStarted;
  }
}

/**
 * Every stage the page should render, in document order: whatever is reachable NOW,
 * plus whatever this flow already presented (so an answered section stays available
 * to revisit, §84). A stage that was never asked never appears.
 */
export function visibleStages(answers: HomeFlowAnswers): readonly HomeStage[] {
  return HOME_STAGES.filter(
    (stage) => isStageReachable(stage, answers) || answers.presentedStages.includes(stage),
  );
}

/** Has this stage been answered? Completed stages may be revisited (§84). */
export function isStageCompleted(stage: HomeStage, answers: HomeFlowAnswers): boolean {
  switch (stage) {
    case 'intent':
      return answers.intentSubmitted;
    case 'match':
      return answers.matchResolved;
    case 'profile':
      return answers.hasProfile;
    case 'machine':
      return answers.hasMachine;
    case 'recipe':
      return answers.recipeReady;
    case 'preparation':
      return false;
  }
}

/**
 * The stage the page should focus after the latest answer — i.e. where a CTA lands.
 * Returns the FIRST reachable-but-unanswered stage, falling back to the furthest
 * completed one so a fully answered flow rests on the live recipe (§85).
 */
export function activeStage(answers: HomeFlowAnswers): HomeStage {
  if (answers.preparationStarted && answers.recipeReady) return 'preparation';
  for (const stage of HOME_STAGES) {
    if (stage === 'preparation') continue;
    if (isStageRequired(stage, answers) && !isStageCompleted(stage, answers)) {
      return isStageReachable(stage, answers) ? stage : 'intent';
    }
  }
  return answers.recipeReady ? 'recipe' : 'intent';
}

/**
 * §83: from the second stage onward a subtle Back is offered. It targets the previous
 * VISIBLE stage, so a skipped question never becomes a dead step backwards.
 */
export function backTarget(current: HomeStage, answers: HomeFlowAnswers): HomeStage | null {
  const visible = visibleStages(answers);
  const index = visible.indexOf(current);
  if (index <= 0) return null;
  return visible[index - 1] ?? null;
}

/**
 * §86: changing the CORE IDEA once a recipe exists is a NEW recipe, not an edit.
 * Anything else (machine, profile, an ingredient) updates the same recipe in place.
 */
export type IntentChangeVerdict = 'edit_in_place' | 'requires_new_recipe';

export function classifyIntentChange(input: {
  readonly recipeReady: boolean;
  readonly changesCoreIdea: boolean;
}): IntentChangeVerdict {
  if (!input.recipeReady) return 'edit_in_place';
  return input.changesCoreIdea ? 'requires_new_recipe' : 'edit_in_place';
}
