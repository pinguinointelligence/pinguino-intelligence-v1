import { describe, expect, it } from 'vitest';
import { ACTIVE_ENGINE, ENGINES } from '@/data/engines';
import { PRODUCT_PROFILES } from '@/data/productProfiles';
import {
  isServingProfileConnected,
  SERVING_PROFILE_ORDER,
  SERVING_PROFILES,
  STORAGE_PROFILES,
  TEMPERATURE_CONCEPT_LABELS,
} from '@/data/servingProfiles';
import { advance, INITIAL_INTAKE, type IntakeEvent } from '@/features/pi-chat/conversation';
import { intakeToRecipe } from '@/features/pi-chat/intakeToRecipe';

const VALID_CATEGORIES = [
  'milk_gelato',
  'fruit_gelato',
  'nut_gelato',
  'chocolate_gelato',
  'alcohol_gelato',
  'sorbet',
  'vegan_gelato',
  'custom',
];

describe('engine catalog terminology', () => {
  it('the active engine is exactly the −11°C Engine', () => {
    expect(ACTIVE_ENGINE.label).toBe('−11°C Engine');
    expect(ACTIVE_ENGINE.target_temperature_c).toBe(-11);
  });

  it('exactly one engine is active; the others are future labels only', () => {
    expect(ENGINES.filter((engine) => engine.status === 'active')).toHaveLength(1);
    expect(ENGINES.filter((engine) => engine.status === 'future').length).toBeGreaterThanOrEqual(4);
  });

  it('never uses the term "Mini Engine"', () => {
    expect(/mini engine/i.test(JSON.stringify(ENGINES))).toBe(false);
  });
});

describe('product profiles', () => {
  it('every product profile maps to a valid engine category', () => {
    for (const profile of PRODUCT_PROFILES) {
      expect(VALID_CATEGORIES, profile.id).toContain(profile.engineCategory);
    }
  });

  it('sorbet protects its hero (Premium Taste First); vegan is animal-free', () => {
    expect(PRODUCT_PROFILES.find((p) => p.id === 'sorbet')!.heroProtected).toBe(true);
    expect(PRODUCT_PROFILES.find((p) => p.id === 'sorbet')!.defaultMode).toBe('premium');
    expect(PRODUCT_PROFILES.find((p) => p.id === 'vegan')!.vegan).toBe(true);
  });
});

describe('serving profiles — no faked future engines', () => {
  it('only the Display −11°C profile is connected today', () => {
    const connected = SERVING_PROFILES.filter(isServingProfileConnected).map((p) => p.id);
    expect(connected).toEqual(['display-minus-11']);
  });
});

describe('temperature concept separation (AUDIT #19 / SPEC §11.2 — owner decision, Slice C)', () => {
  it('the serving vocabulary is exactly Fresh + Display −11/−12/−13 — storage removed', () => {
    expect(SERVING_PROFILE_ORDER).toEqual([
      'fresh',
      'display-minus-11',
      'display-minus-12',
      'display-minus-13',
    ]);
    expect(SERVING_PROFILES.map((p) => p.id)).toEqual([...SERVING_PROFILE_ORDER]);
  });

  it('storage is NEVER selectable as serving: no storage id and no −18 in the serving list', () => {
    const servingIds = SERVING_PROFILES.map((p) => p.id) as string[];
    expect(servingIds).not.toContain('storage-minus-18');
    for (const profile of SERVING_PROFILES) {
      expect(profile.displayTempC, profile.id).not.toBe(-18);
    }
  });

  it('storage −18°C exists as a label-only concept: no engineId, nothing to hang logic off', () => {
    expect(STORAGE_PROFILES.map((p) => p.id)).toEqual(['storage-minus-18']);
    for (const profile of STORAGE_PROFILES) {
      expect(profile.concept).toBe('storage');
      expect(profile.displayTempC).toBe(-18);
      // Deliberately NO engine hook — storage is informational only (SPEC §11.2).
      expect('engineId' in profile).toBe(false);
    }
  });

  it('fresh carries the production/extraction concept; displays carry serving', () => {
    for (const profile of SERVING_PROFILES) {
      expect(profile.concept, profile.id).toBe(profile.id === 'fresh' ? 'production' : 'serving');
    }
  });

  it('the concept label set is the exact SPEC §11.2 wording', () => {
    expect(TEMPERATURE_CONCEPT_LABELS).toEqual({
      serving: 'Temperatura serwowania',
      production: 'Produkcja / ekstrakcja',
      storage: 'Przechowywanie',
    });
  });
});

describe('intakeToRecipe pins the active −11°C Engine (never fakes a future engine)', () => {
  // Owner decision (Slice C): −18 is no longer a SERVING profile (see the
  // concept-separation suite above) — the loop covers the whole serving vocabulary.
  it('computes at −11 for EVERY serving profile, including unconnected previews', () => {
    for (const serving of SERVING_PROFILES) {
      const events: IntakeEvent[] = [
        { type: 'submitFlavor', text: 'vanilla' },
        { type: 'chooseProductType', id: 'gelato' },
        { type: 'chooseServingProfile', id: serving.id },
        { type: 'setBatch', keep: true },
      ];
      const state = events.reduce((s, e) => advance(s, e), INITIAL_INTAKE);
      const seed = intakeToRecipe(state)!;
      expect(seed.temperatureC, serving.id).toBe(-11);
    }
  });

  it('maps the product direction to its engine category and mode', () => {
    const state = [
      { type: 'submitFlavor', text: 'mango' } as const,
      { type: 'chooseProductType', id: 'sorbet' } as const,
      { type: 'chooseServingProfile', id: 'display-minus-11' } as const,
      { type: 'setBatch', keep: true } as const,
    ].reduce((s, e) => advance(s, e), INITIAL_INTAKE);
    const seed = intakeToRecipe(state)!;
    expect(seed.category).toBe('sorbet');
    expect(seed.mode).toBe('premium');
  });
});
