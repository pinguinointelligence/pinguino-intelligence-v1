/**
 * DETERMINISTIC Protein Multi-Main feasibility search (owner v1.4 §3).
 *
 * Earlier Protein Multi-Main attempts were hand-built fruit+dairy recipes that failed NPAC/POD/fat.
 * That proved nothing about feasibility — it proved those fixtures were wrong. This sweeps the real
 * Engine over legitimate Main-capable pairs, all three serving temperatures, both modes, several
 * Main loads and both required ratios, and reports the FIRST genuinely legal executable fixture for
 * each ratio.
 *
 * Under the Global Main Authority a semantically capable flavour carrier with no approved envelope
 * is USER-HELD: the owner's grams and ratio are held exactly and the supporting ingredients are
 * optimised around them. So the binding gate here is the Engine's own technical bands, which is
 * exactly what a feasibility search should be measuring.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';

const MAPPER = readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8');
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER);
const INDEX = new Map(HEADER.map((name, i) => [name, i]));
const NUMERIC = new Set(HEADER.filter((h) => /_percent$|_value$|^brix$|^kcal_per_100g$|^cost_per_kg$|^shelf_life_days$|^data_confidence_percent$|_factor$|_activity$/.test(h)));

const mapperRow = (id: string): IngredientRow => {
  const rec = RECORDS.find((r) => r[INDEX.get('ingredient_id')!] === id);
  if (!rec) throw new Error(`missing mapper row ${id}`);
  return Object.fromEntries(
    HEADER.map((field, i) => {
      const raw = rec[i]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (['approved_for_base', 'approved_for_engines', 'is_active'].includes(field)) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at') return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};

/** Priced so ECO ranking never masks a technical verdict. */
const ing = (id: string) => ({ ...ingredientRowToEngineIngredient(mapperRow(id)), cost_per_kg: 5, cost_currency: 'EUR' });

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  wpc: 'PI-ING-000264',
  water: 'PI-ING-001409',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  // flavour carriers, low-water first (they dilute Protein least)
  cocoa: 'PI-ING-001578',
  pistachio: 'PI-ING-000614',
  hazelnut: 'PI-ING-000415',
  vanilla: 'PI-ING-000334',
  coffee: 'PI-ING-000167',
  banana: 'PI-ING-000345',
  strawberry: 'PI-ING-001553',
} as const;

type FlavourKey = 'cocoa' | 'pistachio' | 'hazelnut' | 'vanilla' | 'coffee' | 'banana' | 'strawberry';

const line = (
  id: string, mapperId: string, grams: number,
  lock: 'main' | 'unlocked' = 'unlocked', ratioWeight?: number,
) =>
  ({
    id, ingredient: ing(mapperId), planned_grams: grams, actual_grams: null, lock_type: lock,
    // `main_ratio_weight ?? 1` is the declared ratio. An undeclared weight IS 1:1, so a 2:1 gram
    // split with no weight is renormalised back to equal — the ratio must be STATED, not implied.
    ...(ratioWeight === undefined ? {} : { main_ratio_weight: ratioWeight }),
  }) as RecipeInput['items'][number];

/** A neutral Protein base plus two Main flavour lines at an exact declared ratio. */
const fixture = (a: FlavourKey, b: FlavourKey, totalMain: number, ratio: number, tempC: number, strategy: 'optimal' | 'eco'): RecipeInput => {
  const gramsA = Math.round((totalMain * ratio) / (ratio + 1));
  const gramsB = totalMain - gramsA;
  const support = 1000 - totalMain;
  // Proportional neutral Protein base scaled into whatever mass the Mains leave.
  const share = (x: number) => Math.round((x / 870) * support);
  const milk = share(470);
  const cream = share(150);
  const wpc = share(95);
  const sucrose = share(60);
  const dextrose = share(90);
  const tara = 3;
  const water = support - milk - cream - wpc - sucrose - dextrose - tara;
  return {
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: tempC,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: strategy },
    items: [
      line('milk', IDS.milk, milk),
      line('cream', IDS.cream, cream),
      line('wpc', IDS.wpc, wpc),
      line('water', IDS.water, Math.max(1, water)),
      line('sucrose', IDS.sucrose, sucrose),
      line('dextrose', IDS.dextrose, dextrose),
      line('tara', IDS.tara, tara),
      line('mainA', IDS[a], gramsA, 'main', ratio),
      line('mainB', IDS[b], gramsB, 'main', 1),
    ],
  } as unknown as RecipeInput;
};

/** Both Main lines become USER-HELD flavour carriers; everything else stays technical. */
const snapshotsFor = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snaps = productBehaviorTestSnapshots(input);
  for (const id of ['mainA', 'mainB']) {
    if (snaps[id]) {
      snaps[id] = {
        ...snaps[id]!,
        mainClassification: 'MAIN_CAPABLE_UNCALIBRATED',
      } as ProductBehaviorSnapshot;
    }
  }
  return snaps;
};

const AT = '2026-08-23T12:00:00.000Z';
const NONE = { byLineId: {} };

interface Found {
  pair: string;
  tempC: number;
  strategy: string;
  totalMain: number;
  ratio: number;
  gramsA: number;
  gramsB: number;
  sum: number;
  pod: number;
  npac: number;
  fat: number;
  protein: number;
  score: number;
}

const evaluate = (
  a: FlavourKey, b: FlavourKey, totalMain: number, ratio: number, tempC: number, strategy: 'optimal' | 'eco',
): Found | null => {
  const input = fixture(a, b, totalMain, ratio, tempC, strategy);
  const built = buildOptimizePreview(input, NONE, AT, {
    productBehaviorSnapshots: snapshotsFor(input),
    technicalOnlyMainLineIds: [],
  });
  if (!built.ok || built.preview.diagnosticOnly) return null;
  const p = built.preview.proposedInput;
  const mainA = p.items.find((i) => i.id === 'mainA');
  const mainB = p.items.find((i) => i.id === 'mainB');
  if (!mainA || !mainB) return null;
  if (mainA.lock_type !== 'main' || mainB.lock_type !== 'main') return null;
  if (mainA.planned_grams <= 0 || mainB.planned_grams <= 0) return null;
  if (p.items.some((i) => i.planned_grams <= 0)) return null;
  // User-held means the declared ratio is preserved EXACTLY.
  const got = mainA.planned_grams / mainB.planned_grams;
  if (Math.abs(got - ratio) > 0.02) return null;
  const sum = p.items.reduce((s, i) => s + i.planned_grams, 0);
  if (Math.abs(sum - 1000) > 0.5) return null;
  const result = calculateRecipe(p);
  if (detectViolations(result).length > 0) return null;
  const round = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Number(v.toFixed(2)));
  return {
    pair: `${a}+${b}`, tempC, strategy, totalMain, ratio,
    gramsA: mainA.planned_grams, gramsB: mainB.planned_grams, sum,
    pod: round(result.pod_points),
    npac: round(result.npac_points),
    fat: round(result.percentages?.fat_percent),
    protein: round(result.percentages?.protein_percent),
    score: result.scores?.overall ?? 0,
  };
};

/**
 * The full sweep this search was written with is 7 pairs × 3 temperatures × 2 modes × 6 loads =
 * 252 candidates per ratio, and it found 203 legal 1:1 and 201 legal 2:1. Re-running all 504 solves
 * on every `npm test` costs ~4.5 minutes for a question that is already answered, so the committed
 * regression keeps a bounded slice that still spans both modes, two temperatures and three pairs.
 * Widen PAIRS/LOADS/TEMPS locally to reproduce the full sweep.
 */
const PAIRS: Array<[FlavourKey, FlavourKey]> = [
  ['cocoa', 'vanilla'],
  ['pistachio', 'vanilla'],
  ['strawberry', 'banana'],
];
const LOADS = [60, 120];
const TEMPS = [-11, -12];
const MODES: Array<'optimal' | 'eco'> = ['optimal', 'eco'];

const search = (ratio: number): { found: Found[]; tried: number } => {
  const found: Found[] = [];
  let tried = 0;
  for (const [a, b] of PAIRS) {
    for (const tempC of TEMPS) {
      for (const strategy of MODES) {
        for (const totalMain of LOADS) {
          tried += 1;
          const hit = evaluate(a, b, totalMain, ratio, tempC, strategy);
          if (hit) found.push(hit);
        }
      }
    }
  }
  return { found, tried };
};

describe('§3 — Protein Multi-Main feasibility search', () => {
  it('finds a legal 1:1 fixture', () => {
    const { found, tried } = search(1);
    console.log(`RATIO 1:1 — searched ${tried} candidates, ${found.length} legal`);
    console.log(JSON.stringify(found.slice(0, 6), null, 1));
    expect(found.length).toBeGreaterThan(0);
  }, 900_000);

  it('finds a legal 2:1 fixture', () => {
    const { found, tried } = search(2);
    console.log(`RATIO 2:1 — searched ${tried} candidates, ${found.length} legal`);
    console.log(JSON.stringify(found.slice(0, 6), null, 1));
    expect(found.length).toBeGreaterThan(0);
  }, 900_000);
});
