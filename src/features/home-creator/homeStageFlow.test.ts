import { describe, expect, it } from 'vitest';
import {
  EMPTY_HOME_FLOW_ANSWERS,
  activeStage,
  backTarget,
  classifyIntentChange,
  isStageReachable,
  isStageRequired,
  visibleStages,
  type HomeFlowAnswers,
} from './homeStageFlow';

const answers = (patch: Partial<HomeFlowAnswers>): HomeFlowAnswers => ({
  ...EMPTY_HOME_FLOW_ANSWERS,
  ...patch,
});

describe('stage requirement (§31, §42)', () => {
  it('drops the profile stage entirely when the profile is already known', () => {
    expect(isStageRequired('profile', answers({ hasProfile: true }))).toBe(false);
    expect(isStageRequired('profile', answers({}))).toBe(true);
  });

  it('drops the machine stage when a saved machine exists — never asks twice', () => {
    expect(isStageRequired('machine', answers({ hasMachine: true }))).toBe(false);
  });

  it('only shows the match stage when matching produced a real choice (§35)', () => {
    expect(isStageRequired('match', answers({}))).toBe(false);
    expect(isStageRequired('match', answers({ requiresMatchChoice: true }))).toBe(true);
  });
});

describe('§84 — a required unanswered stage cannot be skipped', () => {
  it('keeps the profile stage unreachable until an offered match is resolved', () => {
    const pending = answers({ intentSubmitted: true, requiresMatchChoice: true });
    expect(isStageReachable('profile', pending)).toBe(false);
    expect(isStageReachable('match', pending)).toBe(true);
  });

  it('keeps the machine stage unreachable until a profile exists', () => {
    const noProfile = answers({ intentSubmitted: true });
    expect(isStageReachable('machine', noProfile)).toBe(false);
    expect(isStageReachable('machine', answers({ intentSubmitted: true, hasProfile: true }))).toBe(
      true,
    );
  });

  it('keeps the live recipe unreachable before the first generation (§51)', () => {
    expect(isStageReachable('recipe', answers({ intentSubmitted: true, hasProfile: true }))).toBe(
      false,
    );
    expect(isStageReachable('recipe', answers({ recipeReady: true }))).toBe(true);
  });

  it('keeps preparation unreachable until Let us make it is pressed (§66)', () => {
    expect(isStageReachable('preparation', answers({ recipeReady: true }))).toBe(false);
    expect(
      isStageReachable('preparation', answers({ recipeReady: true, preparationStarted: true })),
    ).toBe(true);
  });
});

describe('active stage — where a CTA lands', () => {
  it('starts at intent', () => {
    expect(activeStage(EMPTY_HOME_FLOW_ANSWERS)).toBe('intent');
  });

  it('advances to the match choice after Create my recipe', () => {
    expect(activeStage(answers({ intentSubmitted: true, requiresMatchChoice: true }))).toBe(
      'match',
    );
  });

  it('skips straight past profile and machine when both are already known', () => {
    expect(
      activeStage(
        answers({ intentSubmitted: true, hasProfile: true, hasMachine: true, recipeReady: true }),
      ),
    ).toBe('recipe');
  });

  it('rests on the live recipe once everything is answered (§85)', () => {
    expect(
      activeStage(
        answers({ intentSubmitted: true, hasProfile: true, hasMachine: true, recipeReady: true }),
      ),
    ).toBe('recipe');
  });

  it('moves to preparation once it has started', () => {
    expect(
      activeStage(
        answers({
          intentSubmitted: true,
          hasProfile: true,
          hasMachine: true,
          recipeReady: true,
          preparationStarted: true,
        }),
      ),
    ).toBe('preparation');
  });
});

describe('visible stages and Back (§83)', () => {
  it('never renders a stage the user does not need', () => {
    const known = answers({
      intentSubmitted: true,
      hasProfile: true,
      hasMachine: true,
      recipeReady: true,
      presentedStages: ['intent', 'recipe'],
    });
    const visible = visibleStages(known);
    expect(visible).not.toContain('profile');
    expect(visible).not.toContain('machine');
    expect(visible).not.toContain('match');
    expect(visible).toContain('intent');
    expect(visible).toContain('recipe');
  });

  it('offers no Back on the first stage and a Back from the second onward', () => {
    const flow = answers({
      intentSubmitted: true,
      requiresMatchChoice: true,
      presentedStages: ['intent', 'match'],
    });
    expect(backTarget('intent', flow)).toBeNull();
    expect(backTarget('match', flow)).toBe('intent');
  });

  it('skips a stage the user never saw when going Back', () => {
    const known = answers({
      intentSubmitted: true,
      hasProfile: true,
      hasMachine: true,
      recipeReady: true,
      presentedStages: ['intent', 'recipe'],
    });
    // profile/machine were never asked, so Back from the recipe lands on intent.
    expect(backTarget('recipe', known)).toBe('intent');
  });
});

describe('§86 — changing the core idea is a new recipe', () => {
  it('treats a core-idea change after a recipe exists as a new recipe', () => {
    expect(classifyIntentChange({ recipeReady: true, changesCoreIdea: true })).toBe(
      'requires_new_recipe',
    );
  });

  it('edits in place before a recipe exists, and for non-core changes', () => {
    expect(classifyIntentChange({ recipeReady: false, changesCoreIdea: true })).toBe(
      'edit_in_place',
    );
    expect(classifyIntentChange({ recipeReady: true, changesCoreIdea: false })).toBe(
      'edit_in_place',
    );
  });
});
