/**
 * GLOBAL MAIN AUTHORITY v1.4 — USER-HELD MAIN through the real Preview pipeline.
 *
 * §6  Main grams are not moved by automatic formulation.
 * §16 Sorbet no longer depends on the exact three-id whitelist.
 * §19 The owner decides the Multi-Main combination.
 * §20 The ratio (1:1, 2:1, reverse order) survives optimisation.
 * §22 A technical failure is reported as a technical failure, never as
 *     "this ingredient cannot be Main".
 * §34 A positive Main never reaches 0 g.
 *
 * The scaffold is the owner's served Sorbet: the canonical Sorbet starter with
 * WATER 143 / SUCROSE 78 / DEXTROSE 125 / INULIN 50 / TARA 4 and the owner's
 * Main group — the same base the Main-constrained NEAREST suite uses, so any
 * failure here is about Main authority, not about an invented recipe. The
 * serving temperature is stated per case because Banana and Strawberry do not
 * reach the same bands, which is precisely the §22 distinction under test.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput, RecipeItem } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import {
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { buildOptimizePreview } from './applyPipeline';

const AT = '2026-08-23T12:00:00.000Z';
const NONE = { byLineId: {} } as const;
const OWNER_GRAMS = { water: 143, sucrose: 78, dextrose: 125, inulin: 50, tara: 4 } as const;

const MAPPER = {
  strawberry: 'PI-ING-001553',
  banana: 'PI-ING-000345',
  raspberry: 'PI-ING-000394',
} as const;

type Main = { id: string; mapperId: string; grams: number; weight?: number };

const ownerSorbet = (
  mains: readonly Main[],
  temperature: -11 | -12 | -13 = -11,
): RecipeInput => {
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId:
      temperature === -11 ? 'temp_minus_11' : temperature === -12 ? 'temp_minus_12' : 'temp_minus_13',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  const items = scaffold.items
    .map((item) => {
      const key = (Object.keys(OWNER_GRAMS) as Array<keyof typeof OWNER_GRAMS>).find((candidate) =>
        item.id.includes(candidate),
      );
      return {
        ...item,
        ingredient: sorbetMapperIngredient(
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        ),
        planned_grams: key ? OWNER_GRAMS[key] : item.planned_grams,
      };
    })
    .filter((item) => item.planned_grams > 0);
  const mainItems = mains.map(
    (main) =>
      ({
        id: main.id,
        ingredient: sorbetMapperIngredient(main.mapperId),
        planned_grams: main.grams,
        actual_grams: null,
        lock_type: 'main',
        ...(main.weight === undefined ? {} : { main_ratio_weight: main.weight }),
      }) as RecipeItem,
  );
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: temperature,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [...items, ...mainItems],
    goals: { formulation_strategy: 'optimal' },
  } as RecipeInput;
};

/**
 * The server answer for a semantically valid flavour carrier with no approved
 * envelope for this profile — Banana or Raspberry in Sorbet.
 */
const USER_HELD: Partial<ProductBehaviorSnapshot> = {
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
  mainAuthority: 'USER_HELD',
  mainCalibrationLevel: 'NONE',
  mainPolicyId: null,
  mainPolicyVersion: null,
  ecoFloorPercent: null,
  optimalCeilingPercent: null,
  hardLimitPercent: null,
  multiMainHardLimitPercent: null,
  mainEquivalentFactor: null,
  mainBasis: null,
};

/** The exact calibrated Sorbet 60 % authority is preserved unchanged (§7, §25). */
const CALIBRATED: Partial<ProductBehaviorSnapshot> = {
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainCapability: 'MAIN_CAPABLE',
  mainAuthority: 'CALIBRATED',
  mainCalibrationLevel: 'EXACT_PRODUCT',
};

const snapshotsWith = (
  input: RecipeInput,
  overrides: Record<string, Partial<ProductBehaviorSnapshot>>,
): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = sorbetAuthoritySnapshots(input);
  for (const [lineId, patch] of Object.entries(overrides)) {
    const current = snapshots[lineId];
    if (!current) throw new Error(`fixture has no snapshot for ${lineId}`);
    snapshots[lineId] = { ...current, ...patch } as ProductBehaviorSnapshot;
  }
  return snapshots;
};

const preview = (
  input: RecipeInput,
  overrides: Record<string, Partial<ProductBehaviorSnapshot>>,
) =>
  buildOptimizePreview(input, NONE, AT, {
    productBehaviorSnapshots: snapshotsWith(input, overrides),
  });

const gramsOf = (input: RecipeInput, lineId: string): number => {
  const item = input.items.find((candidate) => candidate.id === lineId);
  if (!item) throw new Error(`proposal has no line ${lineId}`);
  return item.planned_grams;
};

const roleOf = (input: RecipeInput, lineId: string) =>
  input.items.find((candidate) => candidate.id === lineId)?.lock_type;

describe('user-held Main is held exactly (§6, §16, §34)', () => {
  it('OWNER REPRODUCER: Sorbet with Banana as Main at 600 g keeps 600 g and the Main role', () => {
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 600 }]);
    const result = preview(input, { 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).toBe(600);
    expect(roleOf(result.preview.proposedInput, 'main-banana')).toBe('main');
  });

  it('reports the held Main as held_by_contract, not as a maximisation it never did', () => {
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 480 }]);
    const result = preview(input, { 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).toBe(480);
    const proof = result.preview.mainObjective;
    if (proof) {
      // The owner's grams are an exact contract, so the frontier search reports
      // them as held rather than claiming a maximisation it never performed.
      expect(proof.status).toBe('held_by_contract');
      expect(proof.executableMainGrams).toBe(480);
    }
  });

  it('Raspberry — a fruit with no exact Sorbet policy — is usable as Main (§16)', () => {
    const input = ownerSorbet([{ id: 'main-raspberry', mapperId: MAPPER.raspberry, grams: 600 }]);
    const result = preview(input, { 'main-raspberry': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-raspberry')).toBe(600);
  });

  it('the approved Strawberry 60 % calibration still governs its own Main (§7, §25)', () => {
    const input = ownerSorbet([{ id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 600 }], -13);
    const result = preview(input, { 'main-strawberry': CALIBRATED });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const grams = gramsOf(result.preview.proposedInput, 'main-strawberry');
    // 60/60/60 envelope: the calibrated path holds the approved point exactly.
    expect(grams).toBe(600);
    expect(roleOf(result.preview.proposedInput, 'main-strawberry')).toBe('main');
  });
});

describe('Multi-Main under user-held authority (§19, §20, §21)', () => {
  it('strawberry + banana 1:1 keeps both Mains positive at the owner ratio', () => {
    const input = ownerSorbet([
      { id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 300, weight: 1 },
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 300, weight: 1 },
    ]);
    const result = preview(input, { 'main-strawberry': CALIBRATED, 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const strawberry = gramsOf(result.preview.proposedInput, 'main-strawberry');
    const banana = gramsOf(result.preview.proposedInput, 'main-banana');
    expect(strawberry).toBeGreaterThan(0);
    expect(banana).toBeGreaterThan(0);
    expect(strawberry).toBe(300);
    expect(banana).toBe(300);
  });

  it('strawberry + banana 2:1 keeps the 2:1 ratio', () => {
    const input = ownerSorbet([
      { id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 400, weight: 2 },
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 200, weight: 1 },
    ]);
    const result = preview(input, { 'main-strawberry': CALIBRATED, 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const strawberry = gramsOf(result.preview.proposedInput, 'main-strawberry');
    const banana = gramsOf(result.preview.proposedInput, 'main-banana');
    expect(strawberry / banana).toBeCloseTo(2, 9);
  });

  it('banana + raspberry — two uncalibrated Mains — need no pre-listed SQL group (§19)', () => {
    const input = ownerSorbet([
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 300, weight: 1 },
      { id: 'main-raspberry', mapperId: MAPPER.raspberry, grams: 300, weight: 1 },
    ]);
    const result = preview(input, { 'main-banana': USER_HELD, 'main-raspberry': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).toBe(300);
    expect(gramsOf(result.preview.proposedInput, 'main-raspberry')).toBe(300);
  });

  it('reverse assignment order gives the identical held result (§30)', () => {
    const mains: Main[] = [
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 200, weight: 1 },
      { id: 'main-raspberry', mapperId: MAPPER.raspberry, grams: 400, weight: 2 },
    ];
    const overrides = { 'main-banana': USER_HELD, 'main-raspberry': USER_HELD };
    const forward = preview(ownerSorbet(mains), overrides);
    const reverse = preview(ownerSorbet([...mains].reverse()), overrides);
    expect(forward.ok && reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) return;
    expect(gramsOf(forward.preview.proposedInput, 'main-banana'))
      .toBe(gramsOf(reverse.preview.proposedInput, 'main-banana'));
    expect(gramsOf(forward.preview.proposedInput, 'main-raspberry'))
      .toBe(gramsOf(reverse.preview.proposedInput, 'main-raspberry'));
  });
});

describe('technical failure is not an eligibility failure (§22)', () => {
  it('an infeasible user-held Main is refused on recipe technique, never on Main role', () => {
    // Banana at 300 g in a −13 °C Sorbet cannot satisfy the bands with the
    // owner's grams held. PINGÜINO must say that in technical terms.
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 300 }], -13);
    const result = preview(input, { 'main-banana': USER_HELD });
    const payload = JSON.stringify(result);
    expect(payload).not.toMatch(/nie jest zatwierdzony jako Main/);
    expect(payload).not.toMatch(/Brak zatwierdzonego zakresu Main/);
    expect(payload).not.toMatch(/nie jest składnikiem smakowym Main/);
    if (result.ok) {
      // A proposal may still exist; the owner's Main grams stay theirs.
      expect(gramsOf(result.preview.proposedInput, 'main-banana')).toBe(300);
    } else {
      // The refusal names recipe technique, not the ingredient's Main role.
      expect(result.code).toBe('unsafe_proposal');
    }
  });
});
