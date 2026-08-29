/// <reference types="node" />
/**
 * GELLATTI full-application acceptance — shared matrix support.
 *
 * QA-only module. It composes the SAME runtime authorities the served
 * application uses: the canonical new-recipe starter, the real staging
 * ProductBehavior resolver (`resolve_product_behavior_v1`), the real
 * Preview/Apply doors and the real persistence adapter. Nothing here changes
 * formulation science — it only drives it and records what happened.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RecipeInput, RecipeDirectionTarget } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { parseCsv } from '@/lib/csv';
import type { NewRecipeServingModeId } from '@/features/recipes/newRecipeStarter';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import type { CustomerPriceIndex } from '@/features/pro-core/effectiveRecipePricing';

export const STAGING_URL = process.env.QA_SUPABASE_URL ?? 'https://tunabqqrwabacxjcxxkz.supabase.co';
export const STAGING_ANON =
  process.env.QA_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bmFicXFyd2FiYWN4amN4eGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NjYzOTYsImV4cCI6MjA5OTQ0MjM5Nn0.hP1D4Jdq163okiyZBrmdRLyFMhJRZti0ekUR3mW4fjw';
export const QA_EMAIL = process.env.QA_EMAIL ?? 'test1@test1.com';
export const QA_PASSWORD = process.env.QA_PASSWORD ?? '123456';

export type Profile = 'Gelato' | 'Sorbet' | 'Vegan' | 'Protein';
export type Strategy = 'optimal' | 'eco';

export const PROFILE_VISIBLE = {
  Gelato: 'gelato',
  Sorbet: 'sorbet',
  Vegan: 'vegan',
  Protein: 'protein',
} as const;

export const PROFILE_CATEGORY: Record<Profile, RecipeInput['category']> = {
  Gelato: 'milk_gelato',
  Sorbet: 'sorbet',
  Vegan: 'vegan_gelato',
  Protein: 'protein_gelato',
};

export const SERVING_MODES: readonly NewRecipeServingModeId[] = [
  'fresh',
  'temp_minus_11',
  'temp_minus_12',
  'temp_minus_13',
];

export const DIRECTION_STEPS: readonly RecipeDirectionTarget[] = [-2, -1, 0, 1, 2];

/* ---------------- Mapper articles (canonical identities only) -------------- */

const TRI_STATE = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (raw: string, field: string): string | number | boolean | null => {
  const value = raw.trim();
  if (value === '') return null;
  if (TRI_STATE.has(field)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};

const grid = parseCsv(
  readFileSync(join(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
export const MAPPER = new Map<string, IngredientRow>(
  grid.slice(1).map((cells) => {
    const row = Object.fromEntries(
      header.map((field, index) => [field, cell(cells[index] ?? '', field)]),
    ) as unknown as IngredientRow;
    return [row.ingredient_id, row] as const;
  }),
);

export const mapperIngredient = (mapperId: string) => {
  const row = MAPPER.get(mapperId);
  if (!row) throw new Error(`Missing Mapper article ${mapperId}`);
  return ingredientRowToEngineIngredient(row);
};

export const mapperName = (mapperId: string): string =>
  String(MAPPER.get(mapperId)?.ingredient_name_display ?? mapperId);

/* ---------------- Deterministic rotation pools ---------------------------- */

/** Real canonical articles, grouped by the classes the acceptance brief names.
 *  Every id exists in `mapper_basement.csv`; nothing is invented. */
export const ROTATION: Record<Profile, readonly string[]> = {
  Gelato: [
    'PI-ING-000171', // CONDENSED MILK 7.5% — dairy
    'PI-ING-000496', // FRUCTOSE — sweetener
    'PI-ING-001249', // CACAO Elenka — cocoa
    'PI-ING-000407', // HAZELNUT CHUNKS — nut
    'PI-ING-000306', // VITACEL CITRUS FIBER — fiber
    'PI-ING-000343', // APPLE fresh — fruit
    'PI-ING-000087', // DARK CHOCOLATE 55% — chocolate
    'PI-ING-001347', // CHICKEN EGG WHITE DRIED — egg product
  ],
  Sorbet: [
    'PI-ING-000496', // FRUCTOSE
    'PI-ING-000342', // APPLE puree
    'PI-ING-000339', // MANGO CHATO puree
    'PI-ING-000306', // VITACEL CITRUS FIBER
    'PI-ING-000341', // ACAI BERRIES
    'PI-ING-001249', // CACAO
  ],
  Vegan: [
    'PI-ING-000451', // PEA PROTEIN
    'PI-ING-000496', // FRUCTOSE
    'PI-ING-000146', // COCONUT FLAKES
    'PI-ING-000410', // CASHEW paste
    'PI-ING-000306', // VITACEL CITRUS FIBER
    'PI-ING-000343', // APPLE fresh
    'PI-ING-001249', // CACAO
  ],
  Protein: [
    'PI-ING-000450', // RICE PROTEIN
    'PI-ING-000451', // PEA PROTEIN
    'PI-ING-000496', // FRUCTOSE
    'PI-ING-000343', // APPLE fresh
    'PI-ING-000306', // VITACEL CITRUS FIBER
    'PI-ING-001249', // CACAO
  ],
};

/** Sorbet needs a user-chosen fruit Main (the starter is
 *  `blocked_missing_user_main`, 600 g). Real fresh/frozen articles with
 *  zero or near-zero salt so the Sorbet freezing authority stays available. */
export const SORBET_MAINS: readonly string[] = [
  'PI-ING-000406', // WILD STRAWBERRY · Fresh Fruit
  'PI-ING-000359', // RASPBERRY · Frozen Fruit
  'PI-ING-000343', // APPLE · Fresh Fruit
  'PI-ING-000385', // PEACH · Fresh Fruit
  'PI-ING-000347', // BLUEBERRY · Fresh Fruit
  'PI-ING-000405', // WATERMELON · Fresh Fruit
];

/** TOPPING_ONLY articles — `canonicalProductRole` refuses them in BASE_RECIPE,
 *  so they may only ever be added after production. */
export const TOPPINGS: readonly string[] = [
  'PI-ING-001567', // OREO SMALL CRUSHED COOKIE · bakery_inclusion
  'PI-ING-001221', // GRANELLA Stella · decorative_inclusion
  'PI-ING-001634', // APRICOT · Master Martini Variegato
  'PI-ING-001640', // LIME · Master Martini Variegato
  'PI-ING-001974', // LAY'S CLASSIC SALTED · confectionery_inclusion
  'PI-ING-001680', // PERA ZENZERO · Stella Variegato
];

/** BASE_AND_TOPPING articles — the same identity may legally take part in the
 *  Base formulation *and* be added as a post-process topping. All vegan-safe
 *  so the Vegan profile can use the same rotation. */
export const BASE_AND_TOPPING: readonly string[] = [
  'PI-ING-000087', // DARK CHOCOLATE 55% · Master Martini Couverture · chocolate
  'PI-ING-000407', // HAZELNUT CHUNKS · Gotta Paste · nut
  'PI-ING-000146', // COCONUT FLAKES · coconut
  'PI-ING-001249', // CACAO · Elenka Cocoa
  'PI-ING-000089', // BITTER CHOCOLATE POWER 80% · Callebaut Couverture
  'PI-ING-000408', // BRAZIL NUTS DRIED · nut
];

export const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ---------------- Real staging ProductBehavior authority ------------------- */

export interface StagingSession {
  client: SupabaseClient;
  accountId: string;
}

export async function signInStagingQa(): Promise<StagingSession> {
  const client = createClient(STAGING_URL, STAGING_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });
  if (error || !data.user) throw new Error(`QA sign-in failed: ${error?.message ?? 'no user'}`);
  return { client, accountId: data.user.id };
}

type BehaviorKey = string;
const behaviorCache = new Map<BehaviorKey, unknown>();

export interface BehaviorContext {
  accountId: string;
  productProfile: RecipeInput['category'];
  temperatureC: -11 | -12 | -13;
  mode: Strategy;
  processScope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
  requestedRole: 'STANDARD' | 'MAIN';
  module: string;
}

/** One real `resolve_product_behavior_v1` call, memoised by its exact context. */
export async function resolveRealBehavior(
  session: StagingSession,
  mapperId: string,
  context: BehaviorContext,
): Promise<unknown> {
  const key = [
    mapperId,
    context.productProfile,
    context.temperatureC,
    context.mode,
    context.processScope,
    context.requestedRole,
    context.module,
  ].join('|');
  const cached = behaviorCache.get(key);
  if (cached !== undefined) return cached;
  const { data, error } = await session.client.rpc('resolve_product_behavior_v1', {
    p_entity_kind: 'mapper',
    p_entity_id: mapperId,
    p_context: context,
  });
  if (error) throw new Error(`resolve_product_behavior_v1(${mapperId}): ${error.message}`);
  behaviorCache.set(key, data);
  return data;
}

export const behaviorCacheSize = (): number => behaviorCache.size;

/* ---------------- Price index (customer prices are not the subject) -------- */

export const priceIndexFor = (input: RecipeInput, at: string): CustomerPriceIndex =>
  Object.fromEntries(
    input.items.map((item) => {
      const id = canonicalIngredientId(item.ingredient);
      return [
        id,
        {
          overrideId: `acceptance-price-${id}`,
          ownerUserId: 'gellatti-acceptance',
          canonicalIngredientId: id,
          pricePerKg: item.ingredient.cost_per_kg ?? 5,
          currency: item.ingredient.cost_currency ?? 'EUR',
          createdBy: 'gellatti-acceptance',
          createdAt: at,
          updatedAt: at,
        },
      ];
    }),
  );

/* ---------------- Snapshot merge: real authority over the line ------------- */

/** Overlay the real server verdict onto the structural snapshot for a line.
 *  Structure (lineId/processScope/facts) stays local; every *authority* field
 *  — eligibility, Main capability/policy, block reasons — comes from staging. */
export function withServerAuthority(
  base: ProductBehaviorSnapshot,
  resolved: unknown,
): ProductBehaviorSnapshot {
  if (resolved === null || typeof resolved !== 'object') return base;
  const server = resolved as Record<string, unknown>;
  const pick = <T>(key: string, fallback: T): T =>
    server[key] === undefined || server[key] === null ? fallback : (server[key] as T);
  const mainPolicy = (server.mainPolicy ?? null) as Record<string, unknown> | null;
  return {
    ...base,
    familyId: pick('familyId', base.familyId),
    subfamilyId: pick('subfamilyId', base.subfamilyId),
    formId: pick('formId', base.formId),
    verificationState: pick('verificationState', base.verificationState),
    mainClassification: pick('mainClassification', base.mainClassification),
    mainCapability: pick('mainCapability', (base as unknown as Record<string, unknown>).mainCapability),
    mainAuthority: pick('mainAuthority', (base as unknown as Record<string, unknown>).mainAuthority),
    mainCalibrationLevel: pick(
      'mainCalibrationLevel',
      (base as unknown as Record<string, unknown>).mainCalibrationLevel,
    ),
    mainPolicyId: (mainPolicy?.policyId as string | undefined) ?? base.mainPolicyId,
    mainPolicyVersion: (mainPolicy?.version as string | undefined) ?? base.mainPolicyVersion,
    ecoFloorPercent: (mainPolicy?.ecoFloorPercent as number | undefined) ?? base.ecoFloorPercent,
    optimalCeilingPercent:
      (mainPolicy?.optimalCeilingPercent as number | undefined) ?? base.optimalCeilingPercent,
    hardLimitPercent: (mainPolicy?.hardLimitPercent as number | undefined) ?? base.hardLimitPercent,
    multiMainHardLimitPercent:
      (mainPolicy?.multiMainHardLimitPercent as number | undefined) ??
      (base as unknown as Record<string, unknown>).multiMainHardLimitPercent,
    mainEquivalentFactor:
      (mainPolicy?.mainEquivalentFactor as number | undefined) ?? base.mainEquivalentFactor,
    mainBasis: (mainPolicy?.basis as ProductBehaviorSnapshot['mainBasis']) ?? base.mainBasis,
    moduleEligibility: {
      ...base.moduleEligibility,
      ...((server.moduleEligibility as Record<string, string> | undefined) ?? {}),
    },
    blockReasons: (server.blockReasons as string[] | undefined) ?? base.blockReasons,
    warnings: (server.warnings as ProductBehaviorSnapshot['warnings']) ?? base.warnings,
  } as ProductBehaviorSnapshot;
}
