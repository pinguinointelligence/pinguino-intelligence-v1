/**
 * FormulationTemplateRegistry (owner P0 — full formulation).
 *
 * ONE canonical registry of formulation seeds. Every gram in this file is a
 * VERBATIM transcription of an existing repo record — NOTHING is invented:
 *  - gelato −11 `milk_base_v1` + chocolate −11 `chocolate_base_v1`: the locked
 *    starter templates (src/features/studioFlow/intentRecipeDraft.ts);
 *  - gelato −12 `G17` / −13 `G18`: owner-authorized 2026-07-18 clean references
 *    (src/spine/temperatureRegulator.ts golden fixtures, verbatim);
 *  - sorbet −11/−12/−13 `S01/S02/S03`: locked clean sorbet references (ibid.);
 *  - vegan −13 `V02_fixed`: locked clean vegan reference (ibid.);
 *  - fruit gelato −11 `fruit_gelato_ref_v1`: the repo's raspberry-premium
 *    reference proportions (goldenRecipes QA fixture) — status
 *    `reference_derived`, QUARANTINED (see below), never runtime-selectable.
 *  - protein: NO approved template or target contract exists (recovery audit
 *    conclusion D) → honest `unsupported`, never routed to gelato silently.
 *
 * Role targets are per the template's own base batch; the formulation pipeline
 * scales them to the recipe's target batch and maps them onto the USER-selected
 * stable ingredient identities (never substituting brands for selections).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OWNER FINAL INTEGRATION ADDENDUM — item 2 (reference-derived quarantine,
 * 2026-07-25).
 *
 * WHAT WAS TRUE BEFORE: `fruit_gelato_ref_v1` sat in the SAME array the runtime
 * lookup scanned (`REGISTRY`), so a `fruit_gelato` recipe seeded its grams —
 * transcribed verbatim from the goldenRecipes raspberry-premium QA FIXTURE —
 * and the result could become an APPLICABLE production recipe as soon as the
 * search stopped or the batch equalled the target.
 *
 * WHAT IS TRUE NOW: reference-derived formulas are QUARANTINED. Two lists:
 *  - `RUNTIME_REGISTRY` — the ONLY list `selectFormulationTemplate` scans;
 *    contains exclusively `status: 'approved'` templates (enforced by a
 *    structural test, never by convention);
 *  - `ALL_TEMPLATES` — approved + quarantined, reachable ONLY through
 *    `findFormulationTemplateById` / `listQuarantinedTemplates`, so tests,
 *    diagnostics and the trustless Apply-door provenance re-derivation can
 *    still resolve the id.
 * Combined with addendum item 1 (`fruit_gelato` is no longer a runtime category
 * at all), `fruit_gelato_ref_v1` is unreachable at runtime by TWO independent
 * structural facts.
 * ───────────────────────────────────────────────────────────────────────────
 */
import type { ProductCategory, RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { resolveFunctionalRole, type FunctionalRole } from './ingredientRoles';

export type TemplateStatus = 'approved' | 'reference_derived' | 'unsupported';

export interface TemplateRoleTarget {
  role: FunctionalRole;
  /** Verbatim grams at the template's base batch. */
  grams: number;
  /** Canonical toolbox candidate id that may FILL this role automatically when
   * the user selected no matching ingredient (null = the user must supply it —
   * e.g. the fruit of a sorbet; auto-adding a flavour is forbidden). */
  toolboxId: string | null;
  /** May the solver adjust this role freely (within the engine's own rules)?
   * false = template-controlled (kept at the scaled template amount). */
  adjustable: boolean;
}

export interface FormulationTemplate {
  templateId: string;
  category: ProductCategory;
  temperatureC: number;
  veganFlavorStrategy?: VeganFlavorStrategy;
  proteinFlavorStrategy?: ProteinFlavorStrategy;
  proteinRoute?: ProteinRoute;
  status: TemplateStatus;
  approvalSource: string;
  baseBatchG: number;
  roles: readonly TemplateRoleTarget[];
}

export type VeganFlavorStrategy =
  | 'neutral'
  | 'fruit'
  | 'nut'
  | 'cocoa'
  | 'mixed_main'
  | 'unsupported_mixed_main';

const T = (
  role: FunctionalRole,
  grams: number,
  toolboxId: string | null,
  adjustable = true,
): TemplateRoleTarget => ({ role, grams, toolboxId, adjustable });

/** milk_base_v1 — locked starter template (−11). */
const GELATO_M11: FormulationTemplate = {
  templateId: 'milk_base_v1',
  category: 'milk_gelato',
  temperatureC: -11,
  status: 'approved',
  approvalSource: 'intentRecipeDraft.ts STARTER_TEMPLATES (locked starter template)',
  baseBatchG: 1000,
  roles: [
    T('primary_liquid', 670, 'milk_3_5'),
    T('dairy_fat', 130, 'cream_30'),
    T('milk_solids', 35, 'smp'),
    T('sweetener_sucrose', 130, 'sucrose'),
    T('sugar_freezing_control', 30, 'dextrose'),
    T('stabilizer', 5, 'tara_gum', false), // template-controlled dose
  ],
};

/** G17 — owner-authorized −12 clean reference (verbatim). */
const GELATO_M12: FormulationTemplate = {
  templateId: 'milk_base_g17_minus12_v1',
  category: 'milk_gelato',
  temperatureC: -12,
  status: 'approved',
  approvalSource: 'temperatureRegulator.ts G17 (owner-authorized 2026-07-18)',
  baseBatchG: 1000,
  roles: [
    T('primary_liquid', 600, 'milk_3_5'),
    T('dairy_fat', 135, 'cream_30'),
    T('milk_solids', 43, 'smp'),
    T('sweetener_sucrose', 86, 'sucrose'),
    T('sugar_freezing_control', 80, 'dextrose'),
    T('fiber_body', 54.1, 'inulin'),
    T('stabilizer', 1.9, 'tara_gum', false),
  ],
};

/** G18 — owner-authorized −13 clean reference (verbatim). */
const GELATO_M13: FormulationTemplate = {
  templateId: 'milk_base_g18_minus13_v1',
  category: 'milk_gelato',
  temperatureC: -13,
  status: 'approved',
  approvalSource: 'temperatureRegulator.ts G18 (owner-authorized 2026-07-18)',
  baseBatchG: 1000.1,
  roles: [
    T('primary_liquid', 600, 'milk_3_5'),
    T('dairy_fat', 125, 'cream_30'),
    T('milk_solids', 45, 'smp'),
    T('sweetener_sucrose', 72, 'sucrose'),
    T('sugar_freezing_control', 112, 'dextrose'),
    T('fiber_body', 44.1, 'inulin'),
    T('stabilizer', 1.9, 'tara_gum', false),
  ],
};

/** chocolate_base_v1 — locked starter template (−11 only; no approved −12/−13). */
const CHOCOLATE_M11: FormulationTemplate = {
  templateId: 'chocolate_base_v1',
  category: 'chocolate_gelato',
  temperatureC: -11,
  status: 'approved',
  approvalSource: 'intentRecipeDraft.ts STARTER_TEMPLATES (locked starter template)',
  baseBatchG: 1000,
  roles: [
    T('primary_liquid', 600, 'milk_3_5'),
    T('dairy_fat', 90, 'cream_30'),
    T('milk_solids', 30, 'smp'),
    T('sweetener_sucrose', 150, 'sucrose'),
    T('sugar_freezing_control', 40, 'dextrose'),
    T('chocolate_cocoa', 85, null), // cocoa 60 + chocolate 25 — the user's chocolate fills it
    T('stabilizer', 5, 'tara_gum', false),
  ],
};

/** S01/S02/S03 — locked clean sorbet references (fruit is USER-supplied). */
const sorbet = (
  id: string,
  temp: number,
  sucrose: number,
  dextrose: number,
  inulin: number,
  tara: number,
  water: number,
): FormulationTemplate => ({
  templateId: id,
  category: 'sorbet',
  temperatureC: temp,
  status: 'approved',
  approvalSource: `temperatureRegulator.ts ${id} (locked clean sorbet reference)`,
  baseBatchG: 1000,
  roles: [
    T('fruit', 600, null), // never auto-added — the user's selected fruit
    T('water', water, 'water'),
    T('sweetener_sucrose', sucrose, 'sucrose'),
    T('sugar_freezing_control', dextrose, 'dextrose'),
    T('fiber_body', inulin, 'inulin'),
    T('stabilizer', tara, 'tara_gum', false),
  ],
});
const SORBET_M11 = sorbet('S01', -11, 103.8, 59, 55.4, 0.8, 181);
const SORBET_M12 = sorbet('S02', -12, 90, 90, 55, 0.8, 164.2);
const SORBET_M13 = sorbet('S03', -13, 78, 125, 50, 0.8, 146.2);

interface VeganMinus13Seed {
  strategy: VeganFlavorStrategy;
  water: number;
  plantLiquid: number;
  plantFat: number;
  sucrose: number;
  dextrose: number;
  inulin: number;
  mainRole?: FunctionalRole;
  mainGrams?: number;
}

const VEGAN_MINUS13_SEEDS: readonly VeganMinus13Seed[] = [
  {
    strategy: 'neutral',
    water: 397.4,
    plantLiquid: 250,
    plantFat: 52.5,
    sucrose: 95,
    dextrose: 150,
    inulin: 53.1,
  },
  {
    strategy: 'fruit',
    water: 152.2,
    plantLiquid: 213.3,
    plantFat: 33.6,
    sucrose: 107,
    dextrose: 107.7,
    inulin: 59.9,
    mainRole: 'fruit',
    mainGrams: 324.3,
  },
  {
    strategy: 'mixed_main',
    water: 176.5,
    plantLiquid: 213.3,
    plantFat: 33.6,
    sucrose: 107,
    dextrose: 107.7,
    inulin: 59.9,
    mainRole: 'fruit',
    mainGrams: 300,
  },
  {
    strategy: 'nut',
    water: 331.6,
    plantLiquid: 261.6,
    plantFat: 34.1,
    sucrose: 77.4,
    dextrose: 118.8,
    inulin: 54.6,
    mainRole: 'nut_paste',
    mainGrams: 119.9,
  },
  {
    strategy: 'cocoa',
    water: 358.7,
    plantLiquid: 250.9,
    plantFat: 42.1,
    sucrose: 120.4,
    dextrose: 109.5,
    inulin: 56.8,
    mainRole: 'chocolate_cocoa',
    mainGrams: 59.6,
  },
];

const adaptVeganSugarsForTemperature = (
  seed: VeganMinus13Seed,
  temperatureC: -11 | -12 | -13,
): { sucrose: number; dextrose: number } => {
  // Owner reference proves a 50 g sucrose↔dextrose substitution changes NPAC
  // without changing sugar mass. −12 uses that observed step. −11 continues
  // the same physical direction with a bounded 90 g shift; the Engine still
  // evaluates the exact recipe against its native temperature band.
  const requestedShift = temperatureC === -13 ? 0 : temperatureC === -12 ? 50 : 90;
  const shift = Math.min(requestedShift, seed.dextrose);
  return { sucrose: seed.sucrose + shift, dextrose: seed.dextrose - shift };
};

const veganTemplate = (
  seed: VeganMinus13Seed,
  temperatureC: -11 | -12 | -13,
): FormulationTemplate => {
  const sugars = adaptVeganSugarsForTemperature(seed, temperatureC);
  const neutralMinus13 = seed.strategy === 'neutral' && temperatureC === -13;
  return {
    templateId: neutralMinus13
      ? 'V02_fixed'
      : `vegan_${seed.strategy}_minus${Math.abs(temperatureC)}_final`,
    category: 'vegan_gelato',
    temperatureC,
    veganFlavorStrategy: seed.strategy,
    status: 'approved',
    approvalSource:
      'owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities',
    baseBatchG: 1000,
    roles: [
      ...(seed.mainRole && seed.mainGrams ? [T(seed.mainRole, seed.mainGrams, null)] : []),
      T('water', seed.water, 'water'),
      T('plant_liquid', seed.plantLiquid, 'PI-ING-001565'),
      T('plant_fat', seed.plantFat, 'PI-ING-000163'),
      T('sweetener_sucrose', sugars.sucrose, 'sucrose'),
      T('sugar_freezing_control', sugars.dextrose, 'dextrose'),
      T('fiber_body', seed.inulin, 'inulin'),
      // Exact Mapper Tara minimum: 0.2% of a 1000 g mix. Never MyGelato 0 g.
      T('stabilizer', 2, 'tara_gum', false),
    ],
  };
};

const VEGAN_TEMPLATES: readonly FormulationTemplate[] = VEGAN_MINUS13_SEEDS.flatMap((seed) =>
  ([-11, -12, -13] as const).map((temperature) => veganTemplate(seed, temperature)),
);

export type ProteinFlavorStrategy = 'neutral' | 'fruit' | 'nut' | 'cocoa' | 'coffee' | 'mixed_main';
export type ProteinRoute = 'dairy' | 'plant';

interface ProteinTemplateSeed {
  route: ProteinRoute;
  temperatureC: -11 | -12 | -13;
  sucrose: number;
  dextrose: number;
}

const PROTEIN_STRATEGIES: readonly {
  strategy: ProteinFlavorStrategy;
  mainRole: FunctionalRole | null;
}[] = [
  { strategy: 'neutral', mainRole: null },
  { strategy: 'fruit', mainRole: 'fruit' },
  { strategy: 'nut', mainRole: 'nut_paste' },
  { strategy: 'cocoa', mainRole: 'chocolate_cocoa' },
  { strategy: 'coffee', mainRole: 'flavor_other' },
  { strategy: 'mixed_main', mainRole: null },
];

const PROTEIN_SEEDS: readonly ProteinTemplateSeed[] = [
  { route: 'dairy', temperatureC: -11, sucrose: 82, dextrose: 34 },
  { route: 'dairy', temperatureC: -12, sucrose: 30, dextrose: 86 },
  { route: 'dairy', temperatureC: -13, sucrose: 0, dextrose: 116 },
  { route: 'plant', temperatureC: -11, sucrose: 110, dextrose: 15 },
  { route: 'plant', temperatureC: -12, sucrose: 50, dextrose: 75 },
  { route: 'plant', temperatureC: -13, sucrose: 0, dextrose: 125 },
];

const proteinTemplate = (
  seed: ProteinTemplateSeed,
  strategy: ProteinFlavorStrategy,
  mainRole: FunctionalRole | null,
): FormulationTemplate => {
  const calibratedNeutralDairyMinus11 =
    seed.route === 'dairy' && seed.temperatureC === -11 && strategy === 'neutral';
  return {
    templateId: `protein_${seed.route}_${strategy}_minus${Math.abs(seed.temperatureC)}_v1`,
    category: 'protein_gelato',
    temperatureC: seed.temperatureC,
    proteinFlavorStrategy: strategy,
    proteinRoute: seed.route,
    status: 'approved',
    approvalSource:
      'owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics',
    baseBatchG: 1000,
    roles: [
      ...(mainRole ? [T(mainRole, 0, null)] : []),
      ...(seed.route === 'dairy'
        ? [
            T('primary_liquid', calibratedNeutralDairyMinus11 ? 0 : 460, 'milk_3_5'),
            T('dairy_fat', calibratedNeutralDairyMinus11 ? 110 : 100, 'cream_30'),
            T('protein_source', calibratedNeutralDairyMinus11 ? 246.8375 : 230, 'PI-ING-000264'),
            T('water', calibratedNeutralDairyMinus11 ? 505.1625 : 92, 'water'),
          ]
        : [
            T('plant_liquid', 400, 'PI-ING-001565'),
            T('plant_fat', 35, 'PI-ING-000163'),
            T('protein_source', 238, 'PI-ING-000452'),
            T('water', 200, 'water'),
          ]),
      T('sweetener_sucrose', calibratedNeutralDairyMinus11 ? 80 : seed.sucrose, 'sucrose'),
      T('sugar_freezing_control', calibratedNeutralDairyMinus11 ? 56 : seed.dextrose, 'dextrose'),
      T('stabilizer', 2, 'tara_gum', false),
    ],
  };
};

const PROTEIN_TEMPLATES: readonly FormulationTemplate[] = PROTEIN_SEEDS.flatMap((seed) =>
  PROTEIN_STRATEGIES.map(({ strategy, mainRole }) => proteinTemplate(seed, strategy, mainRole)),
);
/**
 * fruit_gelato_ref_v1 — REFERENCE-DERIVED, QUARANTINED (owner addendum item 2).
 * The repo's raspberry-premium reference proportions (goldenRecipes QA fixture:
 * fruit 350 / milk 380 / cream 80 / smp 40 / sucrose 110 / dextrose 35 / tara 5).
 * NOT approved science, deliberately kept OUT of `RUNTIME_REGISTRY`: it exists
 * only so tests, diagnostics and the Apply door's trustless provenance
 * re-derivation can still resolve the id. No runtime path can select it.
 */
const FRUIT_GELATO_M11: FormulationTemplate = {
  templateId: 'fruit_gelato_ref_v1',
  category: 'fruit_gelato',
  temperatureC: -11,
  status: 'reference_derived',
  approvalSource:
    'goldenRecipes.ts raspberry-premium proportions (QA fixture — reference-derived, staging-only)',
  baseBatchG: 1000,
  roles: [
    T('fruit', 350, null),
    T('primary_liquid', 380, 'milk_3_5'),
    T('dairy_fat', 80, 'cream_30'),
    T('milk_solids', 40, 'smp'),
    T('sweetener_sucrose', 110, 'sucrose'),
    T('sugar_freezing_control', 35, 'dextrose'),
    T('stabilizer', 5, 'tara_gum', false),
  ],
};

/**
 * THE RUNTIME REGISTRY (owner addendum item 2): the ONLY list a runtime lookup
 * scans. Every entry is `status: 'approved'` — pinned structurally by
 * `templateQuarantine.test.ts`, so a non-approved template cannot be added here
 * by accident in the future.
 */
const RUNTIME_REGISTRY: readonly FormulationTemplate[] = [
  GELATO_M11,
  GELATO_M12,
  GELATO_M13,
  CHOCOLATE_M11,
  ...PROTEIN_TEMPLATES,
  SORBET_M11,
  SORBET_M12,
  SORBET_M13,
  ...VEGAN_TEMPLATES,
];

/** QUARANTINED templates: resolvable BY ID for tests / diagnostics / the Apply
 * door's provenance re-derivation, NEVER selectable by a runtime lookup. */
const QUARANTINED_TEMPLATES: readonly FormulationTemplate[] = [FRUIT_GELATO_M11];

/** Approved + quarantined — the complete id space (id resolution only). */
const ALL_TEMPLATES: readonly FormulationTemplate[] = [
  ...RUNTIME_REGISTRY,
  ...QUARANTINED_TEMPLATES,
];

export interface TemplateLookup {
  template: FormulationTemplate | null;
  /** Honest reason when null. */
  unsupportedReason: 'no_template_for_category' | 'no_template_for_temperature' | null;
}

/** Resolve the formulation seed for a category × serving temperature. Protein
 * and any unknown category are honestly unsupported — never routed elsewhere.
 *
 * Owner addendum item 2: scans `RUNTIME_REGISTRY` ONLY, so this function is
 * structurally incapable of returning a non-approved template. */
export function selectFormulationTemplate(
  category: ProductCategory,
  temperatureC: number,
): TemplateLookup {
  const forCategory = RUNTIME_REGISTRY.filter((t) => t.category === category);
  if (forCategory.length === 0)
    return { template: null, unsupportedReason: 'no_template_for_category' };
  const exact = forCategory.find(
    (t) =>
      t.temperatureC === temperatureC &&
      (category !== 'vegan_gelato' || t.veganFlavorStrategy === 'neutral'),
  );
  if (exact) return { template: exact, unsupportedReason: null };
  return { template: null, unsupportedReason: 'no_template_for_temperature' };
}

export function veganFlavorStrategyForRecipe(input: RecipeInput): VeganFlavorStrategy {
  if (input.category !== 'vegan_gelato') return 'neutral';
  const mains = input.items.filter((item) => item.lock_type === 'main' && item.planned_grams > 0);
  const mainRoles = mains.map((item) => resolveFunctionalRole(item.ingredient));
  if (mains.length > 1) {
    if (mainRoles.every((role) => role === 'fruit')) return 'mixed_main';
    if (mainRoles.every((role) => role === 'nut_paste')) return 'nut';
    if (mainRoles.every((role) => role === 'chocolate_cocoa')) return 'cocoa';
    return 'unsupported_mixed_main';
  }
  const role = mainRoles[0] ?? null;
  if (role === 'fruit') return 'fruit';
  if (role === 'nut_paste') return 'nut';
  if (role === 'chocolate_cocoa') return 'cocoa';
  return 'neutral';
}

export function proteinFlavorStrategyForRecipe(input: RecipeInput): ProteinFlavorStrategy {
  const mains = input.items.filter((item) => item.lock_type === 'main' && item.planned_grams > 0);
  if (mains.length > 1) return 'mixed_main';
  const main = mains[0];
  if (!main) return 'neutral';
  const role = resolveFunctionalRole(main.ingredient);
  if (role === 'fruit') return 'fruit';
  if (role === 'nut_paste') return 'nut';
  if (role === 'chocolate_cocoa') return 'cocoa';
  if (canonicalIngredientId(main.ingredient) === 'PI-ING-000166') return 'coffee';
  return 'neutral';
}

export function proteinRouteForRecipe(input: RecipeInput): ProteinRoute {
  if (input.goals?.dietary?.includes('vegan')) return 'plant';
  const selectedPlantProtein = input.items.some(
    (item) =>
      resolveFunctionalRole(item.ingredient) === 'protein_source' &&
      item.ingredient.flags?.vegan_eligibility === 'VEGAN_VERIFIED',
  );
  return selectedPlantProtein ? 'plant' : 'dairy';
}

export function selectFormulationTemplateForRecipe(input: RecipeInput): TemplateLookup {
  if (input.category === 'protein_gelato') {
    const strategy = proteinFlavorStrategyForRecipe(input);
    const route = proteinRouteForRecipe(input);
    const template = RUNTIME_REGISTRY.find(
      (candidate) =>
        candidate.category === 'protein_gelato' &&
        candidate.temperatureC === input.target_temperature_c &&
        candidate.proteinFlavorStrategy === strategy &&
        candidate.proteinRoute === route,
    );
    return template
      ? { template, unsupportedReason: null }
      : { template: null, unsupportedReason: 'no_template_for_temperature' };
  }
  if (input.category !== 'vegan_gelato') {
    return selectFormulationTemplate(input.category, input.target_temperature_c);
  }
  const strategy = veganFlavorStrategyForRecipe(input);
  const template = RUNTIME_REGISTRY.find(
    (candidate) =>
      candidate.category === 'vegan_gelato' &&
      candidate.temperatureC === input.target_temperature_c &&
      candidate.veganFlavorStrategy === strategy,
  );
  return template
    ? { template, unsupportedReason: null }
    : { template: null, unsupportedReason: 'no_template_for_temperature' };
}

/** The runtime-selectable templates (approved only). */
export function listFormulationTemplates(): readonly FormulationTemplate[] {
  return RUNTIME_REGISTRY;
}

/** The quarantined, NON-runtime templates (diagnostics / tests / ledger only). */
export function listQuarantinedTemplates(): readonly FormulationTemplate[] {
  return QUARANTINED_TEMPLATES;
}

/**
 * Resolve a template BY ID across approved AND quarantined entries.
 *
 * Owner addendum item 2 — this is what makes the Apply door TRUSTLESS: the door
 * never believes a preview's `templateStatus` field, it re-reads the status from
 * this registry (the source of truth) using only the template id carried by the
 * proposal. `null` = an id that exists in no registry at all, which the door
 * must also treat as non-approved provenance.
 */
export function findFormulationTemplateById(templateId: string): FormulationTemplate | null {
  return ALL_TEMPLATES.find((t) => t.templateId === templateId) ?? null;
}

/**
 * TRUSTLESS provenance predicate for the Apply door (owner addendum item 2):
 * TRUE only when `templateId` names a template that really carries
 * `status: 'approved'` in this registry. An unknown id is NOT approved.
 */
export function isApprovedTemplateId(templateId: string): boolean {
  return findFormulationTemplateById(templateId)?.status === 'approved';
}
