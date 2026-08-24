import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeDirectionTarget } from '@/engine';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import { VEGAN_INTERNET_CORPUS } from './veganInternetCorpus';
import { AT, EMPTY, OWNER_PRICES, toVeganInput as toInput } from './veganCampaignInput';

const TARGET_SEED = 454174848;

describe('fuzz batch drift repro', () => {
  it('replays the seed and reports the proposal', () => {
    let seed = 20260823;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let n = 0; n < 520; n += 1) {
      const recipe = VEGAN_INTERNET_CORPUS[Math.floor(rnd() * VEGAN_INTERNET_CORPUS.length)]!;
      const temperature = ([-11, -12, -13] as const)[Math.floor(rnd() * 3)]!;
      const strategy = rnd() < 0.5 ? 'optimal' : 'eco';
      const sweetness = (Math.floor(rnd() * 5) - 2) as RecipeDirectionTarget;
      const softness = (Math.floor(rnd() * 5) - 2) as RecipeDirectionTarget;
      let input = toInput(recipe, temperature, strategy, { sweetness, softness });
      const factor = 0.85 + rnd() * 0.45;
      const target = input.items[Math.floor(rnd() * input.items.length)]!;
      input = {
        ...input,
        items: input.items.map((i) =>
          i.id === target.id && i.lock_type === 'unlocked'
            ? { ...i, planned_grams: Math.max(1, Math.round(i.planned_grams * factor)) }
            : i,
        ),
      };
      const seedUsed = seed;
      if (seedUsed !== TARGET_SEED) continue;

      const built = buildOptimizePreview(input, EMPTY, AT, {
        effectivePriceOverrides: OWNER_PRICES,
      });
      const base = built.ok ? built.preview.proposedInput : input;
      console.log(
        `n=${n} recipe=${recipe.id} T=${temperature} mode=${strategy} sw=${sweetness} hd=${softness}\n` +
          `  inputSum=${plannedSum(input).toFixed(1)} ok=${built.ok} code=${built.ok ? '-' : built.code}\n` +
          `  proposedSum=${plannedSum(base).toFixed(1)} target=${input.target_batch_grams}\n` +
          `  unreached=${built.ok ? built.preview.directionTargetUnreached : 'n/a'}\n` +
          `  lines=${base.items.map((i) => `${i.ingredient.name.slice(0, 18)}:${i.planned_grams}${i.lock_type === 'main' ? '(MAIN)' : ''}`).join(' | ')}`,
      );
      const r = calculateRecipe(base);
      const changed = built.ok
        ? input.items.filter((i) => {
            const after = base.items.find((b) => b.id === i.id);
            return !after || after.planned_grams !== i.planned_grams;
          })
        : [];
      console.log(`  POD=${r.pod_points?.toFixed(2)} NPAC=${r.npac_points?.toFixed(2)}`);
      console.log(
        `  changedLines=${changed.length} inputLines=${input.items.length} proposalLines=${base.items.length}`,
      );
      if (built.ok) {
        const pv = built.preview as unknown as Record<string, unknown>;
        console.log(`  previewKind=${String(pv.kind)} title=${String(pv.titlePl)}`);
        console.log(`  explanation=${JSON.stringify(pv.explanation)}`);
      }
      // Same draft, Direction switched OFF — does the optimize route still
      // hand back the unchanged 951 g draft, or does it reconcile to 1000?
      const noDir = { ...input, goals: { ...input.goals, direction_targets_active: false } };
      const b2 = buildOptimizePreview(noDir, EMPTY, AT, {
        effectivePriceOverrides: OWNER_PRICES,
      });
      console.log(
        `  NO-DIRECTION: ok=${b2.ok} code=${b2.ok ? '-' : b2.code} sum=${b2.ok ? plannedSum(b2.preview.proposedInput).toFixed(1) : 'n/a'}`,
      );
      // And the same draft scaled to a DIFFERENT deficit, to bracket the behaviour.
      for (const factor of [0.9, 0.93, 0.951, 0.96, 0.98, 1.05]) {
        const t = input.items.find((i) => i.lock_type === 'unlocked')!;
        const probe = {
          ...input,
          items: input.items.map((i) =>
            i.id === t.id ? { ...i, planned_grams: Math.round(i.planned_grams * factor) } : i,
          ),
        };
        const bp = buildOptimizePreview(probe, EMPTY, AT, {
          effectivePriceOverrides: OWNER_PRICES,
        });
        console.log(
          `  probe factor=${factor} draftSum=${plannedSum(probe).toFixed(0)} ok=${bp.ok} code=${bp.ok ? '-' : bp.code} proposedSum=${bp.ok ? plannedSum(bp.preview.proposedInput).toFixed(0) : 'n/a'}`,
        );
      }
      console.log(`  inputGrams=${input.items.map((i) => i.planned_grams).join(',')}`);
      console.log(`  proposalGrams=${base.items.map((i) => i.planned_grams).join(',')}`);
      expect(Math.abs(plannedSum(base) - 1000)).toBeLessThanOrEqual(1.5);
      return;
    }
    throw new Error('seed not reached');
  }, 600_000);
});
