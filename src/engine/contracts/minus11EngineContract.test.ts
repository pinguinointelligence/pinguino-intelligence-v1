/**
 * −11°C Engine Contract — drift guards (Slice 1A.5).
 *
 * Pins the read-only contract to its canonical sources so it can never silently
 * fork from the engine or make an unsupported claim. Numeric values are asserted
 * equal to src/engine/config/*; the engine label and reference-recipe names are
 * asserted equal to the data-layer source (src/data/engines.ts) and the committed
 * −11°C diagnostic fixtures. No engine behavior is exercised — this is a contract.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVE_ENGINE, ENGINES } from '@/data/engines';
import { MODES } from '../config/modes';
import { GOLDEN_MIDDLE_PRIORITY } from '../config/priorities';
import { IDEAL_ZONE_FRACTION, TARGET_BANDS } from '../config/targets';
import { CONFIG_VERSION, ENGINE_VERSION } from '../config/version';
import {
  externalReferenceChocolate123,
  externalReferenceRaspberry428,
} from '../__fixtures__/externalReference';
import type { ProductMode } from '../types';
import { MINUS_11_ENGINE_CONTRACT as CONTRACT } from './minus11EngineContract';

/** The exact active label, built from codepoints: U+2212 (minus) + 11 + U+00B0 (°) C Engine. */
const LABEL_MINUS_11_ENGINE = '−11°C Engine';

describe('−11°C Engine Contract — drift guards', () => {
  it('versions mirror the canonical engine/config versions', () => {
    expect(CONTRACT.version.engine_version).toBe(ENGINE_VERSION);
    expect(CONTRACT.version.config_version).toBe(CONFIG_VERSION);
  });

  it('contract revision is 1A.6', () => {
    expect(CONTRACT.contract_revision).toBe('1A.6');
  });

  it('active engine label is exactly "−11°C Engine" (U+2212 minus, not ASCII hyphen)', () => {
    expect(CONTRACT.engine_label).toBe(ACTIVE_ENGINE.label);
    expect(CONTRACT.engine_label).toBe(LABEL_MINUS_11_ENGINE);
    expect(CONTRACT.engine_label.codePointAt(0)).toBe(0x2212); // leading char is U+2212
    expect(CONTRACT.engine_label.includes('-')).toBe(false); // no ASCII hyphen anywhere
  });

  it('scope is −11°C only and matches the active engine temperature', () => {
    expect(CONTRACT.scope).toBe('minus_11c_only');
    expect(CONTRACT.temperature_c).toBe(-11);
    expect(CONTRACT.validated_temperatures_c).toEqual([-11]);
    expect(ACTIVE_ENGINE.target_temperature_c).toBe(-11);
  });

  it('does not claim −10 / −12 / −13 / −18°C are validated', () => {
    for (const t of [-10, -12, -13, -18]) {
      expect(CONTRACT.validated_temperatures_c).not.toContain(t);
    }
  });

  it('exactly one active engine; all other temperature engines remain future', () => {
    expect(ENGINES.filter((e) => e.status === 'active')).toHaveLength(1);
    const others = ENGINES.filter((e) => e.id !== ACTIVE_ENGINE.id);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((e) => e.status === 'future')).toBe(true);
  });

  it('milk-gelato −11°C band mirrors the seeded target band exactly', () => {
    const band = TARGET_BANDS.find((b) => b.category === 'milk_gelato' && b.temperature_c === -11);
    expect(band).toBeDefined();
    expect(CONTRACT.milk_gelato_minus_11_band).toEqual(band!.metrics);
  });

  it('priority order mirrors GOLDEN_MIDDLE_PRIORITY exactly (order included)', () => {
    expect(CONTRACT.priority_order).toEqual(GOLDEN_MIDDLE_PRIORITY);
  });

  it('ideal-zone fraction mirrors the engine constant', () => {
    expect(CONTRACT.ideal_zone_fraction).toBe(IDEAL_ZONE_FRACTION);
  });

  it('hero protection mirrors MODES — Premium/Signature protect, ECO/Classic do not', () => {
    for (const mode of ['eco', 'classic', 'premium', 'signature'] as const satisfies readonly ProductMode[]) {
      expect(CONTRACT.hero_protected_by_mode[mode]).toBe(MODES[mode].main_ingredient.reduce_forbidden);
    }
    expect(CONTRACT.hero_protected_by_mode.premium).toBe(true);
    expect(CONTRACT.hero_protected_by_mode.signature).toBe(true);
    expect(CONTRACT.hero_protected_by_mode.eco).toBe(false);
    expect(CONTRACT.hero_protected_by_mode.classic).toBe(false);
  });

  it('reference recipes mirror the committed −11°C diagnostic fixtures', () => {
    const names = CONTRACT.reference_recipes.map((r) => r.name);
    expect(names).toContain(externalReferenceChocolate123.name);
    expect(names).toContain(externalReferenceRaspberry428.name);
    for (const recipe of CONTRACT.reference_recipes) {
      expect(recipe.temperature_c).toBe(-11);
    }
  });
});
