import { describe, expect, it } from 'vitest';
import {
  SERVING_MODES,
  SERVING_MODE_ORDER,
  approvedMassForMode,
  isNinjaMode,
  servingModeById,
  temperatureForMode,
  type ServingModeId,
} from './servingMode';
import {
  createCustomerFlow,
  resolveBatch,
  resolveProductType,
  resolveServingRoute,
  selectServingMode,
  setProductType,
} from './customerFlow';
import type { CustomerProductType } from './types';

const DIRECT: ServingModeId[] = ['temp_minus_11', 'temp_minus_12', 'temp_minus_13', 'fresh'];

describe('serving mode matrix — EXACTLY six owner-approved modes', () => {
  it('exposes exactly the six modes in stable order', () => {
    expect(SERVING_MODE_ORDER).toEqual([
      'temp_minus_11',
      'temp_minus_12',
      'temp_minus_13',
      'fresh',
      'ninja_gelato',
      'ninja_swirl',
    ]);
    expect(SERVING_MODES).toHaveLength(6);
  });

  it('routes each visible mode to the correct EXISTING temperature cell', () => {
    expect(temperatureForMode('temp_minus_11')).toBe(-11);
    expect(temperatureForMode('temp_minus_12')).toBe(-12);
    expect(temperatureForMode('temp_minus_13')).toBe(-13);
    expect(temperatureForMode('fresh')).toBe(-11); // Świeże → −11
    expect(temperatureForMode('ninja_gelato')).toBe(-13);
    expect(temperatureForMode('ninja_swirl')).toBe(-11);
  });

  it('carries ONLY the owner-approved Ninja masses (700 / 480)', () => {
    expect(approvedMassForMode('ninja_gelato')).toBe(700);
    expect(approvedMassForMode('ninja_swirl')).toBe(480);
    for (const id of DIRECT) expect(approvedMassForMode(id)).toBeNull();
  });

  it('has no −18, no arbitrary custom temperature, and no stale Ninja aliases', () => {
    for (const m of SERVING_MODES) expect([-11, -12, -13]).toContain(m.temperatureC);
    for (const stale of ['freezer_minus_18', 'deep18', 'custom', 'displayFresh', 'ninja', 'ninja_creami', 'ninja_deluxe', 'ninja_2']) {
      expect(servingModeById(stale)).toBeNull();
      expect(isNinjaMode(stale)).toBe(false);
    }
  });

  it('only the two Ninja modes are machine modes', () => {
    expect(isNinjaMode('ninja_gelato')).toBe(true);
    expect(isNinjaMode('ninja_swirl')).toBe(true);
    for (const id of DIRECT) expect(isNinjaMode(id)).toBe(false);
  });
});

describe('mode × product-profile routing — profile from INTENT, temperature from MODE', () => {
  const build = (type: CustomerProductType, mode: ServingModeId, text = 'wanilia') => {
    let s = createCustomerFlow({ text });
    s = setProductType(s, type);
    s = selectServingMode(s, mode);
    return s;
  };
  const route = (s: ReturnType<typeof build>) => ({
    profile: resolveProductType(s).internalProfile,
    visibleType: resolveProductType(s).userFacingType,
    temp: resolveServingRoute(s).temperatureC,
    mass: resolveBatch(s).batchGrams,
  });

  it('Standard Gelato: Świeże→−11, Ninja Gelato→−13/700, Ninja Swirl→−11/480', () => {
    expect(route(build('gelato', 'fresh'))).toMatchObject({ profile: 'standard_gelato', temp: -11 });
    expect(route(build('gelato', 'ninja_gelato'))).toMatchObject({ profile: 'standard_gelato', temp: -13, mass: 700 });
    expect(route(build('gelato', 'ninja_swirl'))).toMatchObject({ profile: 'standard_gelato', temp: -11, mass: 480 });
  });

  it('Chocolate intent stays visible Gelato but routes chocolate_gelato internally', () => {
    const choc = (mode: ServingModeId) => build('gelato', mode, 'gelato czekoladowe');
    for (const mode of ['fresh', 'ninja_gelato', 'ninja_swirl'] as const) {
      expect(route(choc(mode)).visibleType).toBe('gelato');
      expect(route(choc(mode)).profile).toBe('chocolate_gelato');
    }
    expect(route(choc('ninja_gelato'))).toMatchObject({ temp: -13, mass: 700 });
    expect(route(choc('ninja_swirl'))).toMatchObject({ temp: -11, mass: 480 });
    expect(route(choc('fresh')).temp).toBe(-11);
  });

  it('Sorbet keeps its profile across modes (never silently Standard Gelato)', () => {
    expect(route(build('sorbet', 'ninja_gelato'))).toMatchObject({ profile: 'sorbet', temp: -13, mass: 700 });
    expect(route(build('sorbet', 'ninja_swirl'))).toMatchObject({ profile: 'sorbet', temp: -11, mass: 480 });
    expect(route(build('sorbet', 'fresh'))).toMatchObject({ profile: 'sorbet', temp: -11 });
  });

  it('Vegan keeps its profile across modes and never falls back to Standard Gelato', () => {
    expect(route(build('vegan', 'ninja_gelato'))).toMatchObject({ profile: 'vegan_gelato', temp: -13, mass: 700 });
    expect(route(build('vegan', 'ninja_swirl'))).toMatchObject({ profile: 'vegan_gelato', temp: -11, mass: 480 });
    expect(route(build('vegan', 'fresh')).profile).not.toBe('standard_gelato');
  });

  it('Protein has no supported Engine profile — stays unsupported, never routed to Standard Gelato', () => {
    let s = createCustomerFlow();
    s = setProductType(s, 'protein');
    s = selectServingMode(s, 'ninja_gelato');
    const r = resolveProductType(s);
    expect(r.status).toBe('unsupported');
    expect(r.internalProfile).toBeNull();
    expect(r.internalProfile).not.toBe('standard_gelato');
  });
});
