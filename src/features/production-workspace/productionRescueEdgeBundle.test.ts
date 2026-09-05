/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeInput } from '@/engine';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { assessProductionRescue as assessCanonical } from './productionRescue';
import { productionTestComposition } from './productionTestComposition.fixture';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from './productionSession';
import {
  CONFIG_VERSION,
  ENGINE_VERSION,
  PRACTICAL_RECIPE_MODEL_VERSION,
  PRODUCTION_RESCUE_MODEL_VERSION,
  assessProductionRescue as assessGenerated,
} from '../../../supabase/functions/_shared/generated/productionRescueEngine.bundle.mjs';

const generatedDir = join(process.cwd(), 'supabase/functions/_shared/generated');
const manifest = JSON.parse(
  readFileSync(join(generatedDir, 'productionRescueEngine.manifest.json'), 'utf8'),
) as {
  bundler: { version: string };
  versions: Record<string, string | number>;
  bundle: { sha256: string; externalImports: number; dynamicImports: number };
  sourceClosureSha256: string;
  sourceClosure: Array<{ path: string; sha256: string }>;
};
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

const input: RecipeInput = {
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: 'classic',
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};

const make = () =>
  createProductionSession({
    sessionId: 'edge-bundle-parity',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe',
      recipeVersionId: 'version',
      recipeVersionNumber: 1,
      recipeName: 'Milk base',
    },
    plannedInput: input,
    plannedComposition: productionTestComposition(input),
    startedAt: '2026-08-19T00:00:00.000Z',
  });

const deviation = (query: string, delta: number) => {
  const session = make();
  const line = session.lines.find((candidate) => candidate.name.toLowerCase().includes(query))!;
  return confirmProductionLine(
    setDraftActualGrams(session, line.lineId, line.plannedGrams + delta),
    line.lineId,
    '2026-08-19T00:01:00.000Z',
  );
};

const exactP0DextroseDeviation = () => {
  const rows = [
    ['milk', 'PI-ING-000236', 613],
    ['cream', 'PI-ING-000180', 176],
    ['smp', 'PI-ING-000270', 48],
    ['sucrose', 'PI-ING-000514', 95],
    ['dextrose', 'PI-ING-000494', 64],
    ['tara', 'PI-ING-000492', 4],
  ] as const;
  const plannedInput: RecipeInput = {
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    goals: {
      formulation_strategy: 'optimal',
      cost_priority: 'balanced',
      flavor_intensity: 'balanced',
      direction_targets_active: true,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
    items: rows.map(([id, mapperId, plannedGrams]) => ({
      id,
      ingredient: sorbetMapperIngredient(mapperId),
      planned_grams: plannedGrams,
      actual_grams: null,
      lock_type: 'unlocked' as const,
    })),
  };
  let session = createProductionSession({
    sessionId: 'edge-bundle-exact-p0',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe-p0',
      recipeVersionId: 'version-p0',
      recipeVersionNumber: 1,
      recipeName: 'P0 score authority',
    },
    plannedInput,
    plannedComposition: productionTestComposition(plannedInput),
    startedAt: '2026-08-27T21:00:00.000Z',
  });
  for (const [index, line] of session.lines.entries()) {
    session = confirmProductionLine(
      setDraftActualGrams(
        session,
        line.lineId,
        line.lineId === 'dextrose' ? 65 : line.plannedGrams,
      ),
      line.lineId,
      `2026-08-27T21:${String(index + 1).padStart(2, '0')}:00.000Z`,
    );
  }
  return session;
};

describe('generated canonical Production Rescue Edge bundle', () => {
  it('matches canonical Recipe/Rescue for the exact served Dextrose 64 → 65 g incident', () => {
    const session = exactP0DextroseDeviation();
    const canonical = assessCanonical(session);
    const generated = assessGenerated(session);
    const restore = generated.options.find(({ id }) => id === 'restore_original_recipe');

    expect(generated).toEqual(canonical);
    expect(restore).toBeDefined();
    expect(restore!.candidateInput.items.map((item) => item.planned_grams)).toEqual([
      622.6, 178.8, 48.8, 96.5, 65, 4.1,
    ]);
    expect(
      restore!.candidateInput.items.every((item) => Number.isInteger(item.planned_grams * 10)),
    ).toBe(true);
    expect(restore!.finalMassG).toBeCloseTo(1_015.8, 9);
    expect(restore!.scoreDisplay).toBe('10/10');
  });

  it('pins all formula/config/orchestration identities', () => {
    expect({
      engine: ENGINE_VERSION,
      config: CONFIG_VERSION,
      practicalRecipe: PRACTICAL_RECIPE_MODEL_VERSION,
      productionRescue: PRODUCTION_RESCUE_MODEL_VERSION,
    }).toEqual({
      engine: '0.4.0',
      config: '0.7.0',
      practicalRecipe: 'pro-whole-gram-v1',
      productionRescue: 'production-rescue-v8',
    });
    expect(manifest.bundler.version).toBe('1.0.3');
    expect(manifest.versions.productionSessionSchema).toBe(2);
  });

  it('has no external/dynamic imports and contains only the audited pure closure', () => {
    expect(manifest.bundle.externalImports).toBe(0);
    expect(manifest.bundle.dynamicImports).toBe(0);
    expect(
      manifest.sourceClosure.some(
        (item) => item.path === 'src/features/production-workspace/productionRescue.ts',
      ),
    ).toBe(true);
    expect(
      manifest.sourceClosure.some(
        (item) =>
          item.path.startsWith('node_modules/') ||
          item.path.startsWith('src/stores/') ||
          item.path.startsWith('src/services/') ||
          item.path.endsWith('.tsx'),
      ),
    ).toBe(false);
    const generator = readFileSync(
      join(process.cwd(), 'scripts/buildProductionRescueEdgeBundle.mjs'),
      'utf8',
    );
    expect(generator).toContain('EXPECTED_SOURCE_CLOSURE');
    expect(generator).toContain('source closure changed without review');
  });

  it('matches every source file and emitted bundle hash', () => {
    for (const source of manifest.sourceClosure) {
      expect(hash(readFileSync(join(process.cwd(), source.path)))).toBe(source.sha256);
    }
    const closure = manifest.sourceClosure
      .map((source) => `${source.path}:${source.sha256}`)
      .join('\n');
    expect(hash(closure)).toBe(manifest.sourceClosureSha256);
    expect(hash(readFileSync(join(generatedDir, 'productionRescueEngine.bundle.mjs')))).toBe(
      manifest.bundle.sha256,
    );
  });

  it.each([
    ['exact', make()],
    ['sucrose +2', deviation('sucrose', 2)],
    ['sucrose +50', deviation('sucrose', 50)],
    ['cream +25', deviation('cream', 25)],
    ['milk +80', deviation('milk 3.5', 80)],
  ])('is byte-equivalent to canonical source for %s', (_name, session) => {
    expect(JSON.stringify(assessGenerated(session))).toBe(JSON.stringify(assessCanonical(session)));
  });
});
