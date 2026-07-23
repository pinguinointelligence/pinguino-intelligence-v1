/**
 * FULL FORMULATION & CONSTRAINED REFORMULATION (owner P0) — acceptance matrix.
 * Every seed gram is a verbatim approved repo record; Engine science untouched.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type EngineIngredient, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  buildOptimizePreview,
  commitPreview,
  plannedSum,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { routeFormulationMode } from './formulate';
import { resolveFunctionalRole } from './ingredientRoles';
import { listFormulationTemplates, selectFormulationTemplate } from './templateRegistry';

const line = (id: string, ing: string, grams: number, lock: 'unlocked' | 'grams' | 'main' = 'unlocked') => ({
  id,
  ingredient: findDemoIngredient(ing)!,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: lock as 'unlocked',
});

const input = (
  items: ReturnType<typeof line>[],
  category: RecipeInput['category'] = 'milk_gelato',
  temp = -11,
  batch = 1000,
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: temp,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items,
});

const NO = { byLineId: {} };
const gramsOf = (r: RecipeInput, id: string) => r.items.find((i) => i.id === id)?.planned_grams;

/** The Phase-15 no-gram gelato selection (7 core identities, zero grams). */
const NO_GRAM_GELATO = () => [
  line('l-milk', 'milk_3_5', 0),
  line('l-cream', 'cream_30', 0),
  line('l-smp', 'smp', 0),
  line('l-suc', 'sucrose', 0),
  line('l-dex', 'dextrose', 0),
  line('l-inulin', 'inulin', 0),
  line('l-tara', 'tara_gum', 0),
];

describe('template registry (Phase 1)', () => {
  it('carries the approved seeds verbatim and honest unsupported states', () => {
    expect(selectFormulationTemplate('milk_gelato', -11).template?.templateId).toBe('milk_base_v1');
    expect(selectFormulationTemplate('milk_gelato', -12).template?.templateId).toBe('milk_base_g17_minus12_v1');
    expect(selectFormulationTemplate('milk_gelato', -13).template?.templateId).toBe('milk_base_g18_minus13_v1');
    expect(selectFormulationTemplate('chocolate_gelato', -11).template?.templateId).toBe('chocolate_base_v1');
    expect(selectFormulationTemplate('chocolate_gelato', -12).template).toBeNull(); // honestly limited
    expect(selectFormulationTemplate('sorbet', -11).template?.templateId).toBe('S01');
    expect(selectFormulationTemplate('sorbet', -12).template?.templateId).toBe('S02');
    expect(selectFormulationTemplate('sorbet', -13).template?.templateId).toBe('S03');
    expect(selectFormulationTemplate('vegan_gelato', -13).template?.templateId).toBe('V02_fixed');
    expect(selectFormulationTemplate('vegan_gelato', -11).template).toBeNull();
    expect(selectFormulationTemplate('custom', -11).unsupportedReason).toBe('no_template_for_category');
    // the fruit template is explicitly reference-derived, never claimed approved
    const fruit = listFormulationTemplates().find((t) => t.templateId === 'fruit_gelato_ref_v1')!;
    expect(fruit.status).toBe('reference_derived');
  });
});

describe('functional roles (Phase 2)', () => {
  it('distinguishes the core roles from existing engine data', () => {
    expect(resolveFunctionalRole(findDemoIngredient('milk_3_5')!)).toBe('primary_liquid');
    expect(resolveFunctionalRole(findDemoIngredient('cream_30')!)).toBe('dairy_fat');
    expect(resolveFunctionalRole(findDemoIngredient('smp')!)).toBe('milk_solids');
    expect(resolveFunctionalRole(findDemoIngredient('sucrose')!)).toBe('sweetener_sucrose');
    expect(resolveFunctionalRole(findDemoIngredient('dextrose')!)).toBe('sugar_freezing_control');
    expect(resolveFunctionalRole(findDemoIngredient('inulin')!)).toBe('fiber_body');
    expect(resolveFunctionalRole(findDemoIngredient('tara_gum')!)).toBe('stabilizer');
    expect(resolveFunctionalRole(findDemoIngredient('salt')!)).toBe('salt_modifier');
    expect(resolveFunctionalRole(findDemoIngredient('raspberry')!)).toBe('fruit');
    expect(resolveFunctionalRole(findDemoIngredient('dark_chocolate_70')!)).toBe('chocolate_cocoa');
    expect(resolveFunctionalRole(findDemoIngredient('whiskey_40')!)).toBe('alcohol');
  });
});

describe('Phase 15 — no-gram new recipe (tests 1/13/18)', () => {
  it.each([-11, -12, -13])('gelato %d: full differentiated recipe at exactly 1000 g', (temp) => {
    const result = buildOptimizePreview(input(NO_GRAM_GELATO(), 'milk_gelato', temp), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    expect(p.formulation?.mode).toBe('full_formulation');
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    const grams = p.proposedInput.items.map((i) => Math.round(i.planned_grams));
    expect(new Set(grams).size).toBeGreaterThan(3); // differentiated, never equal split
    // stabilizer stays template-controlled (≤ scaled template dose + solver margin)
    const tara = gramsOf(p.proposedInput, 'l-tara')!;
    expect(tara).toBeGreaterThan(0);
    expect(tara).toBeLessThanOrEqual(6);
    // user line ids preserved (stable identities)
    for (const id of ['l-milk', 'l-cream', 'l-suc']) expect(gramsOf(p.proposedInput, id)).toBeGreaterThan(0);
  });

  it('zero-unlocked ingredient remains an available candidate (test 6)', () => {
    const result = buildOptimizePreview(input(NO_GRAM_GELATO(), 'milk_gelato', -12), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'l-inulin')).toBeGreaterThan(0); // G17 fiber role
  });
});

describe('Phase 14 — locked 500 g milk (tests 2/3/4)', () => {
  it('exact Milk 500 g lock is byte-preserved; the rest fills to 1000 g', () => {
    const items = NO_GRAM_GELATO().map((i) =>
      i.id === 'l-milk' ? { ...line('l-milk', 'milk_3_5', 500, 'grams') } : i,
    );
    const set = { byLineId: { 'l-milk': { mode: 'locked' as const, grams: 500 } } };
    const result = buildOptimizePreview(input(items, 'milk_gelato', -11), set, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.formulation?.mode).toBe('constrained_reformulation');
    expect(Object.is(gramsOf(result.preview.proposedInput, 'l-milk'), 500)).toBe(true);
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    const ids = result.preview.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });

  it('max Milk 500 g (range 0–500) is respected', () => {
    const set = { byLineId: { 'l-milk': { mode: 'range' as const, minGrams: 0, maxGrams: 500 } } };
    const result = buildOptimizePreview(input(NO_GRAM_GELATO(), 'milk_gelato', -11), set, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'l-milk')!).toBeLessThanOrEqual(500 + 0.001);
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('fruit range 150–250 g is respected (fruit gelato, reference-derived)', () => {
    const items = [...NO_GRAM_GELATO(), line('l-rasp', 'raspberry', 0)];
    const set = { byLineId: { 'l-rasp': { mode: 'range' as const, minGrams: 150, maxGrams: 250 } } };
    const result = buildOptimizePreview(input(items, 'fruit_gelato', -11), set, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rasp = gramsOf(result.preview.proposedInput, 'l-rasp')!;
    expect(rasp).toBeGreaterThanOrEqual(150 - 0.001);
    expect(rasp).toBeLessThanOrEqual(250 + 0.001);
    expect(result.preview.formulation?.templateStatus).toBe('reference_derived'); // honest label
  });
});

describe('Phase 13 — unavailable ingredient (tests 5/7/8)', () => {
  it('removed inulin is NOT reintroduced; result carries the honest gap + recommendation', () => {
    const items = NO_GRAM_GELATO().filter((i) => i.id !== 'l-inulin');
    const result = buildOptimizePreview(input(items, 'milk_gelato', -12), NO, 'now'); // G17 needs fiber
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    expect(p.proposedInput.items.some((i) => i.ingredient.id === 'inulin')).toBe(false); // never re-added
    expect(p.formulation?.missingRoles).toContain('fiber_body');
    expect(p.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true);
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // safe-but-suboptimal result stays APPLIABLE (7/10 rule) as long as it improved
    const outcome = commitPreview(input(items, 'milk_gelato', -12), NO, p, 'now', 'a-1');
    expect(outcome.ok).toBe(true);
  });
});

describe('Phase 16 — the exact eight-ingredient all-1 g owner fixture (tests 10/11)', () => {
  const OWNER_EIGHT = () => [
    line('l-milk', 'milk_3_5', 1),
    line('l-cream', 'cream_30', 1),
    line('l-smp', 'smp', 1),
    line('l-suc', 'sucrose', 1),
    line('l-dex', 'dextrose', 1),
    line('l-tara', 'tara_gum', 1),
    line('l-salt', 'salt', 1),
    line('l-inulin', 'inulin', 1),
  ];

  it('formulates a differentiated 1000 g recipe — never 8 × 125 g, salt/tara safe', () => {
    const rec = input(OWNER_EIGHT(), 'milk_gelato', -11);
    expect(routeFormulationMode(rec, NO).mode).toBe('full_formulation'); // damaged draft → template
    const result = buildOptimizePreview(rec, NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    const grams = p.proposedInput.items.map((i) => Math.round(i.planned_grams * 10) / 10);
    expect(grams.every((g) => g === 125)).toBe(false); // FORBIDDEN result
    expect(new Set(grams).size).toBeGreaterThan(3);
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // salt has no template role and no approved bound → kept at the USER's 1 g, never 125 g
    expect(gramsOf(p.proposedInput, 'l-salt')!).toBeLessThanOrEqual(1.001);
    // tara is template-controlled — never an unsafe 125 g
    expect(gramsOf(p.proposedInput, 'l-tara')!).toBeLessThanOrEqual(6);
    expect(p.formulation?.templateId).toBe('milk_base_v1');
  });

  it('Apply → Undo restores the exact eight × 1 g draft (test 25)', () => {
    useRecipeStore.setState({
      mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: 1000,
      machine_capacity_grams: null, flavor_intensity: 'balanced', cost_priority: 'balanced',
      items: OWNER_EIGHT(),
    });
    useConstraintStudioStore.getState().resetForTests();
    const before = JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items);
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const items = useRecipeStore.getState().items;
    expect(Math.abs(items.reduce((a, i) => a + i.planned_grams, 0) - 1000)).toBeLessThanOrEqual(0.1);
    useConstraintStudioStore.getState().undoLastApply();
    expect(JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items)).toBe(before);
  });
});

describe('Phase 17 — the original MyGelato fixture (tests 12/17)', () => {
  it('routes to LOCAL CORRECTION (near-batch draft) and classifies honestly', () => {
    const items = [
      line('l-milk', 'milk_3_5', 592.3), line('l-cream', 'cream_30', 216.6), line('l-smp', 'smp', 22),
      line('l-suc', 'sucrose', 32.5), line('l-dex', 'dextrose', 110), line('l-salt', 'salt', 0.8),
      line('l-inulin', 'inulin', 23.7), line('l-tara', 'tara_gum', 2.01),
    ];
    const rec = input(items, 'milk_gelato', -11);
    expect(routeFormulationMode(rec, NO).mode).toBe('local_correction');
    const result = buildOptimizePreview(rec, NO, 'now');
    if (result.ok) {
      expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
      expect(result.preview.formulation).toBeUndefined(); // local path, not template
    } else {
      expect(['already_clean', 'no_proposal', 'unsafe_proposal']).toContain(result.code);
    }
  });
});

describe('Phase 18 — sorbet + vegan (tests 22/23)', () => {
  it('sorbet −11 with a selected fruit: water auto-added WITH a reason; 1000 g', () => {
    const items = [
      line('l-rasp', 'raspberry', 0), line('l-suc', 'sucrose', 0), line('l-dex', 'dextrose', 0),
      line('l-inulin', 'inulin', 0), line('l-tara', 'tara_gum', 0),
    ];
    const result = buildOptimizePreview(input(items, 'sorbet', -11), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    expect(p.formulation?.templateId).toBe('S01');
    expect(p.formulation?.added.some((a) => a.ingredientId === 'water')).toBe(true);
    expect(p.formulation?.added[0]?.reasonPl).toContain('PI dodało wodę');
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    expect(gramsOf(p.proposedInput, 'l-rasp')!).toBeGreaterThan(300); // the fruit role is real
  });

  it('sorbet without ANY fruit → precise missing-role stop (never invented)', () => {
    const items = [line('l-suc', 'sucrose', 0), line('l-dex', 'dextrose', 0), line('l-tara', 'tara_gum', 0)];
    const result = buildOptimizePreview(input(items, 'sorbet', -12), NO, 'now');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('missing_required_role');
    if (result.code !== 'missing_required_role') return;
    expect(result.role).toBe('fruit');
    expect(result.messagePl).toContain('owoc');
  });

  it('vegan −13 with user plant ingredients works; vegan −11 honestly unsupported (no dairy fallback)', () => {
    const oat: EngineIngredient = {
      ...findDemoIngredient('milk_3_5')!,
      id: 'PI-ING-OAT-TEST', name: 'Oat drink', category: 'other',
      flags: { is_animal_origin: false },
    };
    const coconut: EngineIngredient = {
      ...findDemoIngredient('cream_30')!,
      id: 'PI-ING-COCO-TEST', name: 'Coconut milk 22%', category: 'other',
      flags: { is_animal_origin: false },
    };
    const items = [
      { id: 'l-oat', ingredient: oat, planned_grams: 0, actual_grams: null, lock_type: 'unlocked' as const },
      { id: 'l-coco', ingredient: coconut, planned_grams: 0, actual_grams: null, lock_type: 'unlocked' as const },
      line('l-suc', 'sucrose', 0), line('l-dex', 'dextrose', 0),
      line('l-inulin', 'inulin', 0), line('l-tara', 'tara_gum', 0),
    ];
    const ok = buildOptimizePreview(input(items, 'vegan_gelato', -13), NO, 'now');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.preview.formulation?.templateId).toBe('V02_fixed');
      expect(Math.abs(plannedSum(ok.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
      expect(gramsOf(ok.preview.proposedInput, 'l-oat')!).toBeGreaterThan(0);
    }
    const unsupported = buildOptimizePreview(input(items, 'vegan_gelato', -11), NO, 'now');
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.code).toBe('unsupported_profile');
  });

  it('chocolate −11 uses the chocolate template; unsupported profile (custom) is honest (test 21/24)', () => {
    const items = [
      line('l-milk', 'milk_3_5', 0), line('l-cream', 'cream_30', 0), line('l-smp', 'smp', 0),
      line('l-suc', 'sucrose', 0), line('l-dex', 'dextrose', 0),
      line('l-choc', 'dark_chocolate_70', 0), line('l-cocoa', 'cocoa_2224', 0), line('l-tara', 'tara_gum', 0),
    ];
    const result = buildOptimizePreview(input(items, 'chocolate_gelato', -11), NO, 'now');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.formulation?.templateId).toBe('chocolate_base_v1');
      expect(gramsOf(result.preview.proposedInput, 'l-choc')!).toBeGreaterThan(0);
    }
    // Protein/custom: honest unsupported — never silently routed to gelato.
    const unsupported = buildOptimizePreview(input(items, 'custom', -11), NO, 'now');
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.code).toBe('unsupported_profile');
  });
});

describe('Phase 21 — 20-cycle stability (tests 13/14/15)', () => {
  it('20 successive recalculate→apply cycles: batch stays 1000 g, no duplicates, no runaway', () => {
    useRecipeStore.setState({
      mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: 1000,
      machine_capacity_grams: null, flavor_intensity: 'balanced', cost_priority: 'balanced',
      items: NO_GRAM_GELATO(),
    });
    useConstraintStudioStore.getState().resetForTests();
    for (let cycle = 0; cycle < 20; cycle += 1) {
      // edit: nudge one line + alternate temperature (a real editing session)
      const temp = [-11, -12, -13][cycle % 3]!;
      useRecipeStore.setState({ target_temperature_c: temp });
      const first = useRecipeStore.getState().items[0]!;
      useRecipeStore.getState().setPlannedGrams(first.id, Math.max(0, first.planned_grams - 5));
      useConstraintStudioStore.getState().createOptimizePreview();
      if (useConstraintStudioStore.getState().preview) {
        useConstraintStudioStore.getState().applyPreview();
      }
      const items = useRecipeStore.getState().items;
      const sum = items.reduce((a, i) => a + i.planned_grams, 0);
      expect(useRecipeStore.getState().target_batch_grams).toBe(1000); // target never multiplied
      expect(sum).toBeLessThan(1100); // runaway guard (the 111,000 g regression)
      expect(new Set(items.map((i) => i.ingredient.id)).size).toBe(items.length); // no duplicates
    }
  });

  it('the Apply door structurally blocks a forged multiplied TARGET batch (111,000 g class)', () => {
    const rec = input(NO_GRAM_GELATO(), 'milk_gelato', -11);
    const forged: RecipeInput = {
      ...rec,
      target_batch_grams: 111_000,
      items: rec.items.map((i) => ({ ...i, planned_grams: 111_000 / rec.items.length })),
    };
    const calc = calculateRecipe(forged);
    const preview = {
      kind: 'optimize' as const,
      titlePl: 'forged',
      baseFingerprint: workingStateFingerprint(rec, NO),
      proposedInput: forged,
      nextConstraints: NO,
      lines: [],
      violationsBefore: 9,
      violationsAfter: 0,
      explanation: [],
      engineVersion: calc.engine_version,
      configVersion: calc.config_version,
      createdAt: 'now',
    };
    const outcome = commitPreview(rec, NO, preview, 'now', 'runaway');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('batch_total_mismatch');
  });
});

describe('Phase 22 — direct service / store equality + science freeze (tests 27/29)', () => {
  it('the store path and the direct pipeline produce the identical proposal', () => {
    useRecipeStore.setState({
      mode: 'classic', category: 'milk_gelato', target_temperature_c: -12, target_batch_grams: 1000,
      machine_capacity_grams: null, flavor_intensity: 'balanced', cost_priority: 'balanced',
      items: NO_GRAM_GELATO(),
    });
    useConstraintStudioStore.getState().resetForTests();
    const direct = buildOptimizePreview(buildRecipeInput(useRecipeStore.getState()), NO, 'now');
    useConstraintStudioStore.getState().createOptimizePreview();
    const stored = useConstraintStudioStore.getState().preview;
    expect(direct.ok).toBe(true);
    expect(stored).not.toBeNull();
    if (!direct.ok || !stored) return;
    expect(stored.proposedInput.items.map((i) => [i.id, i.planned_grams])).toEqual(
      direct.preview.proposedInput.items.map((i) => [i.id, i.planned_grams]),
    );
  });

  it('ENGINE/CONFIG versions unchanged', () => {
    const result = calculateRecipe(input(NO_GRAM_GELATO(), 'milk_gelato', -11));
    expect(result.engine_version).toBe('0.4.0');
    expect(result.config_version).toBe('0.7.0');
  });
});
