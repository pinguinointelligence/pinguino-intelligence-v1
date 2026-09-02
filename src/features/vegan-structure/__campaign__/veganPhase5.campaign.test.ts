/// <reference types="node" />
/**
 * PHASE 5 CAMPAIGN — the automatable core.
 *
 * Drives the REAL pipeline (buildCanonicalNewRecipeStarter is not used here;
 * every recipe is the internet corpus mapped onto real Mapper articles) through
 * `buildOptimizePreview`, and writes machine-readable evidence to reports/.
 *
 * Owner prices are the ones actually persisted for the owner account, so ECO is
 * evaluated exactly as the served app evaluates it.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeDirectionTarget } from '@/engine';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { VEGAN_INTERNET_CORPUS } from './veganInternetCorpus';
import {
  AT,
  AXES,
  EMPTY,
  MODES,
  OWNER_PRICES,
  TEMPS,
  toVeganInput as toInput,
  writeCsv,
} from './veganCampaignInput';

describe('Vegan Phase 5 campaign', () => {
  it('runs the ECO/OPTIMAL base matrix (>=120 states)', () => {
    const rows: unknown[][] = [];
    for (const recipe of VEGAN_INTERNET_CORPUS) {
      for (const temperature of TEMPS) {
        for (const strategy of MODES) {
          const input = toInput(recipe, temperature, strategy);
          const t0 = Date.now();
          const built = buildOptimizePreview(input, EMPTY, AT, {
            effectivePriceOverrides: OWNER_PRICES,
          });
          const ms = Date.now() - t0;
          const base = built.ok ? built.preview.proposedInput : input;
          const r = calculateRecipe(base);
          rows.push([
            recipe.id,
            recipe.flavourClass,
            temperature,
            strategy,
            built.ok ? 'PREVIEW' : built.code,
            (r.pod_points ?? 0).toFixed(2),
            (r.npac_points ?? 0).toFixed(2),
            r.percentages.water_percent.toFixed(2),
            r.percentages.solids_percent.toFixed(2),
            r.percentages.fat_percent.toFixed(2),
            detectViolations(r).length,
            base.items.filter((i) => i.planned_grams === 0).length,
            plannedSum(base).toFixed(0),
            ms,
          ]);
        }
      }
    }
    writeCsv(
      'VEGAN_ECO_OPTIMAL_MATRIX.csv',
      [
        'recipe_id',
        'flavour_class',
        'temperature',
        'mode',
        'outcome',
        'pod',
        'npac',
        'water_pct',
        'solids_pct',
        'fat_pct',
        'violations',
        'zero_gram',
        'total_g',
        'runtime_ms',
      ],
      rows,
    );
    expect(rows.length).toBeGreaterThanOrEqual(120);
    // zero-gram invariant across every base state
    expect(rows.filter((r) => Number(r[11]) > 0)).toEqual([]);
    // no missing_prices anywhere now that real owner prices are used
    expect(rows.filter((r) => r[4] === 'missing_prices')).toEqual([]);
    console.log(`ECO_OPTIMAL_STATES ${rows.length}`);
  }, 1_800_000);
  // The 1800-state Direction matrix is partitioned by temperature. Same states,
  // same assertions — but no single test has to carry an hour of wall clock, which
  // is what made the combined version race its own timeout under parallel load.
  const directionRows: unknown[][] = [];
  const tally = { achieved: 0, nearest: 0, alreadyClean: 0, okFalse: 0, zeroGram: 0 };

  // SHARDED. The matrix is the same 1800 states with the same assertions; it is
  // split into 12 shards (3 temperatures x 4 recipe groups, 150 states each) so
  // no single test has to carry ~37 minutes of wall clock. Measured cost is
  // ~3.7 s/state under parallel load, so one shard is ~9 minutes — well inside
  // the budget. Coverage is NOT reduced: every shard is asserted, and the
  // aggregate below still requires >=1500 states in total.
  const RECIPE_GROUP_SIZE = 6;
  const RECIPE_GROUPS = Array.from(
    { length: Math.ceil(VEGAN_INTERNET_CORPUS.length / RECIPE_GROUP_SIZE) },
    (_, g) => VEGAN_INTERNET_CORPUS.slice(g * RECIPE_GROUP_SIZE, (g + 1) * RECIPE_GROUP_SIZE),
  );
  const SHARDS = TEMPS.flatMap((temperature) =>
    RECIPE_GROUPS.map((group, groupIndex) => ({ temperature, group, groupIndex })),
  );

  it.each(SHARDS)(
    'Direction matrix shard: $temperature C, recipe group $groupIndex',
    ({ temperature, group }) => {
      for (const recipe of group) {
        for (const sweetness of AXES) {
          for (const softness of AXES) {
            const input = toInput(recipe, temperature, 'optimal', {
              sweetness: sweetness as RecipeDirectionTarget,
              softness: softness as RecipeDirectionTarget,
            });
            const t0 = Date.now();
            const built = buildOptimizePreview(input, EMPTY, AT, {
              effectivePriceOverrides: OWNER_PRICES,
            });
            const ms = Date.now() - t0;
            let status: string;
            let pod: number, npac: number, total: number;
            let zg = 0;
            if (!built.ok) {
              status = built.code === 'already_clean' ? 'already_clean' : `ok_false:${built.code}`;
              if (built.code === 'already_clean') tally.alreadyClean += 1;
              else tally.okFalse += 1;
              const r = calculateRecipe(input);
              pod = r.pod_points ?? 0;
              npac = r.npac_points ?? 0;
              total = plannedSum(input);
            } else {
              const pi = built.preview.proposedInput;
              const r = calculateRecipe(pi);
              const a = assessRecipeDirection(pi, r);
              const unreached = built.preview.directionTargetUnreached === true;
              status = !unreached && a.reached ? 'ACHIEVED' : 'NEAREST';
              if (status === 'ACHIEVED') tally.achieved += 1;
              else tally.nearest += 1;
              pod = r.pod_points ?? 0;
              npac = r.npac_points ?? 0;
              zg = pi.items.filter((i) => i.planned_grams === 0).length;
              tally.zeroGram += zg;
              total = plannedSum(pi);
            }
            directionRows.push([
              recipe.id,
              recipe.flavourClass,
              temperature,
              'optimal',
              sweetness,
              softness,
              status,
              pod.toFixed(2),
              npac.toFixed(2),
              zg,
              total.toFixed(0),
              ms,
            ]);
          }
        }
      }
      // Every state at this temperature must have produced a legal, non-empty result.
      expect(tally.okFalse).toBe(0);
      expect(tally.zeroGram).toBe(0);
    },
    1_800_000,
  );

  it('Direction matrix aggregate (>=1500 states, zero-gram free, no ok:false)', () => {
    writeCsv(
      'VEGAN_DIRECTION_STATE_MATRIX.csv',
      [
        'recipe_id',
        'flavour_class',
        'temperature',
        'mode',
        'sweetness',
        'hardness',
        'direction_status',
        'delivered_pod',
        'delivered_npac',
        'zero_gram',
        'total_g',
        'runtime_ms',
      ],
      directionRows,
    );
    console.log(
      `DIRECTION_STATES ${directionRows.length} ACHIEVED ${tally.achieved} NEAREST ${tally.nearest} ALREADY_CLEAN ${tally.alreadyClean} OK_FALSE ${tally.okFalse} ZERO_GRAM ${tally.zeroGram}`,
    );
    expect(directionRows.length).toBeGreaterThanOrEqual(1500);
    expect(tally.zeroGram).toBe(0);
    expect(tally.okFalse).toBe(0);
  });
});
