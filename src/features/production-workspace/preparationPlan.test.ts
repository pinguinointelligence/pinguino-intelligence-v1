import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { educationCopy } from '@/copy/education.pl';
import type { RecipeInput } from '@/engine';
import {
  genericMachineEducation,
  machineEducationById,
  type RecipeProcessEvidence,
} from '@/features/education';
import { MACHINE_CATALOG, SAGE_SMART_SCOOP_BCI600 } from '@/features/machine-catalog';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import {
  OWNER_FRESH_STRAWBERRY_TOPPING_RULE,
  buildPreparationPlan,
  preparationPlanForRecipe,
  preparationPlanForSession,
  type PreparationPlan,
  type PreparationPlanLine,
  type PreparationStep,
} from './preparationPlan';
import { nextProductionLineId } from './productionNextAction';
import {
  confirmProductionLine,
  createProductionSession,
  reopenProductionRecord,
} from './productionSession';
import { productionTestComposition } from './productionTestComposition.fixture';

/*
 * Technical fixtures only. Evidence entries copy the SHAPE of real frozen
 * snapshots (dataset 2026-08-28-process-v2) so the rule is exercised on the same
 * fields Production reads; they are not a source of food knowledge.
 */
const copy = educationCopy.preparation;
type Decision = RecipeProcessEvidence['decision'];

const evidence = (
  mapperId: string,
  decision: Decision,
  options: { verified?: boolean; lateAdditionGuidance?: string } = {},
): RecipeProcessEvidence => ({
  decision,
  reasonType: decision === 'heat_required_for_safety' ? 'food_safety' : 'ingredient_function',
  affectedIngredientIds: [mapperId],
  explanation: 'internal process note',
  lateAdditionGuidance: options.lateAdditionGuidance ?? null,
  source: {
    id: `2026-08-28-process-v2:${mapperId}:${decision}`,
    label: 'Owner-approved Mapper process authority through 2026-08-28',
    reference: options.verified === false ? '' : 'source-reference',
    verificationStatus: options.verified === false ? 'provisional' : 'verified',
  },
});

const snapshot = (
  lineId: string,
  options: {
    mapperId?: string;
    familyId?: string | null;
    formId?: string | null;
    scope?: ProductBehaviorSnapshot['processScope'];
    evidence?: RecipeProcessEvidence[];
  } = {},
): ProductBehaviorSnapshot =>
  ({
    lineId,
    mapperIngredientId: options.mapperId ?? null,
    familyId: options.familyId ?? null,
    formId: options.formId ?? null,
    processScope: options.scope ?? 'BASE_FORMULATION',
    sharedFacts: { processEvidence: options.evidence ?? [] },
  }) as unknown as ProductBehaviorSnapshot;

const TARA = (lineId = 'tara') =>
  snapshot(lineId, {
    mapperId: 'PI-ING-000492',
    evidence: [evidence('PI-ING-000492', 'heat_required_for_function')],
  });
const FRESH_STRAWBERRIES = (lineId: string, scope: ProductBehaviorSnapshot['processScope']) =>
  snapshot(lineId, {
    mapperId: 'PI-ING-001553',
    familyId: 'fruit',
    formId: 'fresh',
    scope,
    evidence: [evidence('PI-ING-001553', 'cold_process_approved')],
  });
const COLD = (lineId: string, mapperId: string, formId: string | null = null) =>
  snapshot(lineId, { mapperId, formId, evidence: [evidence(mapperId, 'cold_process_approved')] });
const LIMONCELLO = (lineId = 'limoncello') =>
  snapshot(lineId, {
    mapperId: 'PI-ING-000001',
    formId: 'alcoholic_beverage',
    evidence: [
      evidence('PI-ING-000001', 'cold_process_approved', {
        lateAdditionGuidance: 'Alkohol jest lotny; nie zakładamy ogrzewania.',
      }),
    ],
  });
const UNKNOWN = (lineId: string, mapperId: string, formId: string | null = null) =>
  snapshot(lineId, { mapperId, formId, evidence: [] });

const line = (lineId: string, grams: number, done = false): PreparationPlanLine => ({
  lineId,
  name: lineId.toUpperCase(),
  grams,
  plannedGrams: grams,
  done,
});

const lineSteps = (plan: PreparationPlan) =>
  plan.steps.filter(
    (step): step is Extract<PreparationStep, { kind: 'line' }> => step.kind === 'line',
  );
const sequence = (plan: PreparationPlan) =>
  plan.steps.map((step) => (step.kind === 'line' ? step.lineId : `[${step.id}]`));
const stepFor = (plan: PreparationPlan, lineId: string) =>
  lineSteps(plan).find((step) => step.lineId === lineId)!;
const customerText = (plan: PreparationPlan) =>
  JSON.stringify(
    plan.steps.map((step) =>
      step.kind === 'line'
        ? [step.instruction, step.note]
        : step.kind === 'heat'
          ? [step.title, step.productNames, step.details]
          : [step.title, step.details, step.timing],
    ),
  );

describe('PREPARATION PLAN — one plan from existing data', () => {
  it('PREP-01 keeps the recipe order and every gram when no line needs heat', () => {
    const plan = buildPreparationPlan({
      baseLines: [line('milk', 500), line('sugar', 150), line('smp', 40)],
      addonLines: [],
      snapshots: {
        milk: UNKNOWN('milk', 'PI-ING-milk'),
        sugar: COLD('sugar', 'PI-ING-000514'),
        smp: UNKNOWN('smp', 'PI-ING-000270'),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual(['milk', 'sugar', 'smp']);
    expect(plan.baseLineOrder).toEqual(['milk', 'sugar', 'smp']);
    expect(lineSteps(plan).map((step) => step.grams)).toEqual([500, 150, 40]);
    expect(lineSteps(plan).every((step) => !step.moved)).toBe(true);
    expect(plan.steps.some((step) => step.kind === 'heat')).toBe(false);
  });

  it('PREP-02 fresh strawberries in the Base stay cold — never inside the heated part', () => {
    // Real saved order: Tara is the last Base line in 656/841 versions; here the
    // fresh fruit is FIRST, so the documented cold-add is the only move.
    const plan = buildPreparationPlan({
      baseLines: [
        line('strawberries', 300),
        line('water', 400),
        line('sugar', 150),
        line('tara', 4),
      ],
      addonLines: [],
      snapshots: {
        strawberries: FRESH_STRAWBERRIES('strawberries', 'BASE_FORMULATION'),
        water: COLD('water', 'PI-ING-water', 'liquid'),
        sugar: COLD('sugar', 'PI-ING-000514'),
        tara: TARA(),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual(['water', 'sugar', 'tara', '[heat]', 'strawberries']);
    const strawberries = stepFor(plan, 'strawberries');
    expect(strawberries.instruction).toBe('Umyj, dodaj na zimno i zmiksuj');
    expect(strawberries.moved).toBe(true);
    const heat = plan.steps.find((step) => step.kind === 'heat')!;
    expect(heat.kind === 'heat' && heat.productNames).toEqual(['TARA']);
    expect(heat.kind === 'heat' && heat.precedingLineIds).toEqual(['water', 'sugar', 'tara']);
    // Cold approval does not forbid heating: water and sugar keep their place.
    expect(stepFor(plan, 'water').moved).toBe(false);
    expect(customerText(plan)).not.toMatch(/°C|\bmin\b|minut|godzin|gotuj|zagotuj|pasteryz/i);
  });

  it('PREP-02b without any heat line the same strawberries get no heat step at all', () => {
    const plan = buildPreparationPlan({
      baseLines: [line('water', 400), line('strawberries', 300)],
      addonLines: [],
      snapshots: {
        water: COLD('water', 'PI-ING-water', 'liquid'),
        strawberries: FRESH_STRAWBERRIES('strawberries', 'BASE_FORMULATION'),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual(['water', 'strawberries']);
    // Nothing to blend into is claimed without a cooled base.
    expect(stepFor(plan, 'strawberries').instruction).toBe('Umyj i dodaj na zimno');
  });

  it('PREP-03 fresh strawberries as a topping are cut and added at serving, never mixed', () => {
    const plan = buildPreparationPlan({
      baseLines: [line('milk', 500)],
      addonLines: [line('strawberry-topping', 80)],
      snapshots: {
        milk: UNKNOWN('milk', 'PI-ING-milk'),
        'strawberry-topping': FRESH_STRAWBERRIES('strawberry-topping', 'POST_PROCESS_ADDON'),
      },
      machineGuide: machineEducationById(SAGE_SMART_SCOOP_BCI600.id),
    });
    const topping = stepFor(plan, 'strawberry-topping');
    expect(topping.scope).toBe('addon');
    expect(topping.instruction).toBe('Pokrój truskawki i dodaj przy podaniu. Nie miksuj z bazą.');
    expect(topping.sourceIds).toContain(OWNER_FRESH_STRAWBERRY_TOPPING_RULE.id);
    // After the machine, never inside it.
    expect(sequence(plan)).toEqual(['milk', '[machine:run]', 'strawberry-topping']);
  });

  it('PREP-03c a topping carries no Base heat instruction; a real conflict is still stated', () => {
    const plan = buildPreparationPlan({
      baseLines: [],
      addonLines: [
        line('chocolate-topping', 20),
        line('conflict-topping', 10),
        line('zero-topping', 0),
      ],
      snapshots: {
        'chocolate-topping': snapshot('chocolate-topping', {
          mapperId: 'PI-ING-000087',
          scope: 'POST_PROCESS_ADDON',
          evidence: [evidence('PI-ING-000087', 'heat_required_for_function')],
        }),
        'conflict-topping': snapshot('conflict-topping', {
          scope: 'POST_PROCESS_ADDON',
          evidence: [
            evidence('c', 'cold_process_approved'),
            evidence('c', 'heat_required_for_safety'),
          ],
        }),
        'zero-topping': snapshot('zero-topping', {
          scope: 'POST_PROCESS_ADDON',
          evidence: [
            evidence('z', 'cold_process_approved'),
            evidence('z', 'heat_required_for_safety'),
          ],
        }),
      },
      machineGuide: null,
    });
    expect(stepFor(plan, 'chocolate-topping')).toMatchObject({
      instruction: copy.actions.addAfterMachine,
      note: null,
    });
    expect(stepFor(plan, 'conflict-topping').note).toBe(copy.markers.conflict);
    expect(stepFor(plan, 'zero-topping').note).toBeNull();
    expect(customerText(plan)).not.toContain(copy.markers.heat);
  });

  it('PREP-03b cutting is never generalised to another form of the same fruit', () => {
    const plan = buildPreparationPlan({
      baseLines: [],
      addonLines: [line('puree-topping', 60), line('sauce-topping', 40), line('basil', 5)],
      snapshots: {
        'puree-topping': snapshot('puree-topping', {
          mapperId: 'PI-ING-001435',
          formId: 'puree',
          scope: 'POST_PROCESS_ADDON',
        }),
        basil: snapshot('basil', {
          mapperId: 'PI-ING-001654',
          familyId: 'spice_herb',
          formId: 'fresh',
          scope: 'POST_PROCESS_ADDON',
        }),
        'sauce-topping': snapshot('sauce-topping', {
          mapperId: 'PI-ING-000632',
          formId: 'flavour_paste',
          scope: 'POST_PROCESS_ADDON',
          evidence: [evidence('PI-ING-000632', 'cold_process_approved')],
        }),
      },
      machineGuide: null,
    });
    expect(customerText(plan)).not.toContain('Pokrój');
    expect(stepFor(plan, 'puree-topping').instruction).toBe(copy.actions.addAfterMachine);
    expect(stepFor(plan, 'sauce-topping').instruction).toBe(copy.actions.addAfterMachine);
    // No serving/"do not mix" claim beyond the owner's exact strawberry application.
    expect(stepFor(plan, 'basil').instruction).toBe(copy.actions.addAfterMachine);
    expect(customerText(plan)).not.toMatch(/przy podaniu|Nie miksuj/);
  });

  it('PREP-04 the same product in Base and as a topping stays two lines, each by its own role', () => {
    const plan = buildPreparationPlan({
      baseLines: [line('water', 400), line('tara', 4), line('strawberries-base', 300)],
      addonLines: [line('strawberries-top', 60)],
      snapshots: {
        water: COLD('water', 'PI-ING-water', 'liquid'),
        tara: TARA(),
        'strawberries-base': FRESH_STRAWBERRIES('strawberries-base', 'BASE_FORMULATION'),
        'strawberries-top': FRESH_STRAWBERRIES('strawberries-top', 'POST_PROCESS_ADDON'),
      },
      machineGuide: null,
    });
    const steps = lineSteps(plan);
    expect(steps.map((step) => step.lineId)).toEqual([
      'water',
      'tara',
      'strawberries-base',
      'strawberries-top',
    ]);
    expect(steps.filter((step) => step.lineId.startsWith('strawberries'))).toHaveLength(2);
    expect(stepFor(plan, 'strawberries-base').instruction).toBe(copy.actions.washAddColdAndBlend);
    expect(stepFor(plan, 'strawberries-top').instruction).toBe(
      copy.actions.cutFreshStrawberriesAtServing,
    );
    expect(steps.reduce((sum, step) => sum + step.grams, 0)).toBe(764);
  });

  it('PREP-05 heat + a heat-sensitive line: only that line moves behind the heat step', () => {
    // Shape of a real saved Sorbet: lemon juice UNKNOWN, limoncello (heat-sensitive),
    // water, sucrose, dextrose, inulin UNKNOWN, Tara last.
    const plan = buildPreparationPlan({
      baseLines: [
        line('lemon', 120),
        line('limoncello', 40),
        line('water', 400),
        line('sucrose', 150),
        line('dextrose', 40),
        line('inulin', 20),
        line('tara', 4),
      ],
      addonLines: [],
      snapshots: {
        lemon: UNKNOWN('lemon', 'PI-ING-lemon', 'juice'),
        limoncello: LIMONCELLO(),
        water: COLD('water', 'PI-ING-water', 'liquid'),
        sucrose: COLD('sucrose', 'PI-ING-000514'),
        dextrose: COLD('dextrose', 'PI-ING-dextrose'),
        inulin: UNKNOWN('inulin', 'PI-ING-inulin', 'powder'),
        tara: TARA(),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual([
      'lemon',
      'water',
      'sucrose',
      'dextrose',
      'inulin',
      'tara',
      '[heat]',
      'limoncello',
    ]);
    expect(
      lineSteps(plan)
        .filter((step) => step.moved)
        .map((step) => step.lineId),
    ).toEqual(['limoncello']);
    const limoncello = stepFor(plan, 'limoncello');
    expect(limoncello.instruction).toBe(copy.actions.addAfterCooling);
    expect(limoncello.note).toBe(copy.markers.heatSensitive);
    const heat = plan.steps.find((step) => step.kind === 'heat');
    expect(heat?.kind === 'heat' && heat.details).toEqual([copy.heat.method, copy.heat.cool]);
    expect(customerText(plan)).not.toMatch(/\d\s*°|\d+\s*(?:min|s|h)\b/);
  });

  it('PREP-05b an UNKNOWN line is neither heated nor skipped for its status: recipe position, stated gap', () => {
    const plan = buildPreparationPlan({
      baseLines: [line('milk', 500), line('tara', 4), line('frozen-puree', 200)],
      addonLines: [],
      snapshots: {
        milk: UNKNOWN('milk', 'PI-ING-milk'),
        tara: TARA(),
        'frozen-puree': UNKNOWN('frozen-puree', 'PI-ING-001435', 'puree'),
      },
      machineGuide: null,
    });
    // Owner addendum: UNKNOWN is not an automatic "add before heating" group.
    expect(sequence(plan)).toEqual(['milk', 'tara', '[heat]', 'frozen-puree']);
    const puree = stepFor(plan, 'frozen-puree');
    // After cooling the missing instruction is stated, so no cold approval is implied.
    expect(puree).toMatchObject({
      moved: false,
      process: 'unknown',
      afterCooling: true,
      note: copy.markers.unknown,
    });
    // Before the heat step an unknown line carries no note and no heat claim.
    expect(stepFor(plan, 'milk')).toMatchObject({ process: 'unknown', note: null });
    expect(puree.instruction).toBe(copy.actions.add);
    const heat = plan.steps.find((step) => step.kind === 'heat');
    // Named only for verified heat lines: the unknown purée is not called heat.
    expect(heat?.kind === 'heat' && heat.productNames).toEqual(['TARA']);
  });

  it('PREP-05c a real saved order (6657ae70 shape): recipe order around the last heat line', () => {
    const plan = buildPreparationPlan({
      baseLines: [
        line('milk', 500),
        line('smp', 40),
        line('sucrose', 150),
        line('tara', 4),
        line('banana-puree', 120),
        line('dark-chocolate', 60),
        line('strawberry-puree', 155),
        line('cranberry-variegato', 50),
      ],
      addonLines: [],
      snapshots: {
        milk: UNKNOWN('milk', 'PI-ING-milk'),
        smp: UNKNOWN('smp', 'PI-ING-000270', 'powder'),
        sucrose: COLD('sucrose', 'PI-ING-000514'),
        tara: TARA(),
        'banana-puree': UNKNOWN('banana-puree', 'PI-ING-banana-puree', 'puree'),
        'dark-chocolate': snapshot('dark-chocolate', {
          mapperId: 'PI-ING-000087',
          formId: 'dark_chocolate',
          evidence: [evidence('PI-ING-000087', 'heat_required_for_function')],
        }),
        'strawberry-puree': UNKNOWN('strawberry-puree', 'PI-ING-001435', 'puree'),
        'cranberry-variegato': COLD('cranberry-variegato', 'PI-ING-variegato', 'flavour_paste'),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual([
      'milk',
      'smp',
      'sucrose',
      'tara',
      'banana-puree',
      'dark-chocolate',
      '[heat]',
      'strawberry-puree',
      'cranberry-variegato',
    ]);
    expect(stepFor(plan, 'strawberry-puree').note).toBe(copy.markers.unknown);
    expect(stepFor(plan, 'banana-puree').note).toBeNull();
    const heat = plan.steps.find((step) => step.kind === 'heat');
    expect(heat?.kind === 'heat' && heat.productNames).toEqual(['TARA', 'DARK-CHOCOLATE']);
    expect(stepFor(plan, 'cranberry-variegato')).toMatchObject({
      instruction: copy.actions.add,
      note: copy.markers.cold,
      moved: false,
    });
    expect(lineSteps(plan).some((step) => step.moved)).toBe(false);
  });

  it('PREP-05d the Mapper form `fresh` on milk is not fresh fruit and never leaves the heated part', () => {
    const plan = buildPreparationPlan({
      baseLines: [line('fresh-milk', 500), line('sugar', 150), line('tara', 4)],
      addonLines: [],
      snapshots: {
        // Shape of MILK · fresh_milk: familyId null, formId 'fresh'. Even if it were
        // ever approved for cold use, it is not fresh fruit.
        'fresh-milk': COLD('fresh-milk', 'PI-ING-000201', 'fresh'),
        sugar: COLD('sugar', 'PI-ING-000514'),
        tara: TARA(),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual(['fresh-milk', 'sugar', 'tara', '[heat]']);
    expect(stepFor(plan, 'fresh-milk').instruction).toBe(copy.actions.add);
  });

  it('PREP-05e a 0 g line neither creates nor moves the heat step and carries no process note', () => {
    const zeroHeatOnly = buildPreparationPlan({
      baseLines: [line('strawberries', 300), line('water', 400), line('seed-chocolate', 0)],
      addonLines: [],
      snapshots: {
        strawberries: FRESH_STRAWBERRIES('strawberries', 'BASE_FORMULATION'),
        water: COLD('water', 'PI-ING-water', 'liquid'),
        'seed-chocolate': snapshot('seed-chocolate', {
          evidence: [evidence('PI-ING-000087', 'heat_required_for_function')],
        }),
      },
      machineGuide: null,
    });
    expect(sequence(zeroHeatOnly)).toEqual(['strawberries', 'water', 'seed-chocolate']);

    const trailingZero = buildPreparationPlan({
      baseLines: [
        line('milk', 500),
        line('tara', 4),
        line('crown-seed', 0),
        line('seed-chocolate', 0),
      ],
      addonLines: [],
      snapshots: {
        milk: UNKNOWN('milk', 'PI-ING-milk'),
        tara: TARA(),
        'crown-seed': UNKNOWN('crown-seed', 'PI-ING-crown'),
        'seed-chocolate': snapshot('seed-chocolate', {
          evidence: [evidence('PI-ING-000087', 'heat_required_for_safety')],
        }),
      },
      machineGuide: null,
    });
    // 0 g placeholders keep their recipe place and carry no process note: nothing is added.
    expect(sequence(trailingZero)).toEqual([
      'milk',
      'tara',
      '[heat]',
      'crown-seed',
      'seed-chocolate',
    ]);
    expect(stepFor(trailingZero, 'crown-seed').note).toBeNull();
    expect(stepFor(trailingZero, 'seed-chocolate').note).toBeNull();
  });

  describe('PREP-11 milk: capability is not a plan, a condition is not a product claim', () => {
    const MILK_CONDITION_REF = 'OWNER_ADDENDUM_2026-09-17_MILK_PASTEURIZED_UHT';
    // Fixture of the PREPARED data package (not applied to any database): generic milk
    // approved for cold use only under the owner's pasteurised/UHT condition.
    const conditionedMilk = (lineId: string) =>
      snapshot(lineId, {
        mapperId: 'PI-ING-000236',
        formId: 'liquid',
        evidence: [
          {
            ...evidence('PI-ING-000236', 'cold_process_approved'),
            source: {
              id: `2026-09-17-owner-milk:PI-ING-000236:cold_process_approved`,
              label: 'Owner addendum 2026-09-17',
              reference: MILK_CONDITION_REF,
              verificationStatus: 'verified' as const,
            },
          },
        ],
      });

    it('pasteurised/UHT milk in a cold recipe: recipe order, no heat step, the condition shown', () => {
      const plan = buildPreparationPlan({
        baseLines: [line('milk', 500), line('sugar', 150), line('strawberries', 300)],
        addonLines: [],
        snapshots: {
          milk: conditionedMilk('milk'),
          sugar: COLD('sugar', 'PI-ING-000514'),
          strawberries: FRESH_STRAWBERRIES('strawberries', 'BASE_FORMULATION'),
        },
        machineGuide: null,
      });
      expect(sequence(plan)).toEqual(['milk', 'sugar', 'strawberries']);
      expect(stepFor(plan, 'milk')).toMatchObject({
        process: 'cold',
        note: 'Użyj mleka pasteryzowanego lub UHT.',
        moved: false,
      });
    });

    it('the same milk in a heated recipe stays in the heated part — never moved to the late additions', () => {
      const plan = buildPreparationPlan({
        baseLines: [
          line('milk', 500),
          line('strawberries', 300),
          line('sugar', 150),
          line('tara', 4),
        ],
        addonLines: [],
        snapshots: {
          milk: conditionedMilk('milk'),
          strawberries: FRESH_STRAWBERRIES('strawberries', 'BASE_FORMULATION'),
          sugar: COLD('sugar', 'PI-ING-000514'),
          tara: TARA(),
        },
        machineGuide: null,
      });
      expect(sequence(plan)).toEqual(['milk', 'sugar', 'tara', '[heat]', 'strawberries']);
      expect(stepFor(plan, 'milk')).toMatchObject({
        afterCooling: false,
        moved: false,
        note: 'Użyj mleka pasteryzowanego lub UHT.',
      });
    });

    it('raw or unspecified milk gets no cold approval and no condition', () => {
      const plan = buildPreparationPlan({
        baseLines: [line('milk', 500), line('tara', 4), line('late-milk', 100)],
        addonLines: [],
        snapshots: {
          milk: UNKNOWN('milk', 'PI-ING-000236', 'liquid'),
          tara: TARA(),
          'late-milk': UNKNOWN('late-milk', 'PI-ING-002565', 'liquid'),
        },
        machineGuide: null,
      });
      expect(stepFor(plan, 'milk')).toMatchObject({ process: 'unknown', note: null });
      expect(stepFor(plan, 'late-milk')).toMatchObject({
        process: 'unknown',
        note: copy.markers.unknown,
      });
      expect(customerText(plan)).not.toContain('pasteryzowanego');
      // A cold approval from a different source (e.g. an exact UHT label) states no milk condition.
      const labelled = buildPreparationPlan({
        baseLines: [line('uht-cream', 200)],
        addonLines: [],
        snapshots: { 'uht-cream': COLD('uht-cream', 'PI-ING-001390', 'liquid') },
        machineGuide: null,
      });
      expect(stepFor(labelled, 'uht-cream').note).toBe(copy.markers.cold);
    });
  });

  it('PREP-11b Rescue-added lines keep their per-line facts; a raised planned 0 g heat line gets its note', () => {
    const MILK_CONDITION_REF = 'OWNER_ADDENDUM_2026-09-17_MILK_PASTEURIZED_UHT';
    const plan = buildPreparationPlan({
      baseLines: [line('water', 400), { ...line('tara', 2), plannedGrams: 0 }],
      appendedBaseLines: [
        { ...line('rescue:milk', 60), plannedGrams: 0 },
        { ...line('rescue:puree', 30), plannedGrams: 0 },
      ],
      addonLines: [],
      snapshots: {
        water: COLD('water', 'PI-ING-001409', 'liquid'),
        tara: TARA(),
        'rescue:milk': snapshot('rescue:milk', {
          mapperId: 'PI-ING-000236',
          evidence: [
            {
              ...evidence('PI-ING-000236', 'cold_process_approved'),
              source: {
                id: 'x',
                label: 'Owner addendum 2026-09-17',
                reference: MILK_CONDITION_REF,
                verificationStatus: 'verified' as const,
              },
            },
          ],
        }),
        'rescue:puree': UNKNOWN('rescue:puree', 'PI-ING-001435', 'puree'),
      },
      machineGuide: null,
    });
    // Tara was planned at 0 g: no heat step is created, but the grams now added get the note.
    expect(sequence(plan)).toEqual(['water', 'tara', 'rescue:milk', 'rescue:puree']);
    expect(stepFor(plan, 'tara').note).toBe(copy.markers.heat);
    expect(stepFor(plan, 'rescue:milk').note).toBe('Użyj mleka pasteryzowanego lub UHT.');
    // No heat step in this plan, so an unknown Rescue line gets no after-cooling note.
    expect(stepFor(plan, 'rescue:puree').note).toBeNull();
  });

  it('PREP-12 a safety heat requirement is never cancelled by a cold entry; late additions come once', () => {
    const plan = buildPreparationPlan({
      baseLines: [
        line('raw-egg', 60),
        line('limoncello', 30),
        line('raspberries', 200),
        line('milk', 500),
        line('egg-both', 20),
      ],
      addonLines: [line('raspberry-topping', 40)],
      snapshots: {
        'raw-egg': snapshot('raw-egg', {
          mapperId: 'PI-ING-001666',
          evidence: [evidence('PI-ING-001666', 'heat_required_for_safety')],
        }),
        limoncello: LIMONCELLO(),
        raspberries: snapshot('raspberries', {
          mapperId: 'PI-ING-raspberry',
          familyId: 'fruit',
          formId: 'fresh',
          evidence: [evidence('PI-ING-raspberry', 'cold_process_approved')],
        }),
        milk: UNKNOWN('milk', 'PI-ING-000236', 'liquid'),
        'egg-both': snapshot('egg-both', {
          mapperId: 'PI-ING-egg-both',
          evidence: [
            evidence('PI-ING-egg-both', 'cold_process_approved'),
            evidence('PI-ING-egg-both', 'heat_required_for_safety'),
          ],
        }),
        'raspberry-topping': snapshot('raspberry-topping', {
          mapperId: 'PI-ING-raspberry',
          familyId: 'fruit',
          formId: 'fresh',
          scope: 'POST_PROCESS_ADDON',
          evidence: [evidence('PI-ING-raspberry', 'cold_process_approved')],
        }),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual([
      'raw-egg',
      'milk',
      'egg-both',
      '[heat]',
      'limoncello',
      'raspberries',
      'raspberry-topping',
    ]);
    const heat = plan.steps.find((step) => step.kind === 'heat');
    expect(heat?.kind === 'heat' && heat.productNames).toEqual(['RAW-EGG']);
    // A cold entry next to a safety requirement is a conflict, never a cold approval.
    expect(stepFor(plan, 'egg-both')).toMatchObject({
      process: 'conflict',
      moved: false,
      afterCooling: false,
      note: copy.markers.conflict,
    });
    // Every line appears exactly once — no second "add" for a moved late addition.
    const ids = lineSteps(plan).map((step) => step.lineId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stepFor(plan, 'raspberries')).toMatchObject({
      afterCooling: true,
      moved: true,
      instruction: copy.actions.washAddColdAndBlend,
    });
    // Washing is preparation, not a heat treatment: nothing added after cooling is called treated.
    expect(customerText(plan)).not.toMatch(/pasteryz|zdezynfek/i);
  });

  it('PREP-06 machine steps at their moment; no universal freezing step', () => {
    const lines = { baseLines: [line('milk', 500)], addonLines: [line('topping', 20)] };
    const snapshots = { milk: UNKNOWN('milk', 'PI-ING-milk'), topping: UNKNOWN('topping', 'x') };
    const bowlProfile = MACHINE_CATALOG.find((profile) => profile.technology === 'frozen_bowl')!;
    const bowl = buildPreparationPlan({
      ...lines,
      snapshots,
      machineGuide: machineEducationById(bowlProfile.id),
    });
    expect(sequence(bowl)).toEqual(['[machine:before]', 'milk', '[machine:run]', 'topping']);
    const before = bowl.steps[0]!;
    expect(before.kind === 'machine_before' && before.details).toEqual(['Zamroź misę']);
    const run = bowl.steps.find((step) => step.kind === 'machine')!;
    expect(run.kind === 'machine' && run.details.join(' ')).not.toMatch(/zamro(?:ź|ż).*mis/i);

    const sage = buildPreparationPlan({
      ...lines,
      snapshots,
      machineGuide: machineEducationById(SAGE_SMART_SCOOP_BCI600.id),
    });
    expect(sequence(sage)).toEqual(['milk', '[machine:run]', 'topping']);
    expect(customerText(sage).toLowerCase()).not.toMatch(/zamro(?:ź|ż)/);

    const ninja = buildPreparationPlan({
      ...lines,
      snapshots,
      machineGuide: genericMachineEducation('frozen_container'),
    });
    expect(sequence(ninja)).toEqual(['milk', '[machine:run]', 'topping']);
    const ninjaRun = ninja.steps.find((step) => step.kind === 'machine')!;
    expect(ninjaRun.kind === 'machine' && ninjaRun.details).toContain('Zamroź cały pojemnik');

    const professional = buildPreparationPlan({ ...lines, snapshots, machineGuide: null });
    expect(sequence(professional)).toEqual(['milk', 'topping']);
  });

  it('PREP-07 UNKNOWN, provisional and conflicting evidence never become cold, heat or a move', () => {
    const plan = buildPreparationPlan({
      baseLines: [
        line('fresh-unknown', 100),
        line('provisional-cold', 100),
        line('conflict', 10),
        line('tara', 4),
      ],
      addonLines: [],
      snapshots: {
        'fresh-unknown': UNKNOWN('fresh-unknown', 'PI-ING-herb', 'fresh'),
        'provisional-cold': snapshot('provisional-cold', {
          mapperId: 'PI-ING-p',
          formId: 'fresh',
          evidence: [evidence('PI-ING-p', 'cold_process_approved', { verified: false })],
        }),
        conflict: snapshot('conflict', {
          mapperId: 'PI-ING-c',
          formId: 'fresh',
          evidence: [
            evidence('PI-ING-c', 'cold_process_approved'),
            evidence('PI-ING-c', 'heat_required_for_safety'),
          ],
        }),
        tara: TARA(),
      },
      machineGuide: null,
    });
    expect(sequence(plan)).toEqual([
      'fresh-unknown',
      'provisional-cold',
      'conflict',
      'tara',
      '[heat]',
    ]);
    expect(stepFor(plan, 'fresh-unknown')).toMatchObject({ process: 'unknown', moved: false });
    expect(stepFor(plan, 'provisional-cold')).toMatchObject({
      process: 'unknown',
      note: null,
    });
    expect(stepFor(plan, 'conflict')).toMatchObject({
      process: 'conflict',
      note: copy.markers.conflict,
    });
    const heat = plan.steps.find((step) => step.kind === 'heat');
    expect(heat?.kind === 'heat' && heat.productNames).toEqual(['TARA']);
    // A snapshot that belongs to another line is not this line's authority.
    const foreign = buildPreparationPlan({
      baseLines: [line('strawberries', 300), line('tara', 4)],
      addonLines: [],
      snapshots: {
        strawberries: FRESH_STRAWBERRIES('other-line', 'BASE_FORMULATION'),
        tara: TARA(),
      },
      machineGuide: null,
    });
    expect(stepFor(foreign, 'strawberries')).toMatchObject({ process: 'unknown', moved: false });
  });

  it('PREP-08 scanner, catalog and Mapper products share the same frozen snapshot input', () => {
    const recipe: RecipeInput = {
      ...DEFAULT_PRESET,
      items: [
        {
          id: 'scanned-strawberries',
          ingredient: {
            ...DEFAULT_PRESET.items[0]!.ingredient,
            id: 'private-product-1',
            name: 'Truskawki',
          },
          planned_grams: 300,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'tara',
          ingredient: { ...DEFAULT_PRESET.items[0]!.ingredient, id: 'PI-ING-000492', name: 'Tara' },
          planned_grams: 4,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
    };
    const scanned = {
      ...FRESH_STRAWBERRIES('scanned-strawberries', 'BASE_FORMULATION'),
      source: 'barcode',
    } as ProductBehaviorSnapshot;
    const plan = preparationPlanForRecipe(
      recipe,
      {
        baseOrder: ['scanned-strawberries', 'tara'],
        toppings: [],
        behaviorSnapshots: { 'scanned-strawberries': scanned, tara: TARA() },
      },
      null,
    );
    expect(sequence(plan)).toEqual(['tara', '[heat]', 'scanned-strawberries']);
    // The name alone decides nothing: the same name without a snapshot stays unknown.
    const nameOnly = preparationPlanForRecipe(
      recipe,
      {
        baseOrder: ['scanned-strawberries', 'tara'],
        toppings: [],
        behaviorSnapshots: { tara: TARA() },
      },
      null,
    );
    expect(sequence(nameOnly)).toEqual(['scanned-strawberries', 'tara', '[heat]']);
    expect(stepFor(nameOnly, 'scanned-strawberries').process).toBe('unknown');
  });

  it('PREP-09 resume, correction and Rescue never ask to add confirmed grams again', () => {
    const plannedInput: RecipeInput = {
      ...DEFAULT_PRESET,
      items: [
        { ...DEFAULT_PRESET.items[0]!, id: 'fresh-fruit', actual_grams: null },
        { ...DEFAULT_PRESET.items[1]!, id: 'water', actual_grams: null },
        { ...DEFAULT_PRESET.items[2]!, id: 'tara', actual_grams: null },
      ],
    };
    // Complete frozen authority (Rescue re-validates it), overlaid with the process facts under test.
    const composition = productionTestComposition(plannedInput);
    const overlay = (lineId: string, facts: ProductBehaviorSnapshot): ProductBehaviorSnapshot => ({
      ...composition.behaviorSnapshots[lineId]!,
      familyId: facts.familyId,
      formId: facts.formId,
      mapperIngredientId: facts.mapperIngredientId,
      sharedFacts: {
        ...composition.behaviorSnapshots[lineId]!.sharedFacts!,
        processEvidence: facts.sharedFacts!.processEvidence,
      },
    });
    const session = createProductionSession({
      sessionId: 'prep-plan-run',
      ownerUserId: 'owner',
      source: { recipeId: 'r', recipeVersionId: 'v', recipeVersionNumber: 1, recipeName: 'QA' },
      plannedInput,
      plannedComposition: {
        ...composition,
        baseOrder: ['fresh-fruit', 'water', 'tara'],
        behaviorSnapshots: {
          'fresh-fruit': overlay(
            'fresh-fruit',
            FRESH_STRAWBERRIES('fresh-fruit', 'BASE_FORMULATION'),
          ),
          water: overlay('water', COLD('water', 'PI-ING-water', 'liquid')),
          tara: overlay('tara', TARA()),
        },
      },
      startedAt: '2026-09-17T10:00:00.000Z',
    });
    // Session order is untouched (hydration authority); the plan and the pointer follow the plan.
    expect(session.lines.map((entry) => entry.lineId)).toEqual(['fresh-fruit', 'water', 'tara']);
    expect(nextProductionLineId(session, false)).toBe('water');

    const water = confirmProductionLine(session, 'water', '2026-09-17T10:01:00.000Z');
    const tara = confirmProductionLine(water, 'tara', '2026-09-17T10:02:00.000Z');
    expect(nextProductionLineId(tara, false)).toBe('fresh-fruit');
    const resumed = preparationPlanForSession(tara, null);
    expect(lineSteps(resumed).map((step) => [step.lineId, step.done])).toEqual([
      ['water', true],
      ['tara', true],
      ['fresh-fruit', false],
    ]);

    // Correction reopens only the corrected line; the other confirmation stands.
    const reopened = reopenProductionRecord(tara, 'water');
    expect(nextProductionLineId(reopened, false)).toBe('water');
    expect(stepFor(preparationPlanForSession(reopened, null), 'tara').done).toBe(true);

    // What an accepted Rescue leaves behind: a retargeted open line and an appended
    // Rescue line. The plan shows current targets once each and never re-adds confirmed grams.
    const rescued = {
      ...tara,
      lines: [
        ...tara.lines.map((entry) =>
          entry.lineId === 'fresh-fruit'
            ? { ...entry, targetGrams: entry.targetGrams + 10 }
            : entry,
        ),
        {
          ...tara.lines[1]!,
          lineId: 'rescue:sugar',
          name: 'Rescue sugar',
          targetGrams: 6,
          plannedGrams: 0,
          confirmed: false,
          physicalAddedGrams: 0,
          confirmedAt: null,
          confirmationOrder: null,
        },
      ],
    };
    const rescuedPlan = preparationPlanForSession(rescued, null);
    expect(sequence(rescuedPlan)).toEqual([
      'water',
      'tara',
      '[heat]',
      'fresh-fruit',
      'rescue:sugar',
    ]);
    const fruitTarget = rescued.lines.find((entry) => entry.lineId === 'fresh-fruit')!.targetGrams;
    expect(lineSteps(rescuedPlan).filter((step) => step.lineId === 'fresh-fruit')).toEqual([
      expect.objectContaining({ grams: fruitTarget, done: false }),
    ]);
    // Same per-line rule as a planned line after cooling: the missing instruction is stated.
    expect(stepFor(rescuedPlan, 'rescue:sugar')).toMatchObject({
      process: 'unknown',
      moved: false,
      afterCooling: false,
      note: copy.markers.unknown,
    });
    expect(
      lineSteps(rescuedPlan)
        .filter((step) => step.done)
        .map((step) => step.lineId),
    ).toEqual(['water', 'tara']);
    expect(nextProductionLineId(rescued, false)).toBe('fresh-fruit');

    // A Rescue-appended line with heat evidence follows the plan and never moves the heat step.
    const rescuedWithHeat = {
      ...rescued,
      lines: [
        ...rescued.lines,
        {
          ...rescued.lines.at(-1)!,
          lineId: 'rescue:stabilizer',
          name: 'Rescue stabilizer',
          targetGrams: 2,
        },
      ],
      plannedComposition: {
        ...rescued.plannedComposition,
        behaviorSnapshots: {
          ...rescued.plannedComposition.behaviorSnapshots,
          'rescue:stabilizer': TARA('rescue:stabilizer'),
        },
      },
    };
    const heatRescuePlan = preparationPlanForSession(rescuedWithHeat, null);
    expect(sequence(heatRescuePlan)).toEqual([
      'water',
      'tara',
      '[heat]',
      'fresh-fruit',
      'rescue:sugar',
      'rescue:stabilizer',
    ]);
    expect(stepFor(heatRescuePlan, 'rescue:stabilizer').note).toBe(copy.markers.heat);

    // A Rescue that raises a PLANNED 0 g heat line cannot create a heat step under
    // fruit that is already in the vessel: the step is decided by planned grams.
    const zeroTaraSession = {
      ...session,
      lines: session.lines.map((entry) =>
        entry.lineId === 'tara'
          ? { ...entry, plannedGrams: 0, targetGrams: 0, draftActualGrams: 0 }
          : entry,
      ),
    };
    expect(nextProductionLineId(zeroTaraSession, false)).toBe('fresh-fruit');
    const fruitFirst = confirmProductionLine(
      zeroTaraSession,
      'fresh-fruit',
      '2026-09-17T11:00:00.000Z',
    );
    const retargeted = {
      ...fruitFirst,
      lines: fruitFirst.lines.map((entry) =>
        entry.lineId === 'tara' ? { ...entry, targetGrams: 2 } : entry,
      ),
    };
    expect(sequence(preparationPlanForSession(retargeted, null))).toEqual([
      'fresh-fruit',
      'water',
      'tara',
    ]);
    expect(nextProductionLineId(retargeted, false)).toBe('water');
  });

  it('PREP-10 customer text carries no internal codes or English process prose', () => {
    const plan = buildPreparationPlan({
      baseLines: [line('lemon', 120), line('limoncello', 40), line('tara', 4), line('conflict', 5)],
      addonLines: [line('strawberry-topping', 60), line('mystery', 10)],
      snapshots: {
        lemon: UNKNOWN('lemon', 'PI-ING-lemon'),
        limoncello: LIMONCELLO(),
        tara: TARA(),
        conflict: snapshot('conflict', {
          evidence: [
            evidence('c', 'cold_process_approved'),
            evidence('c', 'heat_required_for_function'),
          ],
        }),
        'strawberry-topping': FRESH_STRAWBERRIES('strawberry-topping', 'POST_PROCESS_ADDON'),
        mystery: UNKNOWN('mystery', 'x'),
      },
      machineGuide: genericMachineEducation('frozen_bowl'),
    });
    const text = customerText(plan);
    expect(text).not.toMatch(
      /PI-ING|UNKNOWN|COLD_PROCESS|HEAT_REQUIRED|fail-closed|kill-step|verified|Mapper|internal process note|Alkohol jest lotny/,
    );
  });
});
