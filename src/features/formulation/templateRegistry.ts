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
import type { ProductCategory } from '@/engine';
import type { FunctionalRole } from './ingredientRoles';

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
  status: TemplateStatus;
  approvalSource: string;
  baseBatchG: number;
  roles: readonly TemplateRoleTarget[];
}

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
const sorbet = (id: string, temp: number, sucrose: number, dextrose: number, inulin: number, tara: number, water: number): FormulationTemplate => ({
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

/** V02_fixed — locked clean vegan reference (−13; plant roles USER-supplied). */
const VEGAN_M13: FormulationTemplate = {
  templateId: 'V02_fixed',
  category: 'vegan_gelato',
  temperatureC: -13,
  status: 'approved',
  approvalSource: 'temperatureRegulator.ts V02_fixed (locked clean vegan reference)',
  baseBatchG: 1000,
  roles: [
    T('water', 200, 'water'),
    T('plant_liquid', 250, null), // the user's plant drink — never invented
    T('plant_fat', 250, null), // the user's coconut/plant fat — never invented
    T('sweetener_sucrose', 95, 'sucrose'),
    T('sugar_freezing_control', 150, 'dextrose'),
    T('fiber_body', 53.1, 'inulin'),
    T('stabilizer', 1.9, 'tara_gum', false),
  ],
};

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
  approvalSource: 'goldenRecipes.ts raspberry-premium proportions (QA fixture — reference-derived, staging-only)',
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
  GELATO_M11, GELATO_M12, GELATO_M13,
  CHOCOLATE_M11,
  SORBET_M11, SORBET_M12, SORBET_M13,
  VEGAN_M13,
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
  unsupportedReason:
    | 'no_template_for_category'
    | 'no_template_for_temperature'
    | null;
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
  if (forCategory.length === 0) return { template: null, unsupportedReason: 'no_template_for_category' };
  const exact = forCategory.find((t) => t.temperatureC === temperatureC);
  if (exact) return { template: exact, unsupportedReason: null };
  return { template: null, unsupportedReason: 'no_template_for_temperature' };
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
