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
import { canonicalToolboxIdentity, isToolboxCandidateExcluded } from './toolboxCanonical';

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
 * ZERO-GRAM SELECTED INGREDIENT SEMANTICS (owner binding rule, live repair):
 * a SELECTED line at 0 g is „chosen but unfilled" — formulation MUST be allowed
 * to give it grams. It stays at 0 ONLY when the zero is EXPLICIT: a §17
 * padlock constraint `{mode:'locked', grams:0}` (or an exclusion, handled
 * upstream). A bare `lock_type='grams'` at exactly 0 g with NO constraint
 * entry is an artifact (legacy saved recipes / resolution-bridge lines / the
 * lock dropdown) — it is NOT a deliberate „keep this role empty" instruction
 * and must never silently produce the owner's „fruit stays 0 g" failure.
 */
export function isEffectivelyLockedLine(
  item: RecipeItem,
  constraint: IngredientConstraint | undefined,
): boolean {
  if (constraint?.mode === 'locked') return true;
  if (item.lock_type !== 'grams') return false;
  return item.planned_grams > 0; // grams-lock at 0 without a constraint = unfilled, not locked
}

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

  // Zero-gram artifacts (selected-unfilled lines wearing a bare grams-lock)
  // never count as constraints and never drive routing (owner binding rule).
  const hardLine = (item: RecipeItem): boolean =>
    item.lock_type !== 'unlocked' &&
    (item.lock_type !== 'grams' || isEffectivelyLockedLine(item, set.byLineId[item.id]));
  const hardConstraints =
    Object.values(set.byLineId).some((c) => c.mode !== 'ai') || input.items.some(hardLine);
  const allLocked =
    input.items.length > 0 &&
    input.items.every((item) => hardLine(item) || set.byLineId[item.id]?.mode === 'locked');

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
  /** Stable canonical Mapper id (owner Phase 2 — staging-verified registry). */
  mapperId: string | null;
  /** Polish display name of the canonical registry entry. */
  namePl: string | null;
  grams: number;
  role: FunctionalRole;
  reasonPl: string;
}

/** One row of the Phase-1 role trace (owner P0 — QA-visible ordering proof):
 * required role | user supplied? | toolbox candidate | found? | filtered? |
 * exact reason. Built for EVERY template role, in template order. */
export interface FormulationRoleTraceRow {
  role: FunctionalRole;
  hard: boolean;
  /** Template grams scaled to this batch (the role's target amount). */
  templateGrams: number;
  /** User-selected line ids carrying this role (empty = none supplied). */
  userLineIds: string[];
  /** The template's toolbox candidate id (null = user must supply the role). */
  toolboxId: string | null;
  /** Canonical Mapper id of that candidate (null when none registered). */
  mapperId: string | null;
  /** The candidate resolved in the approved engine toolbox catalogue? */
  candidateFound: boolean;
  /** The candidate (any canonical identity) is explicitly user-excluded? */
  excluded: boolean;
  outcome:
    | 'user_filled'
    | 'toolbox_added'
    | 'missing_soft'
    | 'missing_hard'
    | 'user_supplied_required';
  /** Exact machine-readable reason for the outcome. */
  reason: string;
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
  /** Phase-1 role trace — one row per template role, in template order. */
  roleTrace: FormulationRoleTraceRow[];
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
  | {
      ok: false;
      code: 'missing_required_role';
      role: FunctionalRole;
      messagePl: string;
      /** Role rows resolved up to (and including) the stopping role. */
      roleTrace?: FormulationRoleTraceRow[];
    }
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
    // Owner binding rule: a bare grams-lock at 0 g without a §17 constraint is
    // a selected-UNFILLED line — fillable, never a deliberate zero.
    locked: isEffectivelyLockedLine(item, lockOf(set, item.id)),
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
  const roleTrace: FormulationRoleTraceRow[] = [];
  const mappedLineIds = new Set<string>();

  // ORDER (owner Phase 3): resolve user roles → identify missing template
  // roles → resolve approved toolbox candidates by EXACT canonical identity →
  // auto-add allowed candidates → resolve Engine rows → compute amounts —
  // hard-role completeness is evaluated by the CALLER only after all of this.
  // A role is "missing" only if no approved, template-allowed, Engine-ready,
  // not-explicitly-excluded candidate exists.
  for (const roleTarget of template.roles) {
    const targetGrams = roleTarget.grams * scale;
    const matches = byRole.get(roleTarget.role) ?? [];
    const canonical = roleTarget.toolboxId ? canonicalToolboxIdentity(roleTarget.toolboxId) : null;
    const traceBase = {
      role: roleTarget.role,
      hard: HARD_ROLES.has(roleTarget.role),
      templateGrams: targetGrams,
      userLineIds: matches.map((m) => m.item.id),
      toolboxId: roleTarget.toolboxId,
      mapperId: canonical?.mapperId ?? null,
    };
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
      roleTrace.push({
        ...traceBase,
        candidateFound: true,
        excluded: false,
        outcome: 'user_filled',
        reason: 'user_selected_ingredient_carries_role',
      });
      continue;
    }

    // Unfilled role: AUTO-FILL from the approved functional toolbox (the owner
    // product contract — the customer chooses the ingredients they consciously
    // want; PI supplies the necessary approved technological base). Candidates
    // resolve by EXACT canonical registry identity (owner Phase 2). Explicitly
    // excluded (removed/unavailable) ingredients — under the engine id OR the
    // stable Mapper id — are NEVER reintroduced; they fall through to an
    // honest recommendation instead.
    if (roleTarget.toolboxId) {
      const ingredient = toolboxIngredient(roleTarget.toolboxId);
      const candidateExcluded =
        isToolboxCandidateExcluded(roleTarget.toolboxId, excluded) ||
        (ingredient !== null && excluded.has(ingredient.id));
      if (!candidateExcluded) {
        if (ingredient) {
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
            mapperId: canonical?.mapperId ?? null,
            namePl: canonical?.namePl ?? null,
            grams: targetGrams,
            role: roleTarget.role,
            reasonPl:
              `PI dodało ${canonical ? `„${canonical.namePl}" (${canonical.mapperId})` : 'składnik'} ` +
              `w roli „${ROLE_LABEL_PL[roleTarget.role]}", ponieważ ` +
              `zatwierdzona receptura ${template.templateId} wymaga tej roli.`,
          });
          roleTrace.push({
            ...traceBase,
            candidateFound: true,
            excluded: false,
            outcome: 'toolbox_added',
            reason: 'approved_toolbox_candidate_auto_added',
          });
          continue;
        }
      }
    }
    if (roleTarget.toolboxId === null && (roleTarget.role === 'fruit' || roleTarget.role === 'plant_liquid' || roleTarget.role === 'plant_fat' || roleTarget.role === 'chocolate_cocoa')) {
      // A user-supplied role that cannot be invented — precise missing-role stop.
      roleTrace.push({
        ...traceBase,
        candidateFound: false,
        excluded: false,
        outcome: 'user_supplied_required',
        reason: 'flavor_role_never_auto_added_user_must_supply',
      });
      return {
        ok: false,
        code: 'missing_required_role',
        role: roleTarget.role,
        messagePl:
          `Brakuje składnika w roli: ${ROLE_LABEL_PL[roleTarget.role]}. ` +
          `Wybierz składnik z katalogu PI, aby PI mogło ułożyć recepturę ${template.templateId}.`,
        roleTrace,
      };
    }
    const isHard = HARD_ROLES.has(roleTarget.role);
    const candidateInCatalogue =
      roleTarget.toolboxId !== null && toolboxIngredient(roleTarget.toolboxId) !== null;
    roleTrace.push({
      ...traceBase,
      candidateFound: candidateInCatalogue,
      excluded:
        roleTarget.toolboxId !== null && isToolboxCandidateExcluded(roleTarget.toolboxId, excluded),
      outcome: isHard ? 'missing_hard' : 'missing_soft',
      reason:
        roleTarget.toolboxId === null
          ? 'template_names_no_toolbox_candidate'
          : candidateInCatalogue
            ? 'candidate_explicitly_excluded_by_user'
            : 'candidate_not_in_approved_catalogue',
    });
    missingRoles.push(roleTarget.role);
    if (isHard) missingHardRoles.push(roleTarget.role);
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
      roleTrace,
    },
  };
}
