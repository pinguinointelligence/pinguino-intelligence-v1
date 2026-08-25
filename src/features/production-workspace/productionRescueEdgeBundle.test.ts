/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeInput } from '@/engine';
import { assessProductionRescue as assessCanonical } from './productionRescue';
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

describe('generated canonical Production Rescue Edge bundle', () => {
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
      productionRescue: 'production-rescue-v2',
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
