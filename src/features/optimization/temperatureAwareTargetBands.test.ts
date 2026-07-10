/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectTargetBand } from '@/engine';
import {
  compareEngineVsShadowBands,
  shadowTargetBands,
  SHADOW_BAND_SOURCE,
} from './temperatureAwareTargetBands';
import type { ProductProfile, ServingTemperatureC } from '@/spine';

const cmp = (p: string, t: number) => compareEngineVsShadowBands(p, t);
const npacOf = (p: string, t: number) => cmp(p, t).comparisons.find((c) => c.metric === 'npac')!;

describe('shadowTargetBands', () => {
  it('exposes the regulator bands per profile × temperature, labelled shadow', () => {
    const s = shadowTargetBands('standard_gelato', -12)!;
    expect(s.source).toBe(SHADOW_BAND_SOURCE);
    expect(s.npacBand).toEqual([42, 50]);
    expect(s.regulatorProfile).toBe('standard_gelato_temperature_regulator');
  });

  it('chocolate protein-share stays advisory (never hard); sorbet/vegan disable dairy gates', () => {
    const c = shadowTargetBands('chocolate_gelato', -13)!;
    expect(c.advisoryGates).toContain('protein_share_in_solids');
    expect(c.hardGates).not.toContain('protein_share_in_solids');
    expect(shadowTargetBands('sorbet', -12)!.hardGates).not.toContain('lactose');
    expect(shadowTargetBands('vegan_gelato', -13)!.hardGates).not.toContain('lactose');
  });

  it('returns null for an unsupported profile or temperature', () => {
    expect(shadowTargetBands('granita', -12)).toBeNull();
    expect(shadowTargetBands('standard_gelato', -18)).toBeNull();
  });
});

describe('compareEngineVsShadowBands', () => {
  it('Standard Gelato −11 is aligned (no fallback) and near-aligned on NPAC', () => {
    const c = cmp('standard_gelato', -11);
    expect(c.status).toBe('aligned');
    expect(c.solverTargetsCorrectBand).toBe(true);
    expect(c.engineTemperatureFallback).toBe(false);
    expect(c.engineCategoryFallback).toBe(false);
    // engine −11 npac [33,42] vs regulator −11 [33,43] → tiny center delta (near-aligned)
    const npac = npacOf('standard_gelato', -11);
    expect(npac.engineBand).toEqual([33, 42]);
    expect(npac.shadowBand).toEqual([33, 43]);
    expect(npac.centerDelta!).toBeLessThanOrEqual(1);
  });

  // CONFIG 0.6.0 flipped the acceptance oracle: the 11 previously-divergent
  // cells now select their own seeded engine bands (transcribed from the same
  // locked regulator docs), so the comparison reports ALIGNED with exact
  // band equality — precisely the migration success criterion from
  // docs/engine/TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md §4.

  it('Standard Gelato −12 is ALIGNED — the engine band IS the regulator band (CONFIG 0.6.0)', () => {
    const c = cmp('standard_gelato', -12);
    expect(c.status).toBe('aligned');
    expect(c.solverTargetsCorrectBand).toBe(true);
    expect(c.engineTemperatureFallback).toBe(false);
    expect(c.warnings).not.toContain('engine_uses_temperature_fallback_band');
    expect(c.warnings).not.toContain('solver_not_targeting_regulator_band');
    const npac = npacOf('standard_gelato', -12);
    expect(npac.engineBand).toEqual([42, 50]);
    expect(npac.shadowBand).toEqual([42, 50]);
    expect(npac.centerDelta).toBe(0);
    expect(npac.aligned).toBe(true);
  });

  it('Standard Gelato −13 is ALIGNED with exact NPAC band equality (CONFIG 0.6.0)', () => {
    const c = cmp('standard_gelato', -13);
    expect(c.status).toBe('aligned');
    const npac = npacOf('standard_gelato', -13);
    expect(npac.engineBand).toEqual([48, 55]);
    expect(npac.shadowBand).toEqual([48, 55]);
    expect(npac.centerDelta).toBe(0);
  });

  it('Chocolate −13 is ALIGNED on its own chocolate band — no category fallback (CONFIG 0.6.0)', () => {
    const c = cmp('chocolate_gelato', -13);
    expect(c.status).toBe('aligned');
    expect(c.engineCategoryFallback).toBe(false);
    expect(c.warnings).not.toContain('engine_uses_category_fallback_band');
    const npac = npacOf('chocolate_gelato', -13);
    expect(npac.engineBand).toEqual([49, 57]);
    expect(npac.shadowBand).toEqual([49, 57]);
    // the ONE deliberate residual: protein-share stays advisory — the engine
    // band uses the locked hard-minimum 7 (regulator advisory band is [8,13])
    const protein = c.comparisons.find((x) => x.metric === 'protein_share_in_solids')!;
    expect(protein.engineBand).toEqual([7, 13]);
    expect(protein.shadowBand).toEqual([8, 13]);
    expect(protein.aligned).toBe(false);
  });

  it('Sorbet −12 is ALIGNED on its own band; shadow carries no dairy hard gate (CONFIG 0.6.0)', () => {
    const c = cmp('sorbet', -12);
    expect(c.status).toBe('aligned');
    expect(c.engineCategoryFallback).toBe(false);
    expect(npacOf('sorbet', -12).engineBand).toEqual([42, 49]);
    expect(shadowTargetBands('sorbet', -12)!.hardGates).not.toContain('lactose_sanding');
  });

  it('Vegan −13 is ALIGNED on its own band with no dairy hard gate (CONFIG 0.6.0)', () => {
    const c = cmp('vegan_gelato', -13);
    expect(c.status).toBe('aligned');
    expect(c.engineCategoryFallback).toBe(false);
    expect(npacOf('vegan_gelato', -13).engineBand).toEqual([50, 64]);
    expect(shadowTargetBands('vegan_gelato', -13)!.hardGates).not.toContain('lactose');
  });

  it('unsupported profile / temperature is reported, never remapped', () => {
    expect(cmp('granita', -12).status).toBe('unsupported_profile');
    expect(cmp('standard_gelato', -18).status).toBe('unsupported_temperature');
  });

  it('provides a target-only NPAC simulation (the clean center the solver would aim at)', () => {
    // regulator −13 clean center [51.5,53.2] → 52.35
    expect(cmp('standard_gelato', -13).wouldTargetNpacCenter!).toBeCloseTo(52.35, 1);
  });

  it('never mutates the engine TARGET_BANDS (config read-only)', () => {
    const before = selectTargetBand('milk_gelato', -11)!.band.metrics.npac;
    const snapshot = JSON.stringify(before);
    compareEngineVsShadowBands('standard_gelato', -12);
    compareEngineVsShadowBands('chocolate_gelato', -13);
    const after = selectTargetBand('milk_gelato', -11)!.band.metrics.npac;
    expect(JSON.stringify(after)).toBe(snapshot);
    expect(after).toEqual({ min: 33, max: 42 });
  });

  it('is deterministic', () => {
    expect(JSON.stringify(cmp('chocolate_gelato', -13))).toBe(JSON.stringify(cmp('chocolate_gelato', -13)));
  });
});

describe('temperatureAwareTargetBands — boundary (shadow only, no live engine mutation)', () => {
  const src = readFileSync(join(import.meta.dirname, 'temperatureAwareTargetBands.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('reads the engine only via the public barrel (selectTargetBand), never deep imports', () => {
    expect(/from\s+['"]@\/engine['"]/.test(src)).toBe(true);
    expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(src)).toBe(false);
    expect(src.includes('selectTargetBand')).toBe(true);
  });

  it('never imports or mutates the live TARGET_BANDS / calculateRecipe, no DB / Mapper / save', () => {
    expect(/import[^;]*TARGET_BANDS/.test(src)).toBe(false); // reads via selectTargetBand, not the raw config
    expect(/TARGET_BANDS\s*[.[]|TARGET_BANDS\s*=/.test(src)).toBe(false);
    expect(src.includes('calculateRecipe')).toBe(false);
    expect(/supabase|service_role|@\/services\/|@\/data\/products|mapper_basement/.test(src)).toBe(false);
    expect(/saveRecipe|persistRecipe|\.save\(/.test(src)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]/.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});

// A trivial reference so the ProductProfile/ServingTemperatureC imports are used (compile-time doc).
const _typecheck: ProductProfile[] = ['standard_gelato', 'chocolate_gelato', 'sorbet', 'vegan_gelato'];
const _temps: ServingTemperatureC[] = [-11, -12, -13];
void _typecheck;
void _temps;
