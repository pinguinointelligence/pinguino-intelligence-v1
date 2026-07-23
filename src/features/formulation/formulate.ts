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
 * Deterministic mode router (owner P0 — the ±25% mass-distance rule is GONE:
 * it was scientifically meaningless — 944.6 g can need full reformulation
 * because inulin was removed, 1120 g because milk is exactly locked, and a
 * 1000 g draft can be technologically absurd). Routing now considers:
 *  - poured actuals (production reality → the local rescue path);
 *  - EXPLICIT hard/availability constraints (exact lock, range, exclusion) —
 *    these demand GLOBAL redistribution → constrained full reformulation;
 *  - target-batch mismatch (outside the approved tolerance) → reformulation;
 *  - the local-correction basin: complete recipe, batch already at target and
 *    no new hard constraints → the existing bounded corrector.
 * An all-locked draft AT the target keeps the local path (it owns the honest
 * „Wszystkie składniki są zablokowane…" diagnosis — PI genuinely cannot act).
 */
export function routeFormulationMode(input: RecipeInput, set: ConstraintSet): ModeDecision {
  const batch = input.target_batch_grams;
  const sum = sumPlanned(input);
  const hasActuals = input.items.some((item) => item.actual_grams !== null);
  if (hasActuals) {
    return { mode: 'local_correction', template: null, reasons: ['poured_actuals'] };
  }

  const hardConstraints =
    Object.values(set.byLineId).some((c) => c.mode !== 'ai') ||
    input.items.some((item) => item.lock_type !== 'unlocked');
  const allLocked =
    input.items.length > 0 &&
    input.items.every(
      (item) => item.lock_type !== 'unlocked' || set.byLineId[item.id]?.mode === 'locked',
    );

  const lookup = selectFormulationTemplate(input.category, input.target_temperature_c);

  // EVERY line locked → two honest cases. When the locked lines already cover
  // the template's HARD roles, the recipe is complete and untouchable — the
  // „Wszystkie składniki są zablokowane…" diagnosis (local path), at ANY batch
  // distance. When hard roles are MISSING (a lone locked Milk 500 g), PI can
  // still act without touching any lock: constrained reformulation adds the
  // missing role carriers around the byte-preserved locked lines.
  if (allLocked) {
    const hardRolesCovered =
      !lookup.template ||
      lookup.template.roles.every(
        (roleTarget) =>
          !HARD_ROLES.has(roleTarget.role) ||
          input.items.some(
            (item) =>
              resolveFunctionalRole(item.ingredient) === roleTarget.role && item.planned_grams > 0,
          ),
      );
    if (hardRolesCovered) {
      return { mode: 'local_correction', template: null, reasons: ['all_locked'] };
    }
  }

  // EXPLICIT hard constraints (exact lock, range) ALWAYS select constrained
  // reformulation — never a mass-distance heuristic (the owner's inulin-0 at
  // 944.6 g and milk-500 at 1120 g failures).
  if (hardConstraints) {
    if (!lookup.template) {
      return { mode: 'unsupported', template: null, reasons: [lookup.unsupportedReason ?? 'no_template'] };
    }
    return {
      mode: 'constrained_reformulation',
      template: lookup.template,
      reasons: ['hard_constraints_present', `draft_mass_${Math.round(sum)}g_vs_batch_${Math.round(batch)}g`],
    };
  }

  // Unconstrained: a SUBSTANTIVE draft (its own composition carries at least
  // half the target mass) is the user's recipe — the verified local corrector
  // owns it (it is batch-first and rescales 975 g → 1000 g itself, protected by
  // the beat-the-null gate). A hollow draft (empty, all-zero, or the 8 × 1 g
  // damaged case) has no composition to preserve → full formulation.
  const substantiveDraft = batch > 0 && sum >= batch * 0.5;
  if (substantiveDraft) {
    return { mode: 'local_correction', template: null, reasons: ['substantive_unconstrained_draft'] };
  }
  if (!lookup.template) {
    return { mode: 'unsupported', template: null, reasons: [lookup.unsupportedReason ?? 'no_template'] };
  }
  return {
    mode: 'full_formulation',
    template: lookup.template,
    reasons: [
      'composition_requires_formulation',
      `draft_mass_${Math.round(sum)}g_vs_batch_${Math.round(batch)}g`,
    ],
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

/** Roles a frozen product cannot exist without (Phase 10): a proposal missing
 * one of these entirely may NEVER be applied. Soft roles (fibre/body, milk
 * solids, dairy fat) lower the honest score instead. */
export const HARD_ROLES: ReadonlySet<FunctionalRole> = new Set([
  'primary_liquid',
  'water',
  'sweetener_sucrose',
  'sugar_freezing_control',
  'stabilizer',
]);

export interface FormulationProposal {
  /** The COMPLETE next RecipeInput (atomic-replacement contract). */
  proposedInput: RecipeInput;
  templateId: string;
  templateStatus: FormulationTemplate['status'];
  mode: FormulationMode;
  /** Template HARD roles with NO usable carrier at all — the preview must not
   * exist (Phase 10); soft gaps go to `missingRoles`/`recommendations`. */
  missingHardRoles: FunctionalRole[];
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

const toolboxIngredient = (id: string) =>
  DEFAULT_CORRECTION_CANDIDATES.find((c) => c.id === id)?.ingredient ?? null;

export interface FormulationOptions {
  /** Canonical ingredient ids the user explicitly REMOVED / marked unavailable —
   * PI never reintroduces them (they become recommendations instead). */
  excludedIngredientIds?: readonly string[];
}

const lockOf = (set: ConstraintSet, lineId: string): IngredientConstraint | undefined =>
  set.byLineId[lineId];

export type BuildFormulationResult =
  | { ok: true; proposal: FormulationProposal }
  | { ok: false; code: 'missing_required_role'; role: FunctionalRole; messagePl: string }
  | { ok: false; code: 'locked_exceeds_batch'; lockedSum: number }
  /** Owner P0 (truthful messages): the locked sum FITS the batch but nothing
   * adjustable remains to fill the difference — never reported as
   * „zablokowana suma przekracza partię" (locked 500 g ≤ 1000 g target). */
  | { ok: false; code: 'no_adjustable_lines' };

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
  options: FormulationOptions = {},
): BuildFormulationResult {
  const excluded = new Set(options.excludedIngredientIds ?? []);
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
  const missingHardRoles: FunctionalRole[] = [];
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

    // Unfilled role: AUTO-FILL from the approved functional toolbox (the owner
    // product contract — the customer chooses the ingredients they consciously
    // want; PI supplies the necessary approved technological base). Explicitly
    // excluded (removed/unavailable) ingredients are NEVER reintroduced — they
    // fall through to an honest recommendation instead.
    if (roleTarget.toolboxId && !excluded.has(roleTarget.toolboxId)) {
      const ingredient = toolboxIngredient(roleTarget.toolboxId);
      if (ingredient && !excluded.has(ingredient.id)) {
        const item: RecipeItem = {
          id: `formulation-${roleTarget.toolboxId}`,
          ingredient,
          planned_grams: targetGrams,
          actual_grams: null,
          lock_type: 'unlocked',
        };
        planned.push({ item, grams: targetGrams, fixed: !roleTarget.adjustable });
        added.push({
          ingredientId: ingredient.id,
          name: ingredient.name,
          grams: targetGrams,
          role: roleTarget.role,
          reasonPl:
            `PI dodało składnik w roli „${ROLE_LABEL_PL[roleTarget.role]}", ponieważ ` +
            `zatwierdzona receptura ${template.templateId} wymaga tej roli.`,
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
    if (HARD_ROLES.has(roleTarget.role)) missingHardRoles.push(roleTarget.role);
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

  // 3b. ROLE-GAP HONESTY (owner Fixture A): a template role whose only carriers
  //     are locked at 0 g (unavailable intention) contributes nothing — report
  //     the gap + an approved-alternative recommendation; NEVER reintroduce.
  for (const roleTarget of template.roles) {
    if (roleTarget.grams <= 0) continue;
    const carriers = planned.filter(
      (p) => resolveFunctionalRole(p.item.ingredient) === roleTarget.role,
    );
    if (carriers.length === 0) continue; // handled by the unfilled-role branch
    const carried = carriers.reduce((s, p) => s + p.grams, 0);
    const allZeroLocked = carried <= 0 && carriers.every((p) => p.fixed);
    if (allZeroLocked && !missingRoles.includes(roleTarget.role)) {
      missingRoles.push(roleTarget.role);
      recommendations.push({
        role: roleTarget.role,
        messagePl:
          `Składnik w roli „${ROLE_LABEL_PL[roleTarget.role]}" jest ustawiony na 0 g. ` +
          `Wynik może być niższy — możesz użyć innego zatwierdzonego składnika pełniącego tę rolę.`,
      });
    }
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
    // Truthful failure split (owner P0 Phase 9): claim „locked exceeds batch"
    // ONLY when it is arithmetically true — a locked 500 g against a 1000 g
    // target that merely lacks adjustable lines is a DIFFERENT, honest message.
    if (lockedSum > batch + 0.1) {
      return { ok: false, code: 'locked_exceeds_batch', lockedSum };
    }
    return { ok: false, code: 'no_adjustable_lines' };
  }
  normalize(); // second pass after clamps

  // Report the FINAL grams of auto-added lines (post-normalization truth).
  for (const addedLine of added) {
    const line = planned.find((p) => p.item.id === `formulation-${addedLine.ingredientId}`);
    if (line) addedLine.grams = line.grams;
  }

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
      missingHardRoles,
      missingRoles,
      recommendations,
      keptFixed,
    },
  };
}
