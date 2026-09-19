/**
 * NAPRAWA 5 — the canonical Rescue toolbox authority.
 *
 * These are IDENTITY tests, not physics tests. They prove the rule the Owner put
 * above everything else in this block: profile identity and base route outrank
 * Direction, so a candidate that would convert a product into a different
 * product is not a worse candidate — it is not a candidate.
 *
 * They also pin the Fructose dosage authority (2026-09-19) and the two places
 * this module deliberately DELEGATES instead of restating: the owner Inulin
 * policy and the Gellatti Stabilizer's product-owned dose.
 */
import { describe, expect, it } from 'vitest';
import type { EngineIngredient, ProductCategory, RecipeInput } from '@/engine';
import { OWNER_INULIN_POLICY } from '@/features/product-intelligence/ownerInulinPolicy';
import { GELLATTI_STABILIZER_AUTHORITY } from '@/data/ingredients/gellattiStabilizerAuthority';
import { starterPackRescueIngredient } from '@/features/constraint-studio/starterPackRescuePalette';
import type { StarterPackRescueMapperId } from '@/features/constraint-studio/starterPackRescuePalette';
import { rescueBaseRoute } from './rescueBaseRoute';
import {
  FRUCTOSE_HARD_MAX_PERCENT,
  FRUCTOSE_NORMAL_MAX_PERCENT,
  rescueAdmissibility,
  rescueDoseIsPermitted,
  rescueDoseUsesControlledRange,
  rescueDosageWindow,
  rescuePresence,
  rescueToolboxEntries,
  rescueToolboxEntry,
} from './rescueToolboxAuthority';

const DEXTROSE = 'PI-ING-000494';
const FRUCTOSE = 'PI-ING-000496';
const INULIN = 'PI-ING-000456';
const EGG_YOLK = 'PI-ING-001645';
const SMP = 'PI-ING-000270';
const CREAM_POWDER = 'PI-ING-000260';
const STABILIZER = 'PI-ING-002114';

const entryOf = (id: string) => {
  const entry = rescueToolboxEntry(id);
  expect(entry, `${id} must be in the canonical Rescue toolbox`).not.toBeNull();
  return entry!;
};

const payloadOf = (id: string): EngineIngredient | null =>
  starterPackRescueIngredient(id as StarterPackRescueMapperId);

const ingredient = (
  id: string,
  name: string,
  category: EngineIngredient['category'],
  protein = 0,
): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  private_product_id: null,
  identity_provenance: 'mapper',
  source_subcategory: null,
  carbonation_status: 'UNKNOWN',
  name,
  category,
  composition: {
    water_percent: 100 - protein,
    solids_percent: protein,
    fat_percent: 0,
    protein_percent: protein,
    carbohydrate_percent: 0,
    sugar_percent: 0,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 0,
    salt_percent: 0,
    alcohol_percent: 0,
    kcal_per_100g: protein * 4,
  },
  pod_value: null,
  pac_value: null,
  de_value: null,
  cost_per_kg: 1,
  cost_currency: 'EUR',
  confidence_score: 95,
  source_type: 'verified_db',
  is_verified: true,
});

const draft = (
  category: ProductCategory,
  items: readonly EngineIngredient[],
  {
    level = 0,
    batch = 1_000,
  }: { level?: -2 | -1 | 0 | 1 | 2; batch?: number } = {},
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: -12,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: level !== 0,
    direction_targets: { sweetness: level, softness: 0, creaminess: 0, flavor: 0 },
  },
  items: items.map((ing, index) => ({
    id: `line-${index}`,
    ingredient: ing,
    planned_grams: batch / items.length,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
});

const WATER = ingredient('PI-ING-001409', 'WATER', 'water');
const MILK = ingredient('PI-ING-000236', 'MILK 3.5%', 'dairy', 3.3);
const OAT = ingredient('PI-ING-001565', 'OAT DRINK', 'other', 1);
const WHEY = ingredient('PI-ING-900001', 'WHEY PROTEIN ISOLATE', 'other', 90);
const PEA = ingredient('PI-ING-900002', 'PEA PROTEIN', 'other', 80);

const admissible = (candidateId: string, input: RecipeInput) =>
  rescueAdmissibility(entryOf(candidateId), input, payloadOf(candidateId));

/* ═══ the registry itself ══════════════════════════════════════════════════ */

describe('one canonical Rescue toolbox, not several disagreeing lists', () => {
  it('carries exactly the seven Owner-named Starter Pack products', () => {
    expect(rescueToolboxEntries().map((entry) => entry.canonicalIngredientId).sort()).toEqual(
      [DEXTROSE, FRUCTOSE, INULIN, EGG_YOLK, SMP, CREAM_POWDER, STABILIZER].sort(),
    );
    for (const entry of rescueToolboxEntries()) expect(entry.starterPackProduct).toBe(true);
  });

  it('resolves every entry whose canonical composition is VERIFIED', () => {
    for (const id of [DEXTROSE, FRUCTOSE, INULIN, EGG_YOLK, STABILIZER]) {
      expect(payloadOf(id), id).not.toBeNull();
    }
  });

  /**
   * A MISSING AUTHORITY, RECORDED AS ONE. `PI-ING-000270 · SMP 0.8 %` and
   * `PI-ING-000260 · Cream Powder 42 %` are on the Owner's Starter Pack list,
   * but their canonical compositions carry `verified: false`
   * („Estimated / PI Calculated"), so the identity gate refuses to hydrate them
   * and they can never become an executable recipe line. That is a DATA gap, not
   * physics and not profile incompatibility — see `OPEN-QUESTIONS.md` Q2. This
   * test exists so the gap stays visible and so it flips to a candidate the day
   * the composition is verified, without anyone editing policy.
   */
  it('reports the two unverified dairy powders as a missing authority, never as impossible', () => {
    for (const id of [SMP, CREAM_POWDER]) {
      expect(payloadOf(id), id).toBeNull();
      const verdict = admissible(id, draft('milk_gelato', [MILK]));
      expect(verdict.admissible, id).toBe(false);
      expect(verdict.reason, id).toBe('authority_unavailable');
      expect(verdict.reason, id).not.toBe('profile_incompatible');
    }
  });
});

/* ═══ base route ═══════════════════════════════════════════════════════════ */

describe('base route is derived, never guessed', () => {
  it('reads the structural family of each profile', () => {
    expect(rescueBaseRoute(draft('sorbet', [WATER]))).toBe('water');
    expect(rescueBaseRoute(draft('vegan_gelato', [OAT]))).toBe('plant');
    expect(rescueBaseRoute(draft('milk_gelato', [MILK]))).toBe('dairy');
    expect(rescueBaseRoute(draft('chocolate_gelato', [MILK]))).toBe('dairy');
  });

  it('separates the two Protein routes by the protein actually delivered', () => {
    expect(rescueBaseRoute(draft('protein_gelato', [WHEY, WATER]))).toBe('dairy');
    expect(rescueBaseRoute(draft('protein_gelato', [PEA, WATER]))).toBe('plant');
  });

  it('reports `unknown` rather than inventing a route it cannot derive', () => {
    expect(rescueBaseRoute(draft('protein_gelato', [WATER]))).toBe('unknown');
    expect(rescueBaseRoute(draft('custom', [WATER]))).toBe('unknown');
  });
});

/* ═══ profile compatibility — the Owner's matrix ═══════════════════════════ */

describe('profile identity outranks Direction', () => {
  it('SORBET never receives dairy or egg, however good the physics would be', () => {
    const sorbet = draft('sorbet', [WATER]);
    for (const id of [SMP, CREAM_POWDER, EGG_YOLK]) {
      const verdict = admissible(id, sorbet);
      expect(verdict.admissible, id).toBe(false);
    }
    // The egg yolk DOES hydrate, so its refusal is a real identity refusal
    // rather than a missing payload — the dairy/egg rule is doing the work.
    expect(payloadOf(EGG_YOLK)).not.toBeNull();
    expect(admissible(EGG_YOLK, sorbet).reason).toBe('profile_incompatible');
  });

  it('SORBET does receive the four sugar/body/stabilizer levers', () => {
    const sorbet = draft('sorbet', [WATER]);
    for (const id of [DEXTROSE, FRUCTOSE, INULIN, STABILIZER]) {
      expect(admissible(id, sorbet), id).toMatchObject({ admissible: true, reason: 'admissible' });
    }
  });

  it('VEGAN never receives animal-origin, dairy or egg', () => {
    const vegan = draft('vegan_gelato', [OAT]);
    for (const id of [SMP, CREAM_POWDER, EGG_YOLK]) {
      expect(admissible(id, vegan), id).toMatchObject({ admissible: false });
    }
  });

  it('VEGAN receives only candidates the ONE vegan authority verifies', () => {
    const vegan = draft('vegan_gelato', [OAT]);
    for (const id of [DEXTROSE, FRUCTOSE, INULIN, STABILIZER]) {
      expect(admissible(id, vegan), id).toMatchObject({ admissible: true });
    }
  });

  it('dairy Gelato may use the dairy-compatible candidates', () => {
    const gelato = draft('milk_gelato', [MILK]);
    for (const id of [DEXTROSE, FRUCTOSE, INULIN, STABILIZER]) {
      expect(admissible(id, gelato), id).toMatchObject({ admissible: true });
    }
    // SMP and Cream Powder are POLICY-compatible with this profile and base
    // route; only their unverified composition withholds them (Q2).
    for (const id of [SMP, CREAM_POWDER]) {
      expect(entryOf(id).allowedProfiles).toContain('milk_gelato');
      expect(entryOf(id).allowedBaseRoutes).toContain('dairy');
    }
  });

  it('dried egg yolk is permitted on dairy Gelato but never as a generic lever', () => {
    const verdict = admissible(EGG_YOLK, draft('milk_gelato', [MILK]));
    expect(verdict.admissible).toBe(true);
    // It must justify itself technologically and may not outrank a simpler
    // sugar or body lever at an equivalent result.
    expect(verdict.conditional).toBe(true);
    for (const id of [DEXTROSE, FRUCTOSE, INULIN, STABILIZER]) {
      expect(admissible(id, draft('milk_gelato', [MILK])).conditional, id).toBe(false);
    }
  });
});

describe('Protein is not globally disabled — the real authority decides', () => {
  it('the DAIRY route keeps its dairy candidates', () => {
    const proteinDairy = draft('protein_gelato', [WHEY, MILK]);
    expect(rescueBaseRoute(proteinDairy)).toBe('dairy');
    for (const id of [DEXTROSE, FRUCTOSE, INULIN, STABILIZER]) {
      expect(admissible(id, proteinDairy), id).toMatchObject({ admissible: true });
    }
    // The point of this test: Protein is NOT globally disabled. Before NAPRAWA 5
    // every one of these returned `blocked_science` on any Protein draft.
    for (const id of [SMP, CREAM_POWDER]) {
      expect(entryOf(id).allowedProfiles).toContain('protein_gelato');
      expect(admissible(id, proteinDairy).reason, id).toBe('authority_unavailable');
    }
  });

  it('the PLANT route stays the plant route', () => {
    const proteinPlant = draft('protein_gelato', [PEA, OAT]);
    expect(rescueBaseRoute(proteinPlant)).toBe('plant');
    for (const id of [DEXTROSE, FRUCTOSE, INULIN, STABILIZER]) {
      expect(admissible(id, proteinPlant), id).toMatchObject({ admissible: true });
    }
    for (const id of [SMP, CREAM_POWDER, EGG_YOLK]) {
      expect(admissible(id, proteinPlant), id).toMatchObject({ admissible: false });
    }
    // Egg yolk hydrates, so ITS refusal proves the route rule, not a data gap.
    expect(admissible(EGG_YOLK, proteinPlant).reason).toBe('profile_incompatible');
  });

  it('dried egg yolk is not an automatic Protein candidate on either route', () => {
    expect(admissible(EGG_YOLK, draft('protein_gelato', [WHEY, MILK]))).toMatchObject({
      admissible: false,
      reason: 'profile_incompatible',
    });
  });

  it('every dairy Protein candidate carries the qualification-preserved condition', () => {
    for (const id of [SMP, CREAM_POWDER]) {
      expect(entryOf(id).hardConditions).toContain('protein_qualification_preserved');
    }
  });

  it('an unresolved route withholds candidates without claiming impossibility', () => {
    // Dextrose hydrates and is allowed on every profile, so the ONLY thing that
    // can withhold it here is the unresolved route.
    const unresolved = draft('custom', [WATER]);
    expect(rescueBaseRoute(unresolved)).toBe('unknown');
    const verdict = admissible(DEXTROSE, unresolved);
    expect(verdict.admissible).toBe(false);
    expect(verdict.reason).toBe('base_route_unresolved');
    expect(verdict.reason).not.toBe('profile_incompatible');
  });
});

/* ═══ presence — adjust, never duplicate ═══════════════════════════════════ */

describe('an ingredient already in the recipe is adjusted, never duplicated', () => {
  const fructoseLine = ingredient(FRUCTOSE, 'FRUCTOSE', 'sugar');

  it('reports absence, unlocked presence and constrained presence apart', () => {
    const entry = entryOf(FRUCTOSE);
    expect(rescuePresence(entry, draft('milk_gelato', [MILK]))).toBe('absent');
    expect(rescuePresence(entry, draft('milk_gelato', [MILK, fructoseLine]))).toBe(
      'present_unlocked',
    );
    const withLock = draft('milk_gelato', [MILK, fructoseLine]);
    expect(
      rescuePresence(entry, withLock, {
        byLineId: { 'line-1': { mode: 'locked', grams: 20 } },
      }),
    ).toBe('present_constrained');
  });

  it('presence never makes a candidate inadmissible — it routes it', () => {
    const verdict = admissible(FRUCTOSE, draft('milk_gelato', [MILK, fructoseLine]));
    expect(verdict.admissible).toBe(true);
    expect(verdict.presence).toBe('present_unlocked');
  });
});

/* ═══ Fructose — the Owner's final dosage authority ════════════════════════ */

describe('Fructose dosage authority (Owner, 2026-09-19)', () => {
  const entry = () => entryOf(FRUCTOSE);

  it('normal is >0–6 % of the TOTAL target batch', () => {
    expect(FRUCTOSE_NORMAL_MAX_PERCENT).toBe(6);
    const window = rescueDosageWindow(entry(), draft('milk_gelato', [MILK]))!;
    expect(window.normal.maxGrams).toBeCloseTo(60, 9);
    expect(rescueDoseIsPermitted(window, 4)).toBe(true);
    expect(rescueDoseIsPermitted(window, 60)).toBe(true);
    expect(rescueDoseIsPermitted(window, 0)).toBe(false);
  });

  it('the controlled extension is the GENERIC +50 % rule cut by the hard maximum', () => {
    expect(FRUCTOSE_HARD_MAX_PERCENT).toBe(8);
    const window = rescueDosageWindow(entry(), draft('milk_gelato', [MILK], { level: 2 }))!;
    // 6 % x 1.5 = 9 %, and the 8 % hard maximum intersects it at 8 %.
    expect(window.extended.maxGrams).toBeCloseTo(80, 9);
    expect(window.hardMaxGrams).toBeCloseTo(80, 9);
  });

  it('−1 / 0 / +1 never exceed 6 %', () => {
    for (const level of [-1, 0, 1] as const) {
      const window = rescueDosageWindow(entry(), draft('milk_gelato', [MILK], { level }))!;
      expect(window.permitted.maxGrams, `level ${level}`).toBeCloseTo(60, 9);
      expect(rescueDoseIsPermitted(window, 61)).toBe(false);
    }
  });

  it('−2 / +2 search through 6 % and may then extend through 8 %', () => {
    for (const level of [-2, 2] as const) {
      const window = rescueDosageWindow(entry(), draft('milk_gelato', [MILK], { level }))!;
      expect(window.permitted.maxGrams, `level ${level}`).toBeCloseTo(80, 9);
      expect(rescueDoseIsPermitted(window, 70)).toBe(true);
      expect(rescueDoseIsPermitted(window, 80)).toBe(true);
      // Above the hard maximum nothing passes, at any level, ever.
      expect(rescueDoseIsPermitted(window, 81)).toBe(false);
    }
  });

  it('prices the controlled range and leaves the normal one free', () => {
    const window = rescueDosageWindow(entry(), draft('milk_gelato', [MILK], { level: 2 }))!;
    expect(rescueDoseUsesControlledRange(window, 4)).toBe(false);
    expect(rescueDoseUsesControlledRange(window, 60)).toBe(false);
    expect(rescueDoseUsesControlledRange(window, 61)).toBe(true);
    expect(rescueDoseUsesControlledRange(window, 80)).toBe(true);
  });

  it('scales with the batch, because the authority is a percentage', () => {
    const half = rescueDosageWindow(entry(), draft('milk_gelato', [MILK], { batch: 500 }))!;
    expect(half.normal.maxGrams).toBeCloseTo(30, 9);
    const halfExtreme = rescueDosageWindow(
      entry(),
      draft('milk_gelato', [MILK], { batch: 500, level: 2 }),
    )!;
    expect(halfExtreme.permitted.maxGrams).toBeCloseTo(40, 9);
    expect(rescueDoseIsPermitted(halfExtreme, 41)).toBe(false);
  });

  it('is not the old 1 / 2 / 4 / 8 % probe grid — any whole gram inside is valid', () => {
    const window = rescueDosageWindow(entry(), draft('milk_gelato', [MILK]))!;
    for (const grams of [4, 7, 13, 41, 59]) {
      expect(rescueDoseIsPermitted(window, grams), `${grams} g`).toBe(true);
    }
  });
});

/* ═══ delegation, not restatement ══════════════════════════════════════════ */

describe('the authority delegates where an authority already exists', () => {
  it('Inulin comes from the owner policy, including its ±2 band', () => {
    const entry = entryOf(INULIN);
    const normal = rescueDosageWindow(entry, draft('milk_gelato', [MILK]))!;
    expect(normal.permitted.minGrams).toBeCloseTo(
      (OWNER_INULIN_POLICY.minPercent / 100) * 1_000,
      9,
    );
    expect(normal.permitted.maxGrams).toBeCloseTo(
      (OWNER_INULIN_POLICY.maxPercent / 100) * 1_000,
      9,
    );
    const extreme = rescueDosageWindow(entry, draft('milk_gelato', [MILK], { level: 2 }))!;
    expect(extreme.permitted.maxGrams).toBeGreaterThan(normal.permitted.maxGrams);
  });

  it('the Gellatti Stabilizer keeps its exact product-owned dose and is never extended', () => {
    const entry = entryOf(STABILIZER);
    const standard = rescueDosageWindow(entry, draft('milk_gelato', [MILK], { level: 2 }))!;
    expect(standard.permitted.minGrams).toBeCloseTo(
      GELLATTI_STABILIZER_AUTHORITY.dosageGPerKg.STANDARD,
      9,
    );
    expect(standard.permitted.maxGrams).toBeCloseTo(standard.permitted.minGrams, 9);
    const sorbet = rescueDosageWindow(entry, draft('sorbet', [WATER], { level: 2 }))!;
    expect(sorbet.permitted.maxGrams).toBeCloseTo(
      GELLATTI_STABILIZER_AUTHORITY.dosageGPerKg.SORBET,
      9,
    );
  });

  it('records where no owner dosage authority exists instead of inventing one', () => {
    for (const id of [DEXTROSE, SMP, CREAM_POWDER, EGG_YOLK]) {
      expect(entryOf(id).dosageAuthority.kind, id).toBe('capped_technical_window');
      expect(entryOf(id).dosageAuthority.provenance, id).toContain('OPEN-QUESTIONS');
    }
    // Fructose and Inulin DO have one, so they must not be labelled that way.
    expect(entryOf(FRUCTOSE).dosageAuthority.kind).toBe('percent_of_batch');
    expect(entryOf(INULIN).dosageAuthority.kind).toBe('owner_inulin_policy');
  });
});
