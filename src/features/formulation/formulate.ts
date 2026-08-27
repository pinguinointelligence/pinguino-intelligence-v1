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
import { canonicalToolboxComposition } from '@/data/ingredients/canonicalToolboxCompositions';
import {
  DEFAULT_CORRECTION_CANDIDATES,
  type EngineIngredient,
  type ProductCategory,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import type { ConstraintSet, IngredientConstraint } from '@/features/recipe-constraints';
import { resolveFunctionalRole, type FunctionalRole } from './ingredientRoles';
import { flavourHeldLineIds, isFlavourSensitiveRole } from './flavourMutationAuthority';
import {
  assessGelatoStabilizerSystem,
  gelatoStabilizerSystemApplies,
  gelatoStabilizerWholeGramBand,
} from '@/features/recipe-constraints/gelatoStabilizerSystemAuthority';
import {
  assessSorbetStabilizerSystem,
  sorbetStabilizerSystemApplies,
  sorbetStabilizerWholeGramBand,
} from '@/features/recipe-constraints/sorbetStabilizerSystemAuthority';
import { selectFormulationTemplateForRecipe, type FormulationTemplate } from './templateRegistry';
import { canonicalToolboxIdentity, isToolboxCandidateExcluded } from './toolboxCanonical';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import {
  canonicalIngredientId,
  normalizeIngredientIdentity,
} from '@/data/ingredients/canonicalIngredientIdentity';
import {
  OWNER_INULIN_POLICY,
  ownerInulinGramBand,
  ownerInulinPresentDoseIsValid,
} from '@/features/product-intelligence/ownerInulinPolicy';
import { resolveMainRatioScale } from './mainIngredientContract';

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
    // Main is an identity/ratio invariant, not an instruction to discard the
    // current composition and require a profile template. The local corrector
    // and trustless Apply door already preserve the complete Main group.
    item.lock_type !== 'main' &&
    (item.lock_type !== 'grams' || isEffectivelyLockedLine(item, set.byLineId[item.id]));
  const hardConstraints =
    Object.values(set.byLineId).some((c) => c.mode !== 'ai') || input.items.some(hardLine);
  const allLocked =
    input.items.length > 0 &&
    input.items.every((item) => hardLine(item) || set.byLineId[item.id]?.mode === 'locked');

  const lookup = selectFormulationTemplateForRecipe(input);

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
      return {
        mode: 'unsupported',
        template: null,
        reasons: [lookup.unsupportedReason ?? 'no_template'],
      };
    }
    return {
      mode: 'constrained_reformulation',
      template: lookup.template,
      reasons: [
        'hard_constraints_present',
        `draft_mass_${Math.round(sum)}g_vs_batch_${Math.round(batch)}g`,
      ],
    };
  }

  // Published internal formulation policies are part of technological
  // completeness, even when the frozen Engine bands are already clean. An
  // unlocked, positively selected Inulin line outside 2–8%, or a present
  // Gelato/Sorbet stabilizer system whose nearest whole-gram vector is outside
  // its Gellatti aggregate band, must be rebuilt through the approved profile
  // template. Fractional components that round to a legal system stay on the
  // local route and are made executable by the shared practicalizer.
  const selectedInulinGrams = input.items
    .filter(
      (item) => canonicalIngredientId(item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId,
    )
    .reduce((total, item) => total + item.planned_grams, 0);
  const ownerInulinNeedsFormulation =
    selectedInulinGrams > 0 &&
    !ownerInulinPresentDoseIsValid(input.target_batch_grams, selectedInulinGrams);
  const stabilizerAssessment = gelatoStabilizerSystemApplies(input.category)
    ? assessGelatoStabilizerSystem(input)
    : sorbetStabilizerSystemApplies(input.category)
      ? assessSorbetStabilizerSystem(input)
      : null;
  const roundedStabilizerTotal =
    stabilizerAssessment?.lineIds.reduce((total, lineId) => {
      const line = input.items.find((item) => item.id === lineId);
      return total + Math.max(0, Math.round(line?.planned_grams ?? 0));
    }, 0) ?? 0;
  const stabilizerNeedsFormulation =
    stabilizerAssessment?.present === true &&
    stabilizerAssessment.band !== null &&
    (roundedStabilizerTotal < stabilizerAssessment.band.minGrams ||
      roundedStabilizerTotal > stabilizerAssessment.band.maxGrams);
  if ((ownerInulinNeedsFormulation || stabilizerNeedsFormulation) && lookup.template) {
    return {
      mode: 'full_formulation',
      template: lookup.template,
      reasons: [
        ownerInulinNeedsFormulation
          ? 'owner_inulin_policy_requires_formulation'
          : 'stabilizer_system_policy_requires_formulation',
      ],
    };
  }

  // A substantive draft can still be technologically incomplete. The local
  // gram corrector may improve Engine bands without restoring a template HARD
  // role (for example Dextrose / sugar_freezing_control). Route that state
  // through the approved template before any Preview exists.
  const missingHardRole = lookup.template?.roles.some(
    (roleTarget) =>
      HARD_ROLES.has(roleTarget.role) &&
      !input.items.some(
        (item) =>
          resolveFunctionalRole(item.ingredient) === roleTarget.role && item.planned_grams > 0,
      ),
  );
  if (missingHardRole && lookup.template) {
    return {
      mode: 'full_formulation',
      template: lookup.template,
      reasons: ['missing_hard_role'],
    };
  }

  // Unconstrained: a SUBSTANTIVE draft (its own composition carries at least
  // half the target mass) is the user's recipe — the verified local corrector
  // owns it (it is batch-first and rescales 975 g → 1000 g itself, protected by
  // the beat-the-null gate). A hollow draft (empty, all-zero, or the 8 × 1 g
  // damaged case) has no composition to preserve → full formulation.
  //
  // …but only for the profiles that corrector is actually FOR (owner
  // 2026-08-24). Functional ingredient role is global; route eligibility is
  // not. Protein, Sorbet and Vegan each own an approved formulation path and
  // keep it — see `localCorrectionProfileEligible`.
  const substantiveDraft = batch > 0 && sum >= batch * 0.5;
  if (substantiveDraft && localCorrectionProfileEligible(input.category)) {
    return {
      mode: 'local_correction',
      template: null,
      reasons: ['substantive_unconstrained_draft'],
    };
  }
  if (substantiveDraft && lookup.template) {
    return {
      mode: 'full_formulation',
      template: lookup.template,
      reasons: [
        'profile_owns_formulation_path',
        `draft_mass_${Math.round(sum)}g_vs_batch_${Math.round(batch)}g`,
      ],
    };
  }
  if (!lookup.template) {
    return {
      mode: 'unsupported',
      template: null,
      reasons: [lookup.unsupportedReason ?? 'no_template'],
    };
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
  /** True when formulation reused an already-present canonical recipe line. */
  existingLineReused?: boolean;
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
/**
 * LOCAL-CORRECTION PROFILE AUTHORITY (owner, 2026-08-24).
 *
 * The bounded local corrector is the ordinary DAIRY GELATO corrector: its
 * stabilizer band, its Inulin dose policy, its gram ladder and its exact
 * Direction search are all the Gelato ones. Functional ingredient ROLE is
 * global — Sucrose is Sucrose in every profile — but ROUTE ELIGIBILITY is not.
 *
 * A profile that owns an approved formulation path of its own keeps it and is
 * never dropped into the dairy corrector merely because its ingredient roles
 * happen to cover a dairy template's HARD roles:
 *   - `protein_gelato` → the approved `protein_<route>_<strategy>_minus<T>_v1`
 *     templates plus the Protein qualification authority;
 *   - `sorbet`         → the Sorbet projection / NEAREST search;
 *   - `vegan_gelato`   → the Vegan structure authority.
 *
 * The eligible set is READ FROM the engine's existing Gelato authority
 * (`gelatoStabilizerSystemApplies`) rather than restated here, so there is one
 * definition of "this is an ordinary dairy Gelato". `custom` is included
 * separately and deliberately: it has no profile authority of its own, so the
 * generic corrector is the only thing that can serve it.
 */
export function localCorrectionProfileEligible(category: ProductCategory): boolean {
  return gelatoStabilizerSystemApplies(category) || category === 'custom';
}

export const HARD_ROLES: ReadonlySet<FunctionalRole> = new Set([
  'primary_liquid',
  'water',
  'sweetener_sucrose',
  'sugar_freezing_control',
  'stabilizer',
]);

/**
 * FLAVOUR-DEFINING roles PI may NEVER invent an amount for (owner addendum
 * items 1+2, 2026-07-25). These are the roles the registry already marks
 * `toolboxId: null` — "never auto-added, the user must supply it" — plus the
 * two flavour components addendum item 1 demoted from families to components
 * (nuts, alcohol). When a template HAS a target for one of them (sorbet fruit
 * 600 g, chocolate_base cocoa 85 g) the target fills it; when the approved
 * template for the canonical family has NO target for it — the dairy-fruit
 * gelato case after `fruit_gelato_ref_v1` was quarantined — PI has no approved
 * dose and must ASK, never silently leave the chosen flavour at 0 g.
 */
export const USER_SUPPLIED_FLAVOUR_ROLES: ReadonlySet<FunctionalRole> = new Set([
  'fruit',
  'chocolate_cocoa',
  'nut_paste',
  'alcohol',
  'plant_liquid',
  'plant_fat',
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
  /**
   * Owner addendum (Agent 3 — proportional-scaling detector baseline): the
   * PRE-normalization seed grams per line id (template role targets / user
   * amounts BEFORE `normalize()` squeezed them into the free envelope). Any
   * presented state whose unlocked lines are one shared factor × this baseline
   * is a proportional PROJECTION of the seed — never a formulation by itself.
   */
  seedBaselineGrams: Record<string, number>;
  /**
   * Owner addendum (3) — stabilizer-dose provenance: when the template
   * controls the stabilizer dose (`adjustable:false`) and the carrier is not
   * held by a user lock, the dose is INHERITED from the reference template,
   * not optimized by the Engine — the preview must say so explicitly.
   */
  stabilizerDose: { lineId: string; scaledTemplateGrams: number; inherited: boolean } | null;
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
  DEFAULT_CORRECTION_CANDIDATES.find((c) => c.id === id)?.ingredient ??
  findVerifiedVeganFormulationCandidate(id) ??
  findVerifiedProteinFormulationCandidate(id);

/**
 * Exact approved ingredient payloads that may legitimately appear as a NEW
 * line in a PI proposal. The Apply door uses these immutable references to
 * re-authorize additions instead of trusting provenance flags carried by the
 * preview. A core correction candidate is admissible only when it has a
 * canonical Mapper registry binding; verified Vegan/Protein candidates carry
 * their Mapper id directly.
 */
export function approvedFormulationToolboxIngredients(id: string): readonly EngineIngredient[] {
  const ingredient = toolboxIngredient(id);
  if (!ingredient) return [];
  const canonical = canonicalToolboxIdentity(id);
  const mapperId = canonical?.mapperId ?? ingredient.canonical_ingredient_id;
  if (typeof mapperId !== 'string' || !mapperId.startsWith('PI-ING-')) return [];
  const normalized = normalizeIngredientIdentity(
    { ...ingredient, canonical_ingredient_id: mapperId },
    'template',
  );
  // ONE IDENTITY → ONE COMPOSITION (owner v1.4 §7). Discovery may stay
  // reference-based, but an EXECUTABLE recipe line may not: the LAST entry is
  // the canonical Mapper-hydrated payload, and every path that turns a toolbox
  // candidate into a real line takes `.at(-1)`.
  //
  // Without it the same ingredient ran different Engine physics depending on how
  // it entered the recipe. Measured on Milk 3.5 %: the reference payload carries
  // pod_value/pac_value NULL, sugar 4.8, confidence 85, unverified, while the
  // Mapper row carries pod 0.752, pac 5.285, sugar 4.7, confidence 98, verified —
  // and `engine/pac.ts` prefers a stored pac_value, so an ADDED line and a
  // PRESENT line of the same product froze differently.
  //
  // It also broke the served app outright. `technicalFactsMatch` compares every
  // technical fact of the line against the product's frozen server facts to
  // 1e-7, so a reference-payload line can never match its own resolved
  // ProductBehavior snapshot; the served Preview was refused as
  // `behavior_snapshot_missing_or_unresolved` even though the snapshot had
  // resolved correctly. The earlier reading of that message as "the product
  // needs scanning" was wrong: nothing was missing, the facts simply disagreed.
  //
  // The reference payloads are deliberately RETAINED ahead of it: the Apply door
  // re-authorizes an addition by fingerprinting it against this list, so keeping
  // all three keeps both the historical and the canonical payload admissible and
  // leaves candidate discovery, the authenticity drift detectors and the
  // substitution contracts exactly as they were.
  const composition = canonicalToolboxComposition(id);
  if (!composition) return [ingredient, normalized];
  const hydrated = normalizeIngredientIdentity(
    {
      ...ingredient,
      canonical_ingredient_id: mapperId,
      name: composition.displayName,
      composition: { ...composition.composition },
      pod_value: composition.pod_value,
      pac_value: composition.pac_value,
      de_value: composition.de_value,
      cost_per_kg: composition.cost_per_kg,
      cost_currency: composition.cost_currency,
      confidence_score: composition.confidence_score,
      source_type: composition.verified ? 'verified_db' : ingredient.source_type,
      is_verified: composition.verified,
    },
    'template',
  );
  return [ingredient, normalized, hydrated];
}

export interface FormulationOptions {
  /** Canonical ingredient ids the user explicitly REMOVED / marked unavailable —
   * PI never reintroduces them (they become recommendations instead). */
  excludedIngredientIds?: readonly string[];
  /** Canonical exclusions that were Main before their row was removed. */
  unavailableMainIngredientIds?: readonly string[];
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
  | { ok: false; code: 'no_adjustable_lines' }
  | {
      ok: false;
      code: 'main_ratio_conflict';
      lineIds: string[];
      ingredientNames: string[];
      messagePl: string;
    }
  | {
      ok: false;
      code: 'main_ingredient_unavailable';
      ingredientIds: string[];
      messagePl: string;
    };

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
  if ((options.unavailableMainIngredientIds?.length ?? 0) > 0) {
    const ingredientIds = [...new Set(options.unavailableMainIngredientIds)];
    return {
      ok: false,
      code: 'main_ingredient_unavailable',
      ingredientIds,
      messagePl:
        `Składnik Główny (${ingredientIds.join(', ')}) jest oznaczony jako niedostępny. ` +
        'Gellatti nie usunie składnika, który definiuje recepturę. Dodaj zatwierdzony zamiennik lub przywróć składnik.',
    };
  }
  const excluded = new Set(options.excludedIngredientIds ?? []);
  const batch = input.target_batch_grams;
  const scale = batch / template.baseBatchG;
  const gelatoStabilizerAssessment = assessGelatoStabilizerSystem(input);
  const sorbetStabilizerAssessment = assessSorbetStabilizerSystem(input);
  const ownerStabilizerAssessment = gelatoStabilizerAssessment.applicable
    ? gelatoStabilizerAssessment
    : sorbetStabilizerAssessment;
  const ownerStabilizerSystemAlreadyValid =
    ownerStabilizerAssessment.applicable &&
    ownerStabilizerAssessment.present &&
    ownerStabilizerAssessment.issues.length === 0;

  // 1. Resolve every selected line's functional role.
  const lines = input.items.map((item) => ({
    item,
    role: resolveFunctionalRole(item.ingredient),
    constraint: lockOf(set, item.id),
    // Owner binding rule: a bare grams-lock at 0 g without a §17 constraint is
    // a selected-UNFILLED line — fillable, never a deliberate zero.
    locked: isEffectivelyLockedLine(item, lockOf(set, item.id)),
  }));
  const positiveInulinLines = lines.filter(
    (line) =>
      canonicalIngredientId(line.item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId &&
      line.item.planned_grams > 0,
  );
  const positiveInulinTotal = positiveInulinLines.reduce(
    (sum, line) => sum + line.item.planned_grams,
    0,
  );
  const ownerInulinAlreadyValid = ownerInulinPresentDoseIsValid(batch, positiveInulinTotal);
  const ownerInulinBand = ownerInulinGramBand(batch);

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
  /** Owner addendum items 1+2: selected 0 g lines the approved template has no
   * role target for — reported honestly, never silently left empty. */
  const unfillableSelections: { name: string; role: FunctionalRole }[] = [];

  // Some approved Gelato templates predate the owner Inulin policy and have
  // no fibre/body row. A positively selected exact Inulin line is still an
  // explicit request: seed it at the owner-preferred 4% and let the existing
  // correction search move it only when the rest of the recipe justifies it.
  if (!template.roles.some((target) => target.toolboxId === 'inulin')) {
    const selectedInulin = lines.filter(
      (line) =>
        canonicalIngredientId(line.item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId &&
        line.item.planned_grams > 0,
    );
    if (selectedInulin.length > 0) {
      const target = ownerInulinBand.preferredGrams;
      selectedInulin.forEach((line, index) => {
        const preferredShare = target / selectedInulin.length;
        const ownerMinimumShare = ownerInulinBand.minGrams / selectedInulin.length;
        const ownerMaximumShare = ownerInulinBand.maxGrams / selectedInulin.length;
        const constrainedShare =
          line.constraint?.mode === 'range'
            ? Math.min(Math.max(preferredShare, line.constraint.minGrams), line.constraint.maxGrams)
            : preferredShare;
        const grams = line.locked ? line.item.planned_grams : constrainedShare;
        mappedLineIds.add(line.item.id);
        planned.push({
          item: line.item,
          grams,
          fixed: line.locked,
          min: line.locked
            ? undefined
            : Math.max(
                ownerMinimumShare,
                line.constraint?.mode === 'range' ? line.constraint.minGrams : 0,
              ),
          max: line.locked
            ? undefined
            : Math.min(
                ownerMaximumShare,
                line.constraint?.mode === 'range'
                  ? line.constraint.maxGrams
                  : Number.POSITIVE_INFINITY,
              ),
        });
        roleTrace.push({
          role: 'fiber_body',
          hard: false,
          templateGrams: target,
          userLineIds: selectedInulin.map((entry) => entry.item.id),
          toolboxId: 'inulin',
          mapperId: 'PI-ING-000456',
          existingLineReused: true,
          candidateFound: true,
          excluded: false,
          outcome: 'user_filled',
          reason:
            index === 0
              ? 'owner_optional_inulin_preferred_target'
              : 'owner_optional_inulin_preferred_target_shared',
        });
      });
    }
  }

  // ORDER (owner Phase 3): resolve user roles → identify missing template
  // roles → resolve approved toolbox candidates by EXACT canonical identity →
  // auto-add allowed candidates → resolve Engine rows → compute amounts —
  // hard-role completeness is evaluated by the CALLER only after all of this.
  // A role is "missing" only if no approved, template-allowed, Engine-ready,
  // not-explicitly-excluded candidate exists.
  // Flavour accents the optimizer has no authority to raise (owner P1-B).
  const flavourHeld = flavourHeldLineIds(input);

  for (const roleTarget of template.roles) {
    const ownerInulinRole = roleTarget.toolboxId === 'inulin';
    const ownerStabilizerRole =
      roleTarget.role === 'stabilizer' &&
      (gelatoStabilizerSystemApplies(input.category) ||
        sorbetStabilizerSystemApplies(input.category));
    const canonical = roleTarget.toolboxId ? canonicalToolboxIdentity(roleTarget.toolboxId) : null;
    const exactCanonicalMatchesUnfiltered = canonical
      ? lines.filter((line) => canonicalIngredientId(line.item.ingredient) === canonical.mapperId)
      : [];
    const exactCanonicalMatches = ownerInulinRole
      ? exactCanonicalMatchesUnfiltered.filter((line) => line.item.planned_grams > 0)
      : exactCanonicalMatchesUnfiltered;
    const ownerInulinPolicyMatch = ownerInulinRole && exactCanonicalMatches.length > 0;
    const targetGrams = ownerInulinPolicyMatch
      ? ownerInulinBand.preferredGrams
      : ownerStabilizerRole
        ? sorbetStabilizerSystemApplies(input.category)
          ? sorbetStabilizerWholeGramBand(batch).preferredGrams
          : gelatoStabilizerWholeGramBand(batch).preferredGrams
        : roleTarget.grams * scale;
    const roleMatches = byRole.get(roleTarget.role) ?? [];
    // Protein Main is recipe identity, not a broad structural-role fallback.
    // A Main vanilla dairy paste, for example, must not become the 460 g milk
    // base. Keep this profile-scoped so accepted Gelato/Vegan formulation
    // behavior remains unchanged.
    const protectProteinMain = input.category === 'protein_gelato';
    const fallbackRoleMatches =
      roleTarget.toolboxId === null || !protectProteinMain
        ? roleMatches
        : roleMatches.filter((line) => line.item.lock_type !== 'main');
    // A zero-dose stabilizer has no established identity/dose contract. Only
    // the exact approved toolbox identity may receive the template seed; an
    // arbitrary role-shaped line must stay at zero while the approved carrier
    // is added. A positive user-selected stabilizer is established intent and
    // remains byte-held by the branch below.
    const templateEligibleFallbackMatches =
      roleTarget.role === 'stabilizer' || ownerInulinRole
        ? fallbackRoleMatches.filter((line) => line.item.planned_grams > 0)
        : fallbackRoleMatches;
    const matches =
      ownerStabilizerRole && templateEligibleFallbackMatches.length > 0
        ? templateEligibleFallbackMatches
        : exactCanonicalMatches.length > 0
          ? exactCanonicalMatches
          : templateEligibleFallbackMatches;
    const traceBase = {
      role: roleTarget.role,
      hard: HARD_ROLES.has(roleTarget.role),
      templateGrams: targetGrams,
      userLineIds: matches.map((m) => m.item.id),
      toolboxId: roleTarget.toolboxId,
      mapperId: canonical?.mapperId ?? null,
      existingLineReused: matches.length > 0,
    };
    if (matches.length > 0) {
      const wholeShare = ownerStabilizerRole ? Math.floor(targetGrams / matches.length) : 0;
      const wholeRemainder = ownerStabilizerRole ? targetGrams % matches.length : 0;
      // FLAVOUR MUTATION AUTHORITY (owner P1-B): a template role target is
      // technological structure, never permission to inflate a secondary
      // flavour accent to co-equal status. When one flavour role has several
      // carriers, the accents keep exactly the grams the user supplied and only
      // the primary carrier (Main, else the largest) absorbs the template
      // target. Single-carrier roles are untouched, so accepted flows keep
      // byte-identical behaviour.
      const flavourRole = isFlavourSensitiveRole(roleTarget.role);
      const heldFlavourMatches = flavourRole
        ? matches.filter((candidate) => flavourHeld.has(candidate.item.id))
        : [];
      const flavourAuthorityApplies = heldFlavourMatches.length > 0;
      const heldFlavourGrams = heldFlavourMatches.reduce(
        (sum, candidate) => sum + candidate.item.planned_grams,
        0,
      );
      const primaryFlavourCarriers = matches.length - heldFlavourMatches.length;
      const primaryFlavourShare =
        primaryFlavourCarriers > 0
          ? Math.max(0, targetGrams - heldFlavourGrams) / primaryFlavourCarriers
          : 0;
      for (const [matchIndex, match] of matches.entries()) {
        const heldFlavourAccent = flavourAuthorityApplies && flavourHeld.has(match.item.id);
        const share =
          ownerInulinPolicyMatch && ownerInulinAlreadyValid
            ? match.item.planned_grams
            : ownerStabilizerRole && ownerStabilizerSystemAlreadyValid
              ? match.item.planned_grams
              : ownerStabilizerRole
                ? wholeShare + (matchIndex < wholeRemainder ? 1 : 0)
                : heldFlavourAccent
                  ? match.item.planned_grams
                  : flavourAuthorityApplies
                    ? primaryFlavourShare
                    : targetGrams / matches.length;
        mappedLineIds.add(match.item.id);
        const constraint = match.constraint;
        // Stabilizer windows are safety clamps, not an approved activity
        // gradient. Once a recipe carries a positive stabilizer dose, full and
        // constrained formulation must preserve that established dose exactly
        // instead of silently replacing it with a batch-scaled template share.
        // A missing/zero carrier may still be seeded from the approved
        // template; explicit batch rescale is handled by its dedicated route.
        if (
          roleTarget.role === 'stabilizer' &&
          !ownerStabilizerRole &&
          match.item.planned_grams > 0
        ) {
          const heldGrams =
            constraint?.mode === 'locked'
              ? constraint.grams
              : constraint?.mode === 'range'
                ? Math.min(
                    Math.max(match.item.planned_grams, constraint.minGrams),
                    constraint.maxGrams,
                  )
                : match.item.planned_grams;
          planned.push({ item: match.item, grams: heldGrams, fixed: true });
          continue;
        }
        // ACCEPTANCE ADDENDUM (4) — MAX/RANGE SEMANTICS: a §17 RANGE constraint
        // takes priority over the `lock_type='grams'` HOLD-AT-CURRENT staging
        if (protectProteinMain && match.item.lock_type === 'main') {
          planned.push({ item: match.item, grams: match.item.planned_grams, fixed: true });
          continue;
        }
        // the UI applies to every constrained line. Before this fix the
        // `match.locked` branch fired first, so a UI-staged range degraded to
        // an EXACT hold at the current grams (the range branch was
        // unreachable) and a max bound gave the solver no freedom to land
        // BELOW it. A range now means: template share CLAMPED into
        // [min, max] — the solver chooses within the bounds (max may move
        // below; exact may not).
        if (constraint?.mode === 'range') {
          planned.push({
            item: match.item,
            grams: Math.min(Math.max(share, constraint.minGrams), constraint.maxGrams),
            fixed: !roleTarget.adjustable,
            min: constraint.minGrams,
            max: constraint.maxGrams,
          });
        } else if (match.locked && constraint?.mode === 'locked') {
          planned.push({ item: match.item, grams: constraint.grams, fixed: true });
        } else if (match.locked) {
          planned.push({ item: match.item, grams: match.item.planned_grams, fixed: true });
        } else {
          planned.push({
            item: match.item,
            grams: share,
            // A held flavour accent is fixed so the downstream proportional
            // normalization cannot re-inflate it into the free envelope.
            fixed: ownerStabilizerRole || !roleTarget.adjustable || heldFlavourAccent,
            min: ownerInulinPolicyMatch ? ownerInulinBand.minGrams : undefined,
            max: ownerInulinPolicyMatch ? ownerInulinBand.maxGrams : undefined,
          });
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

    if (ownerInulinRole) {
      missingRoles.push(roleTarget.role);
      recommendations.push({
        role: roleTarget.role,
        messagePl: 'Dodanie inuliny może pomóc osiągnąć poprawny balans receptury.',
      });
      roleTrace.push({
        ...traceBase,
        candidateFound: true,
        excluded: false,
        outcome: 'missing_soft',
        reason: 'owner_optional_inulin_requires_explicit_user_add',
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
          // §9 — canonicalize BEFORE final physics: the executable line is built
          // from the canonical Mapper payload, so POD/NPAC, the Preview and the
          // Apply proof all describe the same product the served app resolves.
          const approvedIngredient = approvedFormulationToolboxIngredients(roleTarget.toolboxId).at(
            -1,
          );
          if (!approvedIngredient) {
            missingRoles.push(roleTarget.role);
            if (HARD_ROLES.has(roleTarget.role)) missingHardRoles.push(roleTarget.role);
            roleTrace.push({
              ...traceBase,
              candidateFound: false,
              excluded: false,
              outcome: HARD_ROLES.has(roleTarget.role) ? 'missing_hard' : 'missing_soft',
              reason: 'candidate_missing_canonical_mapper_authorization',
            });
            continue;
          }
          const item: RecipeItem = {
            id: `formulation-${roleTarget.toolboxId}`,
            ingredient: approvedIngredient,
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
              `Gellatti dodało ${canonical ? `„${canonical.namePl}" (${canonical.mapperId})` : 'składnik'} ` +
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
    if (
      roleTarget.toolboxId === null &&
      (roleTarget.role === 'fruit' ||
        roleTarget.role === 'plant_liquid' ||
        roleTarget.role === 'plant_fat' ||
        roleTarget.role === 'chocolate_cocoa')
    ) {
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
          `Wybierz składnik z katalogu Gellatti, aby przygotować tę recepturę.`,
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
  //
  //    OWNER FINAL INTEGRATION ADDENDUM — items 1+2 (2026-07-25): after the
  //    canonical-family rule a dairy fruit gelato seeds from the APPROVED
  //    `milk_base_v1`/G17/G18 templates, which carry no `fruit` role target, and
  //    the reference-derived `fruit_gelato_ref_v1` (fruit 350 g, transcribed
  //    from a QA fixture) is quarantined. PI therefore has NO approved dose for
  //    such a flavour line and may not invent one — but it must never leave the
  //    user's chosen ingredient SILENTLY at 0 g either. A selected line that
  //    carries no template role AND no grams gets an explicit recommendation
  //    naming it, so the surface asks for the amount instead of pretending the
  //    ingredient is not there.
  for (const line of lines) {
    if (mappedLineIds.has(line.item.id)) continue;
    const constraint = line.constraint;
    const explicitZero = constraint?.mode === 'locked' && constraint.grams <= 0;
    const grams =
      // A §17 RANGE is the user's OWN explicit bound for this line — it is an
      // instruction, not invented science, so a role-less line honors it just
      // like a template-mapped one does (owner addendum items 1+2: this is what
      // lets a user aim a flavour line the approved template has no target for).
      constraint?.mode === 'range'
        ? Math.min(Math.max(line.item.planned_grams, constraint.minGrams), constraint.maxGrams)
        : line.locked && constraint?.mode === 'locked'
          ? constraint.grams
          : Math.max(0, line.item.planned_grams);
    const hasSoftUserTarget =
      line.item.lock_type === 'unlocked' &&
      line.item.actual_grams === null &&
      line.item.user_target_grams !== undefined &&
      Number.isFinite(line.item.user_target_grams) &&
      line.item.user_target_grams >= 0;
    planned.push({ item: line.item, grams, fixed: !hasSoftUserTarget });
    if (!hasSoftUserTarget) keptFixed.push(line.item.ingredient.name);
    if (grams <= 0 && !explicitZero) {
      unfillableSelections.push({ name: line.item.ingredient.name, role: line.role });
    }
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

  // 3b-bis. UNFILLABLE SELECTION HONESTY (owner addendum items 1+2).
  //
  //     A chosen ingredient sitting at 0 g that the APPROVED template has no
  //     role target for cannot be given an amount by PI without inventing
  //     science. Two honest outcomes, never a silent zero:
  //      - a FLAVOUR-DEFINING role (the fruit of a dairy fruit gelato, a nut
  //        paste, an alcohol) — the recipe IS that flavour, so a formulation
  //        that quietly returns a plain milk base would be a lie. PI stops and
  //        asks for the amount, naming the exact ingredient.
  //      - any other role (salt and friends — the existing salt rule) — the
  //        line stays at the user's 0 g and PI reports the gap as a
  //        recommendation, exactly as an unfilled soft template role does.
  const flavourGap = unfillableSelections.find((entry) =>
    USER_SUPPLIED_FLAVOUR_ROLES.has(entry.role),
  );
  if (flavourGap) {
    return {
      ok: false,
      code: 'missing_required_role',
      role: flavourGap.role,
      messagePl:
        `Składnik „${flavourGap.name}" (rola „${ROLE_LABEL_PL[flavourGap.role]}") ma 0 g, ` +
        `a zatwierdzona receptura bazowa ${template.templateId} nie zawiera tej roli — ` +
        `Gellatti nie zgaduje ilości składnika smakowego. Wpisz ilość, ` +
        `a reszta receptury zostanie dopasowana wokół niej.`,
      roleTrace,
    };
  }
  for (const unfillable of unfillableSelections) {
    recommendations.push({
      role: unfillable.role,
      messagePl:
        `Gellatti nie ma zatwierdzonej ilości dla składnika „${unfillable.name}” ` +
        `(rola „${ROLE_LABEL_PL[unfillable.role]}") w tym profilu — wpisz ilość, ` +
        `a reszta receptury zostanie dopasowana wokół niej.`,
    });
  }

  // 3c. MULTI-MAIN IDENTITY: all positive Main lines are one ratio group.
  // Templates may provide the technological structure and may suggest a total
  // for a represented flavour role, but they may never split multiple Main
  // carriers equally or otherwise overwrite the user's relative intent. Exact
  // locks/ranges anchor the WHOLE group; an incompatible anchor is an honest
  // conflict, never a silently broken ratio.
  const plannedMainTotal = planned
    .filter((entry) => entry.item.lock_type === 'main')
    .reduce((sum, entry) => sum + entry.grams, 0);
  const mainScale = resolveMainRatioScale(input, set.byLineId, plannedMainTotal);
  if (!mainScale.ok) return mainScale;
  if (mainScale.mains.length > 0) {
    const scaledMainTotal = mainScale.mains.reduce(
      (sum, main) => sum + main.grams * mainScale.scaleFactor,
      0,
    );
    if (scaledMainTotal > batch + 0.1) {
      return {
        ok: false,
        code: 'main_ratio_conflict',
        lineIds: mainScale.mains.map((main) => main.lineId),
        ingredientNames: mainScale.mains.map((main) => main.ingredientName),
        messagePl:
          `Proporcja składników Głównych (${mainScale.mains.map((main) => main.ingredientName).join(', ')}) ` +
          `wymaga ${scaledMainTotal.toFixed(1)} g, więcej niż docelowa partia ${batch.toFixed(1)} g. ` +
          'Gellatti nie zmieniło blokad ani składników definiujących recepturę.',
      };
    }
    const originalByLineId = new Map(
      mainScale.mains.map((main) => [main.lineId, main.grams] as const),
    );
    for (const entry of planned) {
      const originalGrams = originalByLineId.get(entry.item.id);
      if (originalGrams === undefined) continue;
      entry.grams = originalGrams * mainScale.scaleFactor;
      // The group amount is resolved once. Independent normalization of its
      // members could drift the ratio; technological lines fill the envelope.
      entry.fixed = true;
      delete entry.min;
      delete entry.max;
    }
  }

  // 3d. SEED BASELINE (owner addendum — proportional-scaling detector): freeze
  //     the PRE-normalization grams per line. `normalize()` below is a pure
  //     proportional projection of these values into the free envelope — the
  //     detector downstream compares the FINAL presented state against this
  //     baseline to prove whether real engine moves followed.
  const seedBaselineGrams: Record<string, number> = {};
  for (const p of planned) seedBaselineGrams[p.item.id] = p.grams;

  // 3e. Stabilizer-dose provenance (owner addendum 3): template-controlled
  //     dose (`adjustable:false`) on a carrier NOT held by a user lock is
  //     INHERITED from the reference template — never Engine-optimized.
  const stabilizerRole = template.roles.find((roleTarget) => roleTarget.role === 'stabilizer');
  let stabilizerDose: FormulationProposal['stabilizerDose'] = null;
  if (stabilizerRole) {
    const carrier = planned.find((p) => resolveFunctionalRole(p.item.ingredient) === 'stabilizer');
    if (carrier) {
      const carrierConstraint = lockOf(set, carrier.item.id);
      const userHeld =
        carrierConstraint?.mode === 'locked' ||
        carrierConstraint?.mode === 'range' ||
        isEffectivelyLockedLine(carrier.item, carrierConstraint);
      stabilizerDose = {
        lineId: carrier.item.id,
        scaledTemplateGrams: stabilizerRole.grams * scale,
        inherited: !stabilizerRole.adjustable && !userHeld,
      };
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
      seedBaselineGrams,
      stabilizerDose,
    },
  };
}
