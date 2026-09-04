/**
 * SUCROSE FUNCTIONAL ROLE / LOCAL-CORRECTOR ROUTING — pinned regressions.
 *
 * THE DEFECT
 * ----------
 * `pod_value` / `pac_value` are per-100 g POINTS with sucrose = 100 (spec §7–§8;
 * the engine spends them as `grams × value / 100`). The role classifier compared
 * a stored PAC POINT against `1.3` — a COEFFICIENT factor, the separator between
 * sucrose (1.00) and dextrose (1.90) in `PAC_COEFFICIENTS`. Every sugar with any
 * stored PAC therefore read as `sugar_freezing_control`: 42 of the 43 engine-sugar
 * Mapper rows, the single exception being SUCRALOSE, whose stored PAC is 0.
 *
 * Downstream, `milk_base_v1` lists `sweetener_sucrose` as a HARD role, so an
 * ordinary Mapper milk gelato — Sucrose + Dextrose in the draft — reported
 * `missing_hard_role` and was rebuilt through `full_formulation` instead of
 * being corrected locally.
 *
 * WHAT IS PINNED HERE
 * -------------------
 *  - the unit contract and its single normalization boundary;
 *  - Sucrose resolves semantically, and the approved toolbox registry (not a
 *    hardcoded SKU test) is the authority for what every core identity is;
 *  - the freezing-control sugars, syrups and polyols keep their roles;
 *  - ordinary milk gelato and the Polish Lost reproducer reach the local
 *    corrector, and `full_formulation` still serves the drafts that need it;
 *  - Soft-Hold and the target-batch invariant survive the route change.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  isMaterialUserIntentDeviation,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { BATCH_SUM_TOLERANCE_G } from '@/features/recipe-constraints';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { CORE_INGREDIENT_IDENTITIES } from '@/data/ingredients/canonicalIngredientIdentity';
import { parseCsv } from '@/lib/csv';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import { OWNER_PRICES } from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import {
  normalizeStoredPointsToRoleFactor,
  resolveFunctionalRole,
  ROLE_CLASSIFICATION_POINTS_PER_FACTOR,
} from './ingredientRoles';
import { localCorrectionProfileEligible, routeFormulationMode } from './formulate';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import type { VisibleProductType } from '@/features/studio/productType';

/* ── the real Mapper rows (no invented compositions) ─────────────────────── */

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC = new Set(
  HEADER.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);

const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper row ${ingredientId}`);
  return Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      )
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};

const engineIngredient = (ingredientId: string): EngineIngredient =>
  ingredientRowToEngineIngredient(mapperRow(ingredientId));

const priced = (ingredientId: string): EngineIngredient => ({
  ...engineIngredient(ingredientId),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const roleOf = (ingredientId: string) => resolveFunctionalRole(engineIngredient(ingredientId));

/** „WATER · Liquid" — see the known-gap test in §2. */
const CANONICAL_WATER_ID = 'PI-ING-001409';

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  yolk: 'PI-ING-001645',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  fructose: 'PI-ING-000496',
  dryGlucoseSyrup39: 'PI-ING-000495',
  maltitol: 'PI-ING-001385',
  erythritol: 'PI-ING-001372',
  xylitol: 'PI-ING-001382',
  sorbitol: 'PI-ING-001466',
  glycerin: 'PI-ING-001376',
  lactose: 'PI-ING-000503',
  trehalose: 'PI-ING-001644',
  stevia: 'PI-ING-001424',
  sucralose: 'PI-ING-001427',
  honey: 'PI-ING-001454',
  invertSugar: 'PI-ING-001369',
  caneSugar: 'PI-ING-000515',
  inulin: 'PI-ING-000456',
  tara: 'PI-ING-000492',
  water: 'PI-ING-001409',
  bottledWaterStill: 'PI-ING-001835',
  bottledWaterSmart: 'PI-ING-001907',
  bottledWaterAquafina: 'PI-ING-001969',
  colaZero: 'PI-ING-001936',
  colaZeroCoke: 'PI-ING-001876',
  colaSugar: 'PI-ING-001934',
  energyZero: 'PI-ING-001785',
  sodaWaterMixer: 'PI-ING-001833',
  tonicWater: 'PI-ING-001900',
  fruitSoda: 'PI-ING-001883',
  juice: 'PI-ING-000357',
  oatDrink: 'PI-ING-001565',
  vanilla: 'PI-ING-000334',
  cocoa: 'PI-ING-000109',
  pistachio: 'PI-ING-000444',
  coffee: 'PI-ING-000167',
} as const;

/* ════════════════════════════════════════════════════════════════════════════
   §1 — THE UNIT CONTRACT
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§1 the PAC/POD unit contract has exactly one normalization boundary', () => {
  it('converts stored per-100 g points to the coefficient factor role rules use', () => {
    expect(ROLE_CLASSIFICATION_POINTS_PER_FACTOR).toBe(100);
    // sucrose is the unit of BOTH scales: 100 points === factor 1.00
    expect(normalizeStoredPointsToRoleFactor(100)).toBe(1);
    // dextrose: stored 174.8 points === PAC_COEFFICIENTS.dextrose (1.90) × 92 % dry
    expect(normalizeStoredPointsToRoleFactor(174.8)).toBeCloseTo(1.748, 12);
    expect(normalizeStoredPointsToRoleFactor(null)).toBeNull();
    expect(normalizeStoredPointsToRoleFactor(undefined)).toBeNull();
    expect(normalizeStoredPointsToRoleFactor(Number.NaN)).toBeNull();
  });

  it('reads the canonical rows on the scale the Mapper actually stores', () => {
    // The Mapper's own factor columns corroborate the points: Sucrose carries
    // pod/pac 100 AND sweetness/freezing factor 1.0 in the same row.
    const sucrose = mapperRow(IDS.sucrose);
    expect(sucrose.pod_value).toBe(100);
    expect(sucrose.pac_value).toBe(100);
    expect(normalizeStoredPointsToRoleFactor(sucrose.pac_value)).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §2 — SEMANTIC ROLES (the regression that fails before the fix)
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§2 sweetener roles resolve semantically', () => {
  it('resolves canonical Sucrose to the sucrose sweetener role', () => {
    // THE regression: before the unit fix this returned `sugar_freezing_control`.
    expect(roleOf(IDS.sucrose)).toBe('sweetener_sucrose');
  });

  it('keeps Dextrose on the freezing-control role', () => {
    expect(roleOf(IDS.dextrose)).toBe('sugar_freezing_control');
  });

  it('keeps Fructose on the freezing-control role', () => {
    expect(roleOf(IDS.fructose)).toBe('sugar_freezing_control');
  });

  it('keeps a dry glucose syrup on the freezing-control role', () => {
    expect(roleOf(IDS.dryGlucoseSyrup39)).toBe('sugar_freezing_control');
  });

  it.each([
    ['maltitol', IDS.maltitol],
    ['erythritol', IDS.erythritol],
    ['xylitol', IDS.xylitol],
    ['sorbitol', IDS.sorbitol],
    ['glycerin', IDS.glycerin],
  ])('never promotes the polyol bulk sweetener %s into the sucrose role', (_name, id) => {
    // Maltitol is the trap: stored PAC 100 === factor 1.00, exactly sucrose's.
    // Only its 98 % polyol content keeps it out of the sucrose role.
    expect(roleOf(id)).not.toBe('sweetener_sucrose');
  });

  it.each([
    ['lactose', IDS.lactose],
    ['trehalose', IDS.trehalose],
    ['stevia', IDS.stevia],
    ['sucralose', IDS.sucralose],
    ['honey', IDS.honey],
    ['invert sugar', IDS.invertSugar],
  ])('never lets %s stand in for the sucrose sweetener', (_name, id) => {
    expect(roleOf(id)).not.toBe('sweetener_sucrose');
  });

  it('does accept a genuinely sucrose-dominant sweetener that is not the canonical SKU', () => {
    // The rule is evidence, not an id list.
    expect(roleOf(IDS.caneSugar)).toBe('sweetener_sucrose');
  });

  it('agrees with the approved toolbox registry for EVERY core identity', () => {
    // The registry declares what each canonical identity IS. Nothing in the
    // resolver may contradict it — and this is what makes the Sucrose result a
    // structural fact rather than a hardcoded SKU expectation.
    for (const identity of CORE_INGREDIENT_IDENTITIES) {
      expect(roleOf(identity.mapperId), `${identity.toolboxId} (${identity.mapperId})`).toBe(
        identity.role,
      );
    }
  });

  it('resolves canonical Water semantically, not as flavour', () => {
    // Was `flavor_other`: the Mapper category `liquid` has no CATEGORY_MAPPING
    // entry so it lands in the engine `other` bucket, and the old rule only
    // matched the engine category or the literal name "water" — while the
    // Sorbet templates ask for the `water` HARD role.
    expect(roleOf(CANONICAL_WATER_ID)).toBe('water');
    expect(
      CORE_INGREDIENT_IDENTITIES.find((identity) => identity.mapperId === CANONICAL_WATER_ID)?.role,
    ).toBe('water');
  });

  it.each([
    ['Acqua Morelli still', IDS.bottledWaterStill],
    ['Smartwater', IDS.bottledWaterSmart],
    ['Aquafina', IDS.bottledWaterAquafina],
  ])('resolves the bottled still water %s to water too', (_name, id) => {
    expect(roleOf(id)).toBe('water');
  });

  it.each([
    ['Pepsi Max (100 % water, 0 solids, POD/PAC 0 — identical to water)', IDS.colaZero],
    ['Coca-Cola Zero Sugar', IDS.colaZeroCoke],
    ['Pepsi Original (sugared cola)', IDS.colaSugar],
    ['Red Bull Sugarfree', IDS.energyZero],
    ['Goldberg soda water (a mixer)', IDS.sodaWaterMixer],
    ['Schweppes Indian Tonic Water', IDS.tonicWater],
    ['Fanta Orange', IDS.fruitSoda],
    ['Campisi blonde orange juice', IDS.juice],
    ['oat drink', IDS.oatDrink],
    ['milk 3.5 %', IDS.milk],
  ])('never turns %s into water', (_name, id) => {
    expect(roleOf(id)).not.toBe('water');
  });

  it('needs BOTH halves of the evidence — composition alone cannot decide', () => {
    // The reason the rule is not composition-only, stated as a fact about the
    // dataset: these two rows are numerically indistinguishable.
    const water = mapperRow(CANONICAL_WATER_ID);
    const cola = mapperRow(IDS.colaZero);
    expect(cola.water_percent).toBe(water.water_percent);
    expect(cola.total_solids_percent).toBe(water.total_solids_percent);
    expect(cola.pod_value).toBe(water.pod_value);
    expect(cola.pac_value).toBe(water.pac_value);
    // …and the subcategory alone is what separates them.
    expect(water.ingredient_subcategory).toBe('water');
    expect(cola.ingredient_subcategory).not.toBe('water');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §3 — ROUTING
   ═══════════════════════════════════════════════════════════════════════════ */

const NO_CONSTRAINTS: ConstraintSet = { byLineId: {} };
const AT = '2026-08-24T09:00:00.000Z';

/** The canonical milk-gelato base every ordinary recipe below is built on. */
const BASE_LINES: readonly (readonly [string, string, number])[] = [
  ['l:milk', IDS.milk, 670],
  ['l:cream', IDS.cream, 130],
  ['l:smp', IDS.smp, 35],
  ['l:sucrose', IDS.sucrose, 130],
  ['l:dextrose', IDS.dextrose, 30],
  ['l:tara', IDS.tara, 5],
];

const milkGelato = (
  extra: readonly (readonly [string, string, number])[] = [],
  overrides: Partial<RecipeInput> = {},
): RecipeInput => {
  const lines = [...BASE_LINES, ...extra];
  const flavourGrams = extra.reduce((sum, [, , grams]) => sum + grams, 0);
  return {
    items: lines.map(([id, ingredientId, grams]) => ({
      id,
      ingredient: priced(ingredientId),
      // keep the batch at 1000 g by taking the flavour mass out of the milk
      planned_grams: id === 'l:milk' ? grams - flavourGrams : grams,
      actual_grams: null,
      lock_type: 'unlocked' as const,
      user_intent_anchor_grams: id === 'l:milk' ? grams - flavourGrams : grams,
    })),
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
    ...overrides,
  };
};

const ORDINARY_GELATO: readonly (readonly [string, RecipeInput])[] = [
  ['Fior di latte', milkGelato()],
  ['Vanilla', milkGelato([['l:vanilla', IDS.vanilla, 30]])],
  ['Chocolate/cocoa', milkGelato([['l:cocoa', IDS.cocoa, 80]])],
  ['Pistachio', milkGelato([['l:pistachio', IDS.pistachio, 70]])],
  ['Coffee', milkGelato([['l:coffee', IDS.coffee, 20]])],
];

/** The served owner reproducer `lost-pl-yolk-v2` „Śmietankowe na żółtkach". */
const LOST_LINES: readonly (readonly [string, string, number])[] = [
  ['l:milk', IDS.milk, 595],
  ['l:cream', IDS.cream, 180],
  ['l:yolk', IDS.yolk, 40],
  ['l:smp', IDS.smp, 30],
  ['l:sucrose', IDS.sucrose, 90],
  ['l:dextrose', IDS.dextrose, 50],
  ['l:inulin', IDS.inulin, 20],
  ['l:tara', IDS.tara, 2],
];

const lostRecipe = (lockYolk = false): { input: RecipeInput; set: ConstraintSet } => ({
  input: {
    items: LOST_LINES.map(([id, ingredientId, grams]) => {
      const locked = lockYolk && id === 'l:yolk';
      return {
        id,
        ingredient: priced(ingredientId),
        planned_grams: grams,
        actual_grams: null,
        lock_type: locked ? ('grams' as const) : ('unlocked' as const),
        ...(locked ? { grams_constraint: { grams: 40 } } : {}),
        user_intent_anchor_grams: grams,
        user_target_grams: grams,
      };
    }),
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      formulation_strategy: 'optimal',
    } as RecipeInput['goals'],
  },
  set: { byLineId: lockYolk ? { 'l:yolk': { mode: 'locked', grams: 40 } } : {} },
});

const gramsOf = (input: RecipeInput, lineId: string): number =>
  input.items.find((item) => item.id === lineId)?.planned_grams ?? 0;

describe('§3 an ordinary Mapper milk gelato reaches the local corrector', () => {
  it.each(ORDINARY_GELATO)('%s routes to local correction', (_label, input) => {
    // The Sucrose line is what used to report the role as missing.
    expect(resolveFunctionalRole(input.items.find((i) => i.id === 'l:sucrose')!.ingredient)).toBe(
      'sweetener_sucrose',
    );
    const decision = routeFormulationMode(input, NO_CONSTRAINTS);
    expect(decision.mode).toBe('local_correction');
    expect(decision.reasons).not.toContain('missing_hard_role');
  });

  it('routes the Polish Lost reproducer to local correction, unlocked and locked', () => {
    expect(routeFormulationMode(lostRecipe(false).input, lostRecipe(false).set).mode).toBe(
      'local_correction',
    );
    expect(routeFormulationMode(lostRecipe(true).input, lostRecipe(true).set).mode).toBe(
      'constrained_reformulation', // an explicit hard lock is a global redistribution
    );
  });

  it('still routes a draft that genuinely lacks the sucrose role through formulation', () => {
    // Remove the sugar entirely: the template HARD role really is missing now,
    // so `full_formulation` must remain reachable and is the honest answer.
    const base = milkGelato();
    const noSugar: RecipeInput = {
      ...base,
      items: base.items.filter((item) => item.id !== 'l:sucrose'),
    };
    const decision = routeFormulationMode(noSugar, NO_CONSTRAINTS);
    expect(decision.mode).toBe('full_formulation');
    expect(decision.reasons).toContain('missing_hard_role');
    expect(decision.template?.templateId).toBe('milk_base_v1');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §4 — THE CONTRACTS THE ROUTE CHANGE MUST NOT BREAK
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§4 Soft-Hold and the target-batch invariant survive the local route', () => {
  it('does not collapse the dried egg yolk when the Lost recipe is UNLOCKED', () => {
    const { input, set } = lostRecipe(false);
    const result = buildOptimizePreview(input, set, AT);
    expect(result.ok, result.ok ? '' : JSON.stringify(result).slice(0, 300)).toBe(true);
    if (!result.ok) return;
    const proposed = result.preview.proposedInput;
    // the served regression was exactly 1 g
    expect(gramsOf(proposed, 'l:yolk')).toBeGreaterThan(1);
    expect(isMaterialUserIntentDeviation(40, gramsOf(proposed, 'l:yolk'), 1000)).toBe(false);
    expect(result.preview.userIntent?.material ?? []).toHaveLength(0);
    // canonical identity preserved — no fresh-yolk substitution
    expect(
      proposed.items.find((item) => item.id === 'l:yolk')?.ingredient.canonical_ingredient_id,
    ).toBe(IDS.yolk);
    expect(gramsOf(proposed, 'l:inulin')).toBeGreaterThanOrEqual(20); // owner minimum
    expect(gramsOf(proposed, 'l:inulin')).toBeLessThanOrEqual(80); // owner maximum
    expect(proposed.items.every((item) => item.planned_grams >= 1)).toBe(true);
    const executableResult = calculateRecipe(proposed);
    expect(detectViolations(executableResult)).toEqual([]);
    expect(result.preview.violationsAfter).toBe(0);
    expect(result.preview.practicalization).toMatchObject({
      status: 'ready',
      audit: { executableResult: { scores: executableResult.scores } },
    });
  });

  it('holds the dried egg yolk at exactly 40 g when it is LOCKED', () => {
    const { input, set } = lostRecipe(true);
    const result = buildOptimizePreview(input, set, AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const proposed = result.preview.proposedInput;
    expect(gramsOf(proposed, 'l:yolk')).toBe(40);
    expect(gramsOf(proposed, 'l:inulin')).toBeGreaterThanOrEqual(20);
    expect(gramsOf(proposed, 'l:inulin')).toBeLessThanOrEqual(80);
    expect(proposed.items.every((item) => item.planned_grams > 0)).toBe(true);
    expect(Math.abs(plannedSum(proposed) - 1000)).toBeLessThanOrEqual(BATCH_SUM_TOLERANCE_G);
    const executableResult = calculateRecipe(proposed);
    expect(detectViolations(executableResult)).toEqual([]);
    expect(result.preview.violationsAfter).toBe(0);
    expect(result.preview.practicalization).toMatchObject({
      status: 'ready',
      audit: { executableResult: { scores: executableResult.scores } },
    });
  });

  it.each([...ORDINARY_GELATO, ['Polish Lost', lostRecipe(false).input] as const])(
    'keeps a successful %s Preview on the target batch',
    (_label, input) => {
      const result = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
      if (!result.ok) return; // an honest refusal is always allowed
      const proposed = result.preview.proposedInput;
      expect(Math.abs(plannedSum(proposed) - input.target_batch_grams)).toBeLessThanOrEqual(
        BATCH_SUM_TOLERANCE_G,
      );
      expect(proposed.items.filter((item) => item.planned_grams <= 0)).toEqual([]);
    },
  );
});

/* ════════════════════════════════════════════════════════════════════════════
   §5 — PROFILE-AWARE ROUTE ELIGIBILITY (the separation this ticket exists for)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Functional ingredient ROLE is global; ROUTE ELIGIBILITY is not.
 *
 * Correcting Sucrose stopped every profile reporting `missing_hard_role`, which
 * dropped Protein — a profile with its OWN approved templates and its own
 * qualification authority — into the ordinary dairy corrector. Sorbet and Vegan
 * would have followed once canonical Water resolved too. The router now asks
 * `localCorrectionProfileEligible` first.
 */
const starterDraft = (
  visibleProductType: VisibleProductType,
  category: RecipeInput['category'],
  temperatureC: number,
): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType,
    servingModeId: temperatureC === -11 ? 'temp_minus_11' : 'temp_minus_12',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1000,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category,
    target_temperature_c: temperatureC,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      formulation_strategy: 'optimal',
    } as RecipeInput['goals'],
  };
};

describe('§5 route eligibility is profile-aware while the role stays global', () => {
  it('lets ordinary dairy Gelato profiles use the local corrector', () => {
    for (const category of [
      'milk_gelato',
      'fruit_gelato',
      'nut_gelato',
      'chocolate_gelato',
      'alcohol_gelato',
    ] as const) {
      expect(localCorrectionProfileEligible(category), category).toBe(true);
    }
    // `custom` has no profile authority of its own — the generic corrector is
    // the only thing that can serve it.
    expect(localCorrectionProfileEligible('custom')).toBe(true);
  });

  it('keeps Protein, Sorbet and Vegan out of the dairy corrector', () => {
    for (const category of ['protein_gelato', 'sorbet', 'vegan_gelato'] as const) {
      expect(localCorrectionProfileEligible(category), category).toBe(false);
    }
  });

  it.each([
    ['protein', 'protein_gelato', -12],
    ['sorbet', 'sorbet', -12],
    ['vegan', 'vegan_gelato', -12],
  ] as const)(
    'routes a substantive %s draft to its own formulation path, never local correction',
    (visible, category, temperatureC) => {
      const input = starterDraft(visible, category, temperatureC);
      const decision = routeFormulationMode(input, NO_CONSTRAINTS);
      expect(decision.mode).not.toBe('local_correction');
      if (decision.mode === 'full_formulation') {
        expect(decision.template?.category).toBe(category);
      }
    },
  );

  it('resolves Sucrose to the same role in every profile', () => {
    // The role is a property of the ingredient, not of the recipe it sits in.
    const roles = new Set(
      (['gelato', 'sorbet', 'vegan', 'protein'] as const).flatMap((visible) => {
        const category = (
          {
            gelato: 'milk_gelato',
            sorbet: 'sorbet',
            vegan: 'vegan_gelato',
            protein: 'protein_gelato',
          } as const
        )[visible];
        const input = starterDraft(visible, category, -12);
        return input.items
          .filter(
            (item) =>
              (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === IDS.sucrose,
          )
          .map((item) => resolveFunctionalRole(item.ingredient));
      }),
    );
    expect([...roles]).toEqual(['sweetener_sucrose']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §6 — ECO PRICING: BLANK MAPPER COST IS "NO CANONICAL PRICE", NEVER "FREE"
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Canonical Water `PI-ING-001409` has a BLANK `cost_per_kg` in the Mapper. That
 * is the architecture, not a defect: there is no canonical purchase price for
 * water. ECO reads the customer/owner MOJA CENA overlay instead — and the owner
 * account really does carry one (verified on staging: 1.00 EUR/kg, 2026-08-16),
 * which is exactly what `OWNER_PRICES` reproduces offline.
 *
 * Nothing here writes a price into the Mapper.
 */
describe('§6 ECO resolves Water through the owner price, not through Mapper', () => {
  const withWater = (): RecipeInput => {
    const base = milkGelato();
    return {
      ...base,
      items: [
        ...base.items.map((item) =>
          item.id === 'l:milk' ? { ...item, planned_grams: item.planned_grams - 100 } : item,
        ),
        {
          id: 'l:water',
          ingredient: { ...engineIngredient(IDS.water), cost_per_kg: null },
          planned_grams: 100,
          actual_grams: null,
          lock_type: 'unlocked' as const,
          user_intent_anchor_grams: 100,
        },
      ],
      goals: { ...base.goals, formulation_strategy: 'eco' } as RecipeInput['goals'],
    };
  };

  it('leaves the canonical Water cost BLANK in the Mapper (no mutation)', () => {
    expect(mapperRow(IDS.water).cost_per_kg).toBeNull();
    // …and a blank cost is never silently read as 0.
    expect(engineIngredient(IDS.water).cost_per_kg).toBeNull();
  });

  it('keeps missing Water price out of the technical Preview result', () => {
    const result = buildOptimizePreview(withWater(), NO_CONSTRAINTS, AT);
    if (!result.ok) expect((result as { code: string }).code).not.toBe('missing_prices');
    expect(calculateRecipe(withWater()).costs).toMatchObject({ complete: false });
  });

  it('prices the ECO draft through the owner MOJA CENA overlay instead', () => {
    const result = buildOptimizePreview(withWater(), NO_CONSTRAINTS, AT, {
      effectivePriceOverrides: OWNER_PRICES,
    });
    // Either a costed proposal or an honest "nothing cheaper" — never the
    // missing-price dead end, and never a Mapper write.
    if (!result.ok) expect(result.code).not.toBe('missing_prices');
    expect(mapperRow(IDS.water).cost_per_kg).toBeNull();
  });

  it('carries the same owner Water price the staging account holds', () => {
    expect(OWNER_PRICES[IDS.water]?.pricePerKg).toBe(1);
  });
});
