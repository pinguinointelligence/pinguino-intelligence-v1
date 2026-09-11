import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import {
  EXECUTABLE_RECIPE_TEMPLATES,
  executableRecipeCard,
  executableRecipeStartHref,
  executableRecipeTemplateById,
  executableTemplateOpenState,
  recipeTemplateBaseTotal,
  recipeTemplateToppingTotal,
} from './executableRecipeLibrary';

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const triState = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (value: string, column: string): string | number | boolean | null => {
  if (value === '') return null;
  if (triState.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const mapperRows = new Map(
  grid.slice(1).map((row) => {
    const parsed = Object.fromEntries(
      header.map((name, index) => [name, cell(row[index] ?? '', name)]),
    ) as unknown as IngredientRow;
    return [parsed.ingredient_id, parsed] as const;
  }),
);

const recipeInput = (template: (typeof EXECUTABLE_RECIPE_TEMPLATES)[number]): RecipeInput => ({
  mode: 'classic',
  category: template.profile,
  target_temperature_c: template.targetTemperatureC,
  target_batch_grams: template.baseTargetGrams,
  machine_capacity_grams: null,
  goals: { formulation_strategy: template.formulationStrategy },
  items: template.base.map((line) => {
    if (line.mapperIngredientId === null || line.grams === null) {
      throw new Error(`unresolved Base line ${line.lineId}`);
    }
    const row = mapperRows.get(line.mapperIngredientId);
    if (!row) throw new Error(`missing Mapper row ${line.mapperIngredientId}`);
    return {
      id: line.lineId,
      ingredient: ingredientRowToEngineIngredient(row),
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: line.role === 'main' ? 'main' as const : 'unlocked' as const,
      ...(line.mainRatioWeight === null ? {} : { main_ratio_weight: line.mainRatioWeight }),
    };
  }),
});

const r4 = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(4)) : null;

describe('executable Recipe Library Batch 1 registry', () => {
  it('registers exactly the six authorized owner-review templates', () => {
    expect(EXECUTABLE_RECIPE_TEMPLATES.map((template) => template.displayName)).toEqual([
      'Śmietankowe na żółtkach',
      'Rocero',
      'Raphaello',
      'Kidi Bueno',
      'Oreyo',
      'Knickers',
    ]);
    expect(new Set(EXECUTABLE_RECIPE_TEMPLATES.map((template) => template.id)).size).toBe(6);
    expect(EXECUTABLE_RECIPE_TEMPLATES.every((template) => template.version === 1)).toBe(true);
    expect(EXECUTABLE_RECIPE_TEMPLATES.every((template) => template.publicationStage === 'owner_review')).toBe(true);
  });

  it.each(EXECUTABLE_RECIPE_TEMPLATES.filter(
    (template) => template.status === 'OWNER_REVIEW_EDITABLE',
  ))('$displayName has an exact whole-gram 1000 g Base', (template) => {
    expect(recipeTemplateBaseTotal(template)).toBe(1000);
    expect(template.base.every((line) => line.grams !== null && Number.isInteger(line.grams))).toBe(true);
    expect(new Set(template.base.map((line) => line.mapperIngredientId)).size).toBe(template.base.length);
  });

  it('uses no fresh-yolk fallback while exact Starter Pack powder data are unavailable', () => {
    const poland = executableRecipeTemplateById('lost-pl-smietankowe-z-zoltkami-v1')!;
    expect(JSON.stringify(poland)).not.toContain('PI-ING-001646');
    expect(recipeTemplateBaseTotal(poland)).toBeNull();
    expect(poland.status).toBe('BLOCKED_EXACT_PRODUCT_DATA');
    expect(poland.base).toContainEqual(expect.objectContaining({
      mapperIngredientId: null,
      requiredProductForm: 'egg_yolk_powder_starter_pack',
      grams: null,
      ownerSeedGrams: null,
    }));
  });

  it('preserves the authorized Topping totals outside the Base', () => {
    expect(Object.fromEntries(EXECUTABLE_RECIPE_TEMPLATES.map((template) => [
      template.displayName,
      recipeTemplateToppingTotal(template),
    ]))).toEqual({
      'Śmietankowe na żółtkach': 0,
      Rocero: 100,
      Raphaello: 100,
      'Kidi Bueno': 90,
      Oreyo: 100,
      Knickers: 120,
    });
    expect(EXECUTABLE_RECIPE_TEMPLATES.flatMap((template) => template.toppings)
      .every((line) => line.processScope === 'POST_PROCESS_ADDON')).toBe(true);
  });

  it('publishes the Raphaello multi-Main ratio explicitly instead of inferring it from grams', () => {
    const raphaello = executableRecipeTemplateById('fantasy-raphaello-v1')!;
    expect(raphaello.base.filter((line) => line.role === 'main').map((line) => ({
      mapperIngredientId: line.mapperIngredientId,
      mainRatioWeight: line.mainRatioWeight,
    }))).toEqual([
      { mapperIngredientId: 'PI-ING-000151', mainRatioWeight: 2 },
      { mapperIngredientId: 'PI-ING-001512', mainRatioWeight: 1 },
    ]);
  });

  it('keeps every line on its current FINAL Mapper identity and reads approval instead of assuming it', () => {
    for (const template of EXECUTABLE_RECIPE_TEMPLATES) {
      for (const line of [...template.base, ...template.toppings]) {
        if (line.mapperIngredientId === null) continue;
        const row = mapperRows.get(line.mapperIngredientId);
        expect(row, `${template.id}:${line.mapperIngredientId}`).toBeDefined();
        expect(row?.verification_status.trim().length).toBeGreaterThan(0);
      }
      if (template.currentEngineEvaluation === null) continue;
      // FINAL authority wins: an unapproved Base PI stays in the source and is a named blocker.
      const unapprovedBase = template.base.flatMap((line) => {
        const row = line.mapperIngredientId ? mapperRows.get(line.mapperIngredientId) : undefined;
        return row && (row.approved_for_base !== true || row.approved_for_engines !== true)
          ? [line.mapperIngredientId!]
          : [];
      });
      expect([...template.currentEngineEvaluation.unapprovedIngredientIds], template.id).toEqual(
        unapprovedBase,
      );
    }
    const oreyo = executableRecipeTemplateById('fantasy-oreyo-v1')!;
    expect(oreyo.base.find((line) => line.mapperIngredientId === 'PI-ING-001705')).toMatchObject({
      grams: 5,
      note: 'Pasta waniliowa',
    });
    expect(mapperRows.get('PI-ING-001705')).toMatchObject({
      approved_for_base: false,
      approved_for_engines: false,
    });
    expect(oreyo.currentEngineEvaluation).toMatchObject({
      unapprovedIngredientIds: ['PI-ING-001705'],
      executable: false,
    });
  });

  it('keeps exact branded Owner-only research references out of the client registry and card projection', () => {
    const serializedRegistry = JSON.stringify(EXECUTABLE_RECIPE_TEMPLATES);
    expect(serializedRegistry).not.toMatch(/Ferrero|Raffaello|Kinder|Oreo|Snickers/i);
    for (const template of EXECUTABLE_RECIPE_TEMPLATES) {
      const card = executableRecipeCard(template);
      expect(card).not.toHaveProperty('ownerOnlyReference');
    }
  });

  it('routes every Owner Review library template to Pro without a Home fallback', () => {
    for (const template of EXECUTABLE_RECIPE_TEMPLATES) {
      const href = executableRecipeStartHref(template.id, 'pro');
      expect(href).toMatch(/^\/pro\/recipe\?/);
      expect(href).toContain(`libraryTemplate=${template.id}`);
      expect(href).not.toMatch(/^\/(?:home|start)(?:\?|$)/);
      expect(executableRecipeStartHref(template.id, 'home')).toMatch(/^\/start\?/);
    }
  });

  it('separates editable Owner Review from Production and Label gates', () => {
    expect(EXECUTABLE_RECIPE_TEMPLATES.every((template) => template.processId === null)).toBe(true);
    const editable = EXECUTABLE_RECIPE_TEMPLATES.filter(
      (template) => template.status === 'OWNER_REVIEW_EDITABLE',
    );
    expect(editable).toHaveLength(5);
    expect(editable.every((template) => template.base.some((line) => line.role === 'main')))
      .toBe(true);
    expect(editable.every((template) => template.blockers.length === 0)).toBe(true);
    expect(editable.every((template) => (
      template.productionStatus === 'PRODUCTION_BLOCKED' && template.productionBlockers.length > 0
    ))).toBe(true);
    expect(editable.every((template) => (
      template.labelStatus === 'LABEL_BLOCKED' && template.labelBlockers.length > 0
    ))).toBe(true);
  });

  it('returns immutable clones when a working draft resolves a template', () => {
    const first = executableRecipeTemplateById('fantasy-rocero-v1')!;
    const second = executableRecipeTemplateById('fantasy-rocero-v1')!;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    (first.base[0] as { grams: number }).grams = 1;
    expect(second.base[0]?.grams).toBe(573);
  });

  it('records the current Engine truth for every Engine-corrected Owner vector without calling it sensory approval', () => {
    const audit = EXECUTABLE_RECIPE_TEMPLATES
      .filter((template) => template.status === 'OWNER_REVIEW_EDITABLE')
      .map((template) => {
      const result = calculateRecipe(recipeInput(template));
      const dairyCarrier = template.base
        .filter((line) => ['PI-ING-000236', 'PI-ING-000180', 'PI-ING-000270'].includes(line.mapperIngredientId ?? ''))
        .reduce((total, line) => total + (line.grams ?? 0), 0) / template.baseTargetGrams * 100;
      const evaluation = template.currentEngineEvaluation!;
      expect(evaluation, template.id).not.toBeNull();
      // CURRENT truth: the deterministic Engine result against the FINAL 2541 projection.
      expect(result.scores?.technical, template.id).toBeCloseTo(evaluation.technicalScore, 8);
      expect(
        detectViolations(result).map((violation) => `${violation.metric}:${violation.direction}`),
        template.id,
      ).toEqual([...evaluation.violations]);
      expect(result.engine_version).toBe(evaluation.engineVersion);
      expect(result.config_version).toBe(evaluation.configVersion);
      expect(evaluation.executable, template.id).toBe(
        evaluation.violations.length === 0 && evaluation.unapprovedIngredientIds.length === 0,
      );
      return {
        id: template.id,
        engineVersion: result.engine_version,
        configVersion: result.config_version,
        batch: result.total_batch_g,
        violations: detectViolations(result).map((violation) => `${violation.metric}:${violation.direction}`),
        pod: r4(result.pod_points),
        pac: r4(result.pac_points),
        npac: r4(result.npac_points),
        ice: r4(result.ice_fraction_percent),
        water: r4(result.percentages.water_percent),
        solids: r4(result.percentages.solids_percent),
        fat: r4(result.percentages.fat_percent),
        protein: r4(result.percentages.protein_percent),
        lactose: r4(result.percentages.lactose_percent),
        dairyCarrier: r4(dairyCarrier),
        technical: r4(result.scores?.technical),
        overall: r4(result.scores?.overall),
        costPerKg: r4(result.costs?.cost_per_kg),
        costComplete: result.costs?.complete ?? false,
        missingCostIds: result.costs?.missing_cost_ingredient_ids ?? [],
      };
    });
    expect(audit.every((entry) => entry.batch === 1000)).toBe(true);
    expect(audit).toMatchSnapshot();
  });

  it('keeps the historical technical score as provenance, separate from the current Engine score', () => {
    expect(
      Object.fromEntries(
        EXECUTABLE_RECIPE_TEMPLATES.map((template) => [
          template.id,
          [
            template.historicalTechnicalScore,
            template.currentEngineEvaluation?.technicalScore ?? null,
          ],
        ]),
      ),
    ).toEqual({
      'lost-pl-smietankowe-z-zoltkami-v1': [null, null],
      'fantasy-rocero-v1': [89.16666666666667, 84.48125717948717],
      'fantasy-raphaello-v1': [89.16666666666667, 74.00171900738295],
      'fantasy-kidi-bueno-v1': [89.16666666666667, 69.44670312869557],
      'fantasy-oreyo-v1': [97.5, 97.5],
      'fantasy-knickers-v1': [88.33333333333333, 73.13846205680093],
    });
    const card = executableRecipeCard(executableRecipeTemplateById('fantasy-rocero-v1')!);
    expect(card).not.toHaveProperty('technicalScore');
    expect(card.historicalTechnicalScore).toBe(89.16666666666667);
    expect(card.currentEngineEvaluation?.technicalScore).toBe(84.48125717948717);
  });

  it('offers no registered template as current-Engine-ready while the FINAL Mapper rejects it', () => {
    expect(
      Object.fromEntries(
        EXECUTABLE_RECIPE_TEMPLATES.map((template) => [
          template.id,
          executableTemplateOpenState(template),
        ]),
      ),
    ).toEqual({
      'lost-pl-smietankowe-z-zoltkami-v1': 'blocked_product_data',
      'fantasy-rocero-v1': 'blocked_current_engine',
      'fantasy-raphaello-v1': 'blocked_current_engine',
      'fantasy-kidi-bueno-v1': 'blocked_current_engine',
      'fantasy-oreyo-v1': 'blocked_current_engine',
      'fantasy-knickers-v1': 'blocked_current_engine',
    });
  });
});
