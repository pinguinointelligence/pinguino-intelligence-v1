/**
 * One place that turns a corpus recipe into an executable Vegan RecipeInput.
 *
 * Compositions are read from the immutable Mapper at run time — never authored —
 * and the prices are the owner's real persisted MOJA CENA values, so ECO does not
 * dead-end on `missing_prices`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineIngredient, RecipeDirectionTarget, RecipeInput } from '@/engine';
import { parseCsv } from '@/lib/csv';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { CustomerPriceIndex } from '@/features/pro-core/effectiveRecipePricing';
import { VEGAN_INTERNET_CORPUS, type CorpusRecipe } from './veganInternetCorpus';

const TRI = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (v: string, col: string): string | number | boolean | null => {
  if (v === '') return null;
  if (TRI.has(col)) return v.toLowerCase();
  if (v.toLowerCase() === 'true') return true;
  if (v.toLowerCase() === 'false') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

const grid = parseCsv(
  readFileSync(join(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;

export const MAPPER = new Map<string, IngredientRow>(
  grid
    .slice(1)
    .filter((c) => c.some((x) => x.trim() !== ''))
    .map((cells) => {
      const row = Object.fromEntries(
        header.map((h, i) => [h, cell(cells[i] ?? '', h)]),
      ) as unknown as IngredientRow;
      return [row.ingredient_id, row] as const;
    }),
);

export const ingredientOf = (id: string): EngineIngredient => {
  const row = MAPPER.get(id);
  if (!row) throw new Error(`Missing Mapper article ${id}`);
  return ingredientRowToEngineIngredient(row);
};

const owner = (id: string, eur: number) =>
  [
    id,
    {
      overrideId: `owner-${id}`,
      ownerUserId: 'qa',
      canonicalIngredientId: id,
      pricePerKg: eur,
      currency: 'EUR',
      createdBy: 'owner',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    },
  ] as const;

/** Owner MOJA CENA actually persisted for the owner account (verified in the DB). */
export const OWNER_PRICES: CustomerPriceIndex = Object.fromEntries([
  owner('PI-ING-000163', 5.0),
  owner('PI-ING-001565', 5.0),
  owner('PI-ING-000456', 9.0),
  owner('PI-ING-000492', 13.0),
  owner('PI-ING-001409', 1.0),
  owner('PI-ING-000514', 0.53),
  owner('PI-ING-000494', 1.48),
]);

/** Normalise a sourced formulation to a 1000 g batch. */
export const toVeganInput = (
  recipe: CorpusRecipe,
  temperature: -11 | -12 | -13,
  strategy: 'optimal' | 'eco',
  direction?: { sweetness: RecipeDirectionTarget; softness: RecipeDirectionTarget },
): RecipeInput => {
  const raw = recipe.lines.reduce((s, l) => s + l.grams, 0);
  const scale = 1000 / raw;
  return {
    mode: 'classic',
    category: 'vegan_gelato',
    target_temperature_c: temperature,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    items: recipe.lines.map((line, index) => ({
      id: `${recipe.id}-${index}-${line.mapperId}`,
      ingredient: ingredientOf(line.mapperId),
      planned_grams: Math.max(1, Math.round(line.grams * scale)),
      actual_grams: null,
      lock_type: line.role === 'main' ? ('main' as const) : ('unlocked' as const),
    })),
    goals: {
      formulation_strategy: strategy,
      ...(direction
        ? {
            direction_targets_active: true,
            direction_targets: {
              ...direction,
              creaminess: 0 as RecipeDirectionTarget,
              flavor: 0 as RecipeDirectionTarget,
            },
          }
        : {}),
    },
  };
};

/** Same builder addressed by corpus id, for focused repros. */
export const buildVeganCampaignInput = (
  recipeId: string,
  temperature: -11 | -12 | -13,
  strategy: 'optimal' | 'eco',
  direction?: { sweetness: RecipeDirectionTarget; softness: RecipeDirectionTarget },
): RecipeInput => {
  const recipe = VEGAN_INTERNET_CORPUS.find((r) => r.id === recipeId);
  if (!recipe) throw new Error(`Unknown corpus recipe ${recipeId}`);
  return toVeganInput(recipe, temperature, strategy, direction);
};

export const TEMPS = [-11, -12, -13] as const;
export const MODES = ['optimal', 'eco'] as const;
export const AXES = [-2, -1, 0, 1, 2] as const;
export const EMPTY = { byLineId: {} } as const;
export const AT = '2026-08-23T00:00:00.000Z';

export const byId = (id: string): CorpusRecipe => {
  const recipe = VEGAN_INTERNET_CORPUS.find((r) => r.id === id);
  if (!recipe) throw new Error(`Unknown corpus recipe ${id}`);
  return recipe;
};

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Writes a campaign evidence matrix into `reports/`. */
export const writeCsv = (file: string, head: string[], rows: unknown[][]) =>
  writeFileSync(
    join(process.cwd(), 'reports', file),
    [head.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n',
  );
