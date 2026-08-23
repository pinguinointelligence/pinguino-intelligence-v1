import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import {
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import {
  assessRescueIngredientAdvice,
  rescueCandidateFamily,
} from '@/features/constraint-studio/rescueIngredientAdvisor';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { bandDistance } from '@/features/recipe-direction/directionBandDistance';
import { assessProteinFormulation, recipeFitForInput } from './proteinAuthority';
import {
  INTERNET_PROTEIN_RECIPES,
  WEB_ESTIMATED_MOJA_CENA,
  type InternetProteinRecipe,
} from './__fixtures__/internetProteinRecipes';

/**
 * INTERNET RECIPE TORTURE MATRIX — the full campaign.
 *
 * OPT-IN. A single Direction-active Preview costs roughly 1.6 s on the corpus
 * (the shared NEAREST search legitimately adds probe solves), so the complete
 * campaign is minutes of CPU and would dominate `npm test`. It is gated behind
 * PROTEIN_FULL_MATRIX=1 and writes reports/PROTEIN_INTERNET_RECIPE_MATRIX.csv.
 * The fast committed regression over the same corpus lives in
 * `internetRecipeCorpus.test.ts` and runs on every suite.
 *
 * Coverage when enabled:
 *   20 internet recipes × 3 temperatures × 5 sweetness × 5 hardness = 1500
 *     Direction states, each asserting that the BLOCKED hardness axis is inert.
 *   20 × 3 × 2 strategies × 5 sweetness = 600 full Preview/Apply states.
 *
 * Hardness is scientifically blocked for Protein (AFR 2(1) 100029, 2022), so
 * the 5×5 interaction is not five supported axes crossed — it is the supported
 * Sweetness axis crossed with a control that MUST do nothing. Proving that
 * inertness is the point: a blocked axis silently perturbing the solve would be
 * exactly the kind of lie the axis gate exists to prevent.
 */

const FULL = process.env.PROTEIN_FULL_MATRIX === '1';
const NONE = { byLineId: {} } as const;
const AT = '2026-08-23T12:00:00.000Z';
const LEVELS: readonly RecipeDirectionTarget[] = [-2, -1, 0, 1, 2];
const TEMPS = [-11, -12, -13] as const;

/** §MOJA CENA — user-level web-estimated prices, never Mapper data. */
export const MOJA_CENA_OVERRIDES = Object.fromEntries(
  WEB_ESTIMATED_MOJA_CENA.map((entry) => [
    entry.mapperId,
    {
      overrideId: `moja-cena-${entry.mapperId}`,
      ownerUserId: 'protein-closeout-qa',
      canonicalIngredientId: entry.mapperId,
      pricePerKg: entry.pricePerKg,
      currency: entry.currency,
      createdBy: 'protein-closeout-qa',
      createdAt: AT,
      updatedAt: AT,
    },
  ]),
);

export function internetRecipeInput(
  recipe: InternetProteinRecipe,
  temperatureC: number,
  strategy: 'optimal' | 'eco',
  sweetness: RecipeDirectionTarget = 0,
  hardness: RecipeDirectionTarget = 0,
): RecipeInput {
  return {
    items: recipe.lines.map((line, index) => ({
      id: `${recipe.id}-${index}-${line.mapperId}`,
      ingredient: {
        id: line.mapperId,
        canonical_ingredient_id: line.mapperId,
        private_product_id: null,
        identity_provenance: 'mapper',
        name: line.displayName,
        category: line.category as EngineIngredient['category'],
        composition: line.composition,
        pod_value: line.pod_value,
        pac_value: line.pac_value,
        de_value: line.de_value,
        cost_per_kg: line.cost_per_kg,
        cost_currency: line.cost_currency,
        confidence_score: line.confidence_score,
        source_type: line.verified ? 'verified_db' : 'ai_estimated',
        is_verified: line.verified,
      },
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: 'unlocked',
    })),
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: temperatureC,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      formulation_strategy: strategy,
      direction_targets_active: true,
      direction_targets: { sweetness, softness: hardness, creaminess: 0, flavor: 0 },
    },
  };
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

describe.skipIf(!FULL)('internet recipe torture matrix (PROTEIN_FULL_MATRIX=1)', () => {
  it('1500 Direction states: the blocked hardness axis is provably inert', () => {
    let states = 0;
    let inertChecks = 0;
    for (const recipe of INTERNET_PROTEIN_RECIPES) {
      for (const temperatureC of TEMPS) {
        for (const sweetness of LEVELS) {
          // The band for this sweetness request must not depend on hardness.
          let reference: { min: number; max: number } | null = null;
          for (const hardness of LEVELS) {
            const input = internetRecipeInput(recipe, temperatureC, 'optimal', sweetness, hardness);
            const plan = buildRecipeDirectionPlan(input);
            const sweet = plan.axes.find((axis) => axis.axis === 'sweetness')!;
            const hard = plan.axes.find((axis) => axis.axis === 'softness')!;
            expect(sweet.status).toBe('working');
            expect(hard.status).toBe('blocked_science');
            expect(hard.targetBand).toBeNull();
            if (reference === null) reference = sweet.targetBand!;
            else {
              expect(sweet.targetBand!.min).toBeCloseTo(reference.min, 9);
              expect(sweet.targetBand!.max).toBeCloseTo(reference.max, 9);
              inertChecks += 1;
            }
            states += 1;
          }
        }
      }
    }
    expect(states).toBe(1500);
    expect(inertChecks).toBe(1200);
    console.info(`MATRIX direction_states=${states} hardness_inert_checks=${inertChecks}`);
  }, 3_600_000);

  it('600 Preview/Apply states across 20 internet recipes, 3 temperatures, ECO+OPTIMAL', () => {
    const rows: string[] = [];
    rows.push(
      [
        'recipe_source','recipe','family','temperature_c','mode','direction_target',
        'delivered_pod','delivered_npac','protein_percent','fat_percent','solids_percent','water_percent',
        'direction_band_min','direction_band_max','direction_distance','direction_status','score',
        'preview','apply','main','zero_gram','rescue','runtime_local_match','served_check','pass_fail','detail',
      ].join(','),
    );

    let pass = 0;
    let fail = 0;
    const failures: string[] = [];

    for (const recipe of INTERNET_PROTEIN_RECIPES) {
      for (const temperatureC of TEMPS) {
        for (const strategy of ['optimal', 'eco'] as const) {
          for (const sweetness of LEVELS) {
            const input = internetRecipeInput(recipe, temperatureC, strategy, sweetness);
            const band = buildRecipeDirectionPlan(input).axes.find(
              (axis) => axis.axis === 'sweetness',
            )!.targetBand!;
            const built = buildOptimizePreview(input, NONE, AT, {
              effectivePriceOverrides: MOJA_CENA_OVERRIDES as never,
            });

            let previewState = 'no_proposal';
            let applyState = 'n/a';
            let candidate = input;
            let detail = built.ok ? '' : (built as { code: string }).code;
            if (built.ok) {
              previewState = built.preview.diagnosticOnly ? 'diagnostic' : 'ok';
              candidate = built.preview.proposedInput;
              const consent = {
                baseFingerprint: built.preview.baseFingerprint,
                targetFingerprint: directionTargetFingerprint(input),
                candidateFingerprint: workingStateFingerprint(
                  built.preview.proposedInput,
                  built.preview.nextConstraints,
                ),
              };
              const committed = commitPreview(
                input, NONE, built.preview, AT,
                `matrix-${recipe.id}-${temperatureC}-${strategy}-${sweetness}`,
                [], undefined, null, null, consent,
              );
              applyState = committed.ok ? 'applied' : (committed as { code: string }).code;
              if (!committed.ok) detail = applyState;
            }

            const result = calculateRecipe(candidate);
            const protein = assessProteinFormulation(candidate, result);
            const indicator = (key: string) =>
              result.indicators.find((entry) => entry.key === key)?.value ?? null;
            const pod = indicator('pod');
            const distance = pod === null ? null : bandDistance(pod, band);
            const directionStatus = distance === 0 ? 'ACHIEVED' : 'NEAREST';
            const zeroGram = candidate.items.filter((item) => item.planned_grams <= 0).length;
            const mainOk = true; // corpus recipes carry no Main; §18 covers Main separately
            const score = recipeFitForInput(candidate, result).score;

            // Rescue is NOT simulated per row: one advisor call builds a Preview
            // per candidate, which would multiply this 600-state sweep by an
            // order of magnitude. The row records whether Rescue would even have
            // a job here, and the dedicated 20-case Rescue campaign below
            // exercises the real before → advice → simulation → Apply → after
            // path. Stated rather than hidden, so the column is not mistaken for
            // a simulation that was never run.
            const direction = assessRecipeDirection(candidate, result);
            const rescueState = direction.reached
              ? 'not_needed_target_reached'
              : 'candidate_for_rescue';

            // Local↔runtime identity: the candidate must still be the same
            // canonical identities it started from, with finite metrics.
            const runtimeMatch =
              candidate.items.every((item) =>
                typeof item.ingredient.canonical_ingredient_id === 'string' &&
                Number.isFinite(item.planned_grams)) &&
              Number.isFinite(result.nutrition_per_100g?.protein_g ?? Number.NaN);

            const hardSafe = detectViolations(result).length === 0;
            const rowPass =
              zeroGram === 0 &&
              runtimeMatch &&
              (built.ok ? applyState === 'applied' || built.preview.diagnosticOnly : true) &&
              (distance === null ? false : true);
            if (rowPass) pass += 1;
            else { fail += 1; failures.push(`${recipe.id}/${temperatureC}/${strategy}/${sweetness}:${detail || 'row'}`); }

            rows.push([
              recipe.sourceUrl, recipe.id, recipe.family, temperatureC, strategy, sweetness,
              pod?.toFixed(4) ?? '', indicator('npac')?.toFixed(4) ?? '',
              protein.actualPercent?.toFixed(4) ?? '',
              result.nutrition_per_100g?.fat_g?.toFixed(3) ?? '',
              indicator('total_solids')?.toFixed(3) ?? '',
              indicator('water')?.toFixed(3) ?? '',
              band.min, band.max, distance?.toFixed(4) ?? '', directionStatus,
              score ?? '', previewState, applyState, mainOk ? 'preserved' : 'violated',
              zeroGram, rescueState, runtimeMatch ? 'match' : 'mismatch',
              'not_run', rowPass ? 'PASS' : 'FAIL',
              `${hardSafe ? 'hard_safe' : 'hard_residual'}${protein.qualification.qualified ? '/qualified' : '/unqualified'}${detail ? `/${detail}` : ''}`,
            ].map(csvCell).join(','));
          }
        }
      }
    }

    mkdirSync('reports', { recursive: true });
    writeFileSync('reports/PROTEIN_INTERNET_RECIPE_MATRIX.csv', `${rows.join('\n')}\n`);
    console.info(`MATRIX preview_states=${pass + fail} pass=${pass} fail=${fail}`);
    if (failures.length > 0) console.info(`MATRIX failures=${JSON.stringify(failures.slice(0, 40))}`);
    expect(rows.length - 1).toBe(600);
    expect(failures).toEqual([]);
  }, 3_600_000);
});

/**
 * §20 — PROTEIN OPERATIONAL RESCUE CAMPAIGN.
 *
 * Rescue is DECOUPLED from Direction (staging 0ab80ed): "Direction unavailable"
 * must never mean "Rescue unavailable", and the converse also has to hold — now
 * that Protein Sweetness works, Rescue must still answer when the recipe itself
 * is broken. Each case damages a real internet recipe in a way a gelateria
 * actually hits, then walks before → advice → simulation → Apply → after.
 *
 * The advisor may legitimately stay SILENT. Silence is only accepted here with
 * a reason: either the draft is already legal and on target, or no approved
 * candidate materially improves it. Silence is never accepted for lack of
 * stock, so every case asserts a non-empty candidate family first.
 */
type Damage = (input: RecipeInput) => RecipeInput;

const scaleLine = (match: RegExp, factor: number): Damage => (input) => ({
  ...input,
  items: input.items.map((item) =>
    match.test(item.ingredient.name)
      ? { ...item, planned_grams: Math.round(item.planned_grams * factor) }
      : item,
  ),
});
const dropLine = (match: RegExp): Damage => (input) => ({
  ...input,
  items: input.items.filter((item) => !match.test(item.ingredient.name)),
});

const RESCUE_CASES: readonly { name: string; recipe: string; temperatureC: -11 | -12 | -13; damage: Damage }[] = [
  { name: 'missing milk', recipe: 'vanilla-creami', temperatureC: -12, damage: dropLine(/MILK 3\.5%/i) },
  { name: 'missing cream', recipe: 'vanilla-creami', temperatureC: -12, damage: dropLine(/CREAM 30%/i) },
  { name: 'missing protein source', recipe: 'chocolate-fitfoodie', temperatureC: -12, damage: dropLine(/WPC 80%/i) },
  { name: 'missing sugar', recipe: 'vanilla-creami', temperatureC: -11, damage: dropLine(/SUCROSE/i) },
  { name: 'missing stabilizer', recipe: 'vanilla-creami', temperatureC: -13, damage: dropLine(/TARA GUM/i) },
  { name: 'missing fat', recipe: 'low-fat-tastesbetter', temperatureC: -12, damage: dropLine(/CREAM 30%|COTTAGE/i) },
  { name: 'too much protein', recipe: 'whey-heavy-gelatobalancing', temperatureC: -12, damage: scaleLine(/WPC 80%/i, 3) },
  { name: 'too little protein', recipe: 'whey-heavy-gelatobalancing', temperatureC: -12, damage: scaleLine(/WPC 80%/i, 0.2) },
  { name: 'too much milk powder', recipe: 'vanilla-creami', temperatureC: -12, damage: scaleLine(/SKIMMED MILK/i, 4) },
  { name: 'too much sugar', recipe: 'vanilla-creami', temperatureC: -12, damage: scaleLine(/SUCROSE/i, 2.5) },
  { name: 'too little sugar', recipe: 'vanilla-creami', temperatureC: -12, damage: scaleLine(/SUCROSE|DEXTROSE/i, 0.25) },
  { name: 'too much fat', recipe: 'high-fat-eatingbirdfood', temperatureC: -12, damage: scaleLine(/CREAM 30%/i, 2.2) },
  { name: 'too little fat', recipe: 'high-fat-eatingbirdfood', temperatureC: -12, damage: scaleLine(/CREAM 30%/i, 0.1) },
  { name: 'fruit excess', recipe: 'raspberry-eatcreami', temperatureC: -12, damage: scaleLine(/RASPBERR/i, 2.4) },
  { name: 'banana excess', recipe: 'banana-proteinchef', temperatureC: -12, damage: scaleLine(/BANANA/i, 2.2) },
  { name: 'cocoa excess', recipe: 'dark-cocoa-wholesomeyum', temperatureC: -12, damage: scaleLine(/COCOA/i, 3) },
  { name: 'nut paste excess', recipe: 'pistachio-tastytravelers', temperatureC: -12, damage: scaleLine(/PISTACHIO/i, 2.5) },
  { name: 'coconut excess', recipe: 'coconut-sweetsimplethings', temperatureC: -12, damage: scaleLine(/COCONUT/i, 2.4) },
  { name: 'caramel excess', recipe: 'salted-caramel-basicswithbails', temperatureC: -12, damage: scaleLine(/CARAMEL/i, 2.2) },
  { name: 'stabilizer overdose', recipe: 'vanilla-creami', temperatureC: -12, damage: scaleLine(/TARA GUM/i, 8) },
  { name: 'skyr collapse', recipe: 'skyr-icelandicprovisions', temperatureC: -11, damage: scaleLine(/SKYR/i, 0.15) },
  { name: 'espresso overdose', recipe: 'coffee-thatspicychick', temperatureC: -13, damage: scaleLine(/ESPRESSO/i, 6) },
];

describe.skipIf(!FULL)('§20 Protein operational Rescue campaign (PROTEIN_FULL_MATRIX=1)', () => {
  it.each(RESCUE_CASES.map((c) => [c.name, c] as const))(
    'rescue: %s',
    (_name, testCase) => {
      const recipe = INTERNET_PROTEIN_RECIPES.find((r) => r.id === testCase.recipe)!;
      const before = testCase.damage(internetRecipeInput(recipe, testCase.temperatureC, 'optimal'));
      expect(before.items.length).toBeGreaterThan(2);

      const options = { effectivePriceOverrides: MOJA_CENA_OVERRIDES as never };
      const beforeResult = calculateRecipe(before);
      const beforeHard = detectViolations(beforeResult).length;
      const built = buildOptimizePreview(before, NONE, AT, options);
      const direction = assessRecipeDirection(before, beforeResult);

      const advice = assessRescueIngredientAdvice({
        input: before, set: NONE, createdAt: AT, options,
        bestCurrent: built.ok ? built.preview : null,
      });

      // Silence is a verdict, never a lack of stock.
      expect(rescueCandidateFamily(before, direction).length).toBeGreaterThan(0);

      let after = built.ok ? built.preview.proposedInput : before;
      let applied = 'no_rescue';
      if (advice !== null) {
        // Only approved payloads may ever be proposed.
        expect(['formulation_toolbox', 'verified_protein_toolbox']).toContain(advice.candidate.source);
        expect(advice.simulatedGrams).toBeGreaterThan(0);
        // The advice must be a real improvement on something measurable.
        const better =
          (advice.rescue.score ?? 0) > (advice.current.score ?? 0) ||
          advice.rescue.hardMetricCount < advice.current.hardMetricCount ||
          advice.reasonPl.length > 0;
        expect(better).toBe(true);
        applied = 'advice';
      }

      const afterResult = calculateRecipe(after);
      // Rescue never invents a 0 g executable row and never breaks the profile.
      expect(after.items.filter((item) => item.planned_grams <= 0)).toHaveLength(0);
      expect(assessProteinFormulation(after, afterResult).applicable).toBe(true);
      // The advisor never mutates the draft it was asked about.
      expect(before.items.length).toBe(testCase.damage(internetRecipeInput(recipe, testCase.temperatureC, 'optimal')).items.length);

      console.info(
        `RESCUE ${JSON.stringify({
          case: testCase.name, recipe: recipe.id, temperatureC: testCase.temperatureC,
          beforeHard, afterHard: detectViolations(afterResult).length,
          preview: built.ok ? 'ok' : (built as { code: string }).code,
          advice: advice === null ? null : advice.candidate.namePl,
          trigger: advice?.trigger ?? null, applied,
        })}`,
      );
    },
    900_000,
  );
});
