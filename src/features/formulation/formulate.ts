/**
 * FULL FORMULATION / CONSTRAINED REFORMULATION pipeline (owner P0). PURE.
 *
 * selected ingredients → role resolution → template selection → template-to-
 * selection mapping → constraint construction → complete initial proposal →
 * (caller: Engine evaluation + existing local-correction solver + verification).
 *
 * HONESTY RULES (all frozen baselines preserved):
 *  - the seed is ALWAYS an approved/reference-derived registry template —
 *    never the previous saved version, never proportional scaling of the
 *    user's arbitrary current grams;
 *  - user-selected stable ingredient identities are PRESERVED (a template role
 *    is filled by the USER's ingredient; brands are never substituted);
 *  - ingredients the user did not select are auto-added ONLY from the approved
 *    functional toolbox, only for unfilled structural roles, and every
 *    addition is reported with grams + role + reason;
 *  - a selected ingredient with no template role and no approved adjustment
 *    bound keeps the USER's amount and is never freely optimized (salt rule);
 *  - exact locks are byte-preserved; ranges are clamped and re-normalized;
 *  - the batch is a hard equality (existing tolerance) with a runaway guard;
 *  - a missing optional role is NEVER silently re-added — it lowers the result
 *    honestly and produces an improvement recommendation instead.
 */
import { DEFAULT_CORRECTION_CANDIDATES, type RecipeInput, type RecipeItem } from '@/engine';
import type { ConstraintSet, IngredientConstraint } from '@/features/recipe-constraints';
import { resolveFunctionalRole, type FunctionalRole } from './ingredientRoles';
import { selectFormulationTemplate, type FormulationTemplate } from './templateRegistry';

/* ────────────────────────────────────────────────────────────── routing ── */

export type FormulationMode =
  | 'full_formulation' // A — new/incomplete/arbitrary draft
  | 'constrained_reformulation' // B — A with user locks/ranges
  | 'local_correction' // C — existing bounded solver
  | 'unsupported'; // D — honest unsupported

export interface ModeDecision {
  mode: FormulationMode;
  template: FormulationTemplate | null;
  reasons: string[];
}

const sumPlanned = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);

/**
 * Deterministic mode router. A draft whose planned mass is within ±25% of the
 * target batch is "sufficiently complete" → local correction (the existing
 * solver's supported region). Anything further (no grams, all-1 g, malformed
 * totals) is a formulation case — template seed, never rescale.
 */
export function routeFormulationMode(input: RecipeInput, set: ConstraintSet): ModeDecision {
  const batch = input.target_batch_grams;
  const sum = sumPlanned(input);
  const hasActuals = input.items.some((item) => item.actual_grams !== null);
  const nearBatch = batch > 0 && Math.abs(sum - batch) / batch <= 0.25;
  // Every line non-adjustable → the local path owns the honest all-locked
  // diagnosis („Wszystkie składniki są zablokowane…") — formulation never
  // overrides a fully-locked draft.
  const allLocked =
    input.items.length > 0 &&
    input.items.every(
      (item) =>
        item.actual_grams !== null ||
        item.lock_type !== 'unlocked' ||
        set.byLineId[item.id]?.mode === 'locked' ||
        set.byLineId[item.id]?.mode === 'range',
    );

  if (hasActuals || nearBatch || allLocked) {
    return {
      mode: 'local_correction',
      template: null,
      reasons: [hasActuals ? 'poured_actuals' : allLocked ? 'all_locked' : 'draft_near_batch'],
    };
  }

  const lookup = selectFormulationTemplate(input.category, input.target_temperature_c);
  if (!lookup.template) {
    return { mode: 'unsupported', template: null, reasons: [lookup.unsupportedReason ?? 'no_template'] };
  }
  const constrained = Object.values(set.byLineId).some((c) => c.mode !== 'ai');
  return {
    mode: constrained ? 'constrained_reformulation' : 'full_formulation',
    template: lookup.template,
    reasons: [`draft_mass_${Math.round(sum)}g_vs_batch_${Math.round(batch)}g`],
  };
}

/* ──────────────────────────────────────────────────────────── proposal ── */

export interface FormulationAddedLine {
  ingredientId: string;
  name: string;
  grams: number;
  role: FunctionalRole;
  reasonPl: string;
}

export interface FormulationRecommendation {
  role: FunctionalRole;
  messagePl: string;
}

export interface FormulationProposal {
  /** The COMPLETE next RecipeInput (atomic-replacement contract). */
  proposedInput: RecipeInput;
  templateId: string;
  templateStatus: FormulationTemplate['status'];
  mode: FormulationMode;
  /** Toolbox ingredients PI added (always shown with reasons). */
  added: FormulationAddedLine[];
  /** Template roles left unfilled (honest lower result + suggestions). */
  missingRoles: FunctionalRole[];
  recommendations: FormulationRecommendation[];
  /** Selected ingredients kept at the USER's amount (no role / no bound). */
  keptFixed: string[];
}

const ROLE_LABEL_PL: Record<FunctionalRole, string> = {
  primary_liquid: 'baza mleczna',
  dairy_fat: 'tłuszcz mleczny',
  milk_solids: 'sucha masa mleczna',
  sweetener_sucrose: 'cukier podstawowy',
  sugar_freezing_control: 'cukier kontrolujący zamarzanie',
  fiber_body: 'błonnik / pełnia',
  stabilizer: 'stabilizator',
  salt_modifier: 'sól',
  fruit: 'owoc',
  chocolate_cocoa: 'czekolada i kakao',
  nut_paste: 'pasta orzechowa',
  alcohol: 'alkohol',
  plant_liquid: 'baza roślinna',
  plant_fat: 'tłuszcz roślinny',
  protein_source: 'źródło białka',
  water: 'woda',
  egg: 'jaja',
  flavor_other: 'składnik smakowy',
};

/** Roles PI may fill automatically from the toolbox when unfilled (structural,
 * never flavour): water only — everything else becomes a recommendation. */
const AUTO_FILL_ROLES: ReadonlySet<FunctionalRole> = new Set(['water']);

const toolboxIngredient = (id: string) =>
  DEFAULT_CORRECTION_CANDIDATES.find((c) => c.id === id)?.ingredient ?? null;

const lockOf = (set: ConstraintSet, lineId: string): IngredientConstraint | undefined =>
  set.byLineId[lineId];

export type BuildFormulationResult =
  | { ok: true; proposal: FormulationProposal }
  | { ok: false; code: 'missing_required_role'; role: FunctionalRole; messagePl: string }
  | { ok: false; code: 'locked_exceeds_batch'; lockedSum: number };

/**
 * Build the complete initial proposal from the template + the user's selection.
 * Deterministic; the caller runs the Engine + the existing correction solver on
 * the result and verifies everything at the canonical Apply door.
 */
export function buildFormulationProposal(
  input: RecipeInput,
  set: ConstraintSet,
  template: FormulationTemplate,
  mode: FormulationMode,
): BuildFormulationResult {
  const batch = input.target_batch_grams;
  const scale = batch / template.baseBatchG;

  // 1. Resolve every selected line's functional role.
  const lines = input.items.map((item) => ({
    item,
    role: resolveFunctionalRole(item.ingredient),
    constraint: lockOf(set, item.id),
    locked: item.lock_type === 'grams' || lockOf(set, item.id)?.mode === 'locked',
  }));

  // 2. Map template roles → selected lines (role grams split equally when the
  //    user selected several ingredients of one role).
  const byRole = new Map<FunctionalRole, typeof lines>();
  for (const line of lines) {
    const bucket = byRole.get(line.role);
    if (bucket) bucket.push(line);
    else byRole.set(line.role, [line]);
  }

  interface PlannedLine {
    item: RecipeItem;
    grams: number; // pre-normalization target
    fixed: boolean; // locked or no-bound (never scaled in normalization)
    min?: number;
    max?: number;
  }
  const planned: PlannedLine[] = [];
  const added: FormulationAddedLine[] = [];
  const missingRoles: FunctionalRole[] = [];
  const recommendations: FormulationRecommendation[] = [];
  const keptFixed: string[] = [];
  const mappedLineIds = new Set<string>();

  for (const roleTarget of template.roles) {
    const targetGrams = roleTarget.grams * scale;
    const matches = byRole.get(roleTarget.role) ?? [];
    if (matches.length > 0) {
      const share = targetGrams / matches.length;
      for (const match of matches) {
        mappedLineIds.add(match.item.id);
        const constraint = match.constraint;
        if (match.locked && constraint?.mode === 'locked') {
          planned.push({ item: match.item, grams: constraint.grams, fixed: true });
        } else if (match.locked) {
          planned.push({ item: match.item, grams: match.item.planned_grams, fixed: true });
        } else if (constraint?.mode === 'range') {
          planned.push({
            item: match.item,
            grams: Math.min(Math.max(share, constraint.minGrams), constraint.maxGrams),
            fixed: !roleTarget.adjustable,
            min: constraint.minGrams,
            max: constraint.maxGrams,
          });
        } else {
          planned.push({ item: match.item, grams: share, fixed: !roleTarget.adjustable });
        }
      }
      continue;
    }

    // Unfilled role: auto-fill (structural), or honest gap + recommendation.
    if (AUTO_FILL_ROLES.has(roleTarget.role) && roleTarget.toolboxId) {
      const ingredient = toolboxIngredient(roleTarget.toolboxId);
      if (ingredient) {
        const item: RecipeItem = {
          id: `formulation-${roleTarget.toolboxId}`,
          ingredient,
          planned_grams: targetGrams,
          actual_grams: null,
          lock_type: 'unlocked',
        };
        planned.push({ item, grams: targetGrams, fixed: false });
        added.push({
          ingredientId: ingredient.id,
          name: ingredient.name,
          grams: targetGrams,
          role: roleTarget.role,
          reasonPl: `PI dodało wodę, ponieważ zatwierdzona receptura ${template.templateId} wymaga fazy wodnej.`,
        });
        continue;
      }
    }
    if (roleTarget.toolboxId === null && (roleTarget.role === 'fruit' || roleTarget.role === 'plant_liquid' || roleTarget.role === 'plant_fat' || roleTarget.role === 'chocolate_cocoa')) {
      // A user-supplied role that cannot be invented — precise missing-role stop.
      return {
        ok: false,
        code: 'missing_required_role',
        role: roleTarget.role,
        messagePl:
          `Brakuje składnika w roli: ${ROLE_LABEL_PL[roleTarget.role]}. ` +
          `Wybierz składnik z katalogu PI, aby PI mogło ułożyć recepturę ${template.templateId}.`,
      };
    }
    missingRoles.push(roleTarget.role);
    recommendations.push({
      role: roleTarget.role,
      messagePl:
        `Bez roli „${ROLE_LABEL_PL[roleTarget.role]}" wynik może być niższy. ` +
        `Możesz dodać zatwierdzony składnik pełniący tę rolę.`,
    });
  }

  // 3. Selected lines with NO template role: honest fixed carry-over at the
  //    user's amount (salt rule — no approved free-adjustment bound).
  for (const line of lines) {
    if (mappedLineIds.has(line.item.id)) continue;
    const constraint = line.constraint;
    const grams =
      line.locked && constraint?.mode === 'locked'
        ? constraint.grams
        : Math.max(0, line.item.planned_grams);
    planned.push({ item: line.item, grams, fixed: true });
    keptFixed.push(line.item.ingredient.name);
  }

  // 4. Normalize to the EXACT batch: fixed lines keep their grams; adjustable
  //    template lines scale proportionally to fill the remainder. Two passes so
  //    range clamps re-normalize honestly.
  const normalize = (): boolean => {
    const fixedSum = planned.filter((p) => p.fixed).reduce((s, p) => s + p.grams, 0);
    if (fixedSum > batch + 0.1) return false;
    const adjustable = planned.filter((p) => !p.fixed);
    const adjustableSum = adjustable.reduce((s, p) => s + p.grams, 0);
    const targetSum = batch - fixedSum;
    if (adjustable.length === 0) return Math.abs(fixedSum - batch) <= 0.1;
    if (adjustableSum <= 0) return false;
    const factor = targetSum / adjustableSum;
    for (const p of adjustable) {
      let next = p.grams * factor;
      if (p.min !== undefined && next < p.min) {
        next = p.min;
        p.fixed = true;
      }
      if (p.max !== undefined && next > p.max) {
        next = p.max;
        p.fixed = true;
      }
      p.grams = next;
    }
    return true;
  };
  if (!normalize()) {
    const lockedSum = planned.filter((p) => p.fixed).reduce((s, p) => s + p.grams, 0);
    return { ok: false, code: 'locked_exceeds_batch', lockedSum };
  }
  normalize(); // second pass after clamps

  const proposedInput: RecipeInput = {
    ...input,
    items: planned.map((p) => ({
      ...p.item,
      planned_grams: p.grams,
      actual_grams: null,
    })),
  };

  return {
    ok: true,
    proposal: {
      proposedInput,
      templateId: template.templateId,
      templateStatus: template.status,
      mode,
      added,
      missingRoles,
      recommendations,
      keptFixed,
    },
  };
}
