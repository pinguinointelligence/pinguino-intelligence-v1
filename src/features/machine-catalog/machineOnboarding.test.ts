/**
 * Machine onboarding (§8) — starter tiles, the "Nie widzę mojej maszyny"
 * behavior question (plain language → technology, honest unsupported state
 * for continuous soft serve) and the §8.4 custom-machine contract
 * (user_declared, ml-internal storage, conservative FLAGGED fallback).
 */
import { describe, expect, it } from 'vitest';
import { MACHINE_CATALOG } from './machineCatalogData';
import { HOME_BATCH_RULE_VERSION } from './homeBatchRule';
import {
  MACHINE_BEHAVIOR_ANSWERS,
  MACHINE_ONBOARDING_TILES,
  behaviorAnswerById,
  buildCustomMachineProfile,
  resolveBehaviorAnswer,
  volumeInputToMl,
  type CustomMachineInput,
} from './machineOnboarding';
import {
  deriveMachineSetup,
  isMachineActivatable,
  validateHomeMachineProfile,
} from './machineDerivation';

/* ------------------------------------------------------------------ */
/* §8.2 — starter tiles                                                */
/* ------------------------------------------------------------------ */

describe('§8.2 starter tiles', () => {
  it('shows the spec family list in order, ending with "Nie widzę mojej maszyny"', () => {
    expect(MACHINE_ONBOARDING_TILES.map((t) => t.label)).toEqual([
      'Ninja CREAMi',
      'Ninja CREAMi Deluxe',
      'Ninja CREAMi Scoop & Swirl',
      'Moulinex Freezi',
      'Sage / Breville Smart Scoop',
      'Magimix Gelato Expert',
      'Cuisinart ICE-100',
      'KitchenAid Ice Cream Maker',
      'Cuisinart z misą chłodzoną',
      'Nie widzę mojej maszyny',
    ]);
    const last = MACHINE_ONBOARDING_TILES[MACHINE_ONBOARDING_TILES.length - 1];
    expect(last?.kind).toBe('not_listed');
    expect(last?.catalogIds).toEqual([]);
  });

  it('every family tile points at existing catalog records', () => {
    const known = new Set(MACHINE_CATALOG.map((p) => p.id));
    for (const tile of MACHINE_ONBOARDING_TILES) {
      if (tile.kind !== 'catalog_family') continue;
      expect(tile.catalogIds.length).toBeGreaterThan(0);
      for (const id of tile.catalogIds) {
        expect(known.has(id), `${tile.id} → ${id}`).toBe(true);
      }
    }
  });

  it('model disambiguation exists ONLY where capacity/technology differs (frozen-bowl Cuisinarts)', () => {
    const multi = MACHINE_ONBOARDING_TILES.filter((t) => t.catalogIds.length > 1);
    expect(multi.map((t) => t.id)).toEqual(['tile-cuisinart-frozen-bowl']);
    expect(multi[0]?.catalogIds).toEqual(['cuisinart-ice21e-eu', 'cuisinart-ice30bce-eu']);
  });
});

/* ------------------------------------------------------------------ */
/* §8.3 — behavior question                                            */
/* ------------------------------------------------------------------ */

describe('§8.3 "Nie widzę mojej maszyny" — behavior, not jargon', () => {
  it('offers exactly the four plain-language answers with the spec mapping', () => {
    expect(MACHINE_BEHAVIOR_ANSWERS.map((a) => [a.id, a.answer, a.technology])).toEqual([
      ['freeze_mixture_first', 'Najpierw zamrażam całą mieszankę', 'respin'],
      ['machine_cools_itself', 'Maszyna sama chłodzi mieszankę', 'compressor'],
      ['freeze_bowl_first', 'Najpierw zamrażam tylko misę', 'frozen_bowl'],
      ['soft_serve_dispenser', 'Maszyna wydaje miękkie lody z dozownika', 'continuous_soft_serve'],
    ]);
  });

  it('never asks the user about "re-spin", "kompresor" or "frozen bowl"', () => {
    for (const a of MACHINE_BEHAVIOR_ANSWERS) {
      const visible = `${a.answer} ${a.helper}`.toLowerCase();
      expect(visible).not.toMatch(/re-?spin|kompresor|compressor|frozen\s*bowl/);
    }
  });

  it('supported answers resolve to EXISTING visible modes', () => {
    expect(resolveBehaviorAnswer('freeze_mixture_first')).toEqual({
      outcome: 'supported',
      technology: 'respin',
      visibleMode: 'ninja_gelato',
    });
    expect(resolveBehaviorAnswer('machine_cools_itself')).toEqual({
      outcome: 'supported',
      technology: 'compressor',
      visibleMode: 'fresh',
    });
    expect(resolveBehaviorAnswer('freeze_bowl_first')).toEqual({
      outcome: 'supported',
      technology: 'frozen_bowl',
      visibleMode: 'fresh',
    });
  });

  it('the soft-serve dispenser answer maps to an HONEST unsupported state (never Ninja Swirl)', () => {
    expect(resolveBehaviorAnswer('soft_serve_dispenser')).toEqual({
      outcome: 'unsupported_for_home',
      technology: 'continuous_soft_serve',
      reasonCode: 'continuous_soft_serve_not_home_supported',
    });
  });

  it('unknown answer ids resolve to null (no guessing)', () => {
    expect(behaviorAnswerById('spin_dry')).toBeNull();
    expect(behaviorAnswerById(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* §8.4 — custom machine                                               */
/* ------------------------------------------------------------------ */

describe('§8.4 custom machine — ml-internal, user_declared, conservative fallback', () => {
  const base: CustomMachineInput = {
    behaviorAnswerId: 'machine_cools_itself',
    market: 'ES',
    brand: 'Acme',
    model: 'Gelatiera 2000',
    vesselCapacity: { value: 1.5, unit: 'l' },
    hasMaxFillLine: true,
    manufacturerMaxMix: { value: 900, unit: 'ml' },
  };

  it('stores volumes internally in ml (l → ml is a VOLUME conversion, never grams)', () => {
    expect(volumeInputToMl({ value: 1.4, unit: 'l' })).toBe(1400);
    expect(volumeInputToMl({ value: 480, unit: 'ml' })).toBe(480);
    expect(volumeInputToMl({ value: 0, unit: 'l' })).toBeNull();
    expect(volumeInputToMl({ value: -1, unit: 'ml' })).toBeNull();
    expect(volumeInputToMl({ value: Number.NaN, unit: 'ml' })).toBeNull();
    expect(volumeInputToMl(null)).toBeNull();
  });

  it('builds a valid, activatable user_declared profile from full data', () => {
    const result = buildCustomMachineProfile(base);
    if (result.outcome !== 'profile') throw new Error('expected a profile');
    const { profile } = result;
    expect(profile.specificationSource).toBe('user_declared');
    expect(profile.specificationStatus).toBe('provisional'); // never 'verified'
    expect(profile.market).toBe('ES');
    expect(profile.brand).toBe('Acme');
    expect(profile.modelCodes).toEqual(['Gelatiera 2000']);
    expect(profile.technology).toBe('compressor');
    expect(profile.resolvedVisibleMode).toBe('fresh');
    expect(profile.capacity.vesselCapacityMl).toBe(1500);
    expect(profile.capacity.maximumLiquidMixMl).toBe(900);
    expect(profile.capacity.maxFillDefinedByManufacturer).toBe(true);
    expect(result.capacityFallback).toBeNull();
    expect(validateHomeMachineProfile(profile)).toEqual([]);
    expect(isMachineActivatable(profile)).toBe(true);
    // The user-reported manual max mix (900 ml) drives the recommendation via
    // the owner rule (× 0.95 → 860 g), marked ESTIMATED for user-declared data.
    expect(deriveMachineSetup(profile).batchSuggestion).toEqual({
      kind: 'recommended_grams',
      grams: 860,
      source: 'maximum_liquid_mix_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: true,
      servingModeId: 'fresh',
    });
  });

  it('vessel-capacity-only input gets the FLAGGED conservative fallback and NO derived number', () => {
    const result = buildCustomMachineProfile({
      behaviorAnswerId: 'freeze_bowl_first',
      market: 'ES',
      vesselCapacity: { value: 2, unit: 'l' },
      hasMaxFillLine: null, // the user does not know
    });
    if (result.outcome !== 'profile') throw new Error('expected a profile');
    expect(result.capacityFallback).toBe('vessel_capacity_only');
    expect(result.profile.capacityFallback).toBe('vessel_capacity_only');
    expect(result.profile.capacity.vesselCapacityMl).toBe(2000);
    expect(result.profile.capacity.maximumLiquidMixMl).toBeNull(); // never derived
    expect(result.profile.capacity.maxFillDefinedByManufacturer).toBe(false); // unknown ≠ documented
    expect(result.profile.requiresPreFreeze).toBe(true);
    expect(result.profile.preFreezeTarget).toBe('bowl');
    // Honest: a BOWL volume is never auto-treated as working capacity (owner
    // rule 3) — no invented batch, the user decides.
    expect(deriveMachineSetup(result.profile).batchSuggestion).toEqual({
      kind: 'none',
      reason: 'no_confirmed_usable_capacity',
    });
  });

  it('a custom re-spin machine derives an ESTIMATED batch from its declared tub (rule 4)', () => {
    const result = buildCustomMachineProfile({
      behaviorAnswerId: 'freeze_mixture_first',
      market: 'ES',
      vesselCapacity: { value: 473, unit: 'ml' },
    });
    if (result.outcome !== 'profile') throw new Error('expected a profile');
    expect(result.profile.technology).toBe('respin');
    expect(result.profile.preFreezeTarget).toBe('mixture');
    // Owner correction (2026-07-17): the device-type rule applies to the
    // user-declared tub figure (473 × 0.95 → 450 g) and is marked ESTIMATED —
    // never presented as a manufacturer figure; mode presets never borrowed.
    expect(deriveMachineSetup(result.profile).batchSuggestion).toEqual({
      kind: 'recommended_grams',
      grams: 450,
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: true,
      servingModeId: 'ninja_gelato',
    });
  });

  it('a soft-serve dispenser custom machine is honestly unsupported (no profile invented)', () => {
    const result = buildCustomMachineProfile({
      behaviorAnswerId: 'soft_serve_dispenser',
      market: 'ES',
      brand: 'Taylor',
    });
    expect(result).toEqual({
      outcome: 'unsupported_for_home',
      technology: 'continuous_soft_serve',
      reasonCode: 'continuous_soft_serve_not_home_supported',
    });
  });

  it('optional brand/model stay optional; the id is deterministic (pure layer)', () => {
    const anonymous = buildCustomMachineProfile({
      behaviorAnswerId: 'machine_cools_itself',
      market: 'ES',
    });
    if (anonymous.outcome !== 'profile') throw new Error('expected a profile');
    expect(anonymous.profile.brand).toBe('');
    expect(anonymous.profile.modelCodes).toEqual([]);
    expect(anonymous.profile.id).toBe('custom-unspecified');

    const named = buildCustomMachineProfile(base);
    const namedAgain = buildCustomMachineProfile(base);
    if (named.outcome !== 'profile' || namedAgain.outcome !== 'profile') {
      throw new Error('expected profiles');
    }
    expect(named.profile.id).toBe('custom-acme-gelatiera-2000');
    expect(namedAgain.profile.id).toBe(named.profile.id);
  });
});
