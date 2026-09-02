import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type ProductCategory, type RecipeInput } from '@/engine';
import {
  starterLine,
  starterMilkBase,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { monitorScoreView } from './monitorSummaryView';
import {
  AWAITING_GRAMS_LABEL,
  monitorLiveScore,
  monitorProposedScore,
  monitorScoreComparison,
} from './monitorLiveScore';

/** Evaluate a recipe exactly the way the Monitor does: canonical engine + canonical adapter. */
const live = (input: RecipeInput) => monitorLiveScore(input, calculateRecipe(input));

const canonical = (input: RecipeInput) =>
  monitorScoreView(calculateRecipe(input), input).match.score;

const withTemperature = (input: RecipeInput, target_temperature_c: number): RecipeInput => ({
  ...input,
  target_temperature_c,
});

const withCategory = (input: RecipeInput, category: ProductCategory): RecipeInput => ({
  ...input,
  category,
});

/** Direction targets live inside `goals` — setting them anywhere else is inert. */
const withSweetnessTarget = (input: RecipeInput, sweetness: -2 | -1 | 0 | 1 | 2): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets: {
      sweetness,
      softness: input.goals?.direction_targets?.softness ?? 0,
      creaminess: input.goals?.direction_targets?.creaminess ?? 0,
      flavor: input.goals?.direction_targets?.flavor ?? 0,
    },
    direction_targets_active: true,
  },
});

describe('live current recipe score', () => {
  it('scores the starter recipe as written', () => {
    const view = live(starterMilkBase());
    expect(view.state).toBe('scored');
    expect(view.score).not.toBeNull();
    expect(view.label.length).toBeGreaterThan(0);
  });

  it('is exactly the canonical score authority — never a second formula', () => {
    for (const grams of [130, 260, 400]) {
      const input = withGrams(starterMilkBase(), starterLine('sucrose'), grams);
      expect(live(input).score).toBe(canonical(input));
    }
  });

  it('re-evaluates when a gram value is edited by hand', () => {
    const before = live(starterMilkBase());
    const after = live(withGrams(starterMilkBase(), starterLine('sucrose'), 420));
    expect(before.state).toBe('scored');
    expect(after.state).toBe('scored');
    // The heavily over-sweetened draft must not keep presenting the balanced score.
    expect(after.score).not.toBe(before.score);
    expect(after.score!).toBeLessThan(before.score!);
  });

  it('retains no previous score — the same input always yields the same view', () => {
    const balanced = starterMilkBase();
    const broken = withGrams(starterMilkBase(), starterLine('sucrose'), 420);
    const first = live(balanced);
    live(broken);
    const again = live(balanced);
    expect(again).toEqual(first);
  });

  it('re-evaluates when an ingredient is removed', () => {
    const base = starterMilkBase();
    const withoutSucrose: RecipeInput = {
      ...base,
      items: base.items.filter((item) => item.id !== starterLine('sucrose')),
    };
    const reduced = {
      ...withoutSucrose,
      target_batch_grams: withoutSucrose.items.reduce((sum, i) => sum + i.planned_grams, 0),
    };
    expect(live(reduced).score).toBe(canonical(reduced));
    expect(live(reduced).score).not.toBe(live(base).score);
  });

  it('re-evaluates when the batch is resized', () => {
    const base = starterMilkBase();
    const doubled: RecipeInput = {
      ...base,
      items: base.items.map((item) => ({ ...item, planned_grams: item.planned_grams * 2 })),
      target_batch_grams: base.target_batch_grams * 2,
    };
    expect(live(doubled).score).toBe(canonical(doubled));
  });

  it('re-evaluates when the serving temperature changes', () => {
    for (const temperature of [-11, -12, -13]) {
      const input = withTemperature(starterMilkBase(), temperature);
      expect(live(input).score).toBe(canonical(input));
    }
  });
});

describe('Direction target re-evaluation regression', () => {
  // Same recipe, only the selected target moves. The live score must be computed
  // against the SELECTED target every time — never a cached previous-target score.
  it('recomputes for 0 → +1 → +2 on an unchanged recipe', () => {
    const ledger = ([0, 1, 2] as const).map((sweetness) => {
      const input = withSweetnessTarget(starterMilkBase(), sweetness);
      const result = calculateRecipe(input);
      return {
        selectedTarget: sweetness,
        pod: result.indicators.find((indicator) => indicator.key === 'pod')?.value ?? null,
        liveScore: monitorLiveScore(input, result).score,
        canonicalScore: monitorScoreView(result, input).match.score,
      };
    });

    // Grams are identical across all three rows — only the target differs.
    for (const row of ledger) {
      expect(row.liveScore).toBe(row.canonicalScore);
    }
    // Every row was computed from its own selected target, not carried over.
    expect(ledger.map((row) => row.selectedTarget)).toEqual([0, 1, 2]);
    expect(ledger.every((row) => row.liveScore !== null)).toBe(true);
    // The selected target genuinely reaches the canonical score authority: the
    // three targets do NOT all produce the same number on identical grams.
    // (Observed on the starter: 0 → 8, +1 → 9, +2 → 8. Direction scoring is
    // `max(1, 10 - missedAxisCount)`, so equal values at some targets are
    // legitimate — but they cannot ALL be equal if the target is really used.)
    expect(new Set(ledger.map((row) => row.liveScore)).size).toBeGreaterThan(1);
    expect(ledger.map((row) => row.pod)).toEqual([ledger[0]!.pod, ledger[0]!.pod, ledger[0]!.pod]);
  });

  it('never reuses the score of a different target for the same grams', () => {
    const atZero = withSweetnessTarget(starterMilkBase(), 0);
    const atPlusTwo = withSweetnessTarget(starterMilkBase(), 2);
    // Identical grams …
    expect(atZero.items.map((i) => i.planned_grams)).toEqual(
      atPlusTwo.items.map((i) => i.planned_grams),
    );
    // … yet each is evaluated against its own selected target.
    expect(live(atZero).score).toBe(canonical(atZero));
    expect(live(atPlusTwo).score).toBe(canonical(atPlusTwo));
    // And activating Direction at all is visible in the score, so a stale
    // "Direction off" score can never be left on screen.
    expect(live(atZero).score).not.toBe(live(starterMilkBase()).score);
  });
});

describe('live score cost', () => {
  it('invokes no optimizer, solver, rescue or correction search', () => {
    const source = readFileSync(new URL('./monitorLiveScore.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(
      /proposeCorrections|buildOptimizePreview|rescue|Rescue|directionBestCandidate|buildRecipeDirectionPlan/,
    );
  });

  it('performs no network or storage call', async () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      for (let grams = 120; grams <= 140; grams += 1) {
        live(withGrams(starterMilkBase(), starterLine('sucrose'), grams));
      }
    } finally {
      globalThis.fetch = original;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    const source = readFileSync(new URL('./monitorLiveScore.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/fetch\(|supabase|openai|localStorage/i);
  });

  it('is deterministic — identical input, identical output', () => {
    const input = withGrams(starterMilkBase(), starterLine('sucrose'), 175);
    expect(live(input)).toEqual(live(input));
  });
});

describe('live score across product profiles', () => {
  it.each(['milk_gelato', 'sorbet', 'vegan_gelato', 'protein_gelato'] as const)(
    'uses the canonical authority for %s and never fabricates a score',
    (category) => {
      const input = withCategory(starterMilkBase(), category);
      const view = live(input);
      // Whatever the profile's own authority returns is what is shown — including
      // an honest no-data state. Nothing is invented to fill the ring.
      expect(view.score).toBe(canonical(input));
      if (view.score === null) expect(view.state).not.toBe('scored');
    },
  );
});

describe('zero-gram editor placeholder', () => {
  const withPlaceholder = (): RecipeInput => {
    const base = starterMilkBase();
    return {
      ...base,
      items: [
        ...base.items,
        { ...base.items[0]!, id: 'placeholder-line', planned_grams: 0 },
      ],
    };
  };

  it('does not present a polished executable score for an unfinished draft', () => {
    const view = live(withPlaceholder());
    expect(view.state).toBe('awaiting_grams');
    expect(view.score).toBeNull();
    expect(view.label).toBe(AWAITING_GRAMS_LABEL);
  });

  it('resumes scoring once real grams are entered', () => {
    const filled = withGrams(withPlaceholder(), 'placeholder-line', 25);
    const view = live(filled);
    expect(view.state).toBe('scored');
    expect(view.score).toBe(canonical(filled));
  });

  it('shows an honest no-data state for an empty recipe', () => {
    const empty: RecipeInput = { ...starterMilkBase(), items: [], target_batch_grams: 0 };
    const view = monitorLiveScore(empty, calculateRecipe(empty));
    expect(view.state).toBe('no_data');
    expect(view.score).toBeNull();
  });
});

describe('Gellatti proposal — before / after', () => {
  const current = withGrams(starterMilkBase(), starterLine('sucrose'), 420);
  const proposal = starterMilkBase();

  const comparison = () =>
    monitorScoreComparison({
      input: current,
      result: calculateRecipe(current),
      previewInput: proposal,
      previewResult: calculateRecipe(proposal),
    });

  it('shows both the current recipe and the proposal', () => {
    const view = comparison();
    expect(view.current.state).toBe('scored');
    expect(view.proposed?.state).toBe('scored');
    expect(view.showComparison).toBe(true);
  });

  it('derives the proposed score from the EXACT preview candidate', () => {
    const view = comparison();
    expect(view.proposed?.score).toBe(canonical(proposal));
    // Not from the current recipe, and not from any requested target.
    expect(view.proposed?.score).not.toBe(view.current.score);
  });

  it('shows the candidate’s real score even when it is below the requested ideal', () => {
    // A candidate that genuinely evaluates to less than 10 must display its own value.
    const modest = withGrams(starterMilkBase(), starterLine('sucrose'), 190);
    const modestScore = canonical(modest);
    const view = monitorScoreComparison({
      input: current,
      result: calculateRecipe(current),
      previewInput: modest,
      previewResult: calculateRecipe(modest),
    });
    expect(view.proposed?.score).toBe(modestScore);
  });

  it('shows no proposal when the preview is cancelled', () => {
    const view = monitorScoreComparison({ input: current, result: calculateRecipe(current) });
    expect(view.proposed).toBeNull();
    expect(view.showComparison).toBe(false);
    expect(view.current.state).toBe('scored');
  });

  it('drops the comparison once the proposal has been applied', () => {
    // After Apply the current recipe IS the proposal — there is nothing to compare.
    const view = monitorScoreComparison({
      input: proposal,
      result: calculateRecipe(proposal),
      previewInput: proposal,
      previewResult: calculateRecipe(proposal),
    });
    expect(view.showComparison).toBe(false);
    expect(view.current.score).toBe(canonical(proposal));
  });

  it('never presents an unscorable/diagnostic candidate as an executable "after"', () => {
    const empty: RecipeInput = { ...starterMilkBase(), items: [], target_batch_grams: 0 };
    expect(monitorProposedScore(empty, calculateRecipe(empty))).toBeNull();

    const placeholderCandidate: RecipeInput = {
      ...proposal,
      items: [...proposal.items, { ...proposal.items[0]!, id: 'draft', planned_grams: 0 }],
    };
    expect(
      monitorProposedScore(placeholderCandidate, calculateRecipe(placeholderCandidate)),
    ).toBeNull();

    expect(monitorProposedScore(null, null)).toBeNull();
  });

  it('follows the preview candidate when it changes', () => {
    const first = monitorScoreComparison({
      input: current,
      result: calculateRecipe(current),
      previewInput: proposal,
      previewResult: calculateRecipe(proposal),
    });
    const other = withGrams(starterMilkBase(), starterLine('sucrose'), 300);
    const second = monitorScoreComparison({
      input: current,
      result: calculateRecipe(current),
      previewInput: other,
      previewResult: calculateRecipe(other),
    });
    expect(second.proposed?.score).toBe(canonical(other));
    expect(second.proposed?.score).not.toBe(first.proposed?.score);
  });
});

describe('accessibility text', () => {
  it('labels the current and proposed scores in words, not colour', () => {
    const view = monitorScoreComparison({
      input: starterMilkBase(),
      result: calculateRecipe(starterMilkBase()),
      previewInput: withGrams(starterMilkBase(), starterLine('sucrose'), 420),
      previewResult: calculateRecipe(withGrams(starterMilkBase(), starterLine('sucrose'), 420)),
    });
    expect(view.current.ariaText).toContain('Wynik aktualny receptury');
    expect(view.current.ariaText).toMatch(/\d+ na 10/);
    expect(view.proposed?.ariaText).toContain('Wynik propozycji Gellatti');
  });

  it('states the reason in words when there is no score', () => {
    const base = starterMilkBase();
    const draft: RecipeInput = {
      ...base,
      items: [...base.items, { ...base.items[0]!, id: 'draft', planned_grams: 0 }],
    };
    expect(monitorLiveScore(draft, calculateRecipe(draft)).ariaText).toContain(
      AWAITING_GRAMS_LABEL,
    );
  });
});
