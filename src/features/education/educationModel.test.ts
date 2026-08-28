import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  MACHINE_CATALOG,
  SAGE_SMART_SCOOP_BCI600,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import { educationCopy } from '@/copy/education.pl';
import {
  FRESH_GELATO_EDUCATION,
  availableMachineEducationCategories,
  classifyCurrentRecipeProcess,
  classifyHeatProcess,
  contextualEducationPrompts,
  machineEducationForProfile,
  mapperProcessRowsToEvidence,
  topLevelEducationOrder,
  verifiedPlantOrigin,
  type ProcessEvidenceDecision,
  type RecipeProcessEvidence,
  type MapperProcessMetadataRow,
} from '.';

const source = (id: string, verificationStatus: 'verified' | 'provisional' = 'verified') => ({
  id,
  label: `Evidence ${id}`,
  reference: `https://example.test/${id}`,
  verificationStatus,
});

const evidence = (
  decision: ProcessEvidenceDecision,
  ingredientId: string,
  id = `${decision}-${ingredientId}`,
): RecipeProcessEvidence => ({
  decision,
  reasonType:
    decision === 'heat_required_for_function'
      ? 'hydration'
      : decision === 'heat_required_for_safety'
        ? 'food_safety'
        : 'process_requirement',
  affectedIngredientIds: [ingredientId],
  explanation: `Verified ${decision}`,
  source: source(id),
});

describe('process classification is positive-evidence only', () => {
  it('never returns cold-process OK from missing data', () => {
    expect(classifyHeatProcess({ ingredientIds: ['milk', 'sugar'], evidence: [] }).status).toBe(
      'unknown',
    );
    expect(classifyCurrentRecipeProcess(starterMilkBase()).status).toBe('unknown');
  });

  it('requires verified cold approval for every exact ingredient identity', () => {
    const partial = classifyHeatProcess({
      ingredientIds: ['water', 'sugar'],
      evidence: [evidence('cold_process_approved', 'water')],
    });
    expect(partial.status).toBe('unknown');
    expect(partial.affectedIngredientIds).toContain('sugar');

    const complete = classifyHeatProcess({
      ingredientIds: ['water', 'sugar'],
      evidence: [
        evidence('cold_process_approved', 'water'),
        evidence('cold_process_approved', 'sugar'),
      ],
    });
    expect(complete.status).toBe('cold_process_ok');
  });

  it('ignores provisional evidence for a cold approval', () => {
    const provisional = {
      ...evidence('cold_process_approved', 'water'),
      source: source('provisional', 'provisional'),
    };
    expect(classifyHeatProcess({ ingredientIds: ['water'], evidence: [provisional] }).status).toBe(
      'unknown',
    );
  });

  it('keeps functional heat and food-safety heat separate and can report both', () => {
    const functional = evidence('heat_required_for_function', 'lbg');
    const safety = evidence('heat_required_for_safety', 'raw-egg');
    const functionOnly = classifyHeatProcess({ ingredientIds: ['lbg'], evidence: [functional] });
    expect(functionOnly.status).toBe('heat_required_for_function');
    expect(functionOnly.reasons[0]?.type).toBe('hydration');

    const safetyOnly = classifyHeatProcess({ ingredientIds: ['raw-egg'], evidence: [safety] });
    expect(safetyOnly.status).toBe('heat_required_for_safety');
    expect(safetyOnly.reasons[0]?.type).toBe('food_safety');

    const both = classifyHeatProcess({
      ingredientIds: ['lbg', 'raw-egg'],
      evidence: [functional, safety],
    });
    expect(both.status).toBe('heat_required_for_both');
    expect(both.reasons.map((reason) => reason.type)).toEqual(['hydration', 'food_safety']);
  });

  it('has no field capable of inventing an exact heat time or temperature', () => {
    const serialized = JSON.stringify(
      classifyHeatProcess({
        ingredientIds: ['lbg'],
        evidence: [evidence('heat_required_for_function', 'lbg')],
      }),
    );
    expect(serialized).not.toMatch(/82|85|minutes|temperatureC|timeMinutes/);
  });

  it.each([
    ['COLD_PROCESS_OK', 'cold_process_ok'],
    ['HEAT_REQUIRED_FOR_FUNCTION', 'heat_required_for_function'],
    ['HEAT_REQUIRED_FOR_SAFETY', 'heat_required_for_safety'],
    ['HEAT_REQUIRED_FOR_BOTH', 'heat_required_for_both'],
    ['UNKNOWN', 'unknown'],
  ] as const)('maps companion %s to fail-closed recipe status %s', (decision, expected) => {
    const row: MapperProcessMetadataRow = {
      ingredient_id: 'PI-ING-PROCESS',
      process_decision: decision,
      reason_type: 'process_requirement',
      explanation_pl: 'Zweryfikowana decyzja procesu.',
      heat_sensitive: false,
      late_addition_guidance_pl: null,
      source_label: 'Owner Process Metadata',
      source_reference: 'owner-workbook:07_Process_Metadata_2026-08-08',
      verification_status: 'verified',
      dataset_version: '2026-08-08',
    };
    const evidenceRows = mapperProcessRowsToEvidence([row]);
    expect(
      classifyHeatProcess({ ingredientIds: [row.ingredient_id], evidence: evidenceRows }).status,
    ).toBe(expected);
  });

  it('surfaces verified late-addition guidance without inventing timing', () => {
    const evidenceRows = mapperProcessRowsToEvidence([
      {
        ingredient_id: 'PI-ING-WHISKY',
        process_decision: 'COLD_PROCESS_OK',
        reason_type: 'process_requirement',
        explanation_pl: 'Składnik jest zgodny z procesem na zimno.',
        heat_sensitive: true,
        late_addition_guidance_pl: 'Dodaj po schłodzeniu bazy, aby ograniczyć utratę aromatu.',
        source_label: 'Owner Process Metadata',
        source_reference: 'owner-workbook:07_Process_Metadata_2026-08-08',
        verification_status: 'verified',
        dataset_version: '2026-08-08',
      },
    ]);
    expect(evidenceRows[0]?.lateAdditionGuidance).toContain('Dodaj po schłodzeniu');
    expect(evidenceRows[0]?.lateAdditionGuidance).not.toMatch(/\d+\s*(min|°C)/);
  });

  it('retains a source-backed late-addition warning when another ingredient requires heat', () => {
    const volatile = {
      ...evidence('cold_process_approved', 'whisky'),
      lateAdditionGuidance: 'Dodaj po schłodzeniu bazy, aby ograniczyć utratę aromatu.',
    };
    const result = classifyHeatProcess({
      ingredientIds: ['chocolate', 'whisky'],
      evidence: [evidence('heat_required_for_function', 'chocolate'), volatile],
    });
    expect(result.status).toBe('heat_required_for_function');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ingredientId: 'whisky', explanation: volatile.lateAdditionGuidance }),
      ]),
    );
  });
});

describe('contextual education selection', () => {
  it('limits the current-recipe prompt set to three cards', () => {
    expect(contextualEducationPrompts(starterMilkBase())).toHaveLength(3);
  });

  it('does not prioritize dairy for a dairy-free sorbet', () => {
    const sorbet = starterMilkBase();
    sorbet.category = 'sorbet';
    sorbet.items = sorbet.items.map((item) => ({
      ...item,
      ingredient: {
        ...item.ingredient,
        category: item.ingredient.category === 'dairy' ? 'water' : item.ingredient.category,
      },
    }));
    expect(contextualEducationPrompts(sorbet).map((prompt) => prompt.id)).not.toContain('dairy');
  });

  it('prioritizes fruit and adapts to inulin/stabilizer presence', () => {
    const recipe = starterMilkBase();
    recipe.items = recipe.items.map((item, index) =>
      index === 0
        ? { ...item, ingredient: { ...item.ingredient, id: 'mango', category: 'fruit' } }
        : index === 1
          ? { ...item, ingredient: { ...item.ingredient, id: 'inulin', category: 'other' } }
          : item,
    );
    const ids = contextualEducationPrompts(recipe).map((prompt) => prompt.id);
    expect(ids[0]).toBe('fruit');
    expect(ids).toContain('micro');
  });

  it('uses one shared system with different Home and Pro order', () => {
    expect(topLevelEducationOrder('home')).toEqual(['process', 'ingredients', 'sugar']);
    expect(topLevelEducationOrder('pro')).toEqual(['ingredients', 'sugar', 'process']);
  });
});

describe('beginner and ingredient content integrity', () => {
  it('starts the sugar lesson with the required beginner explanation', () => {
    expect(educationCopy.sugar.title).toBe('Cukier nie tylko słodzi.');
    expect(educationCopy.sugar.intro).toBe('Cukier wpływa także na to, ile wody zamarza.');
    expect(educationCopy.sugar.rows[0]?.name).toBe('Zwykły cukier (sacharoza)');
    expect(educationCopy.sugar.technicalCopy).toContain('POD');
    expect(educationCopy.sugar.technicalCopy).toContain('PAC');
  });

  it('keeps Mango, Milk and Pistachio effects distinct', () => {
    expect(educationCopy.ingredient.examples.mango.effects.map((effect) => effect.id)).toEqual([
      'water',
      'sugars',
      'fiber',
    ]);
    expect(educationCopy.ingredient.examples.milk.effects.map((effect) => effect.id)).toEqual([
      'water',
      'lactose',
      'protein',
      'fat',
    ]);
    expect(educationCopy.ingredient.examples.pistachio.effects.map((effect) => effect.id)).toEqual([
      'fat',
      'protein',
      'solids',
      'fiber',
    ]);
  });

  it('contains Inulin, Stabilizer and Salt without health or magic claims', () => {
    expect(educationCopy.micro.items.inulin.lead).toContain('Dodaje ciała');
    expect(educationCopy.micro.items.stabilizer.lead).toContain('kryształki lodu');
    expect(educationCopy.micro.items.salt.lead).toBe('Podkreśla smak.');
    expect(JSON.stringify(educationCopy.micro).toLowerCase()).not.toContain('magicz');
    expect(JSON.stringify(educationCopy.micro).toLowerCase()).not.toContain('zdrow');
  });

  it('does not equate an E-number with artificial origin and only exact IDs unlock plant origin', () => {
    expect(educationCopy.micro.eNumberLead).toContain(
      'sam numer nie oznacza, że składnik jest syntetyczny',
    );
    expect(verifiedPlantOrigin('PI-ING-000492')?.eNumber).toBe('E417');
    expect(verifiedPlantOrigin('tara_gum')?.sourcePlant).toContain('tara');
    expect(verifiedPlantOrigin('unknown-stabilizer-blend')).toBeNull();
  });
});

describe('machine guide uses canonical catalog data', () => {
  it('derives all Home preparation categories from canonical technologies', () => {
    expect(availableMachineEducationCategories()).toEqual(
      expect.arrayContaining(['frozen_container', 'frozen_bowl', 'compressor', 'fresh_gelato']),
    );
  });

  it('never displays provisional timing as verified', () => {
    const base = MACHINE_CATALOG.find((profile) => profile.preFreezeMinimumHours != null)!;
    const provisional: HomeMachineProfile = { ...base, specificationStatus: 'provisional' };
    expect(machineEducationForProfile(provisional)?.timing.status).toBe('missing');
  });

  it('shows timing only for a verified exact profile', () => {
    const base = MACHINE_CATALOG.find((profile) => profile.technology === 'frozen_bowl')!;
    const verified: HomeMachineProfile = {
      ...base,
      preFreezeMinimumHours: 16,
      specificationStatus: 'verified',
      specificationVerifiedAt: '2026-08-08',
    };
    expect(machineEducationForProfile(verified)?.timing).toMatchObject({
      status: 'verified',
      hours: 16,
    });
  });

  it('keeps Fresh Gelato heat-neutral and timing-unknown', () => {
    expect(FRESH_GELATO_EDUCATION.steps).toContain('wykonaj proces, jeśli jest wymagany');
    expect(FRESH_GELATO_EDUCATION.timing.status).toBe('missing');
    expect(JSON.stringify(FRESH_GELATO_EDUCATION).toLowerCase()).not.toContain('pasteurisation');
  });
});
  it('uses Sage model-specific operational steps from the canonical record', () => {
    const guide = machineEducationForProfile(SAGE_SMART_SCOOP_BCI600);
    expect(guide?.title).toBe('SAGE SMART SCOOP');
    expect(guide?.steps).toHaveLength(8);
    expect(guide?.steps.join(' ')).toContain('PRE-COOL');
    expect(guide?.steps.join(' ')).toContain('KEEP COOL');
    expect(guide?.steps.join(' ').toLowerCase()).not.toContain('zamroź misę');
  });
