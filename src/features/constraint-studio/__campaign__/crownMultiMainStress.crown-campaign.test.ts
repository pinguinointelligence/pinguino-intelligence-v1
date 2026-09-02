/// <reference types="node" />
/**
 * GELLATTI v1.6 Crown / Multi-Main deep stress campaign.
 *
 * Qualification-only harness: real Mapper articles, real profile starters,
 * real Preview/Apply doors and real persistence adapter. The baseline phase is
 * run against unchanged staging logic. Production defects found here receive
 * a small default-suite reproducer before any implementation change.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { parseCsv } from '@/lib/csv';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import type { NewRecipeServingModeId } from '@/features/recipes/newRecipeStarter';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { productBehaviorSnapshotFingerprint } from '@/features/product-intelligence';
import {
  mainEnvelopeSearchCeilingGrams,
  verifyMainEnvelope,
} from '@/features/product-intelligence/mainEnvelope';
import {
  captureMainIngredientIntent,
  verifyMainIngredientIdentity,
} from '@/features/formulation/mainIngredientContract';
import {
  buildBatchRescalePreview,
  buildOptimizePreview,
  bindProductBehaviorToPreview,
  commitPreview,
  directionTargetFingerprint,
  plannedSum,
  workingStateFingerprint,
  type BuildPreviewResult,
} from '@/features/constraint-studio/applyPipeline';
import type { CustomerPriceIndex } from '@/features/pro-core/effectiveRecipePricing';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { InMemoryRecipes } from '@/services/proCore/inMemoryRecipes';
import { inMemoryRecipesRepository } from '@/services/proCore/recipesRepository';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import { classifyViolationBands } from '@/features/formulation/violationBands';

type Profile = 'Gelato' | 'Sorbet' | 'Vegan' | 'Protein';
type Strategy = 'optimal' | 'eco';
type Classification =
  | 'PASS'
  | 'HONEST_IMPOSSIBLE'
  | 'AUTHORITY_BLOCKED'
  | 'SOLVER_FAILURE'
  | 'RATIO_REGRESSION'
  | 'PERSISTENCE_REGRESSION'
  | 'TIMEOUT_RUNTIME'
  | 'UI_STATE_REGRESSION';
type LockPattern = 'none' | 'support_one' | 'support_multiple' | 'main_one';
type CaseExpectation = 'feasible' | 'honest_impossible' | 'authority_blocked';

interface MainPolicySpec {
  policyId: string;
  version: string;
  family: string;
  subfamily: string | null;
  form: string;
  basis: NonNullable<ProductBehaviorSnapshot['mainBasis']>;
  floor: number;
  ceiling: number;
  hard: number;
  multiHard: number | null;
  carrier: boolean;
}

interface ProductSpec {
  key: string;
  mapperId: string;
  family: string;
  subfamily: string | null;
  form: string;
  policies: Partial<Record<Profile, MainPolicySpec>>;
}

interface CaseSpec {
  runId: string;
  randomSeed: number;
  profile: Profile;
  servingMode: NewRecipeServingModeId;
  strategy: Strategy;
  sweetness: RecipeDirectionTarget;
  hardness: RecipeDirectionTarget;
  batchTarget: number;
  batchFrom?: number;
  crownCount: number;
  productKeys: string[];
  grams: number[];
  lockPattern: LockPattern;
  expectation: CaseExpectation;
  random: boolean;
  unknownLast?: boolean;
  sequenceStage?: string;
}

interface LedgerRow {
  run_id: string;
  random_seed: number;
  profile: Profile;
  temperature: string;
  serving_mode: NewRecipeServingModeId;
  mode: 'OPTIMAL' | 'ECO';
  sweetness: number;
  hardness: number;
  batch_target_g: number;
  input_batch_g: number;
  crown_count: number;
  crown_pi_ing_ids: string;
  crown_names: string;
  input_crown_grams: string;
  input_ratio: string;
  individual_main_policies: string;
  main_basis: string;
  family: string;
  individual_hard_limits: string;
  derived_shared_group_hard_limit: string;
  engine_result_status: string;
  proposed_crown_grams: string;
  output_ratio: string;
  exact_engine_ratio: string;
  whole_gram_ratio: string;
  total_main_percent: string;
  score: string;
  hard_safe: boolean;
  preview_status: string;
  apply_status: string;
  save_reopen_status: string;
  refusal_error_code: string;
  largest_non_main_drift: string;
  runtime_ms: number;
  classification: Classification;
  case_expectation: CaseExpectation;
  case_kind: string;
  failure_reason: string;
}

interface ExecutedCase {
  row: LedgerRow;
  input: RecipeInput;
  output: RecipeInput | null;
  snapshots: Record<string, ProductBehaviorSnapshot>;
}

const AT = '2026-08-26T09:00:00.000Z';
const REPORT_DIR = join(process.cwd(), 'reports');
const PHASE = process.env.CROWN_STRESS_PHASE === 'final' ? 'final' : 'baseline';
const CASE_PATTERN_TEXT = process.env.CROWN_STRESS_CASE_PATTERN?.trim() ?? '';
const CASE_PATTERN = CASE_PATTERN_TEXT === '' ? null : new RegExp(CASE_PATTERN_TEXT);
const CAPS: RecipeCapabilities = {
  canSaveRecipe: true,
  canViewRecipeVersions: true,
  canRestoreRecipeVersion: true,
  maxSavedRecipes: null,
  canViewExactGrams: true,
};
const TRACE = { engineVersion: 'crown-stress', configVersion: 'crown-stress-v1' } as never;

const PROFILE_CATEGORY: Record<Profile, RecipeInput['category']> = {
  Gelato: 'milk_gelato',
  Sorbet: 'sorbet',
  Vegan: 'vegan_gelato',
  Protein: 'protein_gelato',
};
const PROFILE_VISIBLE = {
  Gelato: 'gelato',
  Sorbet: 'sorbet',
  Vegan: 'vegan',
  Protein: 'protein',
} as const;

const gelatoFruit = (
  policyId: string,
  subfamily: string | null,
  floor: number,
  ceiling: number,
  hard: number,
): MainPolicySpec => ({
  policyId,
  version: '2',
  family: 'fruit',
  subfamily,
  form: 'fresh',
  basis: 'FRUIT_EQUIVALENT',
  floor,
  ceiling,
  hard,
  multiHard: null,
  carrier: true,
});

const sorbetFruit = (subfamily: string, form = 'fresh'): MainPolicySpec => ({
  policyId: 'main-sorbet-exact-fruit-60-v1',
  version: '1',
  family: 'fruit',
  subfamily,
  form,
  basis: 'FRUIT_EQUIVALENT',
  floor: 60,
  ceiling: 60,
  hard: 60,
  multiHard: 60,
  carrier: false,
});

const veganFruit = (subfamily: string, form: string): MainPolicySpec => ({
  policyId: 'main-vegan-fruit-combination-v2',
  version: '2',
  family: 'fruit',
  subfamily,
  form,
  basis: 'FRUIT_EQUIVALENT',
  floor: 30,
  ceiling: 87.6,
  hard: 87.6,
  multiHard: 82.5,
  carrier: false,
});

const proteinFruit = (subfamily: string, ceiling: number): MainPolicySpec => ({
  policyId: 'main-protein-fruit-combination-v2',
  version: '2',
  family: 'fruit',
  subfamily,
  form: 'fresh',
  basis: 'FRUIT_EQUIVALENT',
  floor: 10,
  ceiling,
  hard: ceiling,
  multiHard: 20.7,
  carrier: false,
});

const PRODUCTS: ProductSpec[] = [
  {
    key: 'banana',
    mapperId: 'PI-ING-000345',
    family: 'fruit',
    subfamily: 'banana',
    form: 'fresh',
    policies: {
      Gelato: gelatoFruit('main-banana-fresh-dairy', 'banana', 10, 20, 30),
      Protein: proteinFruit('banana', 17.1),
    },
  },
  {
    key: 'strawberry',
    mapperId: 'PI-ING-001553',
    family: 'fruit',
    subfamily: 'berry',
    form: 'fresh',
    policies: {
      Gelato: gelatoFruit('main-berry-fresh-dairy', 'berry', 25, 35, 45),
      Sorbet: sorbetFruit('berry'),
      Vegan: veganFruit('berry', 'fresh'),
      Protein: proteinFruit('berry', 49.5),
    },
  },
  {
    key: 'cranberry',
    mapperId: 'PI-ING-001556',
    family: 'fruit',
    subfamily: 'berry',
    form: 'fresh',
    policies: { Gelato: gelatoFruit('main-berry-fresh-dairy', 'berry', 25, 35, 45) },
  },
  {
    key: 'raspberry',
    mapperId: 'PI-ING-000394',
    family: 'fruit',
    subfamily: 'berry',
    form: 'fresh',
    policies: { Gelato: gelatoFruit('main-berry-fresh-dairy', 'berry', 25, 35, 45) },
  },
  {
    key: 'watermelon',
    mapperId: 'PI-ING-000405',
    family: 'fruit',
    subfamily: null,
    form: 'fresh',
    policies: { Gelato: gelatoFruit('main-fruit-fresh-dairy', null, 20, 35, 45) },
  },
  {
    key: 'kiwi',
    mapperId: 'PI-ING-000366',
    family: 'fruit',
    subfamily: 'kiwi',
    form: 'fresh',
    policies: { Gelato: gelatoFruit('main-kiwi-fresh-dairy', 'kiwi', 10, 15, 20) },
  },
  {
    key: 'lime',
    mapperId: 'PI-ING-000369',
    family: 'fruit',
    subfamily: 'citrus',
    form: 'fresh',
    policies: {
      Gelato: gelatoFruit('main-fruit-fresh-dairy', 'citrus', 20, 35, 45),
      Sorbet: sorbetFruit('citrus'),
    },
  },
  {
    key: 'mango',
    mapperId: 'PI-ING-000340',
    family: 'fruit',
    subfamily: 'mango_tropical',
    form: 'puree',
    policies: {
      Gelato: {
        ...gelatoFruit('main-fruit-puree-dairy', 'mango_tropical', 20, 35, 45),
        form: 'puree',
      },
      Sorbet: sorbetFruit('mango_tropical', 'puree'),
    },
  },
  {
    key: 'banana_puree',
    mapperId: 'PI-ING-001589',
    family: 'fruit',
    subfamily: 'banana',
    form: 'puree',
    policies: {
      Gelato: { ...gelatoFruit('main-fruit-puree-dairy', 'banana', 20, 35, 45), form: 'puree' },
      Vegan: veganFruit('banana', 'puree'),
    },
  },
  {
    key: 'pistachio',
    mapperId: 'PI-ING-000614',
    family: 'nut',
    subfamily: null,
    form: 'pure_nut_paste',
    policies: {
      Gelato: {
        policyId: 'main-pistachio-pure-paste-dairy-0614',
        version: '1',
        family: 'nut',
        subfamily: null,
        form: 'pure_nut_paste',
        basis: 'NUT_EQUIVALENT',
        floor: 8,
        ceiling: 15,
        hard: 15,
        multiHard: null,
        carrier: true,
      },
      Vegan: {
        policyId: 'main-vegan-pistachio-paste-0614',
        version: '2',
        family: 'nut',
        subfamily: null,
        form: 'pure_nut_paste',
        basis: 'NUT_EQUIVALENT',
        floor: 12,
        ceiling: 26.6,
        hard: 26.6,
        multiHard: null,
        carrier: false,
      },
      Protein: {
        policyId: 'main-protein-pistachio-0614',
        version: '1',
        family: 'nut',
        subfamily: null,
        form: 'pure_nut_paste',
        basis: 'NUT_EQUIVALENT',
        floor: 10,
        ceiling: 10,
        hard: 10,
        multiHard: null,
        carrier: false,
      },
    },
  },
  {
    key: 'hazelnut',
    mapperId: 'PI-ING-000419',
    family: 'nut',
    subfamily: null,
    form: 'pure_nut_paste',
    policies: {
      Gelato: {
        policyId: 'main-pure-nut-paste-dairy',
        version: '2',
        family: 'nut',
        subfamily: null,
        form: 'pure_nut_paste',
        basis: 'NUT_EQUIVALENT',
        floor: 8,
        ceiling: 15,
        hard: 15,
        multiHard: null,
        carrier: true,
      },
    },
  },
  {
    key: 'cocoa',
    mapperId: 'PI-ING-001578',
    family: 'chocolate_cocoa',
    subfamily: null,
    form: 'cocoa_powder',
    policies: {
      Vegan: {
        policyId: 'main-vegan-cocoa-powder-1578',
        version: '2',
        family: 'chocolate_cocoa',
        subfamily: null,
        form: 'cocoa_powder',
        basis: 'COCOA_SOLIDS_EQUIVALENT',
        floor: 6,
        ceiling: 24,
        hard: 24,
        multiHard: null,
        carrier: false,
      },
      Protein: {
        policyId: 'main-protein-cocoa-1578',
        version: '2',
        family: 'chocolate_cocoa',
        subfamily: null,
        form: 'cocoa_powder',
        basis: 'COCOA_SOLIDS_EQUIVALENT',
        floor: 6,
        ceiling: 6.1,
        hard: 6.1,
        multiHard: null,
        carrier: false,
      },
    },
  },
  {
    key: 'vanilla',
    mapperId: 'PI-ING-000334',
    family: 'vanilla',
    subfamily: null,
    form: 'flavour_paste',
    policies: {},
  },
  {
    key: 'protein_vanilla',
    mapperId: 'PI-ING-000246',
    family: 'vanilla',
    subfamily: null,
    form: 'flavour_paste',
    policies: {
      Protein: {
        policyId: 'main-protein-vanilla-0246',
        version: '2',
        family: 'vanilla',
        subfamily: null,
        form: 'flavour_paste',
        basis: 'PERCENT_OF_BASE',
        floor: 0.5,
        ceiling: 4.9,
        hard: 4.9,
        multiHard: null,
        carrier: false,
      },
    },
  },
  {
    key: 'coffee',
    mapperId: 'PI-ING-000167',
    family: 'coffee',
    subfamily: null,
    form: 'powder',
    policies: {},
  },
  {
    key: 'whisky',
    mapperId: 'PI-ING-000038',
    family: 'alcohol',
    subfamily: null,
    form: 'alcoholic_beverage',
    policies: {
      Gelato: {
        policyId: 'main-whisky-40-dairy-0038-minus11',
        version: '1',
        family: 'alcohol',
        subfamily: null,
        form: 'alcoholic_beverage',
        basis: 'ETHANOL_PERCENT',
        floor: 2,
        ceiling: 4.9,
        hard: 4.9,
        multiHard: null,
        carrier: true,
      },
    },
  },
];

const PRODUCT = new Map(PRODUCTS.map((product) => [product.key, product]));

const mapperGrid = parseCsv(
  readFileSync(join(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const mapperHeader = mapperGrid[0]!;
const TRI_STATE = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const mapperCell = (raw: string, field: string): string | number | boolean | null => {
  const value = raw.trim();
  if (value === '') return null;
  if (TRI_STATE.has(field)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const MAPPER = new Map<string, IngredientRow>(
  mapperGrid.slice(1).map((cells) => {
    const row = Object.fromEntries(
      mapperHeader.map((field, index) => [field, mapperCell(cells[index] ?? '', field)]),
    ) as unknown as IngredientRow;
    return [row.ingredient_id, row] as const;
  }),
);
const ingredient = (mapperId: string) => {
  const row = MAPPER.get(mapperId);
  if (!row) throw new Error(`Missing Mapper article ${mapperId}`);
  return ingredientRowToEngineIngredient(row);
};

const mainPatterns: Readonly<Record<number, readonly number[][]>> = {
  1: [[1], [2], [5], [10], [25], [50], [100], [150], [300], [600]],
  2: [
    [150, 150],
    [300, 150],
    [1, 200],
    [200, 1],
    [10, 50],
    [25, 100],
    [400, 600],
    [600, 600],
    [2, 1],
    [100, 100],
  ],
  3: [
    [50, 50, 50],
    [100, 200, 300],
    [300, 200, 100],
    [1, 2, 5],
    [600, 1, 2],
    [25, 50, 100],
    [150, 150, 150],
    [400, 10, 1],
    [2, 5, 10],
    [100, 200, 100],
  ],
  4: [
    [50, 50, 50, 50],
    [100, 200, 300, 400],
    [400, 300, 200, 100],
    [1, 2, 5, 10],
    [600, 1, 2, 5],
    [25, 50, 100, 150],
    [150, 150, 150, 150],
    [400, 100, 25, 5],
    [2, 5, 10, 25],
    [100, 200, 100, 200],
  ],
  5: [
    [50, 50, 50, 50, 50],
    [100, 150, 200, 300, 400],
    [400, 300, 200, 150, 100],
    [1, 2, 5, 10, 25],
    [600, 1, 2, 5, 10],
    [25, 50, 100, 150, 200],
    [150, 150, 150, 150, 150],
    [400, 100, 25, 5, 1],
    [2, 5, 10, 25, 50],
    [100, 200, 100, 200, 100],
  ],
};

const COMPATIBLE: Record<Profile, string[]> = {
  Gelato: ['banana', 'strawberry', 'cranberry', 'raspberry', 'watermelon'],
  Sorbet: ['strawberry', 'lime', 'mango', 'cranberry', 'raspberry'],
  Vegan: ['strawberry', 'banana_puree', 'cranberry', 'raspberry', 'watermelon'],
  Protein: ['strawberry', 'banana', 'cranberry', 'raspberry', 'watermelon'],
};
const RANDOM_POOL: Record<Profile, string[]> = {
  Gelato: [
    'banana',
    'strawberry',
    'cranberry',
    'raspberry',
    'watermelon',
    'kiwi',
    'lime',
    'mango',
    'pistachio',
    'hazelnut',
    'cocoa',
    'vanilla',
    'coffee',
    'whisky',
  ],
  Sorbet: [
    'strawberry',
    'lime',
    'mango',
    'banana',
    'cranberry',
    'raspberry',
    'watermelon',
    'kiwi',
    'cocoa',
    'vanilla',
    'coffee',
  ],
  Vegan: [
    'strawberry',
    'banana_puree',
    'cranberry',
    'raspberry',
    'watermelon',
    'mango',
    'pistachio',
    'cocoa',
    'vanilla',
    'coffee',
  ],
  Protein: [
    'strawberry',
    'banana',
    'cranberry',
    'raspberry',
    'watermelon',
    'pistachio',
    'cocoa',
    'protein_vanilla',
    'vanilla',
    'coffee',
  ],
};
const MIXED: Record<Profile, string[]> = {
  Gelato: ['banana', 'pistachio', 'strawberry', 'hazelnut', 'cranberry'],
  Sorbet: ['strawberry', 'lime', 'mango', 'cranberry', 'raspberry'],
  Vegan: ['strawberry', 'pistachio', 'banana_puree', 'cocoa', 'cranberry'],
  Protein: ['strawberry', 'cocoa', 'banana', 'pistachio', 'protein_vanilla'],
};

const mulberry32 = (seed: number) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const selectUnique = (pool: readonly string[], count: number, random: () => number): string[] => {
  const remaining = [...pool];
  const selected: string[] = [];
  while (selected.length < count) {
    if (remaining.length === 0) throw new Error(`Pool has fewer than ${count} unique products`);
    selected.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]!);
  }
  return selected;
};

const temperatureModes: NewRecipeServingModeId[] = [
  'temp_minus_11',
  'temp_minus_12',
  'temp_minus_13',
  'fresh',
];
const batchTargets = [400, 500, 750, 1_000, 1_200, 1_500, 2_000];
const resizePairs: Array<[number, number]> = [
  [1_300, 1_000],
  [1_000, 1_500],
  [1_000, 400],
  [2_000, 750],
  [400, 1_200],
];
const targetPairs: Array<[RecipeDirectionTarget, RecipeDirectionTarget]> = [
  [-2, -2],
  [-2, 2],
  [2, -2],
  [2, 2],
  [0, 0],
  [-1, 1],
  [1, -1],
  [-2, 0],
  [0, 2],
  [2, 0],
];

const casesForProfile = (profile: Profile, profileIndex: number): CaseSpec[] => {
  const rows: CaseSpec[] = [];
  for (let crownCount = 1; crownCount <= 5; crownCount += 1) {
    const patterns = mainPatterns[crownCount]!;
    for (let variant = 0; variant < 10; variant += 1) {
      const seed = 2026082600 + profileIndex * 100 + crownCount * 10 + variant;
      const random = mulberry32(seed);
      const randomized = variant >= 8;
      let productKeys = randomized
        ? selectUnique(RANDOM_POOL[profile], crownCount, random)
        : COMPATIBLE[profile].slice(0, crownCount);
      let unknownLast = false;
      let expectation: CaseExpectation = 'feasible';
      if (variant === 2) {
        if (profile === 'Sorbet' || crownCount === 1) {
          unknownLast = true;
          expectation = 'authority_blocked';
        } else {
          productKeys = MIXED[profile].slice(0, crownCount);
          expectation = 'authority_blocked';
        }
      }
      if (variant === 3) {
        unknownLast = true;
        expectation = 'authority_blocked';
      }
      let grams = [...patterns[variant]!];
      if (profile === 'Gelato' && crownCount === 2 && variant === 0) {
        productKeys = ['banana', 'cranberry'];
        grams = [150, 150];
      }
      if (profile === 'Protein' && crownCount === 2 && variant === 0) {
        productKeys = ['banana', 'cranberry'];
        grams = [352, 136];
      }
      if (profile === 'Gelato' && crownCount === 1 && variant === 5) {
        productKeys = ['whisky'];
        grams = [20];
      }
      const [defaultSweetness, defaultHardness] = targetPairs[variant]!;
      const servingMode = randomized
        ? temperatureModes[Math.floor(random() * temperatureModes.length)]!
        : temperatureModes[(variant + crownCount + profileIndex) % temperatureModes.length]!;
      const strategy: Strategy = randomized
        ? random() < 0.5
          ? 'optimal'
          : 'eco'
        : (variant + crownCount) % 2 === 0
          ? 'optimal'
          : 'eco';
      const batchTarget = randomized
        ? batchTargets[Math.floor(random() * batchTargets.length)]!
        : batchTargets[(variant + crownCount + profileIndex) % batchTargets.length]!;
      if (randomized) {
        grams = Array.from({ length: crownCount }, () => {
          const extremes = [1, 2, 5, 10, 25, 50, 100, 150, 200, 300, 400, 600];
          return extremes[Math.floor(random() * extremes.length)]!;
        });
      }
      const resize =
        variant === 6 ? resizePairs[(crownCount + profileIndex) % resizePairs.length] : null;
      const finalTarget = resize?.[1] ?? batchTarget;
      if (grams.reduce((sum, value) => sum + value, 0) > (resize?.[0] ?? finalTarget)) {
        expectation = expectation === 'authority_blocked' ? expectation : 'honest_impossible';
      }
      rows.push({
        runId: `${profile.toUpperCase()}-${crownCount}C-${String(variant + 1).padStart(2, '0')}`,
        randomSeed: seed,
        profile,
        servingMode,
        strategy,
        sweetness: randomized
          ? ((Math.floor(random() * 5) - 2) as RecipeDirectionTarget)
          : defaultSweetness,
        hardness: randomized
          ? ((Math.floor(random() * 5) - 2) as RecipeDirectionTarget)
          : defaultHardness,
        batchTarget: finalTarget,
        ...(resize ? { batchFrom: resize[0] } : {}),
        crownCount,
        productKeys,
        grams,
        lockPattern:
          variant === 4
            ? 'support_one'
            : variant === 5
              ? 'main_one'
              : variant === 7
                ? 'support_multiple'
                : 'none',
        expectation,
        random: randomized,
        ...(unknownLast ? { unknownLast: true } : {}),
      });
    }
  }
  return rows;
};

const buildInput = (spec: CaseSpec): RecipeInput => {
  const inputBatch = spec.batchFrom ?? spec.batchTarget;
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: PROFILE_VISIBLE[spec.profile],
    servingModeId: spec.servingMode,
    formulationStrategy: spec.strategy,
    targetBatchGrams: inputBatch,
  });
  let support = starter.items.map((item) => ({
    ...item,
    ingredient: structuredClone(item.ingredient),
  }));
  if (spec.batchFrom !== undefined) {
    const remaining = inputBatch - spec.grams.reduce((sum, grams) => sum + grams, 0);
    const supportTotal = support.reduce((sum, item) => sum + item.planned_grams, 0);
    if (remaining > 0 && supportTotal > 0) {
      support = support.map((item) => ({
        ...item,
        planned_grams: item.planned_grams * (remaining / supportTotal),
      }));
    }
  }
  const mains = spec.productKeys.map((key, index) => {
    const product = PRODUCT.get(key);
    if (!product) throw new Error(`Unknown campaign product ${key}`);
    const grams = spec.grams[index]!;
    return {
      id: `crown-${index + 1}-${product.mapperId}`,
      ingredient: ingredient(product.mapperId),
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'main' as const,
      main_ratio_weight: grams,
      user_intent_anchor_grams: grams,
    };
  });
  return {
    mode: 'classic',
    category: PROFILE_CATEGORY[spec.profile],
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: inputBatch,
    machine_capacity_grams: null,
    items: [...support, ...mains],
    goals: {
      formulation_strategy: spec.strategy,
      direction_targets_active: true,
      direction_targets: {
        sweetness: spec.sweetness,
        softness: spec.hardness,
        creaminess: 0,
        flavor: 0,
      },
    },
  };
};

const withMainAuthority = (
  snapshot: ProductBehaviorSnapshot,
  product: ProductSpec,
  profile: Profile,
  unknown: boolean,
): ProductBehaviorSnapshot => {
  if (unknown) {
    return {
      ...snapshot,
      familyId: product.family,
      subfamilyId: product.subfamily,
      formId: product.form,
      mainClassification: 'UNKNOWN',
      mainCapability: 'MAIN_UNKNOWN',
      mainAuthority: undefined,
      mainCalibrationLevel: 'NONE',
      moduleEligibility: { ...snapshot.moduleEligibility, MAIN: 'unknown' },
      blockReasons: ['main_authority_unknown_campaign_case'],
    } as ProductBehaviorSnapshot;
  }
  const policy = product.policies[profile];
  if (!policy) {
    return {
      ...snapshot,
      familyId: product.family,
      subfamilyId: product.subfamily,
      formId: product.form,
      behaviorRole: 'MAIN_CAPABLE_UNCALIBRATED',
      mainClassification: 'MAIN_CAPABLE_UNCALIBRATED',
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
      moduleEligibility: { ...snapshot.moduleEligibility, MAIN: 'eligible' },
      blockReasons: [],
    } as ProductBehaviorSnapshot;
  }
  return {
    ...snapshot,
    familyId: policy.family,
    subfamilyId: policy.subfamily,
    formId: policy.form,
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainCapability: 'MAIN_CAPABLE',
    mainAuthority: 'CALIBRATED',
    mainCalibrationLevel:
      policy.policyId.includes('exact') ||
      policy.policyId.includes('protein') ||
      policy.policyId.includes('vegan')
        ? 'EXACT_PRODUCT'
        : 'FAMILY',
    mainPolicyId: policy.policyId,
    mainPolicyVersion: policy.version,
    ecoFloorPercent: policy.floor,
    optimalCeilingPercent: policy.ceiling,
    hardLimitPercent: policy.hard,
    multiMainHardLimitPercent: policy.multiHard,
    mainEquivalentFactor: 1,
    mainBasis: policy.basis,
    requiresLiquidDairyCarrier: policy.carrier,
    liquidDairyCarrierFloorPercent: policy.carrier ? 30 : null,
    moduleEligibility: { ...snapshot.moduleEligibility, MAIN: 'eligible' },
    blockReasons: [],
  } as ProductBehaviorSnapshot;
};

const DAIRY_CARRIER_IDS = new Set([
  'PI-ING-000180',
  'PI-ING-000203',
  'PI-ING-000236',
  'PI-ING-000237',
]);

const snapshotsFor = (
  input: RecipeInput,
  spec: CaseSpec,
): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = productBehaviorTestSnapshots(input);
  for (const item of input.items) {
    const current = snapshots[item.id]!;
    if (DAIRY_CARRIER_IDS.has(canonicalIngredientId(item.ingredient))) {
      snapshots[item.id] = { ...current, approvedLiquidDairyCarrier: true };
    }
  }
  const mains = input.items.filter((item) => item.lock_type === 'main');
  mains.forEach((item, index) => {
    const product = PRODUCT.get(spec.productKeys[index]!)!;
    snapshots[item.id] = withMainAuthority(
      snapshots[item.id]!,
      product,
      spec.profile,
      spec.unknownLast === true && index === mains.length - 1,
    );
  });
  return snapshots;
};

const priceOverrides = (input: RecipeInput): CustomerPriceIndex =>
  Object.fromEntries(
    input.items.map((item) => {
      const id = canonicalIngredientId(item.ingredient);
      return [
        id,
        {
          overrideId: `campaign-price-${id}`,
          ownerUserId: 'crown-campaign-owner',
          canonicalIngredientId: id,
          pricePerKg: item.ingredient.cost_per_kg ?? 5,
          currency: item.ingredient.cost_currency ?? 'EUR',
          createdBy: 'crown-campaign-owner',
          createdAt: AT,
          updatedAt: AT,
        },
      ];
    }),
  );

const constraintsFor = (input: RecipeInput, pattern: LockPattern) => {
  const support = input.items.filter((item) => item.lock_type !== 'main');
  const mains = input.items.filter((item) => item.lock_type === 'main');
  const locked =
    pattern === 'support_one'
      ? support.slice(0, 1)
      : pattern === 'support_multiple'
        ? support.slice(0, 2)
        : pattern === 'main_one'
          ? mains.slice(0, 1)
          : [];
  return {
    byLineId: Object.fromEntries(
      locked.map((item) => [item.id, { mode: 'locked' as const, grams: item.planned_grams }]),
    ),
  };
};

const gramsFor = (input: RecipeInput, lineIds: readonly string[]): number[] =>
  lineIds.map(
    (lineId) => input.items.find((item) => item.id === lineId)?.planned_grams ?? Number.NaN,
  );

const ratioText = (grams: readonly number[]): string => {
  if (grams.length === 0) return '';
  const base = grams[0]!;
  if (!(base > 0)) return grams.join(':');
  return grams.map((value) => Number((value / base).toFixed(6))).join(':');
};

const shareDrift = (expected: readonly number[], actual: readonly number[]): number => {
  const expectedTotal = expected.reduce((sum, value) => sum + value, 0);
  const actualTotal = actual.reduce((sum, value) => sum + value, 0);
  if (!(expectedTotal > 0) || !(actualTotal > 0) || expected.length !== actual.length)
    return Number.POSITIVE_INFINITY;
  return Math.max(
    ...expected.map((value, index) =>
      Math.abs(value / expectedTotal - actual[index]! / actualTotal),
    ),
  );
};

const fingerprint = (input: RecipeInput) => ({
  category: input.category,
  temperature: input.target_temperature_c,
  batch: input.target_batch_grams,
  strategy: input.goals?.formulation_strategy,
  direction: input.goals?.direction_targets,
  items: input.items.map((item) => ({
    id: item.id,
    canonicalId: canonicalIngredientId(item.ingredient),
    grams: item.planned_grams,
    lock: item.lock_type,
    ratio: item.main_ratio_weight ?? null,
  })),
});

const persistAndReopen = async (
  input: RecipeInput,
  snapshots: Record<string, ProductBehaviorSnapshot>,
  runId: string,
): Promise<{ ok: boolean; reason: string }> => {
  let counter = 0;
  const store = new InMemoryRecipes(
    () => `2026-08-26T10:00:${String((counter += 1) % 60).padStart(2, '0')}.000Z`,
    () => `${runId}-${(counter += 1)}`,
  );
  const repo = inMemoryRecipesRepository(store);
  const composition: RecipeCompositionMetadata = {
    schemaVersion: 1,
    baseScope: 'BASE_FORMULATION',
    baseOrder: input.items.map((item) => item.id),
    toppings: [],
    behaviorSnapshots: snapshots,
    migrationAmbiguities: [],
  };
  const created = await repo.createRecipe({
    ownerUserId: 'crown-campaign-owner',
    title: `Crown stress ${runId}`,
    recipeInput: input,
    productComposition: composition,
    trace: TRACE,
    by: 'crown-campaign-owner',
    capabilities: CAPS,
  });
  const reopened = inMemoryRecipesRepository(store);
  const version = await reopened.getVersion(created.recipe.recipeId, 1);
  if (!version) return { ok: false, reason: 'saved version missing on reopen' };
  const equal =
    JSON.stringify(fingerprint(version.recipeInput)) === JSON.stringify(fingerprint(input));
  return { ok: equal, reason: equal ? '' : 'Crown/ratio/profile state changed on reopen' };
};

const previewCode = (built: BuildPreviewResult): string => (built.ok ? 'ok' : built.code);

const classifyRefusal = (
  spec: CaseSpec,
  built: Exclude<BuildPreviewResult, { ok: true }>,
): Classification => {
  // A fixture's expectation is not a feasibility proof.  Class C requires an
  // independently verified legal candidate; a truthful domain refusal without
  // that witness belongs to physics/constraints (A) or missing authority (B).
  // Proven candidates rejected at the Preview/Apply state boundary are
  // classified later as UI_STATE_REGRESSION, so no actual bug is hidden here.
  if (spec.expectation === 'authority_blocked') return 'AUTHORITY_BLOCKED';
  if (
    /missing_prices|substitution_invalid|main_ingredient_unavailable|vegan_ingredient_conflict|missing_required_role/.test(
      built.code,
    )
  ) {
    return 'AUTHORITY_BLOCKED';
  }
  if (built.code === 'product_behavior_invalid') {
    const authorityMissing = (built.productBehaviorIssues ?? []).some((issue) =>
      issue.reasons.some((reason) =>
        /unknown|incompatible|missing|unavailable|not_authorized/.test(reason),
      ),
    );
    return authorityMissing ? 'AUTHORITY_BLOCKED' : 'HONEST_IMPOSSIBLE';
  }
  if (built.code === 'apply_failed' || built.code === 'line_missing') {
    return 'UI_STATE_REGRESSION';
  }
  return 'HONEST_IMPOSSIBLE';
};

const failureReason = (built: BuildPreviewResult): string =>
  built.ok
    ? ''
    : 'messagePl' in built && typeof built.messagePl === 'string'
      ? built.messagePl
      : built.code;

const executeCase = async (
  spec: CaseSpec,
  shouldPersist: boolean,
  suppliedInput?: RecipeInput,
): Promise<ExecutedCase> => {
  const started = performance.now();
  const input = suppliedInput ?? buildInput(spec);
  const snapshots = snapshotsFor(input, spec);
  let proposalSnapshots: typeof snapshots;
  const prices = priceOverrides(input);
  const constraints = constraintsFor(input, spec.lockPattern);
  const mains = captureMainIngredientIntent(input);
  const lineIds = mains.map((main) => main.lineId);
  const inputGrams = gramsFor(input, lineIds);
  const policyLabels = lineIds.map(
    (lineId) => snapshots[lineId]?.mainPolicyId ?? 'USER_HELD/UNKNOWN',
  );
  const bases = lineIds.map((lineId) => snapshots[lineId]?.mainBasis ?? 'NONE');
  const families = lineIds.map((lineId) => snapshots[lineId]?.familyId ?? 'UNKNOWN');
  const hardLimits = lineIds.map((lineId) => snapshots[lineId]?.hardLimitPercent ?? 'NONE');
  let built: BuildPreviewResult;
  let unbound: BuildPreviewResult;
  try {
    unbound =
      spec.batchFrom !== undefined
        ? buildBatchRescalePreview(input, constraints, spec.batchTarget, AT)
        : buildOptimizePreview(input, constraints, AT, {
            effectivePriceOverrides: prices,
            productBehaviorSnapshots: snapshots,
            technicalOnlyMainLineIds: [],
            requirePracticalPreview: true,
          });
    proposalSnapshots = unbound.ok ? snapshotsFor(unbound.preview.proposedInput, spec) : snapshots;
    built = bindProductBehaviorToPreview(unbound, proposalSnapshots, snapshots, []);
  } catch (error) {
    const runtime = Math.round(performance.now() - started);
    const row: LedgerRow = {
      run_id: spec.runId,
      random_seed: spec.randomSeed,
      profile: spec.profile,
      temperature: spec.servingMode === 'fresh' ? 'Fresh' : String(input.target_temperature_c),
      serving_mode: spec.servingMode,
      mode: spec.strategy === 'eco' ? 'ECO' : 'OPTIMAL',
      sweetness: spec.sweetness,
      hardness: spec.hardness,
      batch_target_g: spec.batchTarget,
      input_batch_g: input.target_batch_grams,
      crown_count: spec.crownCount,
      crown_pi_ing_ids: mains.map((main) => main.canonicalIngredientId).join('|'),
      crown_names: mains.map((main) => main.ingredientName).join('|'),
      input_crown_grams: inputGrams.join('|'),
      input_ratio: ratioText(inputGrams),
      individual_main_policies: policyLabels.join('|'),
      main_basis: bases.join('|'),
      family: families.join('|'),
      individual_hard_limits: hardLimits.join('|'),
      derived_shared_group_hard_limit: '',
      engine_result_status: 'EXCEPTION',
      proposed_crown_grams: '',
      output_ratio: '',
      exact_engine_ratio: '',
      whole_gram_ratio: '',
      total_main_percent: '',
      score: '',
      hard_safe: false,
      preview_status: 'EXCEPTION',
      apply_status: 'NOT_ATTEMPTED',
      save_reopen_status: 'NOT_ATTEMPTED',
      refusal_error_code: 'exception',
      largest_non_main_drift: '',
      runtime_ms: runtime,
      classification: 'TIMEOUT_RUNTIME',
      case_expectation: spec.expectation,
      case_kind:
        spec.sequenceStage ??
        (spec.random ? 'randomized' : spec.batchFrom ? 'batch_resize' : spec.lockPattern),
      failure_reason: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
    return { row, input, output: null, snapshots };
  }

  const runtime = Math.round(performance.now() - started);
  if (!built.ok) {
    const classification = classifyRefusal(spec, built);
    const rejectedCandidate = unbound.ok ? unbound.preview.proposedInput : null;
    const rejectedExact =
      unbound.ok && unbound.preview.practicalization?.status === 'ready'
        ? unbound.preview.practicalization.audit.exactInput
        : rejectedCandidate;
    const rejectedGrams = rejectedCandidate ? gramsFor(rejectedCandidate, lineIds) : [];
    const rejectedExactGrams = rejectedExact ? gramsFor(rejectedExact, lineIds) : [];
    const rejectedResult = rejectedCandidate ? calculateRecipe(rejectedCandidate) : null;
    const rejectedHardSafe =
      rejectedCandidate !== null &&
      classifyViolationBands(rejectedCandidate).hardMetrics.length === 0 &&
      Math.abs(plannedSum(rejectedCandidate) - spec.batchTarget) <= 1.5 &&
      rejectedCandidate.items.every((item) => item.planned_grams > 0);
    const rejectedSupport = new Map(
      input.items
        .filter((item) => item.lock_type !== 'main')
        .map((item) => [item.id, item.planned_grams]),
    );
    const rejectedNonMainDrift = rejectedCandidate
      ? rejectedCandidate.items
          .filter((item) => item.lock_type !== 'main' && rejectedSupport.has(item.id))
          .reduce(
            (maximum, item) =>
              Math.max(maximum, Math.abs(item.planned_grams - rejectedSupport.get(item.id)!)),
            0,
          )
      : 0;
    const row: LedgerRow = {
      run_id: spec.runId,
      random_seed: spec.randomSeed,
      profile: spec.profile,
      temperature: spec.servingMode === 'fresh' ? 'Fresh' : String(input.target_temperature_c),
      serving_mode: spec.servingMode,
      mode: spec.strategy === 'eco' ? 'ECO' : 'OPTIMAL',
      sweetness: spec.sweetness,
      hardness: spec.hardness,
      batch_target_g: spec.batchTarget,
      input_batch_g: input.target_batch_grams,
      crown_count: spec.crownCount,
      crown_pi_ing_ids: mains.map((main) => main.canonicalIngredientId).join('|'),
      crown_names: mains.map((main) => main.ingredientName).join('|'),
      input_crown_grams: inputGrams.join('|'),
      input_ratio: ratioText(inputGrams),
      individual_main_policies: policyLabels.join('|'),
      main_basis: bases.join('|'),
      family: families.join('|'),
      individual_hard_limits: hardLimits.join('|'),
      derived_shared_group_hard_limit: '',
      engine_result_status: unbound.ok
        ? (unbound.preview.mainObjective?.status ?? built.code)
        : built.code,
      proposed_crown_grams: rejectedGrams.join('|'),
      output_ratio: ratioText(rejectedGrams),
      exact_engine_ratio: ratioText(rejectedExactGrams),
      whole_gram_ratio: ratioText(rejectedGrams),
      total_main_percent:
        rejectedCandidate === null
          ? ''
          : String(
              Number(
                (
                  (rejectedGrams.reduce((sum, value) => sum + value, 0) / spec.batchTarget) *
                  100
                ).toFixed(4),
              ),
            ),
      score:
        rejectedResult?.scores?.overall === undefined ? '' : String(rejectedResult.scores.overall),
      hard_safe: rejectedHardSafe,
      preview_status: `REFUSED:${built.code}`,
      apply_status: 'NOT_ATTEMPTED',
      save_reopen_status: 'NOT_ATTEMPTED',
      refusal_error_code: built.code,
      largest_non_main_drift:
        rejectedCandidate === null ? '' : String(Number(rejectedNonMainDrift.toFixed(4))),
      runtime_ms: runtime,
      classification,
      case_expectation: spec.expectation,
      case_kind:
        spec.sequenceStage ??
        (spec.random ? 'randomized' : spec.batchFrom ? 'batch_resize' : spec.lockPattern),
      failure_reason: `${failureReason(built)}${
        unbound.ok
          ? ` ${JSON.stringify({
              mainObjective: unbound.preview.mainObjective ?? null,
              diagnosticReason: unbound.preview.diagnosticReason ?? null,
            })}`
          : ''
      }`,
    };
    return { row, input, output: null, snapshots };
  }

  const executable = built.preview.proposedInput;
  const exact =
    built.preview.practicalization?.status === 'ready'
      ? built.preview.practicalization.audit.exactInput
      : executable;
  const exactGrams = gramsFor(exact, lineIds);
  const outputGrams = gramsFor(executable, lineIds);
  const exactIdentity = verifyMainIngredientIdentity(input, exact, constraints.byLineId);
  const executableIdentity = verifyMainIngredientIdentity(input, executable, constraints.byLineId);
  const result = calculateRecipe(executable);
  const hardSafe =
    classifyViolationBands(executable).hardMetrics.length === 0 &&
    Math.abs(plannedSum(executable) - spec.batchTarget) <= 1.5 &&
    executable.items.every((item) => item.planned_grams > 0);
  const locksPreserved = Object.entries(constraints.byLineId).every(([lineId, constraint]) =>
    Object.is(executable.items.find((item) => item.id === lineId)?.planned_grams, constraint.grams),
  );
  const envelope = verifyMainEnvelope({
    recipe: executable,
    snapshots,
    mode: spec.strategy,
    enforceFloor: false,
  });
  const ceiling = mainEnvelopeSearchCeilingGrams({
    recipe: input,
    snapshots,
  });
  const groupHard = envelope.ok
    ? envelope.hardLimitPercent
    : ceiling === null
      ? null
      : (ceiling / spec.batchTarget) * 100;
  let applyStatus = built.preview.diagnosticOnly ? 'NOT_ATTEMPTED_DIAGNOSTIC' : 'NOT_ATTEMPTED';
  let applied: RecipeInput | null = null;
  let appliedSnapshots = snapshots;
  let applyFailure = '';
  if (
    !built.preview.diagnosticOnly &&
    hardSafe &&
    exactIdentity.ok &&
    executableIdentity.ok &&
    locksPreserved
  ) {
    const directionConsent = {
      baseFingerprint: built.preview.baseFingerprint,
      targetFingerprint: directionTargetFingerprint(input),
      candidateFingerprint: workingStateFingerprint(executable, built.preview.nextConstraints),
    };
    const proposalAuthorization = {
      baseFingerprint: built.preview.baseFingerprint,
      proposedFingerprint: workingStateFingerprint(executable, built.preview.nextConstraints),
      baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(snapshots),
      proposedProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(proposalSnapshots),
      snapshots: structuredClone(proposalSnapshots),
    };
    const committed = commitPreview(
      input,
      constraints,
      built.preview,
      '2026-08-26T09:01:00.000Z',
      `apply-${spec.runId}`,
      [],
      undefined,
      null,
      null,
      directionConsent,
      null,
      snapshots,
      [],
      proposalAuthorization,
      null,
      {
        effectivePriceOverrides: prices,
        requirePracticalPreview: true,
      },
    );
    applyStatus = committed.ok ? 'APPLIED' : `REJECTED:${committed.code}`;
    if (committed.ok) {
      applied = committed.verified.input;
      appliedSnapshots = committed.verified.productBehaviorSnapshots;
    } else {
      applyFailure = `${committed.messagePl} ${JSON.stringify({
        mainObjective: built.preview.mainObjective ?? null,
        currentMainGrams: inputGrams.reduce((sum, grams) => sum + grams, 0),
        exactMainGrams: exactGrams.reduce((sum, grams) => sum + grams, 0),
        executableMainGrams: outputGrams.reduce((sum, grams) => sum + grams, 0),
        exactScore: recipeFitForInput(exact, calculateRecipe(exact)).score,
      })}`;
    }
  }

  let saveStatus = 'NOT_SELECTED';
  let persistenceFailure = '';
  if (shouldPersist && applied) {
    const persisted = await persistAndReopen(applied, appliedSnapshots, spec.runId);
    saveStatus = persisted.ok ? 'SAVED_REOPENED' : 'REOPEN_MISMATCH';
    persistenceFailure = persisted.reason;
  }

  let classification: Classification = 'PASS';
  let reason = '';
  if (!exactIdentity.ok || !executableIdentity.ok) {
    classification = 'RATIO_REGRESSION';
    reason = JSON.stringify({
      exactIdentity,
      executableIdentity,
      shareDrift: shareDrift(inputGrams, outputGrams),
    });
  } else if (!hardSafe || !locksPreserved || built.preview.diagnosticOnly) {
    // An unsafe/diagnostic candidate is evidence that this returned vector is
    // not executable, not proof that another legal vector exists. Class C is
    // reserved for an independently verified feasible witness.
    classification = 'HONEST_IMPOSSIBLE';
    reason = JSON.stringify({
      hardSafe,
      locksPreserved,
      diagnosticOnly: built.preview.diagnosticOnly,
      violations: detectViolations(result),
    });
  } else if (!applied) {
    classification = 'UI_STATE_REGRESSION';
    reason = applyFailure || applyStatus;
  } else if (shouldPersist && saveStatus !== 'SAVED_REOPENED') {
    classification = 'PERSISTENCE_REGRESSION';
    reason = persistenceFailure;
  }

  const inputSupport = new Map(
    input.items
      .filter((item) => item.lock_type !== 'main')
      .map((item) => [item.id, item.planned_grams]),
  );
  const nonMainDrift = executable.items
    .filter((item) => item.lock_type !== 'main' && inputSupport.has(item.id))
    .reduce(
      (maximum, item) =>
        Math.max(maximum, Math.abs(item.planned_grams - inputSupport.get(item.id)!)),
      0,
    );

  const row: LedgerRow = {
    run_id: spec.runId,
    random_seed: spec.randomSeed,
    profile: spec.profile,
    temperature: spec.servingMode === 'fresh' ? 'Fresh' : String(executable.target_temperature_c),
    serving_mode: spec.servingMode,
    mode: spec.strategy === 'eco' ? 'ECO' : 'OPTIMAL',
    sweetness: spec.sweetness,
    hardness: spec.hardness,
    batch_target_g: spec.batchTarget,
    input_batch_g: input.target_batch_grams,
    crown_count: spec.crownCount,
    crown_pi_ing_ids: mains.map((main) => main.canonicalIngredientId).join('|'),
    crown_names: mains.map((main) => main.ingredientName).join('|'),
    input_crown_grams: inputGrams.join('|'),
    input_ratio: ratioText(inputGrams),
    individual_main_policies: policyLabels.join('|'),
    main_basis: bases.join('|'),
    family: families.join('|'),
    individual_hard_limits: hardLimits.join('|'),
    derived_shared_group_hard_limit: groupHard === null ? '' : String(Number(groupHard.toFixed(4))),
    engine_result_status: built.preview.mainObjective?.status ?? 'preview_ready',
    proposed_crown_grams: outputGrams.join('|'),
    output_ratio: ratioText(outputGrams),
    exact_engine_ratio: ratioText(exactGrams),
    whole_gram_ratio: ratioText(outputGrams),
    total_main_percent: String(
      Number(
        ((outputGrams.reduce((sum, value) => sum + value, 0) / spec.batchTarget) * 100).toFixed(4),
      ),
    ),
    score: String(result.scores?.overall ?? ''),
    hard_safe: hardSafe,
    preview_status: built.preview.diagnosticOnly ? 'DIAGNOSTIC' : 'READY',
    apply_status: applyStatus,
    save_reopen_status: saveStatus,
    refusal_error_code:
      classification === 'PASS'
        ? ''
        : applyStatus.startsWith('REJECTED:')
          ? applyStatus.slice(9)
          : previewCode(built),
    largest_non_main_drift: String(Number(nonMainDrift.toFixed(4))),
    runtime_ms: runtime,
    classification,
    case_expectation: spec.expectation,
    case_kind:
      spec.sequenceStage ??
      (spec.random ? 'randomized' : spec.batchFrom ? 'batch_resize' : spec.lockPattern),
    failure_reason: reason,
  };
  return { row, input, output: applied ?? executable, snapshots };
};

const CSV_COLUMNS: Array<keyof LedgerRow> = [
  'run_id',
  'random_seed',
  'profile',
  'temperature',
  'serving_mode',
  'mode',
  'sweetness',
  'hardness',
  'batch_target_g',
  'input_batch_g',
  'crown_count',
  'crown_pi_ing_ids',
  'crown_names',
  'input_crown_grams',
  'input_ratio',
  'individual_main_policies',
  'main_basis',
  'family',
  'individual_hard_limits',
  'derived_shared_group_hard_limit',
  'engine_result_status',
  'proposed_crown_grams',
  'output_ratio',
  'exact_engine_ratio',
  'whole_gram_ratio',
  'total_main_percent',
  'score',
  'hard_safe',
  'preview_status',
  'apply_status',
  'save_reopen_status',
  'refusal_error_code',
  'largest_non_main_drift',
  'runtime_ms',
  'classification',
  'case_expectation',
  'case_kind',
  'failure_reason',
];

const csvCell = (value: unknown): string => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const writeLedger = (rows: readonly LedgerRow[]): void => {
  mkdirSync(REPORT_DIR, { recursive: true });
  const csv =
    [
      CSV_COLUMNS.join(','),
      ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')),
    ].join('\n') + '\n';
  if (CASE_PATTERN !== null) {
    writeFileSync(join(REPORT_DIR, 'CROWN_MULTI_MAIN_STRESS_LEDGER_REPLAY.csv'), csv);
    return;
  }
  writeFileSync(join(REPORT_DIR, 'CROWN_MULTI_MAIN_STRESS_LEDGER.csv'), csv);
  writeFileSync(join(REPORT_DIR, `CROWN_MULTI_MAIN_STRESS_LEDGER_${PHASE.toUpperCase()}.csv`), csv);
};

const tally = (rows: readonly LedgerRow[], key: keyof LedgerRow): Record<string, number> =>
  rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[key]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

const markdownTable = (counts: Readonly<Record<string, number>>): string =>
  Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `| ${key} | ${count} |`)
    .join('\n');

const writeSummary = (rows: readonly LedgerRow[]): void => {
  const failures = rows.filter((row) => row.classification !== 'PASS');
  const slowest = [...rows].sort((left, right) => right.runtime_ms - left.runtime_ms)[0]!;
  const worstRatio = rows
    .filter((row) => row.proposed_crown_grams !== '')
    .map((row) => ({
      row,
      drift: shareDrift(
        row.input_crown_grams.split('|').map(Number),
        row.proposed_crown_grams.split('|').map(Number),
      ),
    }))
    .sort((left, right) => right.drift - left.drift)[0];
  const largestFormulation = [...rows].sort(
    (left, right) =>
      Number(right.largest_non_main_drift || 0) - Number(left.largest_non_main_drift || 0),
  )[0]!;
  const profileLines = (Object.keys(PROFILE_CATEGORY) as Profile[])
    .map((profile) => {
      const profileRows = rows.filter((row) => row.profile === profile);
      return `| ${profile} | ${profileRows.length} | ${profileRows.filter((row) => row.classification === 'PASS').length} | ${profileRows.filter((row) => row.classification !== 'PASS').length} |`;
    })
    .join('\n');
  const summary =
    `# Crown / Multi-Main stress summary — ${PHASE}\n\n` +
    `Baseline/phase SHA: ${process.env.CROWN_STRESS_SHA ?? 'read from git closeout'}\n\n` +
    `## Totals\n\n| Profile | Runs | PASS | Non-PASS |\n|---|---:|---:|---:|\n${profileLines}\n\n` +
    `## Classification\n\n| Class | Count |\n|---|---:|\n${markdownTable(tally(rows, 'classification'))}\n\n` +
    `## Extremes\n\n` +
    `- Worst ratio-share drift: ${worstRatio ? worstRatio.drift.toFixed(8) : 'n/a'} (${worstRatio?.row.run_id ?? 'n/a'}).\n` +
    `- Largest non-Main formulation drift: ${largestFormulation.largest_non_main_drift} g (${largestFormulation.run_id}).\n` +
    `- Slowest Preview: ${slowest.runtime_ms} ms (${slowest.run_id}).\n\n` +
    `## Non-PASS by Crown count\n\n| Crown count | Count |\n|---|---:|\n${markdownTable(tally(failures, 'crown_count')) || '| none | 0 |'}\n\n` +
    `## Non-PASS by temperature\n\n| Temperature | Count |\n|---|---:|\n${markdownTable(tally(failures, 'temperature')) || '| none | 0 |'}\n\n` +
    `## Non-PASS by sweetness/hardness\n\n| Pair | Count |\n|---|---:|\n${
      markdownTable(
        failures.reduce<Record<string, number>>((counts, row) => {
          const key = `${row.sweetness}/${row.hardness}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
      ) || '| none | 0 |'
    }\n\n` +
    `## Non-PASS by family\n\n| Family | Count |\n|---|---:|\n${markdownTable(tally(failures, 'family')) || '| none | 0 |'}\n\n` +
    `## Exact non-PASS runs\n\n` +
    (failures.length === 0
      ? 'None.\n'
      : failures
          .map(
            (row) =>
              `- ${row.run_id}: ${row.classification}; input ${row.input_crown_grams || 'n/a'} g → output ${row.proposed_crown_grams || 'none'} g; ${row.refusal_error_code || row.failure_reason}.`,
          )
          .join('\n') + '\n');
  if (CASE_PATTERN !== null) {
    writeFileSync(join(REPORT_DIR, 'CROWN_MULTI_MAIN_STRESS_SUMMARY_REPLAY.md'), summary);
    return;
  }
  writeFileSync(join(REPORT_DIR, 'CROWN_MULTI_MAIN_STRESS_SUMMARY.md'), summary);
  writeFileSync(
    join(REPORT_DIR, `CROWN_MULTI_MAIN_STRESS_SUMMARY_${PHASE.toUpperCase()}.md`),
    summary,
  );
};

const clusterKey = (row: LedgerRow): string => {
  if (row.classification === 'RATIO_REGRESSION') return 'Multi-Main ratio / practicalization';
  if (row.classification === 'PERSISTENCE_REGRESSION') return 'Persistence';
  if (row.classification === 'TIMEOUT_RUNTIME') return 'Timeout / runtime';
  if (row.classification === 'UI_STATE_REGRESSION') return 'Preview / Apply state';
  if (row.refusal_error_code.includes('multi_main_policy'))
    return 'Family or basis incompatibility';
  if (row.refusal_error_code.includes('main_ratio')) return 'Main ratio / constraint conflict';
  if (row.case_kind === 'batch_resize') return 'Batch reduction or expansion';
  if (row.profile === 'Protein') return 'Protein coupled frontier';
  if (row.crown_count === 5) return '5-Crown scaling';
  return `${row.classification}: ${row.refusal_error_code || 'unclassified code'}`;
};

const writeClusters = (rows: readonly LedgerRow[]): void => {
  const failures = rows.filter((row) => row.classification !== 'PASS');
  const clusters = new Map<string, LedgerRow[]>();
  failures.forEach((row) => {
    const key = clusterKey(row);
    clusters.set(key, [...(clusters.get(key) ?? []), row]);
  });
  const ranked = [...clusters.entries()].sort((left, right) => right[1].length - left[1].length);
  const markdown =
    `# Crown / Multi-Main failure clusters — ${PHASE}\n\n` +
    `Ranking order: frequency, severity, shared systemic cause, regression risk.\n\n` +
    (ranked.length === 0
      ? 'No non-PASS clusters.\n'
      : ranked
          .map(
            ([name, cluster], index) =>
              `## ${index + 1}. ${name} (${cluster.length})\n\n` +
              `Classifications: ${[...new Set(cluster.map((row) => row.classification))].join(', ')}.\n\n` +
              `Run IDs: ${cluster.map((row) => row.run_id).join(', ')}.\n\n` +
              cluster
                .map(
                  (row) =>
                    `- ${row.run_id}: ${row.input_crown_grams || 'n/a'} g → ${row.proposed_crown_grams || 'none'} g; ${row.refusal_error_code || row.failure_reason}`,
                )
                .join('\n') +
              '\n',
          )
          .join('\n'));
  writeFileSync(
    join(
      REPORT_DIR,
      CASE_PATTERN === null
        ? 'CROWN_MULTI_MAIN_FAILURE_CLUSTERS.md'
        : 'CROWN_MULTI_MAIN_FAILURE_CLUSTERS_REPLAY.md',
    ),
    markdown,
  );
};

const writeBeforeAfter = (rows: readonly LedgerRow[]): void => {
  if (CASE_PATTERN !== null) return;
  if (PHASE !== 'final') {
    writeFileSync(
      join(REPORT_DIR, 'CROWN_MULTI_MAIN_BEFORE_AFTER.csv'),
      'run_id,before_classification,after_classification,before_output_grams,after_output_grams,before_ratio,after_ratio,changed\n',
    );
    return;
  }
  const baselinePath = join(REPORT_DIR, 'CROWN_MULTI_MAIN_STRESS_LEDGER_BASELINE.csv');
  const baselineGrid = parseCsv(readFileSync(baselinePath, 'utf8'));
  const header = baselineGrid[0]!;
  const index = new Map(header.map((column, position) => [column, position]));
  const before = new Map(
    baselineGrid
      .slice(1)
      .filter((cells) => cells.length > 1)
      .map((cells) => [cells[index.get('run_id')!]!, cells]),
  );
  const columns = [
    'run_id',
    'before_classification',
    'after_classification',
    'before_output_grams',
    'after_output_grams',
    'before_ratio',
    'after_ratio',
    'changed',
  ];
  const output = [columns.join(',')];
  rows.forEach((row) => {
    const prior = before.get(row.run_id);
    const beforeClass = prior?.[index.get('classification')!] ?? '';
    const beforeGrams = prior?.[index.get('proposed_crown_grams')!] ?? '';
    const beforeRatio = prior?.[index.get('whole_gram_ratio')!] ?? '';
    const changed =
      beforeClass !== row.classification ||
      beforeGrams !== row.proposed_crown_grams ||
      beforeRatio !== row.whole_gram_ratio;
    output.push(
      [
        row.run_id,
        beforeClass,
        row.classification,
        beforeGrams,
        row.proposed_crown_grams,
        beforeRatio,
        row.whole_gram_ratio,
        changed,
      ]
        .map(csvCell)
        .join(','),
    );
  });
  writeFileSync(join(REPORT_DIR, 'CROWN_MULTI_MAIN_BEFORE_AFTER.csv'), output.join('\n') + '\n');
};

const checkpoint = (rows: LedgerRow[], row: LedgerRow): void => {
  rows.push(row);
  writeLedger(rows);
  console.log(
    `CROWN_STRESS_PROGRESS ${rows.length}/220 ${row.run_id} ${row.classification} ${row.runtime_ms}ms`,
  );
};

const sequenceSpecs = (profile: Profile, profileIndex: number): CaseSpec[] => {
  const products = COMPATIBLE[profile].slice(0, 3);
  const base: CaseSpec = {
    runId: `${profile.toUpperCase()}-SESSION-01`,
    randomSeed: 2026082990 + profileIndex,
    profile,
    servingMode: 'temp_minus_11',
    strategy: 'optimal',
    sweetness: 0,
    hardness: 0,
    batchTarget: 1_000,
    crownCount: 3,
    productKeys: products,
    grams: [100, 200, 300],
    lockPattern: 'support_one',
    expectation: 'feasible',
    random: false,
    sequenceStage: 'session_recalculate',
  };
  return [
    base,
    {
      ...base,
      runId: `${profile.toUpperCase()}-SESSION-02`,
      sweetness: 2,
      sequenceStage: 'session_sweetness',
    },
    {
      ...base,
      runId: `${profile.toUpperCase()}-SESSION-03`,
      sweetness: 2,
      hardness: -2,
      sequenceStage: 'session_hardness',
    },
    {
      ...base,
      runId: `${profile.toUpperCase()}-SESSION-04`,
      servingMode: 'temp_minus_13',
      sweetness: 2,
      hardness: -2,
      sequenceStage: 'session_temperature',
    },
    {
      ...base,
      runId: `${profile.toUpperCase()}-SESSION-05`,
      servingMode: 'temp_minus_13',
      sweetness: 2,
      hardness: -2,
      batchTarget: 1_500,
      batchFrom: 1_000,
      sequenceStage: 'session_batch',
    },
  ];
};

describe('GELLATTI v1.6 Crown / Multi-Main stress campaign', () => {
  it(`runs the complete ${PHASE} campaign and preserves the evidence ledger`, async () => {
    const rows: LedgerRow[] = [];
    const persistenceCounts: Record<Profile, number> = {
      Gelato: 0,
      Sorbet: 0,
      Vegan: 0,
      Protein: 0,
    };

    for (const [profileIndex, profile] of (Object.keys(PROFILE_CATEGORY) as Profile[]).entries()) {
      const specs = casesForProfile(profile, profileIndex).filter(
        (spec) => CASE_PATTERN === null || CASE_PATTERN.test(spec.runId),
      );
      for (const spec of specs) {
        const shouldPersist = persistenceCounts[profile] < 10 && spec.expectation === 'feasible';
        const executed = await executeCase(spec, shouldPersist);
        checkpoint(rows, executed.row);
        if (executed.row.save_reopen_status === 'SAVED_REOPENED') persistenceCounts[profile] += 1;
      }

      const stages = sequenceSpecs(profile, profileIndex).filter(
        (spec) => CASE_PATTERN === null || CASE_PATTERN.test(spec.runId),
      );
      let current: RecipeInput | undefined;
      for (const stage of stages) {
        let stageInput = current;
        if (stageInput) {
          const targetTemperature = stage.servingMode === 'temp_minus_13' ? -13 : -11;
          stageInput = {
            ...stageInput,
            target_temperature_c: targetTemperature,
            goals: {
              ...stageInput.goals,
              formulation_strategy: stage.strategy,
              direction_targets_active: true,
              direction_targets: {
                sweetness: stage.sweetness,
                softness: stage.hardness,
                creaminess: 0,
                flavor: 0,
              },
            },
          };
          if (stage.sequenceStage === 'session_batch') {
            stageInput = { ...stageInput, target_batch_grams: stage.batchFrom! };
          }
        }
        const executed = await executeCase(stage, false, stageInput);
        checkpoint(rows, executed.row);
        current = executed.output ?? stageInput;
      }
    }

    writeLedger(rows);
    writeSummary(rows);
    writeClusters(rows);
    writeBeforeAfter(rows);

    if (CASE_PATTERN !== null) {
      expect(rows.length, `selective replay ${CASE_PATTERN_TEXT}`).toBeGreaterThan(0);
      const actualRegressions = rows.filter((row) =>
        [
          'SOLVER_FAILURE',
          'RATIO_REGRESSION',
          'PERSISTENCE_REGRESSION',
          'TIMEOUT_RUNTIME',
          'UI_STATE_REGRESSION',
        ].includes(row.classification),
      );
      expect(
        actualRegressions,
        `Actual regression run IDs: ${actualRegressions.map((row) => row.run_id).join(', ')}`,
      ).toHaveLength(0);
      return;
    }

    const baseRows = rows.filter((row) => !row.run_id.includes('-SESSION-'));
    for (const profile of Object.keys(PROFILE_CATEGORY) as Profile[]) {
      const profileRows = baseRows.filter((row) => row.profile === profile);
      expect(profileRows, `${profile} executed cases`).toHaveLength(50);
      expect(new Set(profileRows.map((row) => row.crown_count))).toEqual(new Set([1, 2, 3, 4, 5]));
      expect(new Set(profileRows.map((row) => row.serving_mode))).toEqual(
        new Set(temperatureModes),
      );
      expect(new Set(profileRows.map((row) => row.sweetness))).toEqual(new Set([-2, -1, 0, 1, 2]));
      expect(new Set(profileRows.map((row) => row.hardness))).toEqual(new Set([-2, -1, 0, 1, 2]));
      expect(new Set(profileRows.map((row) => row.mode))).toEqual(new Set(['OPTIMAL', 'ECO']));
      expect(profileRows.filter((row) => row.case_kind === 'randomized')).toHaveLength(10);
      expect(
        persistenceCounts[profile],
        `${profile} successful Save/Reopen cases`,
      ).toBeGreaterThanOrEqual(10);
    }

    const actualRegressions = rows.filter((row) =>
      [
        'SOLVER_FAILURE',
        'RATIO_REGRESSION',
        'PERSISTENCE_REGRESSION',
        'TIMEOUT_RUNTIME',
        'UI_STATE_REGRESSION',
      ].includes(row.classification),
    );
    expect(
      actualRegressions,
      `Actual regression run IDs: ${actualRegressions.map((row) => row.run_id).join(', ')}`,
    ).toHaveLength(0);
  });
});
