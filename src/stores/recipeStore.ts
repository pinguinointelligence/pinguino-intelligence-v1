/**
 * Recipe working state — the goal fields + ingredient lines the user edits.
 *
 * This store holds INPUT only. It never stores computed numbers: the engine
 * result is derived on demand via buildRecipeInput + calculateRecipe
 * (useStudioResult). Persisted to localStorage so a demo survives reload.
 *
 * Curated demo scenarios load atomically via loadPreset (Step 5C); the store
 * seeds the default Milk Base preset.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PRESET, type DemoPreset, type PresetId } from '@/data/demoPresets';
import {
  canonicalInternalCategory,
  gelatoInternalCategory,
  internalCategoryFor,
  visibleTypeOf,
  type VisibleProductType,
} from '@/features/studio/productType';
import type {
  EngineIngredient,
  LockType,
  ProductCategory,
  ProductMode,
  RecipeGoals,
  RecipeDirectionTarget,
  RecipeDirectionTargets,
  RecipeInput,
  RecipeItem,
} from '@/engine';
import {
  canonicalDuplicateIds,
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
  normalizeIngredientIdentity,
  normalizeRecipeItemIdentity,
} from '@/data/ingredients/canonicalIngredientIdentity';
import { useAuthStore } from '@/stores/authStore';
import { readRecipeProfileMetadata } from '@/features/pro-workbench/recipeProfilePersistence';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import {
  clearCrownAutoSeeded,
  clearCrownAutoSeededLines,
  crownOffPlannedGrams,
  crownOnPlannedGrams,
  markCrownAutoSeeded,
} from '@/features/ingredient-builder/crownAutoSeed';
import {
  DEFAULT_DIRECTION_TARGETS,
  savedRecipeProfileDraftIdentity,
  type ProfileSettingsSnapshot,
  useRecipeProfileStore,
} from '@/features/pro-workbench/recipeProfileStore';
import {
  normalizeFormulationStrategy,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';
import {
  readPracticalRecipeAudit,
  type PracticalRecipeSavedAudit,
  unusedZeroGramLineIds,
} from '@/features/practical-recipe/practicalRecipe';
import {
  readRecipeCompositionMetadata,
  recipeCompositionFromState,
  type OwnerReviewRecipeGate,
  type RecipeCompositionMetadata,
  type RecipeToppingItem,
  type RecipeToppingIngredient,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { productionVersionFingerprint } from '@/features/production-workspace/productionReadinessState';
import {
  buildCanonicalNewRecipeStarter,
  DEFAULT_NEW_RECIPE_BATCH_G,
  DEFAULT_NEW_RECIPE_PROFILE,
  DEFAULT_NEW_RECIPE_STRATEGY,
  isNewRecipeServingModeId,
  newRecipeStarterMaterialFingerprint,
  starterServingModeForTemperature,
  type NewRecipeStarterKey,
} from '@/features/recipes/newRecipeStarter';
import {
  cloneToppingIngredient,
  isCatalogLabelToppingIngredient,
  toppingIngredientIdentity,
} from '@/features/recipe-composition/labelTopping';
import {
  mainBehaviorBlockReason,
  productBehaviorIsManaged,
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import {
  clampOwnerStabilizerComponentGrams,
  evaluateRecipeConstraintAuthority,
  planSorbetStabilizerSystemRescale,
  sorbetStabilizerSystemItems,
} from '@/features/recipe-constraints';
import {
  buildRecipeInput,
  type RecipeInputState,
} from '@/features/studio/buildRecipeInput';
import { classifyProfileTransition } from '@/features/pro-workbench/profileCompatibility';
import {
  MACHINE_CATALOG,
  deriveMachineSetup,
  type MachineTechnology,
} from '@/features/machine-catalog';

type FlavorIntensity = NonNullable<RecipeGoals['flavor_intensity']>;

const OWNER_REVIEW_GATE_REASON = 'owner_review_production_label_gate';
const OWNER_REVIEW_GATE_WARNING = 'owner_review_only';

/** Server re-resolution may refresh product truth, but it must never erase a
 * recipe-level Owner Review boundary. That boundary belongs to the opened
 * template (omitted Toppings/final legal process), not to the product
 * classifier, so it is re-applied after every snapshot refresh and survives
 * save/reload through the ordinary composition sidecar. */
const preserveOwnerReviewGate = (
  gate: OwnerReviewRecipeGate | null,
  current: ProductBehaviorSnapshot,
): ProductBehaviorSnapshot => {
  if (!gate) return structuredClone(current);
  return {
    ...structuredClone(current),
    moduleEligibility: {
      ...current.moduleEligibility,
      PRODUCTION: 'blocked',
      PROCESS: 'blocked',
      LABEL: 'blocked',
      MASTER_LABEL: 'blocked',
      EXPORT: 'blocked',
    },
    warnings: [...new Set([...current.warnings, OWNER_REVIEW_GATE_WARNING])],
    blockReasons: [...new Set([...current.blockReasons, OWNER_REVIEW_GATE_REASON])],
  };
};

/**
 * Crown top-down seed authority.
 *
 * Entered Crown grams are not an initial optimisation anchor and therefore
 * must never be converted into a Multi-Main ratio. Every positive Crown gets
 * one equal seed share; the existing frontier then starts at its independently
 * proved upper bound and searches downward through the unchanged Engine and
 * guards. Standard lines are returned byte-for-byte. An explicit ratio-editor
 * action remains a separate user instruction and may still override the equal
 * seed after the Crown set has been created.
 */
const equalCrownSeedWeights = (items: RecipeItem[]): RecipeItem[] => {
  const mains = items.filter((item) => item.lock_type === 'main');
  if (mains.length === 0) return items;
  return items.map((item) =>
    item.lock_type === 'main' ? { ...item, main_ratio_weight: 1 } : item,
  );
};

/** Every hydrated Crown group gets the current equal top-down seed. Legacy
 * saved weights belonged to the retired manual-ratio semantic and must not
 * create an alternative Crown authority after Save/Reopen. */
const hydrateLegacyMainRatioWeights = (items: RecipeItem[]): RecipeItem[] => {
  return equalCrownSeedWeights(items);
};

type CostPriority = NonNullable<RecipeGoals['cost_priority']>;

export type AddIngredientResult =
  | { status: 'added'; lineId: string; canonicalId: string }
  | { status: 'duplicate'; lineId: string; canonicalId: string };

export type RecipeBatchSource =
  | 'MACHINE_DEFAULT'
  | 'USER_OVERRIDE'
  | 'PROFESSIONAL_DEFAULT'
  | 'PROFESSIONAL_USER_BATCH'
  | 'CUSTOM_MACHINE_BATCH';

/** Canonical Gellatti batch applied whenever Professional is selected. */
export const PROFESSIONAL_DEFAULT_BATCH_GRAMS = DEFAULT_NEW_RECIPE_BATCH_G;

export const BATCH_RESIZE_TOLERANCE_GRAMS = 0.1;

export type BatchResizeConflictReason =
  | 'invalid_target'
  | 'fixed_locks_exceed_target'
  | 'no_scalable_mass'
  | 'range_lock_conflict'
  | 'batch_mismatch';

export interface BatchResizeConflict {
  readonly reason: BatchResizeConflictReason;
  readonly targetGrams: number;
  readonly actualGrams: number;
  readonly lineId?: string;
}

export type BatchResizeResult =
  | { readonly ok: true; readonly items: RecipeItem[] }
  | { readonly ok: false; readonly conflict: BatchResizeConflict };

export type BatchResizeWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly conflict: BatchResizeConflict };

export interface RecipeState {
  mode: ProductMode;
  formulation_strategy: FormulationStrategy;
  category: ProductCategory;
  /**
   * The CUSTOMER-FACING product type (owner P0): exactly Gelato/Sorbet/Vegan/Protein. `category`
   * is the INTERNAL Engine calculation policy, DERIVED from the visible type + real ingredients
   * (chocolate/nut/fruit/alcohol route internally; never a visible type). 'protein' is honest-
   * unsupported: it never silently re-profiles the recipe.
   */
  visibleProductType: VisibleProductType;
  target_temperature_c: number;
  target_batch_grams: number;
  /** Explicit authority for the current target batch. */
  batch_source: RecipeBatchSource;
  /** Transient, explicit failure from the last rejected atomic resize. */
  batchResizeConflict: BatchResizeConflict | null;
  machine_capacity_grams: number | null;
  /**
   * OWNER CURRENT-DRAFT P0 (Phase 8) — WHERE the capacity came from. The engine
   * raises `machine_capacity_exceeded` from `machine_capacity_grams` alone, so
   * an UNPROVENANCED value (e.g. one persisted into localStorage by an earlier
   * session and never cleared) made a 1000 g PROFESSIONAL recipe with no Home
   * machine selected shout „batch exceeds machine capacity". A capacity only
   * reaches the Engine when it has an explicit source: a Home machine
   * selection ('machine') or an explicit user entry / saved recipe ('manual').
   * null ⇒ no capacity limit is in force, whatever number happens to be stored.
   */
  machine_capacity_source: 'machine' | 'manual' | null;
  flavor_intensity: FlavorIntensity;
  cost_priority: CostPriority;
  /** Canonical persisted direction intent used by Preview formulation. */
  direction_targets: RecipeDirectionTargets;
  direction_targets_active: boolean;
  items: RecipeItem[];
  /** Display/workflow order only; Engine item order remains canonical and untouched. */
  baseOrder: string[];
  /** Post-process additions. They never enter Base Engine formulation. */
  toppings: RecipeToppingItem[];
  /** Immutable product/version/policy authority per Base/Topping line. */
  productBehaviorSnapshots: Record<string, ProductBehaviorSnapshot>;
  /** Durable recipe-level Owner Review boundary. It cannot disappear when a
   * product snapshot is re-resolved or a Base line is replaced. */
  ownerReviewGate: OwnerReviewRecipeGate | null;
  compositionMigrationAmbiguities: Array<{ lineId: string; reason: string }>;
  /**
   * Canonical ingredient ids the user EXPLICITLY marked unavailable/excluded —
   * the formulation toolbox never reintroduces them (cleared by adding the
   * ingredient back). Owner FINAL CLOSURE C2 (supersedes the NIGHTLY-phase
   * removal-excludes rule): `removeItem` NEVER writes here — removing a row
   * only removes it from the CURRENT recipe. The ONLY exclusion source is the
   * explicit `markIngredientUnavailable` action.
   *
   * OWNER FINAL INTEGRATION ADDENDUM (Agent C — multi-remove/no-refresh):
   * PERSISTED. An explicit „nie mam tego składnika" is DRAFT-MATERIAL (it is
   * one of the eight fields `canonicalDraftSerialization` calls
   * formulation-material), so it must survive a reload exactly like the grams
   * do. Leaving it out of the partialize is what made the live session and the
   * refreshed session formulate from DIFFERENT inputs — the asymmetry class the
   * FINAL CLOSURE work only narrowed (it moved the writer from `removeItem` to
   * `markIngredientUnavailable`) instead of sealing. The draft-scoped lifecycle
   * is unchanged: load/preset/reset and an emptied draft still clear it, and an
   * explicit re-add still lifts it — so a persisted exclusion is always
   * recoverable through the UI.
   */
  excludedIngredientIds: string[];
  /** Canonical identities that were Main when explicitly marked unavailable. */
  unavailableMainIngredientIds: string[];
  /**
   * CROWN AUTO-SEED PROVENANCE — transient, never persisted, never business
   * data. Holds the lines whose current gram was seeded by Crown ON at 0 g and
   * has not been touched since. Removing the crown restores 0 g for exactly
   * those lines; any explicit grams write clears the line from this set, so a
   * deliberately typed amount is always preserved. Deliberately absent from
   * `recipePersistPartialize` and from every saved payload.
   */
  crownAutoSeededLineIds: string[];
  /** Last loaded demo preset (drives the selector highlight); null after a manual reset to none. */
  activePresetId: PresetId | null;
  /** Approved neutral scaffold attached only to an untouched explicit new draft. */
  newRecipeStarterTemplateId: string | null;
  /** Complete profile × serving × strategy × mass identity of an explicit starter. */
  newRecipeStarterKey: NewRecipeStarterKey | null;
  /** Material baseline used to distinguish server hydration/account-price dirtiness
   * from an actual user edit without relying on the generic `dirty` flag. */
  newRecipeStarterMaterialFingerprint: string | null;
  /**
   * Mass an INCOMPLETE canonical starter has reserved for the Main the customer
   * has not chosen yet (`NewRecipeStarterMetrics.missingMainMassGrams`). The
   * Sorbet scaffold lays down ~40 % of the batch and names the rest as the
   * fruit's; it is a real part of the batch, not a shortfall to be filled with
   * support ingredients. A batch resize therefore has to move it too — see
   * `resizeRecipeBatch`. Zero for every complete starter, which is why the
   * discriminator is the reservation and never the product type.
   */
  starterReservedMainGrams: number;
  /**
   * The CANONICAL saved-recipe aggregate link (= `saved_recipes.id` = pro-core `recipeId`).
   * Drives the ONE save flow: null → "Zapisz recepturę" (create); set → "Zapisz nową wersję".
   * Persisted so version continuity survives reload/login; the adapter always re-reads the
   * DB's authoritative `latest_version_number`, so a stale link can never fabricate a number.
   */
  savedRecipeId: string | null;
  /** Name of the linked aggregate (prefills the Save dialog + shows in the button state). */
  savedRecipeName: string | null;
  /** The linked aggregate's latest persisted version number (display only; DB is authoritative). */
  currentVersionNumber: number | null;
  /**
   * The NEWEST version number of the linked recipe. Together with `currentVersionNumber` this is
   * what makes „am I looking at history?" answerable: the library can open any immutable snapshot,
   * and an older one must never be mistaken for the current editable parent (owner v1.4 §7).
   */
  savedRecipeLatestVersionNumber: number | null;
  /** Exact immutable `recipe_versions.id` UUID for the currently loaded/saved vector. */
  currentVersionId: string | null;
  /** ISO date of the current version (drives the `DD.MM.YYYY · vN` label; persisted). */
  currentVersionDate: string | null;
  /**
   * Pro machine/serving selection context (S4). Drives the workbar context line + which visible
   * serving mode routes the recipe. It NEVER changes Engine math — the temperature it carries is
   * always an existing supported cell set on `target_temperature_c`. Reset to null on account
   * switch via resetToDemo (cross-account isolation).
   */
  machineKind: 'professional' | 'home' | null;
  /** The selected ServingModeId (fresh/temp_minus_11/12/13 for professional; the machine's mode for home). */
  servingModeId: string | null;
  /** The selected Home machine's catalog id (null for the professional machine). */
  machineId: string | null;
  /** Display label ("Maszyna profesjonalna" or the Home machine name). */
  machineLabel: string | null;
  /** Custom-machine Production routing; canonical catalog machines can re-resolve by id. */
  machineTechnology: MachineTechnology | null;
  /** Unsaved-changes flag: true after any edit, false after a load or a successful save. */
  dirty: boolean;
  /** Verified whole-gram provenance restored from a saved recipe/version. It
   * never grants Apply consent; every consumer matches its material fingerprint. */
  practicalRecipeAudit: PracticalRecipeSavedAudit | null;
  /** Exact immutable recipe-version identity last persisted for Production.
   * Kept separate from `dirty` and from the current technical calculation. */
  savedProductionFingerprint: string | null;
  /**
   * Owner P0 NIGHTLY (live FAILURE 1, Phase 3) — MONOTONIC DRAFT REVISION.
   * Incremented on EVERY material edit (gram, add/remove, lock change, §17
   * constraint change via `bumpDraftRevision`, exclusion, product type, tier/
   * mode, temperature, batch, machine, apply, undo, load). A staged preview
   * carries the revision it was built for; `commitPreview` rejects a revision
   * mismatch (the additional monotonic guard next to the fingerprint guard),
   * and the constraint-studio bridge invalidates staged state on every bump.
   * NOT persisted — a fresh session legitimately starts at 0.
   */
  draftRevision: number;
  /**
   * Owner P0 NIGHTLY (live FAILURE 1, Phase 3) — DRAFT CONTEXT SEQUENCE.
   * Incremented ONLY when a whole new draft context begins (`loadRecipeInput`,
   * `loadPreset`, `resetToDemo`). The constraint-studio bridge resets the §17
   * session (constraints + preview + staged state + history) when it changes:
   * a loaded recipe starts a FRESH §17 context — constraints from an earlier
   * session draft must never silently constrain the reloaded draft.
   * Persisted only as a context identity so the separately persisted five-detent
   * Profile intent cannot be rebound to a different draft after an ambient refresh.
   * It still changes only on an explicit whole-draft transition.
   */
  draftContextSeq: number;
  /** Increment `draftRevision` for a material edit that lives OUTSIDE this
   * store (a §17 constraint/range change in the constraint-studio session). */
  bumpDraftRevision: () => void;
  /** Desired Profile target changed. Marks the saved draft + recalculation state dirty without
   * changing ingredient grams or any Engine field. */
  markProfileTargetChanged: () => void;

  setMode: (mode: ProductMode) => void;
  setFormulationStrategy: (strategy: FormulationStrategy) => void;
  setCategory: (category: ProductCategory) => void;
  /** Pick the visible product type; the internal category derives from it + the ingredients. */
  setVisibleProductType: (visible: VisibleProductType) => void;
  /** Pick a serving mode (Świeże/−11/−12/−13) — ONE state drives mode + Engine temperature. */
  setServingMode: (servingModeId: string, temperatureC: number) => void;
  setTargetTemperature: (temperature_c: number) => void;
  setBatchGrams: (
    grams: number,
    /** Canonical §17 percentages for lines whose stronger Engine role keeps
     * lock_type as Main/Required/already-added. */
    percentByLineId?: Readonly<Record<string, number>>,
    source?: RecipeBatchSource,
  ) => BatchResizeWriteResult;
  setMachineCapacity: (grams: number | null) => void;
  setFlavorIntensity: (value: FlavorIntensity) => void;
  setCostPriority: (value: CostPriority) => void;
  moveDirectionTarget: (axis: keyof RecipeDirectionTargets, delta: -1 | 1) => void;
  setDirectionTarget: (axis: keyof RecipeDirectionTargets, target: RecipeDirectionTarget) => void;

  /**
   * Owner P0 (Apply data integrity) — the ONLY sanctioned write for a verified
   * complete next RecipeInput. Validates EVERY line (stable id present, grams
   * finite, not NaN, not negative), independently recomputes the total and
   * requires it to equal `input.target_batch_grams` within the batch tolerance
   * (planned recipes), writes items + batch in ONE atomic setState, then reads
   * back and VERIFIES the write — any mismatch rolls back to the exact prior
   * draft. Never coerces a missing amount to zero.
   */
  applyVerifiedRecipeInput: (
    input: RecipeInput,
    productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot>>,
    options?: {
      acknowledgeRecalculation?: boolean;
      /** Explicit Direction fallback accepted through Preview → Apply. */
      directionTargets?: RecipeDirectionTargets;
    },
  ) =>
    | { ok: true }
    | { ok: false; code: 'invalid_line'; lineName: string }
    | { ok: false; code: 'duplicate_ingredient'; canonicalIds: string[] }
    | { ok: false; code: 'batch_mismatch'; sum: number; target: number }
    | { ok: false; code: 'recipe_constraint_invalid'; messagePl: string }
    | { ok: false; code: 'write_verification_failed' };
  /**
   * Atomically adds a Base ingredient or returns the first existing row with
   * the same canonical identity. A duplicate is a strict no-op: it must not
   * dirty the draft, refresh product data or invalidate Preview/Undo state.
   */
  addIngredient: (ingredient: EngineIngredient, grams?: number) => AddIngredientResult;
  addTopping: (ingredient: RecipeToppingIngredient, grams?: number) => void;
  removeTopping: (lineId: string) => void;
  setToppingGrams: (lineId: string, grams: number) => void;
  setToppingActualGrams: (lineId: string, grams: number | null) => void;
  replaceToppingIngredient: (lineId: string, ingredient: RecipeToppingIngredient) => void;
  setIngredientPrivateCost: (
    lineId: string,
    pricePerKg: number | null,
    currency: string | null,
    source: 'reference' | 'private' | null,
  ) => void;
  moveBaseItem: (lineId: string, direction: -1 | 1) => void;
  moveTopping: (lineId: string, direction: -1 | 1) => void;
  resolveCompositionAmbiguity: (lineId: string) => void;
  setProductBehaviorSnapshot: (lineId: string, snapshot: ProductBehaviorSnapshot | null) => void;
  /** Replace the complete server-resolved authority set without turning the
   * unchanged recipe into a material edit. Every entry is still bound to an
   * existing line and its exact Base/Topping process scope. */
  syncProductBehaviorSnapshots: (
    snapshots: Readonly<Record<string, ProductBehaviorSnapshot>>,
  ) => void;
  /**
   * Owner FINAL CLOSURE C2/C3 — „Remove row": ONE atomic material-edit
   * transaction that removes the line from the CURRENT recipe. It leaves NO
   * orphan state (the §17 constraint entry for the removed line id is dropped
   * synchronously by the constraint-studio store bridge inside this same
   * setState) and NEVER creates a scientific exclusion — a removed ingredient
   * may be refilled by the toolbox. Bumps `draftRevision` EXACTLY once.
   */
  removeItem: (lineId: string) => void;
  /**
   * Owner FINAL CLOSURE C2 — the EXPLICIT „unavailable/exclude" action, the
   * ONLY exclusion source: removes every line of the tapped line's canonical
   * ingredient AND records the exclusion, so the toolbox never reintroduces
   * it. Cleared only by explicitly adding the ingredient back
   * (`addIngredient`) or by a draft-context change. ONE atomic transaction,
   * ONE revision bump.
   */
  markIngredientUnavailable: (lineId: string) => void;
  /** Keep the line as an explicit replacement tombstone while excluding its
   * canonical identity from every automatic proposal. */
  setIngredientUnavailable: (lineId: string, unavailable: boolean) => void;
  /** Owner P0 repair: fold plannable duplicate-ingredient lines into one (explicit action). */
  mergeDuplicateIngredientLines: () => void;
  setPlannedGrams: (lineId: string, grams: number) => void;
  /** One atomic direct-manipulation write for a coherent full recipe vector. */
  setPlannedGramsVector: (gramsByLineId: Readonly<Record<string, number>>) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  /** Persist/remove the product-layer percent sidecar while retaining a
   * stronger Main/Required/already-added Engine role when present. */
  setPercentLock: (lineId: string, percent: number | null) => void;
  /** Persist/remove the product-layer exact-grams sidecar while retaining a
   * stronger Main/Required/already-added Engine role when present. */
  setGramLock: (lineId: string, grams: number | null) => void;
  setRangeLock: (lineId: string, minGrams: number, maxGrams: number) => void;
  clearRangeLock: (lineId: string) => void;
  /** Adds one line to the Main ingredient set; existing Main lines stay Main. */
  setMainIngredient: (lineId: string) => void;
  /** Removes only the Main crown. Independent gram/percent/range constraints
   * remain exact and become the line's visible lock type. */
  setStandardIngredient: (lineId: string) => void;
  /** Persist an explicit positive Main-group ratio weight. `null` restores the
   * deterministic equal-share default and never derives a ratio from grams. */
  setMainRatioWeight: (lineId: string, weight: number | null) => void;
  /** Atomically replace goal + ingredients with a curated demo scenario. */
  loadPreset: (preset: DemoPreset) => void;
  /** Atomically load a saved recipe's RecipeInput (the stored source of truth) and LINK it to
   * its aggregate so the next save appends a new version (not a copy). Clears the dirty flag. */
  loadRecipeInput: (
    input: RecipeInput,
    link?: {
      savedId?: string | null;
      savedName?: string | null;
      versionNumber?: number | null;
      /** The recipe's newest version; absent means „the opened one is the newest". */
      latestVersionNumber?: number | null;
      versionId?: string | null;
      versionDate?: string | null;
      composition?: RecipeCompositionMetadata | null;
      /**
       * Who owns `target_batch_grams` for THIS load. Omitted (the default) an
       * account/product default may still impose its batch on a non-saved load.
       * `'payload'` means the caller carries an explicit, newer user batch
       * intent that outranks that default — today only the Studio assistant's
       * "apply this starter", where `batch_size` is a required answer. The
       * batch is still adopted only together with the Base that realizes it.
       */
      batchAuthority?: 'payload';
    },
  ) => void;
  /** Start an explicit clean Pro draft for the selected customer-visible type. */
  startNewRecipe: (visible?: VisibleProductType) => void;
  /** Rebuild only the current explicit starter. Keeps this draft identity/name,
   * while replacing all recipe-formulation state with the confirmed key. */
  rebuildNewRecipeStarter: (key: NewRecipeStarterKey) => void;
  /** Link the draft to its persisted aggregate after a create/version/restore. Clears dirty. */
  markSaved: (
    id: string,
    name: string,
    versionNumber: number,
    versionDate?: string | null,
    practicalRecipeAudit?: PracticalRecipeSavedAudit | null,
    versionId?: string | null,
    savedProductionFingerprint?: string | null,
  ) => void;
  /** Record a server-authorized, whole-gram audit for an unchanged recipe.
   * This does not mutate the formulation or its saved/dirty identity. */
  acknowledgePracticalRecipeAudit: (audit: PracticalRecipeSavedAudit) => void;
  /** Select a Pro machine/serving mode (S4): sets the routing temperature + context + optional batch. */
  setMachineSelection: (sel: {
    kind: 'professional' | 'home';
    servingModeId: string;
    machineId: string | null;
    label: string;
    temperatureC: number;
    machineTechnology?: MachineTechnology | null;
    batchGrams?: number | null;
    /** Home machines only: the machine's real usable capacity in grams. */
    capacityGrams?: number | null;
    /** Explicit batch authority when this selection also changes the batch. */
    batchSource?: RecipeBatchSource;
  }) => BatchResizeWriteResult;
  resetToDemo: () => void;
}

let lineSeq = 0;
const nextLineId = (): string => `line-${Date.now().toString(36)}-${(lineSeq++).toString(36)}`;

const makeLine = (
  ingredient: EngineIngredient,
  planned_grams: number,
  lock_type: LockType = 'unlocked',
): RecipeItem => ({
  id: nextLineId(),
  ingredient: normalizeIngredientIdentity(ingredient),
  planned_grams,
  actual_grams: null,
  lock_type,
});

const sortedBaseItems = (items: readonly RecipeItem[]): RecipeItem[] => items.slice();

const orderedBaseItems = (items: readonly RecipeItem[], order: readonly string[]): RecipeItem[] => {
  if (order.length === 0) return [...items];
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, rank: rank.get(item.id) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item);
};

/** First matching Base row in the same deterministic order the editor renders. */
export const firstCanonicalBaseItem = (
  items: readonly RecipeItem[],
  order: readonly string[],
  ingredient: EngineIngredient,
): RecipeItem | undefined => {
  const canonicalId = canonicalIngredientId(ingredient);
  return orderedBaseItems(items, order).find(
    (item) => canonicalIngredientId(item.ingredient) === canonicalId,
  );
};

const sortedToppings = (items: readonly RecipeToppingItem[]): RecipeToppingItem[] =>
  items
    .slice()
    .sort((a, b) => a.addon_sort_order - b.addon_sort_order)
    .map((item, index) => ({ ...item, addon_sort_order: index }));

const moveWithin = <T extends { id: string }>(
  items: readonly T[],
  lineId: string,
  direction: -1 | 1,
): T[] => {
  const index = items.findIndex((item) => item.id === lineId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};

const ENGINE_KEPT_LOCKS: ReadonlySet<LockType> = new Set(['main', 'already_added', 'required']);

/**
 * Has the required Main role been RESOLVED?
 *
 * `starterReservedMainGrams` says one thing only — "the required Main role is
 * not resolved yet" — so this is the single transition that retires it. The
 * answer comes from the canonical ProductBehavior Main authority, deliberately
 * NOT from the product type, the ingredient's name, the Crown flag alone, or
 * merely having positive grams: a Cocoa line must never retire a Sorbet's Main
 * reservation.
 *
 * `snapshotRequired` is true, so a line with no resolver authority fails CLOSED
 * and the reservation stands. A crowned line counts as resolved because
 * `setMainIngredient` can only crown what this same authority already approved.
 */
const requiredMainRoleResolved = (state: {
  items: readonly RecipeItem[];
  productBehaviorSnapshots: Readonly<Record<string, ProductBehaviorSnapshot>>;
}): boolean =>
  state.items.some(
    (item) =>
      item.planned_grams > 0 &&
      (item.lock_type === 'main' ||
        mainBehaviorBlockReason(state.productBehaviorSnapshots[item.id], true) === null),
  );

/**
 * The reservation after any change that can resolve the Main role. It is
 * RETIRED, never decremented: the reservation is not "remaining desired Main
 * grams", so a 300 g Main against a 402 g reservation does not leave 102 g
 * owing. The draft is simply allowed to sit under its target until Recalculate.
 */
const reservationAfterMainCheck = (state: {
  items: readonly RecipeItem[];
  productBehaviorSnapshots: Readonly<Record<string, ProductBehaviorSnapshot>>;
  starterReservedMainGrams: number;
}): number =>
  state.starterReservedMainGrams > 0 && requiredMainRoleResolved(state)
    ? 0
    : state.starterReservedMainGrams;

/**
 * The reservation an incomplete canonical starter still owes its unchosen Main,
 * but only while it is still TRUE of this draft: the lines plus the reservation
 * must still account for exactly the current batch. A draft the customer has
 * since completed reports 0, so a stale figure can never revive — and a
 * shortfall that is merely a whole-gram stabilizer pin is never mistaken for a
 * Main reservation.
 */
const activeStarterReservation = (state: {
  items: readonly RecipeItem[];
  target_batch_grams: number;
  starterReservedMainGrams: number;
}): number => {
  const reserved = state.starterReservedMainGrams;
  if (!(reserved > 0)) return 0;
  const lineSum = state.items.reduce((total, item) => total + item.planned_grams, 0);
  return Math.abs(lineSum + reserved - state.target_batch_grams) <= BATCH_RESIZE_TOLERANCE_GRAMS
    ? reserved
    : 0;
};

/** What is left of the reservation once the lines have taken their share of the
 *  new batch. Only an ACTIVE reservation carries forward. */
const nextStarterReservation = (
  activeReservedGrams: number,
  lineSumAfter: number,
  nextBatchGrams: number,
): number =>
  activeReservedGrams > 0 ? Math.max(0, nextBatchGrams - lineSumAfter) : 0;

/** A row the batch resize must not move: physically weighed, or pinned in grams. */
const isBatchFixedLine = (item: RecipeItem): boolean =>
  item.actual_grams !== null ||
  item.grams_constraint !== undefined ||
  item.lock_type === 'grams';

/**
 * The ONE recipe-batch resize authority used by both machine selection and
 * manual Partia editing. It changes Base planned grams only:
 *  - exact-gram and physically actualized rows stay fixed;
 *  - percentage constraints keep their exact final-batch share;
 *  - every other row (including Main/Required roles) receives one common
 *    proportional factor, preserving identity and all ratios;
 *  - toppings are outside this input and therefore cannot be resized here.
 *
 * A target that cannot coexist with locks is rejected before any store write.
 *
 * `pinnedLineIds` holds lines whose grams a canonical authority has already
 * decided for the NEW batch — they are committed exactly as given, like any
 * other fixed row, and the remaining mass reconciles around them.
 *
 * `reservedMainGrams` is mass an INCOMPLETE canonical starter has already
 * promised to a Main the customer has not chosen yet. It is part of the batch,
 * not a shortfall: the Sorbet scaffold lays down ~40 % of the batch and names
 * the rest as the fruit's. Filling the batch with support ingredients spends
 * that reservation and inflates every line by ~2.5x — which is how a starter's
 * 5.4 % Inulin became 13.8 % and broke the 2–8 % owner policy before the
 * customer had touched anything. When a reservation is present the LINES are
 * resized to their own share of the new batch and the reservation keeps the
 * rest, so `sum(lines) + reservation === target batch` still holds. With no
 * reservation — every complete recipe — the semantics are untouched.
 */
export const resizeRecipeBatch = (
  items: readonly RecipeItem[],
  previousBatchGrams: number,
  nextBatchGrams: number,
  percentByLineId?: Readonly<Record<string, number>>,
  pinnedLineIds?: ReadonlySet<string>,
  reservedMainGrams = 0,
): BatchResizeResult => {
  const currentSum = items.reduce((sum, item) => sum + item.planned_grams, 0);
  if (!Number.isFinite(nextBatchGrams) || nextBatchGrams <= 0) {
    return {
      ok: false,
      conflict: { reason: 'invalid_target', targetGrams: nextBatchGrams, actualGrams: currentSum },
    };
  }
  const previousBatchKnown = Number.isFinite(previousBatchGrams) && previousBatchGrams > 0;
  // A reservation is honoured only while it is still TRUE of this draft — the
  // lines plus the reservation must still account for exactly the current
  // batch. The moment the customer adds the Main the equation breaks and
  // ordinary fill-the-batch semantics resume by themselves, with nothing to
  // clear. Percentage instructions are shares of the REAL batch, so a draft
  // carrying any is left on the ordinary path rather than mixing two targets.
  const reservationHolds =
    reservedMainGrams > 0 &&
    previousBatchKnown &&
    currentSum > 0 &&
    Math.abs(currentSum + reservedMainGrams - previousBatchGrams) <= BATCH_RESIZE_TOLERANCE_GRAMS &&
    percentByLineId === undefined &&
    !items.some((item) => item.percent_constraint !== undefined || item.lock_type === 'percent');
  const lineTargetGrams = reservationHolds
    ? (nextBatchGrams * currentSum) / (currentSum + reservedMainGrams)
    : nextBatchGrams;
  const percentById = new Map<string, number>();
  const fixedIds = new Set<string>();
  const flexibleIds = new Set<string>();
  let committed = 0;
  let flexibleCurrent = 0;

  for (const item of items) {
    if (isBatchFixedLine(item) || pinnedLineIds?.has(item.id) === true) {
      fixedIds.add(item.id);
      committed += item.planned_grams;
      continue;
    }
    const canonicalPercent = percentByLineId?.[item.id] ?? item.percent_constraint?.percent;
    const legacyPercent =
      canonicalPercent === undefined && item.lock_type === 'percent' && previousBatchKnown
        ? (item.planned_grams / previousBatchGrams) * 100
        : canonicalPercent;
    if (legacyPercent !== undefined) {
      if (!Number.isFinite(legacyPercent) || legacyPercent < 0 || legacyPercent > 100) {
        return {
          ok: false,
          conflict: {
            reason: 'batch_mismatch',
            targetGrams: nextBatchGrams,
            actualGrams: currentSum,
            lineId: item.id,
          },
        };
      }
      percentById.set(item.id, legacyPercent);
      committed += (nextBatchGrams * legacyPercent) / 100;
      continue;
    }
    flexibleIds.add(item.id);
    flexibleCurrent += item.planned_grams;
  }

  const remaining = lineTargetGrams - committed;
  if (remaining < -BATCH_RESIZE_TOLERANCE_GRAMS) {
    return {
      ok: false,
      conflict: {
        reason: 'fixed_locks_exceed_target',
        targetGrams: nextBatchGrams,
        actualGrams: committed,
      },
    };
  }
  if (flexibleIds.size === 0 && Math.abs(remaining) > BATCH_RESIZE_TOLERANCE_GRAMS) {
    return {
      ok: false,
      conflict: {
        reason: 'no_scalable_mass',
        targetGrams: nextBatchGrams,
        actualGrams: committed,
      },
    };
  }
  if (flexibleIds.size > 0 && flexibleCurrent <= 0 && remaining > BATCH_RESIZE_TOLERANCE_GRAMS) {
    return {
      ok: false,
      conflict: {
        reason: 'no_scalable_mass',
        targetGrams: nextBatchGrams,
        actualGrams: committed,
      },
    };
  }

  const flexibleFactor = flexibleCurrent > 0 ? Math.max(0, remaining) / flexibleCurrent : 0;
  const resized = items.map((item) => {
    if (fixedIds.has(item.id)) return item;
    const percent = percentById.get(item.id);
    const planned_grams =
      percent === undefined
        ? item.planned_grams * flexibleFactor
        : (nextBatchGrams * percent) / 100;
    if (item.range_constraint) {
      const { min_grams, max_grams } = item.range_constraint;
      if (
        planned_grams < min_grams - BATCH_RESIZE_TOLERANCE_GRAMS ||
        planned_grams > max_grams + BATCH_RESIZE_TOLERANCE_GRAMS
      ) {
        return null;
      }
    }
    return { ...item, planned_grams };
  });
  const rangeConflictIndex = resized.findIndex((item) => item === null);
  if (rangeConflictIndex >= 0) {
    return {
      ok: false,
      conflict: {
        reason: 'range_lock_conflict',
        targetGrams: nextBatchGrams,
        actualGrams: currentSum,
        lineId: items[rangeConflictIndex]?.id,
      },
    };
  }
  const nextItems = resized as RecipeItem[];
  const nextSum = nextItems.reduce((sum, item) => sum + item.planned_grams, 0);
  if (Math.abs(nextSum - lineTargetGrams) > BATCH_RESIZE_TOLERANCE_GRAMS) {
    return {
      ok: false,
      conflict: {
        reason: 'batch_mismatch',
        targetGrams: nextBatchGrams,
        actualGrams: nextSum,
      },
    };
  }
  return { ok: true, items: nextItems };
};

/**
 * PC-02 — project the owner-approved Sorbet stabilizer system onto the band the
 * NEW batch derives, then let this same resize authority reconcile everything
 * else around it. The percentage limit lives in the stabilizer authority and is
 * never restated here.
 *
 * The projection is skipped — leaving today's behaviour untouched — when any
 * component of the system is not the resize's to move: physically weighed,
 * gram-pinned, or carrying a percentage instruction. Those are explicit
 * customer or caller decisions, and the Apply-door authority stays the final
 * check on them.
 *
 * A projection that cannot be reconciled falls back to the plain proportional
 * result, so no batch change that succeeds today can begin to refuse.
 */
const rescaleWithOwnerStabilizerSystem = (
  state: RecipeInputState,
  resized: RecipeItem[],
  nextBatchGrams: number,
  percentByLineId?: Readonly<Record<string, number>>,
  reservedMainGrams = 0,
): RecipeItem[] => {
  // The reservation is honoured here only if it is still TRUE of the incoming
  // draft — exactly the test the outer resize applies. Re-deriving it from the
  // pinned vector without this guard would resurrect a stale starter
  // reservation on a draft the customer has since completed.
  const draftSum = state.items.reduce((total, item) => total + item.planned_grams, 0);
  const honoursReservation =
    reservedMainGrams > 0 &&
    Math.abs(draftSum + reservedMainGrams - state.target_batch_grams) <=
      BATCH_RESIZE_TOLERANCE_GRAMS;
  const components = sorbetStabilizerSystemItems(resized);
  if (components.length === 0) return resized;
  const adjustable = components.every(
    (item) =>
      !isBatchFixedLine(item) &&
      item.percent_constraint === undefined &&
      item.range_constraint === undefined &&
      item.lock_type !== 'percent' &&
      percentByLineId?.[item.id] === undefined,
  );
  if (!adjustable) return resized;

  const plan = planSorbetStabilizerSystemRescale(
    buildRecipeInput(state),
    buildRecipeInput({ ...state, items: resized, target_batch_grams: nextBatchGrams }),
  );
  if (plan === null) return resized;

  const pinnedItems = state.items.map((item) =>
    plan.has(item.id) ? { ...item, planned_grams: plan.get(item.id)! } : item,
  );
  const reconciled = resizeRecipeBatch(
    pinnedItems,
    state.target_batch_grams,
    nextBatchGrams,
    percentByLineId,
    new Set(plan.keys()),
    // The stabilizer projection reconciles the SAME draft, so it inherits the
    // same Main reservation; dropping it would re-inflate the support vector
    // the outer resize just protected. Pinning the stabilizer to whole grams
    // moves a gram or two, so the reservation is re-read off the pinned vector
    // the way it is defined everywhere else — whatever the lines do not hold.
    honoursReservation
      ? Math.max(
          0,
          state.target_batch_grams -
            pinnedItems.reduce((total, item) => total + item.planned_grams, 0),
        )
      : 0,
  );
  return reconciled.ok ? reconciled.items : resized;
};

/** Snapshot of a preset as fresh store state (items cloned so edits never touch preset data). */
const fromPreset = (preset: DemoPreset) => ({
  mode: 'classic' as const,
  formulation_strategy: normalizeFormulationStrategy(preset.mode),
  category: preset.category,
  visibleProductType: visibleTypeOf(preset.category),
  target_temperature_c: preset.target_temperature_c,
  target_batch_grams: preset.target_batch_grams,
  batch_source: 'PROFESSIONAL_USER_BATCH' as const,
  batchResizeConflict: null as BatchResizeConflict | null,
  machine_capacity_grams: preset.machine_capacity_grams,
  machine_capacity_source: (preset.machine_capacity_grams === null ? null : 'manual') as
    | 'machine'
    | 'manual'
    | null,
  flavor_intensity: preset.flavor_intensity,
  cost_priority: preset.cost_priority,
  direction_targets: { ...DEFAULT_DIRECTION_TARGETS },
  direction_targets_active: false,
  items: preset.items.map((item) => ({
    ...item,
    ingredient: normalizeIngredientIdentity(item.ingredient, 'demo'),
  })),
  baseOrder: preset.items.map((item) => item.id),
  toppings: [] as RecipeToppingItem[],
  productBehaviorSnapshots: {} as Record<string, ProductBehaviorSnapshot>,
  ownerReviewGate: null as OwnerReviewRecipeGate | null,
  compositionMigrationAmbiguities: [] as Array<{ lineId: string; reason: string }>,
  // Owner P0 NIGHTLY (exclusion lifecycle): exclusions are DRAFT-SCOPED — a
  // fresh preset load / reset starts a fresh exclusion context. An ingredient
  // never selected in the new draft is NOT excluded.
  excludedIngredientIds: [] as string[],
  unavailableMainIngredientIds: [] as string[],
  crownAutoSeededLineIds: [] as string[],
  activePresetId: preset.id,
  newRecipeStarterTemplateId: null,
  newRecipeStarterKey: null,
  newRecipeStarterMaterialFingerprint: null,
  starterReservedMainGrams: 0,
  savedRecipeId: null,
  savedRecipeName: null,
  currentVersionNumber: null,
  savedRecipeLatestVersionNumber: null,
  currentVersionId: null,
  currentVersionDate: null,
  machineKind: null,
  servingModeId: null,
  machineId: null,
  machineLabel: null,
  machineTechnology: null,
  dirty: false,
  practicalRecipeAudit: null,
  savedProductionFingerprint: null,
});

const profileOwnerKey = (): string => useAuthStore.getState().user?.id ?? 'local-device';
const productDefaultsKey = (visible: VisibleProductType): string =>
  `${profileOwnerKey()}:${visible}`;

const manualBatchSourceForState = (state: RecipeState): RecipeBatchSource => {
  if (state.machineKind !== 'home') return 'PROFESSIONAL_USER_BATCH';
  return state.machineId?.startsWith('custom-') ? 'CUSTOM_MACHINE_BATCH' : 'USER_OVERRIDE';
};

const canonicalMachineDefault = (
  machineId: string | null,
  productProfile: VisibleProductType,
): number | null => {
  const profile = MACHINE_CATALOG.find((candidate) => candidate.id === machineId);
  return profile ? deriveMachineSetup(profile, productProfile).recommendedBatchGrams : null;
};

const profileBatchSource = (profile: ProfileSettingsSnapshot): RecipeBatchSource =>
  profile.batchSource ??
  (profile.machineKind === 'home'
    ? profile.machineId?.startsWith('custom-')
      ? 'CUSTOM_MACHINE_BATCH'
      : 'MACHINE_DEFAULT'
    : 'PROFESSIONAL_USER_BATCH');

/**
 * The label for a batch the USER set for themselves rather than one a machine
 * derived. Keeping it off `MACHINE_DEFAULT` is what stops `setVisibleProductType`
 * from silently re-deriving it from the machine on the next product switch.
 */
const userBatchSourceForProfile = (profile: ProfileSettingsSnapshot): RecipeBatchSource =>
  profile.machineKind !== 'home'
    ? 'PROFESSIONAL_USER_BATCH'
    : profile.machineId?.startsWith('custom-')
      ? 'CUSTOM_MACHINE_BATCH'
      : 'USER_OVERRIDE';

/** The batch a profile imposes, together with the Base that realizes it. */
interface ResolvedProfileBatch {
  items: RecipeItem[];
  targetBatchGrams: number;
  batchSource: RecipeBatchSource;
}

/**
 * Adopting an ACCOUNT/PRODUCT default batch is a lifecycle change of the
 * authoritative batch, so it goes through the one atomic resize authority
 * together with the Base it describes. Writing `target_batch_grams` alone left
 * the previous recipe's grams in place and still reported the draft as
 * coherent — the owner P0 `400 / 1000` (and `982 / 950`) state with
 * `batchResizeConflict: null`.
 *
 * When the default cannot coexist with the draft's locks it is NOT adopted:
 * the recipe keeps its own coherent batch, described as the manual batch it
 * actually is. An incoherent Partia is never written.
 */
const resolveProfileBatch = (
  profile: ProfileSettingsSnapshot,
  items: RecipeItem[],
  previousBatchGrams: number,
): ResolvedProfileBatch => {
  const batchSource = profileBatchSource(profile);
  if (profile.targetBatchGrams === previousBatchGrams) {
    return { items, targetBatchGrams: previousBatchGrams, batchSource };
  }
  const resized = resizeRecipeBatch(items, previousBatchGrams, profile.targetBatchGrams);
  if (resized.ok) {
    return { items: resized.items, targetBatchGrams: profile.targetBatchGrams, batchSource };
  }
  return {
    items,
    targetBatchGrams: previousBatchGrams,
    batchSource: userBatchSourceForProfile(profile),
  };
};

/**
 * A load whose PAYLOAD carries the authoritative batch (owner decision,
 * 2026-08-29): the Studio assistant's starter flow asks `batch_size` as a
 * REQUIRED question, so the applied payload holds the newest and most specific
 * user intent — newer than any stored account/product default. That intent wins
 * for this operation.
 *
 * It wins WITH its Base, never alone. The requested batch is only authoritative
 * if the vector realizes it, so a payload whose Base sum differs goes through
 * the same shared atomic `resizeRecipeBatch` authority as every other batch
 * lifecycle change. `target_batch_grams` is never written next to a
 * differently-sized ingredient vector — the RESTORATION #2 contract.
 *
 * The batch is labelled as a USER batch, not a machine default, so a later
 * product-type switch cannot silently re-derive the size the user chose.
 *
 * Machine capacity is deliberately NOT applied here: a batch larger than the
 * account's Home machine stays exactly as requested and is validated — and
 * shown truthfully — by the machine/flow validation layer. Silently converting
 * the user's selected batch to a machine-sized one is the behaviour this path
 * exists to remove.
 */
const resolvePayloadBatch = (
  items: RecipeItem[],
  requestedBatchGrams: number,
  profile: ProfileSettingsSnapshot | null,
): ResolvedProfileBatch => {
  const batchSource: RecipeBatchSource = profile
    ? userBatchSourceForProfile(profile)
    : 'PROFESSIONAL_USER_BATCH';
  const baseSum = items.reduce((sum, item) => sum + item.planned_grams, 0);
  if (Math.abs(baseSum - requestedBatchGrams) <= BATCH_RESIZE_TOLERANCE_GRAMS) {
    return { items, targetBatchGrams: requestedBatchGrams, batchSource };
  }
  const resized = resizeRecipeBatch(items, baseSum, requestedBatchGrams);
  if (resized.ok) {
    return { items: resized.items, targetBatchGrams: requestedBatchGrams, batchSource };
  }
  // Defensive: a starter template carries no gram locks or actualized rows, so
  // this is unreachable from the live apply. If a payload ever does make the
  // request unrealizable, coherence still outranks it — the draft keeps the
  // batch its own Base actually realizes rather than a number it does not.
  return { items, targetBatchGrams: baseSum, batchSource };
};

const profileFields = (
  profile: ProfileSettingsSnapshot,
  items: RecipeItem[],
  currentCategory: ProductCategory,
  batch: ResolvedProfileBatch,
) => ({
  mode: 'classic' as const,
  formulation_strategy: normalizeFormulationStrategy(profile.formulationStrategy),
  visibleProductType: profile.visibleProductType,
  category: internalCategoryFor(profile.visibleProductType, items, currentCategory),
  target_temperature_c: profile.targetTemperatureC,
  target_batch_grams: batch.targetBatchGrams,
  batch_source: batch.batchSource,
  batchResizeConflict: null,
  machine_capacity_grams: profile.machineKind === 'home' ? profile.machineCapacityGrams : null,
  machine_capacity_source: (profile.machineKind === 'home' && profile.machineCapacityGrams !== null
    ? 'machine'
    : null) as 'machine' | null,
  machineKind: profile.machineKind,
  servingModeId: profile.servingModeId,
  machineId: profile.machineId,
  machineLabel: profile.machineLabel,
  machineTechnology: profile.machineTechnology ?? null,
  direction_targets: { ...profile.directionTargets },
  // Owner P1-A: the neutral (0) selection is the CLEAN-MIDDLE INTENT, not the
  // absence of one. Gating activation on "some axis != 0" made Sweetness 0 opt
  // out of its own target, so the optimizer judged it against the global band
  // alone and parked POD at the band edge — which is what made "+1 sweeter"
  // deliver LESS sweetness than "balanced". A serialized Pro direction contract
  // is always active; legacy/direct Engine inputs carry no `goals` and stay
  // byte-compatible.
  direction_targets_active: true,
});

const requireProductBehaviorRevalidation = (
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot>>,
): Record<string, ProductBehaviorSnapshot> =>
  Object.fromEntries(
    Object.entries(snapshots).map(([lineId, snapshot]) => [
      lineId,
      {
        ...snapshot,
        resolutionState: 'REVALIDATION_REQUIRED' as const,
        blockReasons: [...new Set([...snapshot.blockReasons, 'recipe_context_changed'])],
      },
    ]),
  );

/** A Standard ↔ Crown transition changes the formulation authority requested
 * for this exact product line. Keep the frozen facts, but force the next PI
 * entry to resolve them in the new role context instead of accepting a
 * pre-transition Standard/Main snapshot as current. */
const requireProductBehaviorLineRevalidation = (
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot>>,
  lineId: string,
): Record<string, ProductBehaviorSnapshot> => {
  const snapshot = snapshots[lineId];
  if (!snapshot) return { ...snapshots };
  return {
    ...snapshots,
    [lineId]: {
      ...snapshot,
      resolutionState: 'REVALIDATION_REQUIRED',
      blockReasons: [...new Set([...snapshot.blockReasons, 'recipe_context_changed'])],
    },
  };
};

/**
 * Persisted slice — recipe content + the preset highlight + the CANONICAL aggregate link
 * (`savedRecipeId`/`savedRecipeName`/`currentVersionNumber`/`dirty`). Persisting the link is
 * what makes version numbering survive reload/login (the S2-repair requirement): the next save
 * appends v(n+1) to the SAME aggregate instead of starting a new one at v1. A stale link is safe
 * because the adapter re-reads the DB's authoritative `latest_version_number` and fails honestly
 * (offering "save as new") if the aggregate is gone.
 *
 * OWNER FINAL INTEGRATION ADDENDUM (Agent C) — the slice now carries EVERY
 * formulation-material field of the canonical draft that lives in this store:
 * items, batch, category/type, temperature, tier, machine capacity + provenance
 * AND `excludedIngredientIds`. The §17 half (constraint `byLineId`) is persisted
 * by its own store's partialize. Together they make the live payload and the
 * post-refresh payload byte-identical — the reload can no longer silently drop
 * an input the live click was using.
 */
export function recipePersistPartialize(state: RecipeState) {
  return {
    mode: state.mode,
    formulation_strategy: state.formulation_strategy,
    category: state.category,
    visibleProductType: state.visibleProductType,
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    batch_source: state.batch_source,
    machine_capacity_grams: state.machine_capacity_grams,
    machine_capacity_source: state.machine_capacity_source,
    flavor_intensity: state.flavor_intensity,
    cost_priority: state.cost_priority,
    direction_targets: state.direction_targets,
    direction_targets_active: state.direction_targets_active,
    items: state.items,
    baseOrder: state.baseOrder,
    toppings: state.toppings,
    productBehaviorSnapshots: state.productBehaviorSnapshots,
    ownerReviewGate: state.ownerReviewGate,
    compositionMigrationAmbiguities: state.compositionMigrationAmbiguities,
    // Agent C (owner addendum): draft-material — see the field doc above.
    excludedIngredientIds: state.excludedIngredientIds,
    unavailableMainIngredientIds: state.unavailableMainIngredientIds,
    activePresetId: state.activePresetId,
    newRecipeStarterTemplateId: state.newRecipeStarterTemplateId,
    newRecipeStarterKey: state.newRecipeStarterKey,
    newRecipeStarterMaterialFingerprint: state.newRecipeStarterMaterialFingerprint,
    // Draft material, not provenance: it is the part of the batch the unchosen
    // Main already owns. Dropping it on reload leaves an incomplete starter
    // looking merely off-batch, and the next batch change spends the
    // reservation on the support vector again — INULIN 4.9 % -> 12.4 % at the
    // first amount edit after a refresh. Persisted for the same reason as the
    // rest of this slice: the live payload and the post-refresh payload have to
    // describe the same draft.
    starterReservedMainGrams: state.starterReservedMainGrams,
    savedRecipeId: state.savedRecipeId,
    savedRecipeName: state.savedRecipeName,
    currentVersionNumber: state.currentVersionNumber,
    currentVersionId: state.currentVersionId,
    currentVersionDate: state.currentVersionDate,
    machineKind: state.machineKind,
    servingModeId: state.servingModeId,
    machineId: state.machineId,
    machineLabel: state.machineLabel,
    machineTechnology: state.machineTechnology,
    dirty: state.dirty,
    practicalRecipeAudit: state.practicalRecipeAudit,
    savedProductionFingerprint: state.savedProductionFingerprint,
    draftContextSeq: state.draftContextSeq,
  };
}

const persistedStarterProfile = (value: unknown): VisibleProductType | null => {
  if (!value || typeof value !== 'object') return null;
  const visible = (value as Partial<NewRecipeStarterKey>).visibleProductType;
  return visible === 'gelato' ||
    visible === 'sorbet' ||
    visible === 'vegan' ||
    visible === 'protein'
    ? visible
    : null;
};

/**
 * Rehydration guard for drafts written by older profile-only routing.
 *
 * An explicit starter key is stronger base provenance than a later bare
 * profile enum. If an old build persisted “Sorbet” over an untouched/edited
 * Gelato starter without replacing its ingredients, restore the starter's
 * actual family. For non-starter recipes, the persisted Engine category is the
 * source of truth and the visible projection may not contradict it.
 */
export function mergePersistedRecipeState(
  persistedState: unknown,
  currentState: RecipeState,
): RecipeState {
  const persisted =
    persistedState && typeof persistedState === 'object'
      ? (persistedState as Partial<RecipeState>)
      : {};
  const merged = {
    ...currentState,
    ...persisted,
    items: hydrateLegacyMainRatioWeights(persisted.items ?? currentState.items),
  };
  const starterProfile =
    typeof merged.newRecipeStarterTemplateId === 'string'
      ? persistedStarterProfile(merged.newRecipeStarterKey)
      : null;
  if (starterProfile !== null) {
    return {
      ...merged,
      visibleProductType: starterProfile,
      category: internalCategoryFor(starterProfile, merged.items, merged.category),
    };
  }
  const categoryProfile = visibleTypeOf(merged.category);
  const visibleDerivesPersistedCategory =
    internalCategoryFor(merged.visibleProductType, merged.items, merged.category) ===
    merged.category;
  return visibleDerivesPersistedCategory
    ? merged
    : { ...merged, visibleProductType: categoryProfile };
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set, get) => ({
      ...fromPreset(DEFAULT_PRESET),
      excludedIngredientIds: [],
      unavailableMainIngredientIds: [],
      crownAutoSeededLineIds: [],
      productBehaviorSnapshots: {},
      draftRevision: 0,
      draftContextSeq: 0,

      bumpDraftRevision: () => set((state) => ({ draftRevision: state.draftRevision + 1 })),
      markProfileTargetChanged: () =>
        set((state) => ({ dirty: true, draftRevision: state.draftRevision + 1 })),

      setMode: (mode) =>
        set((state) => ({
          mode,
          productBehaviorSnapshots: requireProductBehaviorRevalidation(
            state.productBehaviorSnapshots,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      setFormulationStrategy: (formulation_strategy) =>
        set((state) => ({
          formulation_strategy,
          productBehaviorSnapshots: requireProductBehaviorRevalidation(
            state.productBehaviorSnapshots,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      // Direct internal-category writes (QA/diagnostic/tests) keep the visible projection coherent.
      setCategory: (category) =>
        set((state) => ({
          category,
          visibleProductType: visibleTypeOf(category),
          productBehaviorSnapshots: requireProductBehaviorRevalidation(
            state.productBehaviorSnapshots,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      setVisibleProductType: (visible) =>
        set((state) => {
          if (visible === state.visibleProductType) return {};
          const decision = classifyProfileTransition(
            buildRecipeInput(state),
            visible,
            state.visibleProductType,
          );
          // A bare enum/category write has no authority to replace a formulation
          // family. Cross-family changes must go through the confirmed native
          // starter route.
          if (!decision.supported || decision.kind === 'new_base_required') return {};
          const nextBase = {
            visibleProductType: visible,
            category: decision.nextCategory,
            productBehaviorSnapshots: requireProductBehaviorRevalidation(
              state.productBehaviorSnapshots,
            ),
            // The vector is intentionally preserved for a proved same-family
            // transition, but it is no longer the untouched canonical starter
            // named by the previous profile's template.
            newRecipeStarterTemplateId: null,
            newRecipeStarterKey: null,
            newRecipeStarterMaterialFingerprint: null,
            starterReservedMainGrams: 0,
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
          if (state.batch_source !== 'MACHINE_DEFAULT' || state.machineKind !== 'home') {
            return nextBase;
          }
          const machineDefault = canonicalMachineDefault(state.machineId, visible);
          if (machineDefault === null) return nextBase;
          const resized = resizeRecipeBatch(state.items, state.target_batch_grams, machineDefault);
          if (!resized.ok) return { batchResizeConflict: resized.conflict };
          return {
            ...nextBase,
            target_batch_grams: machineDefault,
            // PC-02 — the product type the batch is re-derived FOR is the new
            // one, so the projection is asked about `decision.nextCategory`.
            items: rescaleWithOwnerStabilizerSystem(
              { ...state, category: decision.nextCategory },
              resized.items,
              machineDefault,
            ),
            machine_capacity_grams: machineDefault,
            machine_capacity_source: 'machine' as const,
            batch_source: 'MACHINE_DEFAULT' as const,
            batchResizeConflict: null,
          };
        }),
      setServingMode: (servingModeId, temperatureC) =>
        set((state) => ({
          servingModeId,
          target_temperature_c: temperatureC,
          // A manual serving-mode choice keeps a professional machine route but clears a Home
          // route (a Home machine's mode is fixed by the machine — owner P0 route integrity).
          ...(state.machineKind === 'home'
            ? { machineKind: null, machineId: null, machineLabel: null, machineTechnology: null }
            : {}),
          productBehaviorSnapshots: requireProductBehaviorRevalidation(
            state.productBehaviorSnapshots,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      // A MANUAL temperature change overrides any machine/serving route (owner P0 temperature
      // contract): clearing the machine context keeps the visible selection, the Engine input
      // and every label in agreement — a route mismatch becomes unrepresentable.
      setTargetTemperature: (target_temperature_c) =>
        set((state) => ({
          target_temperature_c,
          machineKind: null,
          servingModeId: null,
          machineId: null,
          machineLabel: null,
          machineTechnology: null,
          // A MACHINE-derived capacity cannot outlive the machine context it
          // came from; an explicit manual entry survives (owner Phase 8).
          machine_capacity_grams:
            state.machine_capacity_source === 'machine' ? null : state.machine_capacity_grams,
          machine_capacity_source:
            state.machine_capacity_source === 'machine' ? null : state.machine_capacity_source,
          productBehaviorSnapshots: requireProductBehaviorRevalidation(
            state.productBehaviorSnapshots,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      setBatchGrams: (target_batch_grams, percentByLineId, source) => {
        const state = get();
        const reservedMainGrams = activeStarterReservation(state);
        const resized = resizeRecipeBatch(
          state.items,
          state.target_batch_grams,
          target_batch_grams,
          percentByLineId,
          undefined,
          reservedMainGrams,
        );
        if (!resized.ok) {
          set({ batchResizeConflict: resized.conflict });
          return { ok: false, conflict: resized.conflict };
        }
        // PC-02 — the owner-approved Sorbet stabilizer system is capped at a
        // PERCENTAGE of the batch that rounds inward to whole grams, so one
        // proportional factor cannot carry it: a legal 5 g system at 1000 g
        // arrived at 670 g (Ninja CREAMi Deluxe) as 1.34 g + 2.01 g — fractional,
        // and above the 3 g ceiling that batch derives. The canonical authority
        // projects the system onto the new band; no limit is restated here, and
        // the ordinary lines absorb the difference through this same resize.
        const projected = rescaleWithOwnerStabilizerSystem(
          state,
          resized.items,
          target_batch_grams,
          percentByLineId,
          reservedMainGrams,
        );
        const batchSource = source ?? manualBatchSourceForState(state);
        const customBatch = batchSource === 'CUSTOM_MACHINE_BATCH';
        set({
          target_batch_grams,
          items: projected,
          starterReservedMainGrams: nextStarterReservation(
            reservedMainGrams,
            projected.reduce((total, item) => total + item.planned_grams, 0),
            target_batch_grams,
          ),
          batch_source: batchSource,
          batchResizeConflict: null,
          ...(customBatch
            ? {
                machine_capacity_grams: target_batch_grams,
                machine_capacity_source: 'machine' as const,
              }
            : {}),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        });
        useRecipeProfileStore.getState().markRecalculationRequired();
        return { ok: true };
      },
      // An explicit user entry is legitimate provenance; clearing it removes
      // the limit entirely (owner CURRENT-DRAFT P0, Phase 8).
      setMachineCapacity: (machine_capacity_grams) =>
        set((state) => ({
          machine_capacity_grams,
          machine_capacity_source: machine_capacity_grams === null ? null : 'manual',
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      setFlavorIntensity: (flavor_intensity) =>
        set((state) => ({ flavor_intensity, dirty: true, draftRevision: state.draftRevision + 1 })),
      setCostPriority: (cost_priority) =>
        set((state) => ({ cost_priority, dirty: true, draftRevision: state.draftRevision + 1 })),
      moveDirectionTarget: (axis, delta) =>
        set((state) => {
          const current = state.direction_targets[axis];
          const next = Math.max(-2, Math.min(2, current + delta)) as RecipeDirectionTarget;
          if (next === current) return {};
          const direction_targets = { ...state.direction_targets, [axis]: next };
          useRecipeProfileStore.getState().setDirectionTargets(direction_targets);
          return {
            direction_targets,
            direction_targets_active: true,
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      applyVerifiedRecipeInput: (input, productBehaviorSnapshots, options) => {
        // Phase 5 — reject missing/invalid amounts (never coerce to zero).
        const lineIds = new Set<string>();
        for (const item of input.items) {
          const grams = item.planned_grams;
          if (
            typeof item.id !== 'string' ||
            !item.id.trim() ||
            lineIds.has(item.id) ||
            typeof item.ingredient?.id !== 'string' ||
            !item.ingredient.id.trim() ||
            typeof grams !== 'number' ||
            Number.isNaN(grams) ||
            !Number.isFinite(grams) ||
            grams <= 0 ||
            (item.actual_grams !== null &&
              (!Number.isFinite(item.actual_grams) || item.actual_grams < 0)) ||
            !canonicalIngredientId(item.ingredient).trim()
          ) {
            return { ok: false, code: 'invalid_line', lineName: item.ingredient?.name ?? item.id };
          }
          lineIds.add(item.id);
        }
        const duplicateCanonicalIds = canonicalDuplicateIds(input.items);
        if (duplicateCanonicalIds.length > 0) {
          return {
            ok: false,
            code: 'duplicate_ingredient',
            canonicalIds: duplicateCanonicalIds,
          };
        }
        const verifiedSnapshots = productBehaviorSnapshots ?? get().productBehaviorSnapshots;
        // Runtime Apply supplies immutable authority. Empty maps exist only at
        // the pure Engine/store test seam; user-reachable Apply, Save and
        // Production paths resolve snapshots before reaching this write.
        if (Object.keys(verifiedSnapshots).length > 0) {
          const authority = evaluateRecipeConstraintAuthority({
            recipe: input,
            snapshots: verifiedSnapshots,
            module:
              normalizeFormulationStrategy(input.goals?.formulation_strategy ?? input.mode) ===
              'eco'
                ? 'ECO'
                : 'OPTIMAL',
            technicalOnlyMainLineIds: get().ownerReviewGate?.technicalOnlyMainLineIds,
          });
          if (!authority.valid) {
            return {
              ok: false,
              code: 'recipe_constraint_invalid',
              messagePl:
                authority.issues[0]?.messagePl ??
                'Receptura nie spełnia pełnej weryfikacji profilu.',
            };
          }
        }
        // Phase 6 — the door of last resort recomputes the total ITSELF.
        const hasActuals = input.items.some((item) => item.actual_grams !== null);
        const sum = input.items.reduce((total, item) => total + item.planned_grams, 0);
        if (
          !Number.isFinite(input.target_batch_grams) ||
          input.target_batch_grams <= 0 ||
          (!hasActuals && Math.abs(sum - input.target_batch_grams) > 0.1)
        ) {
          return { ok: false, code: 'batch_mismatch', sum, target: input.target_batch_grams };
        }
        // Phase 7 — atomic write + read-back verification with rollback.
        const prior = useRecipeStore.getState();
        const priorItems = prior.items;
        const priorBaseOrder = prior.baseOrder;
        const priorToppings = prior.toppings;
        const priorProductBehaviorSnapshots = prior.productBehaviorSnapshots;
        const priorMigrationAmbiguities = prior.compositionMigrationAmbiguities;
        const priorBatch = prior.target_batch_grams;
        const priorDirectionTargets = prior.direction_targets;
        const priorDirectionActive = prior.direction_targets_active;
        const nextItems = sortedBaseItems(
          input.items.map((item) => normalizeRecipeItemIdentity({ ...item })),
        );
        const nextToppings = priorToppings;
        const nextBaseOrder = orderedBaseItems(nextItems, priorBaseOrder).map((item) => item.id);
        const nextLineIds = new Set([
          ...nextItems.map((item) => item.id),
          ...nextToppings.map((item) => item.id),
        ]);
        if (
          productBehaviorSnapshots &&
          Object.entries(productBehaviorSnapshots).some(
            ([lineId, snapshot]) =>
              !nextLineIds.has(lineId) ||
              snapshot.lineId !== lineId ||
              (nextItems.some((item) => item.id === lineId)
                ? snapshot.processScope !== 'BASE_FORMULATION'
                : snapshot.processScope !== 'POST_PROCESS_ADDON'),
          )
        ) {
          return { ok: false, code: 'write_verification_failed' };
        }
        const nextProductBehaviorSnapshots = productBehaviorSnapshots
          ? Object.fromEntries(
              Object.entries(productBehaviorSnapshots).map(([lineId, snapshot]) => [
                lineId,
                preserveOwnerReviewGate(prior.ownerReviewGate, snapshot),
              ]),
            )
          : Object.fromEntries(
              Object.entries(prior.productBehaviorSnapshots).filter(([lineId]) => {
                const priorBase = prior.items.find((item) => item.id === lineId);
                const nextBase = nextItems.find((item) => item.id === lineId);
                if (priorBase && nextBase) {
                  return (
                    canonicalIngredientId(priorBase.ingredient) ===
                    canonicalIngredientId(nextBase.ingredient)
                  );
                }
                return nextToppings.some((item) => item.id === lineId);
              }),
            );
        set((state) => ({
          items: nextItems,
          baseOrder: nextBaseOrder,
          toppings: nextToppings,
          productBehaviorSnapshots: nextProductBehaviorSnapshots,
          compositionMigrationAmbiguities: priorMigrationAmbiguities,
          target_batch_grams: input.target_batch_grams,
          ...(options?.directionTargets
            ? {
                direction_targets: { ...options.directionTargets },
                direction_targets_active: true,
              }
            : {}),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        }));
        const written = useRecipeStore.getState();
        const writtenSum = written.items.reduce((total, item) => total + item.planned_grams, 0);
        const intact =
          written.items.length === nextItems.length &&
          written.items.every(
            (item, index) =>
              item.id === nextItems[index]!.id &&
              Object.is(item.planned_grams, nextItems[index]!.planned_grams),
          ) &&
          (hasActuals || Math.abs(writtenSum - input.target_batch_grams) <= 0.1) &&
          (options?.directionTargets === undefined ||
            JSON.stringify(written.direction_targets) === JSON.stringify(options.directionTargets));
        if (!intact) {
          // Rollback is itself a material write — the revision stays monotonic.
          set((state) => ({
            items: priorItems,
            baseOrder: priorBaseOrder,
            toppings: priorToppings,
            productBehaviorSnapshots: priorProductBehaviorSnapshots,
            compositionMigrationAmbiguities: priorMigrationAmbiguities,
            target_batch_grams: priorBatch,
            direction_targets: priorDirectionTargets,
            direction_targets_active: priorDirectionActive,
            draftRevision: state.draftRevision + 1,
          }));
          return { ok: false, code: 'write_verification_failed' };
        }
        if (options?.directionTargets) {
          useRecipeProfileStore.getState().setDirectionTargets(options.directionTargets);
        }
        if (options?.acknowledgeRecalculation === false) {
          useRecipeProfileStore.getState().markRecalculationRequired();
        } else {
          useRecipeProfileStore.getState().acknowledgeRecalculation();
        }
        return { ok: true };
      },

      addIngredient: (ingredient, grams = 100) => {
        const canonicalId = canonicalIngredientId(ingredient);
        const current = get();
        const existing = firstCanonicalBaseItem(current.items, current.baseOrder, ingredient);
        if (existing) {
          return { status: 'duplicate', lineId: existing.id, canonicalId };
        }

        const normalizedIngredient = normalizeIngredientIdentity(ingredient);
        const candidate = makeLine(normalizedIngredient, grams);
        const aggregate = clampOwnerStabilizerComponentGrams(
          buildRecipeInput({ ...current, items: [...current.items, candidate] }),
          candidate.id,
          grams,
        );
        const added = {
          ...candidate,
          planned_grams: aggregate.grams,
          lock_type: current.unavailableMainIngredientIds.some(
            (id) => canonicalIngredientIdFromSourceId(id) === canonicalId,
          )
            ? ('main' as const)
            : ('unlocked' as const),
          ...(aggregate.grams > 0 ? { user_intent_anchor_grams: aggregate.grams } : {}),
        };
        set((state) => {
          const orderedItems = sortedBaseItems([...state.items, added]);
          return {
            items: orderedItems,
            // A valid Main may have just arrived; the reservation is retired,
            // never decremented.
            starterReservedMainGrams: reservationAfterMainCheck({
              items: orderedItems,
              productBehaviorSnapshots: state.productBehaviorSnapshots,
              starterReservedMainGrams: state.starterReservedMainGrams,
            }),
            baseOrder: [
              ...state.baseOrder.filter((id) => orderedItems.some((item) => item.id === id)),
              added.id,
            ],
            // Visible GELATO re-routes its INTERNAL category from the real ingredients
            // (chocolate/nut/fruit/alcohol are classifications, never visible types).
            ...(state.visibleProductType === 'gelato'
              ? { category: gelatoInternalCategory(orderedItems) }
              : {}),
            // Explicitly adding an ingredient back clears its EXPLICIT
            // exclusion (frozen pin: an excluded ingredient returns ONLY
            // through an explicit add — never via the toolbox).
            excludedIngredientIds: state.excludedIngredientIds.filter(
              (id) => canonicalIngredientIdFromSourceId(id) !== canonicalId,
            ),
            unavailableMainIngredientIds: state.unavailableMainIngredientIds.filter(
              (id) => canonicalIngredientIdFromSourceId(id) !== canonicalId,
            ),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        });
        return { status: 'added', lineId: added.id, canonicalId };
      },

      addTopping: (ingredient, grams = 0) =>
        set((state) => {
          const canonicalId = toppingIngredientIdentity(ingredient);
          const normalized = isCatalogLabelToppingIngredient(ingredient)
            ? cloneToppingIngredient(ingredient)
            : normalizeIngredientIdentity(ingredient);
          const existingIndex = state.toppings.findIndex(
            (item) => toppingIngredientIdentity(item.ingredient) === canonicalId,
          );
          const toppings =
            existingIndex >= 0
              ? state.toppings.map((item, index) =>
                  index === existingIndex ? { ...item, ingredient: normalized } : item,
                )
              : [
                  ...state.toppings,
                  {
                    id: nextLineId(),
                    ingredient: normalized,
                    planned_grams: Math.max(0, grams),
                    actual_grams: null,
                    process_scope: 'POST_PROCESS_ADDON' as const,
                    addon_sort_order: state.toppings.length,
                  },
                ];
          return {
            toppings: sortedToppings(toppings),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
      removeTopping: (lineId) =>
        set((state) => {
          const toppings = state.toppings.filter((item) => item.id !== lineId);
          if (toppings.length === state.toppings.length) return {};
          return {
            toppings: sortedToppings(toppings),
            productBehaviorSnapshots: Object.fromEntries(
              Object.entries(state.productBehaviorSnapshots).filter(([id]) => id !== lineId),
            ),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
      setToppingGrams: (lineId, grams) =>
        set((state) => ({
          toppings: state.toppings.map((item) =>
            item.id === lineId ? { ...item, planned_grams: Math.max(0, grams) } : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      setToppingActualGrams: (lineId, grams) =>
        set((state) => ({
          toppings: state.toppings.map((item) =>
            item.id === lineId
              ? { ...item, actual_grams: grams === null ? null : Math.max(0, grams) }
              : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      replaceToppingIngredient: (lineId, ingredient) =>
        set((state) => {
          const current = state.toppings.find((item) => item.id === lineId);
          if (!current) return {};
          const canonicalId = toppingIngredientIdentity(ingredient);
          const normalized = isCatalogLabelToppingIngredient(ingredient)
            ? cloneToppingIngredient(ingredient)
            : normalizeIngredientIdentity(ingredient);
          const duplicate = state.toppings.find(
            (item) =>
              item.id !== lineId && toppingIngredientIdentity(item.ingredient) === canonicalId,
          );
          const toppings = duplicate
            ? state.toppings
                .filter((item) => item.id !== duplicate.id)
                .map((item) =>
                  item.id === lineId
                    ? {
                        ...item,
                        ingredient: normalized,
                        planned_grams: item.planned_grams + duplicate.planned_grams,
                        actual_grams:
                          item.actual_grams === null && duplicate.actual_grams === null
                            ? null
                            : (item.actual_grams ?? item.planned_grams) +
                              (duplicate.actual_grams ?? duplicate.planned_grams),
                      }
                    : item,
                )
            : state.toppings.map((item) =>
                item.id === lineId ? { ...item, ingredient: normalized } : item,
              );
          return {
            toppings: sortedToppings(toppings),
            productBehaviorSnapshots: Object.fromEntries(
              Object.entries(state.productBehaviorSnapshots).filter(
                ([snapshotLineId]) => snapshotLineId !== lineId && snapshotLineId !== duplicate?.id,
              ),
            ),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
      setIngredientPrivateCost: (lineId, pricePerKg, currency, source) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId
              ? {
                  ...item,
                  ingredient: {
                    ...item.ingredient,
                    cost_per_kg: pricePerKg,
                    cost_currency: currency,
                    cost_source: source,
                  },
                }
              : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      moveBaseItem: (lineId, direction) =>
        set((state) => ({
          baseOrder: moveWithin(
            state.baseOrder.map((id) => ({ id })),
            lineId,
            direction,
          ).map((item) => item.id),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      moveTopping: (lineId, direction) =>
        set((state) => ({
          toppings: moveWithin(sortedToppings(state.toppings), lineId, direction).map(
            (item, index) => ({ ...item, addon_sort_order: index }),
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      resolveCompositionAmbiguity: (lineId) =>
        set((state) => {
          const next = state.compositionMigrationAmbiguities.filter(
            (ambiguity) => ambiguity.lineId !== lineId,
          );
          if (next.length === state.compositionMigrationAmbiguities.length) return {};
          return {
            compositionMigrationAmbiguities: next,
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
      setProductBehaviorSnapshot: (lineId, snapshot) =>
        set((state) => {
          const isBase = state.items.some((item) => item.id === lineId);
          const isTopping = state.toppings.some((item) => item.id === lineId);
          if (!isBase && !isTopping) return {};
          if (
            snapshot &&
            ((isBase && snapshot.processScope !== 'BASE_FORMULATION') ||
              (isTopping && snapshot.processScope !== 'POST_PROCESS_ADDON') ||
              snapshot.lineId !== lineId)
          )
            return {};
          const next = { ...state.productBehaviorSnapshots };
          if (snapshot) {
            next[lineId] = preserveOwnerReviewGate(state.ownerReviewGate, snapshot);
          } else delete next[lineId];
          return {
            productBehaviorSnapshots: next,
            // Resolver authority can arrive AFTER the line does, so the Main
            // role may resolve here rather than at insertion.
            starterReservedMainGrams: reservationAfterMainCheck({
              items: state.items,
              productBehaviorSnapshots: next,
              starterReservedMainGrams: state.starterReservedMainGrams,
            }),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
      syncProductBehaviorSnapshots: (snapshots) =>
        set((state) => {
          const baseIds = new Set(state.items.map((item) => item.id));
          const toppingIds = new Set(state.toppings.map((item) => item.id));
          const entries = Object.entries(snapshots);
          const valid = entries.every(
            ([lineId, snapshot]) =>
              snapshot.lineId === lineId &&
              ((baseIds.has(lineId) && snapshot.processScope === 'BASE_FORMULATION') ||
                (toppingIds.has(lineId) && snapshot.processScope === 'POST_PROCESS_ADDON')),
          );
          if (!valid) return {};
          const synced = Object.fromEntries(
            entries.map(([lineId, snapshot]) => [
              lineId,
              preserveOwnerReviewGate(state.ownerReviewGate, snapshot),
            ]),
          );
          return {
            productBehaviorSnapshots: synced,
            // Same transition as the single-line door: authority arriving here
            // can resolve the required Main role.
            starterReservedMainGrams: reservationAfterMainCheck({
              items: state.items,
              productBehaviorSnapshots: synced,
              starterReservedMainGrams: state.starterReservedMainGrams,
            }),
          };
        }),

      removeItem: (lineId) =>
        set((state) => {
          const items = state.items.filter((item) => item.id !== lineId);
          if (items.length === state.items.length) return {}; // unknown line — no-op
          return {
            items,
            baseOrder: state.baseOrder.filter((id) => items.some((item) => item.id === id)),
            crownAutoSeededLineIds: clearCrownAutoSeeded(state.crownAutoSeededLineIds, lineId),
            productBehaviorSnapshots: Object.fromEntries(
              Object.entries(state.productBehaviorSnapshots).filter(([id]) => id !== lineId),
            ),
            ...(state.visibleProductType === 'gelato'
              ? { category: gelatoInternalCategory(items) }
              : {}),
            // Owner FINAL CLOSURE C2 (supersedes the NIGHTLY removal-excludes
            // rule): „Remove row" = removed from the CURRENT recipe ONLY. It
            // must NOT silently become a permanent scientific exclusion — the
            // toolbox may refill the vacated role. Exclusion happens ONLY via
            // the explicit `markIngredientUnavailable` action.
            // KEPT (owner P0 NIGHTLY, live FAILURE B — draft-scoped
            // lifecycle): removing the LAST line ends the draft; the empty
            // draft starts a fresh exclusion context (never-selected ≠
            // excluded), so even explicit exclusions do not leak into the
            // next draft built from scratch.
            ...(items.length === 0
              ? { excludedIngredientIds: [], unavailableMainIngredientIds: [] }
              : {}),
            dirty: true,
            // C3: EXACTLY one bump per material edit. The constraint-studio
            // store bridge reconciles the §17 half (drops the removed line's
            // constraint entry, invalidates staged previews) SYNCHRONOUSLY
            // inside this same setState — no async effect, no second bump.
            draftRevision: state.draftRevision + 1,
          };
        }),

      markIngredientUnavailable: (lineId) =>
        set((state) => {
          const target = state.items.find((item) => item.id === lineId);
          if (!target) return {}; // unknown line — no-op
          const ingredientId = canonicalIngredientId(target.ingredient);
          const items = state.items.filter(
            (item) => canonicalIngredientId(item.ingredient) !== ingredientId,
          );
          return {
            items,
            baseOrder: state.baseOrder.filter((id) => items.some((item) => item.id === id)),
            productBehaviorSnapshots: Object.fromEntries(
              Object.entries(state.productBehaviorSnapshots).filter(([id]) =>
                items.some((item) => item.id === id),
              ),
            ),
            ...(state.visibleProductType === 'gelato'
              ? { category: gelatoInternalCategory(items) }
              : {}),
            // THE explicit exclusion write (owner FINAL CLOSURE C2 — the only
            // source). An explicit statement of unavailability stands even if
            // it empties the draft; only an explicit add or a draft-context
            // change clears it.
            excludedIngredientIds: state.excludedIngredientIds.includes(ingredientId)
              ? state.excludedIngredientIds
              : [...state.excludedIngredientIds, ingredientId],
            unavailableMainIngredientIds:
              target.lock_type === 'main' &&
              !state.unavailableMainIngredientIds.includes(ingredientId)
                ? [...state.unavailableMainIngredientIds, ingredientId]
                : state.unavailableMainIngredientIds,
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      setIngredientUnavailable: (lineId, unavailable) =>
        set((state) => {
          const target = state.items.find((item) => item.id === lineId);
          if (!target) return {};
          const ingredientId = canonicalIngredientId(target.ingredient);
          const excludedIngredientIds = unavailable
            ? state.excludedIngredientIds.includes(ingredientId)
              ? state.excludedIngredientIds
              : [...state.excludedIngredientIds, ingredientId]
            : state.excludedIngredientIds.filter(
                (id) => canonicalIngredientIdFromSourceId(id) !== ingredientId,
              );
          const unavailableMainIngredientIds = unavailable
            ? target.lock_type === 'main' &&
              !state.unavailableMainIngredientIds.includes(ingredientId)
              ? [...state.unavailableMainIngredientIds, ingredientId]
              : state.unavailableMainIngredientIds
            : state.unavailableMainIngredientIds.filter(
                (id) => canonicalIngredientIdFromSourceId(id) !== ingredientId,
              );
          if (
            excludedIngredientIds === state.excludedIngredientIds &&
            unavailableMainIngredientIds === state.unavailableMainIngredientIds
          ) {
            return {};
          }
          return {
            excludedIngredientIds,
            unavailableMainIngredientIds,
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      /**
       * Owner P0 (recalc duplication) — REPAIR for drafts saved before the
       * canonical-identity fix: fold every later PLANNABLE (unlocked, nothing
       * poured) line of an already-seen ingredient into the first such line
       * (grams summed). Locked/poured lines and genuinely different
       * ingredients are never touched. Explicit user action — never automatic.
       */
      mergeDuplicateIngredientLines: () =>
        set((state) => {
          const keepByIngredient = new Map<string, RecipeItem>();
          const items: RecipeItem[] = [];
          let merged = false;
          for (const item of state.items) {
            const plannable = item.lock_type === 'unlocked' && item.actual_grams === null;
            if (!plannable) {
              items.push(item);
              continue;
            }
            const ingredientId = canonicalIngredientId(item.ingredient);
            const keep = keepByIngredient.get(ingredientId);
            if (keep) {
              keep.planned_grams += item.planned_grams;
              merged = true;
              continue;
            }
            const copy = { ...item };
            keepByIngredient.set(ingredientId, copy);
            items.push(copy);
          }
          return merged
            ? {
                items,
                baseOrder: state.baseOrder.filter((id) => items.some((item) => item.id === id)),
                dirty: true,
                draftRevision: state.draftRevision + 1,
              }
            : {};
        }),

      setPlannedGrams: (lineId, grams) =>
        set((state) => {
          const line = state.items.find((item) => item.id === lineId);
          if (!line) return {};
          const requestedGrams = Math.max(0, grams);
          const required = productBehaviorRequiredLineIds({
            items: [{ ...line, planned_grams: requestedGrams }],
          });
          if (
            productBehaviorIsManaged(state.productBehaviorSnapshots) &&
            required.length > 0 &&
            !productBehaviorModuleGate(state.productBehaviorSnapshots, 'BASE_RECIPE', required)
              .ready
          )
            return {};
          // Manufacturer dosage is informational only: the amount the user
          // asks for is the amount they get. Only PINGÜINO's own stabilizer
          // system still bounds a component.
          const aggregate = clampOwnerStabilizerComponentGrams(
            buildRecipeInput(state),
            lineId,
            requestedGrams,
          );
          const targetGrams = aggregate.grams;
          const items = state.items.map((item) => {
            const next = { ...item };
            delete next.user_target_grams;
            if (item.id !== lineId) return next;
            next.planned_grams = targetGrams;
            next.user_target_grams = targetGrams;
            if (targetGrams > 0) next.user_intent_anchor_grams = targetGrams;
            else delete next.user_intent_anchor_grams;
            return next;
          });
          return {
            items: line.lock_type === 'main' ? equalCrownSeedWeights(items) : items,
            // OWNER P0 — an explicit grams write is the user's amount, even
            // when it happens to equal the seed. The crown no longer owns it.
            crownAutoSeededLineIds: clearCrownAutoSeeded(state.crownAutoSeededLineIds, lineId),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
      setDirectionTarget: (axis, target) =>
        set((state) => {
          if (state.direction_targets[axis] === target) return {};
          const direction_targets = { ...state.direction_targets, [axis]: target };
          useRecipeProfileStore.getState().setDirectionTargets(direction_targets);
          return {
            direction_targets,
            // Owner P1-A: returning an axis to 0 selects the CLEAN MIDDLE — it
            // does not switch Direction off. Recomputing activation from
            // "is any axis non-zero" is the same defect as the draft seam: it
            // silently dropped the contract, so the optimizer stopped honouring
            // the neutral band and parked POD at the approved band's edge.
            direction_targets_active: true,
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      setPlannedGramsVector: (gramsByLineId) =>
        set((state) => {
          const touched = state.items.some(
            (item) =>
              gramsByLineId[item.id] !== undefined &&
              Number.isFinite(gramsByLineId[item.id]) &&
              !Object.is(item.planned_grams, gramsByLineId[item.id]),
          );
          if (!touched) return {};
          // Apply PINGÜINO's per-component stabilizer clamp exactly as the
          // single-line grams write does, so both seams enforce the same
          // science (aggregate ceiling + whole grams) and neither enforces the
          // aggregate minimum, which is a Preview/Apply/Save verdict.
          const proposedItems = state.items.map((item) => {
            const next = gramsByLineId[item.id];
            if (next === undefined || !Number.isFinite(next)) return item;
            const requested = Math.max(0, next);
            const planned =
              resolveFunctionalRole(item.ingredient) === 'stabilizer'
                ? clampOwnerStabilizerComponentGrams(buildRecipeInput(state), item.id, requested)
                    .grams
                : requested;
            return { ...item, planned_grams: planned };
          });
          const proposed = buildRecipeInput({ ...state, items: proposedItems });
          const required = productBehaviorRequiredLineIds({ items: proposed.items });
          if (
            productBehaviorIsManaged(state.productBehaviorSnapshots) &&
            required.length > 0 &&
            !productBehaviorModuleGate(state.productBehaviorSnapshots, 'BASE_RECIPE', required)
              .ready
          )
            return {};
          // GRAMS/PERCENT PARITY. The grams control applies PINGÜINO's
          // per-component stabilizer clamp and then WRITES — it does not refuse
          // an amount that leaves the aggregate below the band, because the
          // band is enforced where it belongs: Preview, Apply and Save. The
          // percent control must behave identically, or the two representations
          // of one quantity diverge (served staging: 1 g accepted as grams,
          // silently refused as 0.1 %). `buildDirectPercentEdit` has already
          // applied the SAME clamp to this vector, so there is nothing left for
          // a second, stricter stabilizer verdict to legitimately add here.
          return {
            items: proposedItems,
            // OWNER P0 — every line this vector actually writes now holds an
            // explicit amount, so no crown seed provenance survives it.
            crownAutoSeededLineIds: clearCrownAutoSeededLines(
              state.crownAutoSeededLineIds,
              Object.entries(gramsByLineId)
                .filter(([, grams]) => grams !== undefined && Number.isFinite(grams))
                .map(([lineId]) => lineId),
            ),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      setActualGrams: (lineId, grams) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId
              ? { ...item, actual_grams: grams === null ? null : Math.max(0, grams) }
              : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),

      setLockType: (lineId, lockType) =>
        set((state) => {
          const current = state.items.find((item) => item.id === lineId);
          // OWNER P0 — the crown contract belongs to the role transition, not
          // to one button. This lower-level write reaches the same Main role,
          // so it seeds and restores exactly like the Crown toggle.
          const wasAutoSeeded = state.crownAutoSeededLineIds.includes(lineId);
          const crownedNow = lockType === 'main' && current?.lock_type !== 'main';
          const uncrownedNow = lockType !== 'main' && current?.lock_type === 'main';
          const seed = crownedNow ? crownOnPlannedGrams(current?.planned_grams ?? 0) : null;
          const items = state.items.map((item) =>
            item.id === lineId
              ? (() => {
                  const withoutRange = { ...item };
                  delete withoutRange.range_constraint;
                  delete withoutRange.percent_constraint;
                  delete withoutRange.grams_constraint;
                  if (lockType !== 'main') delete withoutRange.main_ratio_weight;
                  const planned_grams = seed
                    ? seed.plannedGrams
                    : uncrownedNow
                      ? crownOffPlannedGrams(item.planned_grams, wasAutoSeeded)
                      : item.planned_grams;
                  if (planned_grams === 0) delete withoutRange.user_intent_anchor_grams;
                  return { ...withoutRange, lock_type: lockType, planned_grams };
                })()
              : item,
          );
          return {
            items: lockType === 'main' ? equalCrownSeedWeights(items) : items,
            crownAutoSeededLineIds: seed?.autoSeeded
              ? markCrownAutoSeeded(state.crownAutoSeededLineIds, lineId)
              : crownedNow || uncrownedNow
                ? clearCrownAutoSeeded(state.crownAutoSeededLineIds, lineId)
                : state.crownAutoSeededLineIds,
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      setPercentLock: (lineId, percent) => {
        if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) return;
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== lineId) return item;
            const next = { ...item };
            delete next.range_constraint;
            delete next.grams_constraint;
            if (percent === null) {
              delete next.percent_constraint;
              return {
                ...next,
                lock_type: item.lock_type === 'percent' ? ('unlocked' as const) : item.lock_type,
              };
            }
            return {
              ...next,
              lock_type: ENGINE_KEPT_LOCKS.has(item.lock_type)
                ? item.lock_type
                : ('percent' as const),
              percent_constraint: { percent },
            };
          }),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        }));
      },

      setGramLock: (lineId, grams) => {
        if (grams !== null && (!Number.isFinite(grams) || grams < 0)) return;
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== lineId) return item;
            const next = { ...item };
            delete next.range_constraint;
            delete next.percent_constraint;
            if (grams === null) {
              delete next.grams_constraint;
              return {
                ...next,
                lock_type: item.lock_type === 'grams' ? ('unlocked' as const) : item.lock_type,
              };
            }
            return {
              ...next,
              lock_type: ENGINE_KEPT_LOCKS.has(item.lock_type)
                ? item.lock_type
                : ('grams' as const),
              grams_constraint: { grams },
            };
          }),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        }));
      },

      setRangeLock: (lineId, minGrams, maxGrams) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId
              ? (() => {
                  const withoutPercent = { ...item };
                  delete withoutPercent.percent_constraint;
                  delete withoutPercent.grams_constraint;
                  return {
                    ...withoutPercent,
                    lock_type: ENGINE_KEPT_LOCKS.has(item.lock_type)
                      ? item.lock_type
                      : ('grams' as const),
                    range_constraint: { min_grams: minGrams, max_grams: maxGrams },
                  };
                })()
              : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),

      clearRangeLock: (lineId) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== lineId || item.range_constraint === undefined) return item;
            const withoutRange = { ...item };
            delete withoutRange.range_constraint;
            return {
              ...withoutRange,
              lock_type: item.lock_type === 'grams' ? ('unlocked' as const) : item.lock_type,
            };
          }),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),

      setMainIngredient: (lineId) =>
        set((state) => {
          const current = state.items.find((item) => item.id === lineId);
          if (!current) return {};
          const snapshotRequired = productBehaviorRequiredLineIds({ items: state.items }).includes(
            lineId,
          );
          if (mainBehaviorBlockReason(state.productBehaviorSnapshots[lineId], snapshotRequired))
            return {};
          const roleChanged = current.lock_type !== 'main';
          // OWNER P0 — Crown at 0 g. The crown is a role, not an amount, but a
          // crowned line must hold a real positive mass: a 0 g line is not a
          // ProductBehavior required line, so nothing ever revalidates the
          // role transition and every later grams edit is refused. Seed one
          // ordinary gram and remember that WE seeded it.
          const seed = roleChanged ? crownOnPlannedGrams(current.planned_grams) : null;
          const items = state.items.map((item) => {
            if (item.id !== lineId) return item;
            const next = {
              ...item,
              lock_type: 'main' as const,
              ...(seed ? { planned_grams: seed.plannedGrams } : {}),
            };
            delete next.user_intent_anchor_grams;
            return next;
          });
          const crowned = equalCrownSeedWeights(items);
          return {
            items: crowned,
            starterReservedMainGrams: reservationAfterMainCheck({
              items: crowned,
              productBehaviorSnapshots: state.productBehaviorSnapshots,
              starterReservedMainGrams: state.starterReservedMainGrams,
            }),
            // Re-asserting a crown the line already wears changes nothing, so
            // it must not quietly discard the provenance of the seeded gram.
            crownAutoSeededLineIds: !seed
              ? state.crownAutoSeededLineIds
              : seed.autoSeeded
                ? markCrownAutoSeeded(state.crownAutoSeededLineIds, lineId)
                : clearCrownAutoSeeded(state.crownAutoSeededLineIds, lineId),
            ...(roleChanged
              ? {
                  productBehaviorSnapshots: requireProductBehaviorLineRevalidation(
                    state.productBehaviorSnapshots,
                    lineId,
                  ),
                  practicalRecipeAudit: null,
                  savedProductionFingerprint: null,
                }
              : {}),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      setStandardIngredient: (lineId) =>
        set((state) => {
          const roleChanged = state.items.some(
            (item) => item.id === lineId && item.lock_type === 'main',
          );
          // OWNER P0 — the gram the crown seeded belongs to the crown. It goes
          // back to 0 g only while it is still untouched; an amount the user
          // typed after the seed, or an amount that existed before the crown,
          // is preserved exactly. No gram stack, no history.
          const autoSeeded = state.crownAutoSeededLineIds.includes(lineId);
          return {
            items: state.items.map((item) => {
              if (item.id !== lineId || item.lock_type !== 'main') return item;
              const next = { ...item };
              delete next.main_ratio_weight;
              const planned_grams = crownOffPlannedGrams(item.planned_grams, autoSeeded);
              if (planned_grams === 0) delete next.user_intent_anchor_grams;
              return {
                ...next,
                planned_grams,
                ...(planned_grams > 0 ? { user_intent_anchor_grams: planned_grams } : {}),
                lock_type:
                  item.range_constraint || item.grams_constraint
                    ? ('grams' as const)
                    : item.percent_constraint
                      ? ('percent' as const)
                      : ('unlocked' as const),
              };
            }),
            crownAutoSeededLineIds: clearCrownAutoSeeded(state.crownAutoSeededLineIds, lineId),
            ...(roleChanged
              ? {
                  productBehaviorSnapshots: requireProductBehaviorLineRevalidation(
                    state.productBehaviorSnapshots,
                    lineId,
                  ),
                  practicalRecipeAudit: null,
                  savedProductionFingerprint: null,
                }
              : {}),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      setMainRatioWeight: (lineId, weight) => {
        if (weight !== null && (!Number.isFinite(weight) || weight <= 0)) return;
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== lineId || item.lock_type !== 'main') return item;
            const next = { ...item };
            if (weight === null) delete next.main_ratio_weight;
            else next.main_ratio_weight = weight;
            return next;
          }),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        }));
      },

      // Owner P0 NIGHTLY (live FAILURE 1): a preset load / recipe load / reset
      // starts a WHOLE NEW draft context — `draftContextSeq` bumps so the
      // constraint-studio bridge resets the §17 session (constraints, staged
      // preview, history). Stale §17 locks/ranges from an earlier session
      // draft must never survive into a reloaded recipe.
      loadPreset: (preset) => {
        useIngredientTableUxStore.getState().reset();
        set((state) => ({
          ...fromPreset(preset),
          excludedIngredientIds: [],
          unavailableMainIngredientIds: [],
          crownAutoSeededLineIds: [],
          draftRevision: state.draftRevision + 1,
          draftContextSeq: state.draftContextSeq + 1,
        }));
        const opened = useRecipeStore.getState();
        useRecipeProfileStore
          .getState()
          .openDraft(opened.draftContextSeq, DEFAULT_DIRECTION_TARGETS);
      },
      loadRecipeInput: (input, link = {}) => {
        useIngredientTableUxStore.getState().reset();
        const metadata = readRecipeProfileMetadata(input);
        const compositionMetadata = readRecipeCompositionMetadata(
          link.composition,
          input.items.map((item) => item.id),
          input.items.filter((item) => item.lock_type === 'main').map((item) => item.id),
        );
        const practicalRecipeAudit = readPracticalRecipeAudit(input);
        const savedRecipe = link.savedId != null || link.savedName != null;
        const visibleForDefaults = visibleTypeOf(input.category);
        const defaults = savedRecipe
          ? null
          : (useRecipeProfileStore.getState().defaultsFor(productDefaultsKey(visibleForDefaults)) ??
            useRecipeProfileStore.getState().defaultsFor(profileOwnerKey()));
        // Saved Engine category + ingredients are the formulation source of
        // truth. Legacy UI metadata may carry a profile enum written by an old
        // profile-only switch; never let it relabel that vector on reopen.
        const runtimeInputCategory = canonicalInternalCategory(input.category, input.items);
        const matchesInputBase = (candidate: ProfileSettingsSnapshot | null): boolean =>
          candidate !== null &&
          internalCategoryFor(candidate.visibleProductType, input.items, runtimeInputCategory) ===
            runtimeInputCategory;
        const compatibleMetadata = matchesInputBase(metadata) ? metadata : null;
        const compatibleDefaults = matchesInputBase(defaults) ? defaults : null;
        const profile = compatibleMetadata ?? compatibleDefaults;
        // Reopening a saved recipe restores ITS OWN batch and grams untouched
        // (they were written together at save time). Only a NON-SAVED load may
        // adopt an account/product default batch, and only atomically.
        const adoptsAccountBatch = profile !== null && profile === compatibleDefaults;
        // An explicit payload batch intent outranks the account/product default
        // for this load. A saved reopen is never affected: it carries its own
        // persisted batch and resolves no defaults at all.
        const payloadOwnsBatch = !savedRecipe && link.batchAuthority === 'payload';
        const healedItems = input.items.map((item) => {
          const normalized = normalizeRecipeItemIdentity({ ...item });
          return normalized.lock_type === 'grams' && normalized.planned_grams === 0
            ? { ...normalized, lock_type: 'unlocked' as const }
            : normalized;
        });
        // Owner zero-gram executable invariant (2026-08-22): a SAVED version is a
        // canonical executable state and must never reopen with an explicit 0 g
        // optional row. Legacy versions persisted before the invariant may still
        // carry one ("not used" written as 0 g); drop that row on reopen — the
        // absence is the truth — and require a fresh recalculation so the
        // practical audit is re-established. Unsaved drafts keep every 0 g row:
        // there it is the temporary editor placeholder the PI guard handles.
        const legacyUnusedLineIds = new Set(
          savedRecipe
            ? unusedZeroGramLineIds({ ...input, items: healedItems }, { byLineId: {} })
            : [],
        );
        const normalizedItems = hydrateLegacyMainRatioWeights(
          healedItems.filter((item) => !legacyUnusedLineIds.has(item.id)),
        );
        const legacyAdditionItems = normalizedItems.filter(
          (item) => metadata?.ingredientUxByLineId?.[item.id]?.role === 'addition',
        );
        // Historical "Dodatek" was UI-only metadata while the line still
        // participated in Base Engine. Its post-process meaning cannot be
        // proven, so keep the formula byte-identical and record the ambiguity.
        const loadedToppings: RecipeToppingItem[] = compositionMetadata?.toppings ?? [];
        const migrationAmbiguities = [
          ...(compositionMetadata?.migrationAmbiguities ?? []),
          ...legacyAdditionItems.map((item) => ({
            lineId: item.id,
            reason: 'LEGACY_ADDITION_ROLE_DID_NOT_PROVE_POST_PROCESS_SCOPE',
          })),
        ].filter(
          (item, index, all) =>
            all.findIndex(
              (candidate) => candidate.lineId === item.lineId && candidate.reason === item.reason,
            ) === index,
        );
        const resolvedBatch: ResolvedProfileBatch | null = payloadOwnsBatch
          ? resolvePayloadBatch(normalizedItems, input.target_batch_grams, profile)
          : profile === null
            ? null
            : adoptsAccountBatch
              ? resolveProfileBatch(profile, normalizedItems, input.target_batch_grams)
              : {
                  items: normalizedItems,
                  targetBatchGrams: profile.targetBatchGrams,
                  batchSource: profileBatchSource(profile),
                };
        const loadedItems = resolvedBatch?.items ?? normalizedItems;
        set((state) => ({
          draftRevision: state.draftRevision + 1,
          draftContextSeq: state.draftContextSeq + 1,
          ...(profile && resolvedBatch
            ? profileFields(profile, loadedItems, input.category, resolvedBatch)
            : {
                mode: 'classic' as const,
                category: input.category,
                visibleProductType: visibleTypeOf(input.category),
                target_temperature_c: input.target_temperature_c,
                // With no profile to adopt, the payload's own batch already
                // stands. `resolvedBatch` is non-null here ONLY on the
                // payload-authority path, where it additionally guarantees the
                // Base sums to that batch; every other caller is unchanged.
                target_batch_grams: resolvedBatch?.targetBatchGrams ?? input.target_batch_grams,
                batch_source: resolvedBatch?.batchSource ?? ('PROFESSIONAL_USER_BATCH' as const),
                batchResizeConflict: null,
                machine_capacity_grams: input.machine_capacity_grams,
                machine_capacity_source:
                  input.machine_capacity_grams === null ? null : ('manual' as const),
                machineKind: null,
                servingModeId: null,
                machineId: null,
                machineLabel: null,
                machineTechnology: null,
              }),
          formulation_strategy: normalizeFormulationStrategy(
            // Account defaults may configure machine/batch/profile context,
            // but they never turn a newly loaded draft into ECO implicitly.
            // Saved/derived payloads still preserve an explicit persisted mode.
            metadata?.formulationStrategy ?? input.goals?.formulation_strategy ?? input.mode,
          ),
          flavor_intensity: input.goals?.flavor_intensity ?? 'balanced',
          cost_priority: input.goals?.cost_priority ?? 'balanced',
          // Owner P2: reopening a saved recipe restores ITS OWN Direction. The
          // ambient per-profile snapshot belongs to whatever was open last, so
          // it must never outrank the persisted recipe.
          direction_targets: {
            ...(input.goals?.direction_targets ??
              profile?.directionTargets ??
              DEFAULT_DIRECTION_TARGETS),
          },
          direction_targets_active:
            input.goals?.direction_targets_active ??
            Object.values(profile?.directionTargets ?? {}).some((target) => target !== 0),
          // Owner binding rule (zero-gram semantics): a stored bare grams-lock
          // at 0 g is a selected-UNFILLED artifact (legacy saves / resolution
          // bridge), not a deliberate zero — heal it on load so the UI shows
          // the truth. Explicit zeros live in §17 constraints, which are
          // session state and never stored with the recipe input.
          items: loadedItems,
          baseOrder: orderedBaseItems(
            loadedItems,
            compositionMetadata?.baseOrder ?? loadedItems.map((item) => item.id),
          ).map((item) => item.id),
          toppings: sortedToppings(loadedToppings),
          productBehaviorSnapshots: structuredClone(
            Object.fromEntries(
              Object.entries(compositionMetadata?.behaviorSnapshots ?? {}).filter(
                ([lineId]) => !legacyUnusedLineIds.has(lineId),
              ),
            ),
          ),
          ownerReviewGate: compositionMetadata?.ownerReviewGate
            ? structuredClone(compositionMetadata.ownerReviewGate)
            : null,
          compositionMigrationAmbiguities: migrationAmbiguities,
          excludedIngredientIds: [...(input.goals?.excluded_ingredient_ids ?? [])],
          unavailableMainIngredientIds: [...(input.goals?.unavailable_main_ingredient_ids ?? [])],
          // A reopened recipe carries only real amounts. Crown auto-seed
          // provenance is draft-transient and must never be reconstructed from
          // a saved payload.
          crownAutoSeededLineIds: [],
          activePresetId: null,
          newRecipeStarterTemplateId: null,
          newRecipeStarterKey: null,
          newRecipeStarterMaterialFingerprint: null,
          starterReservedMainGrams: 0,
          savedRecipeId: link.savedId ?? null,
          savedRecipeName: link.savedName ?? null,
          currentVersionNumber: link.versionNumber ?? null,
          savedRecipeLatestVersionNumber: link.latestVersionNumber ?? link.versionNumber ?? null,
          currentVersionId: link.versionId ?? null,
          currentVersionDate: link.versionDate ?? null,
          dirty: false,
          practicalRecipeAudit,
          savedProductionFingerprint: null,
        }));
        const opened = useRecipeStore.getState();
        if (link.versionId && compositionMetadata) {
          set({
            savedProductionFingerprint: productionVersionFingerprint(
              buildRecipeInput(opened),
              recipeCompositionFromState(opened),
            ),
          });
        }
        useIngredientTableUxStore.getState().hydrateRecipeMeta(profile?.ingredientUxByLineId ?? {});
        useRecipeProfileStore
          .getState()
          .openDraft(
            opened.draftContextSeq,
            opened.direction_targets,
            profile?.directionIntents,
            savedRecipeProfileDraftIdentity(opened),
          );
        if (legacyUnusedLineIds.size > 0) {
          useRecipeProfileStore.getState().markRecalculationRequired();
        }
      },
      markSaved: (
        id,
        name,
        versionNumber,
        versionDate = null,
        practicalRecipeAudit,
        versionId = null,
        savedProductionFingerprint = null,
      ) => {
        set({
          savedRecipeId: id,
          savedRecipeName: name,
          currentVersionNumber: versionNumber,
          savedRecipeLatestVersionNumber: versionNumber,
          currentVersionId: versionId,
          currentVersionDate: versionDate,
          dirty: false,
          newRecipeStarterTemplateId: null,
          newRecipeStarterKey: null,
          newRecipeStarterMaterialFingerprint: null,
          starterReservedMainGrams: 0,
          ...(practicalRecipeAudit === undefined ? {} : { practicalRecipeAudit }),
          savedProductionFingerprint,
        });
        const savedIdentity = savedRecipeProfileDraftIdentity(useRecipeStore.getState());
        if (savedIdentity !== null) {
          useRecipeProfileStore.getState().rebindDraftIdentity(savedIdentity);
        }
      },
      acknowledgePracticalRecipeAudit: (practicalRecipeAudit) =>
        set({ practicalRecipeAudit: structuredClone(practicalRecipeAudit) }),
      startNewRecipe: (requestedVisible) => {
        useIngredientTableUxStore.getState().reset();
        // An explicit New Recipe stays in the product family the customer is
        // currently working in. Account defaults may configure that family's
        // machine/serving/batch preferences, but they must never redirect the
        // action to another family or restore a previous recipe's strategy.
        const legacyDefaults = useRecipeProfileStore.getState().defaultsFor(profileOwnerKey());
        const visible = requestedVisible ?? get().visibleProductType ?? DEFAULT_NEW_RECIPE_PROFILE;
        const specificDefaults = useRecipeProfileStore
          .getState()
          .defaultsFor(productDefaultsKey(visible));
        const defaults =
          specificDefaults ??
          (legacyDefaults?.visibleProductType === visible ? legacyDefaults : null);
        // A genuinely new recipe always starts OPTIMAL. Persisted ECO belongs
        // to an existing saved recipe and is restored by `loadRecipeInput`; it
        // is never a default for a fresh identity, even when older account
        // preferences still contain `formulationStrategy: eco`.
        const formulationStrategy: FormulationStrategy = DEFAULT_NEW_RECIPE_STRATEGY;
        const starterServingMode = isNewRecipeServingModeId(defaults?.servingModeId)
          ? defaults.servingModeId
          : starterServingModeForTemperature(defaults?.targetTemperatureC);
        const starter = buildCanonicalNewRecipeStarter({
          visibleProductType: visible,
          servingModeId: starterServingMode,
          formulationStrategy,
          targetBatchGrams:
            defaults?.machineKind === 'home'
              ? defaults.targetBatchGrams
              : PROFESSIONAL_DEFAULT_BATCH_GRAMS,
        });
        const starterMaterialFingerprint = newRecipeStarterMaterialFingerprint({
          items: starter.items,
        });
        const base = fromPreset(DEFAULT_PRESET);
        set((state) => ({
          ...base,
          mode: 'classic',
          formulation_strategy: formulationStrategy,
          category: starter.category,
          visibleProductType: starter.visibleProductType,
          target_temperature_c: starter.targetTemperatureC,
          target_batch_grams: starter.targetBatchGrams,
          batch_source:
            defaults?.machineKind === 'home'
              ? (defaults.batchSource ??
                (defaults.machineId?.startsWith('custom-')
                  ? 'CUSTOM_MACHINE_BATCH'
                  : 'MACHINE_DEFAULT'))
              : 'PROFESSIONAL_DEFAULT',
          batchResizeConflict: null,
          machine_capacity_grams:
            defaults?.machineKind === 'home' ? defaults.machineCapacityGrams : null,
          machine_capacity_source:
            defaults?.machineKind === 'home' && defaults.machineCapacityGrams !== null
              ? 'machine'
              : null,
          // A new draft starts from the account default for THIS product
          // (deliberately configured in Account Recipe Defaults), else the
          // clean middle. That is a stored preference, not the previous
          // recipe's state — the leak lives in `rebuildNewRecipeStarter`.
          direction_targets: {
            ...(defaults?.directionTargets ?? DEFAULT_DIRECTION_TARGETS),
          },
          // Owner P1-A: neutral is an intent, not its absence (see above).
          direction_targets_active: true,
          items: starter.items,
          baseOrder: starter.items.map((item) => item.id),
          activePresetId: null,
          newRecipeStarterTemplateId: starter.templateId,
          starterReservedMainGrams: Math.max(0, starter.metrics.missingMainMassGrams),
          newRecipeStarterKey: {
            visibleProductType: starter.visibleProductType,
            servingModeId: starter.servingModeId,
            formulationStrategy: starter.formulationStrategy,
            targetBatchGrams: starter.targetBatchGrams,
          },
          newRecipeStarterMaterialFingerprint: starterMaterialFingerprint,
          machineKind: defaults?.machineKind ?? null,
          servingModeId: defaults?.servingModeId ?? starter.servingModeId,
          machineId: defaults?.machineId ?? null,
          machineLabel: defaults?.machineLabel ?? null,
          machineTechnology: defaults?.machineTechnology ?? null,
          dirty: false,
          draftRevision: state.draftRevision + 1,
          draftContextSeq: state.draftContextSeq + 1,
        }));
        const opened = useRecipeStore.getState();
        useRecipeProfileStore
          .getState()
          .openDraft(
            opened.draftContextSeq,
            defaults?.directionTargets ?? DEFAULT_DIRECTION_TARGETS,
            defaults?.directionIntents,
          );
      },
      rebuildNewRecipeStarter: (key) => {
        useIngredientTableUxStore.getState().reset();
        // Owner P2 (served 2026-08-23): a starter rebuild is a NEW draft — it
        // replaces the product, the category, every ingredient and the
        // temperature. It used to leave `direction_targets` untouched and never
        // opened a new draft context, so recipe A's Sweetness/Hardness silently
        // rode into the rebuilt recipe: gelato at −2/+2 → switch to Sorbet →
        // an all-new sorbet still carrying −2/+2 on draftContextSeq 19.
        // A rebuilt starter now resolves Direction exactly like `startNewRecipe`
        // does: the account default deliberately configured for the NEW product,
        // otherwise the clean middle.
        const rebuildDefaults = useRecipeProfileStore
          .getState()
          .defaultsFor(productDefaultsKey(key.visibleProductType));
        const rebuildDirection = {
          ...(rebuildDefaults?.directionTargets ?? DEFAULT_DIRECTION_TARGETS),
        };
        const starter = buildCanonicalNewRecipeStarter({
          visibleProductType: key.visibleProductType,
          servingModeId: key.servingModeId,
          formulationStrategy: key.formulationStrategy,
          targetBatchGrams: key.targetBatchGrams,
        });
        const starterMaterialFingerprint = newRecipeStarterMaterialFingerprint({
          items: starter.items,
        });
        set((state) => {
          const preserveHomeMachine =
            state.visibleProductType === starter.visibleProductType &&
            state.machineKind === 'home' &&
            state.target_temperature_c === starter.targetTemperatureC;
          // A starter rebuild is a complete working-recipe replacement. Begin
          // from the same blank aggregate used by New Recipe so no saved
          // identity, historical warning, behavior snapshot, Topping, lock,
          // Apply/Production provenance or old profile metadata can survive a
          // product-family or native-starter transition.
          const base = fromPreset(DEFAULT_PRESET);
          return {
            ...base,
            mode: 'classic',
            formulation_strategy: starter.formulationStrategy,
            category: starter.category,
            visibleProductType: starter.visibleProductType,
            target_temperature_c: starter.targetTemperatureC,
            target_batch_grams: starter.targetBatchGrams,
            items: starter.items,
            baseOrder: starter.items.map((item) => item.id),
            toppings: [],
            productBehaviorSnapshots: {},
            ownerReviewGate: null,
            compositionMigrationAmbiguities: [],
            excludedIngredientIds: [],
            unavailableMainIngredientIds: [],
            activePresetId: null,
            newRecipeStarterTemplateId: starter.templateId,
          starterReservedMainGrams: Math.max(0, starter.metrics.missingMainMassGrams),
            newRecipeStarterKey: {
              visibleProductType: starter.visibleProductType,
              servingModeId: starter.servingModeId,
              formulationStrategy: starter.formulationStrategy,
              targetBatchGrams: starter.targetBatchGrams,
            },
            newRecipeStarterMaterialFingerprint: starterMaterialFingerprint,
            practicalRecipeAudit: null,
            savedProductionFingerprint: null,
            direction_targets: rebuildDirection,
            // Neutral is an intent, not its absence (P1-A).
            direction_targets_active: true,
            ...(preserveHomeMachine
              ? {
                  machineKind: state.machineKind,
                  servingModeId: state.servingModeId,
                  machineId: state.machineId,
                  machineLabel: state.machineLabel,
                  machineTechnology: state.machineTechnology,
                  machine_capacity_grams: state.machine_capacity_grams,
                  machine_capacity_source: state.machine_capacity_source,
                  batch_source: state.batch_source,
                  batchResizeConflict: null,
                }
              : {
                  machineKind: 'professional' as const,
                  servingModeId: starter.servingModeId,
                  machineId: null,
                  machineLabel: null,
                  machineTechnology: null,
                  machine_capacity_grams: null,
                  machine_capacity_source: null,
                  batch_source:
                    state.batch_source === 'PROFESSIONAL_DEFAULT' &&
                    starter.targetBatchGrams === PROFESSIONAL_DEFAULT_BATCH_GRAMS
                      ? ('PROFESSIONAL_DEFAULT' as const)
                      : ('PROFESSIONAL_USER_BATCH' as const),
                  batchResizeConflict: null,
                }),
            dirty: false,
            draftRevision: state.draftRevision + 1,
            // A rebuilt starter is a new draft context, so the Direction
            // regulator rebinds to it instead of staying attached to the
            // recipe that was replaced.
            draftContextSeq: state.draftContextSeq + 1,
          };
        });
        useRecipeProfileStore
          .getState()
          .openDraft(
            useRecipeStore.getState().draftContextSeq,
            rebuildDirection,
            rebuildDefaults?.directionIntents,
          );
        // A confirmed starter rebuild is already materialized and evaluated by
        // the frozen Engine. PI becomes pending only after a subsequent user
        // edit; it is not an initialization step for this fresh scaffold.
        useRecipeProfileStore.getState().acknowledgeRecalculation();
      },
      // OWNER CURRENT-DRAFT P0 (Phase 8) — ONE SHARED MACHINE CONTEXT. The
      // machine selection is now AUTHORITATIVE over the capacity: a
      // PROFESSIONAL selection imposes no Home capacity limit (null), a HOME
      // selection carries the machine's own usable capacity (or null when the
      // catalogue states none). Previously this action left
      // `machine_capacity_grams` untouched, so a stale value could outlive the
      // machine that produced it and fire a capacity warning forever.
      setMachineSelection: (sel) => {
        const state = get();
        const enteringProfessionalFromHome =
          sel.kind === 'professional' && state.machineKind === 'home';
        const reservedMainGrams = activeStarterReservation(state);
        const targetBatchGrams =
          sel.batchGrams ??
          (enteringProfessionalFromHome
            ? PROFESSIONAL_DEFAULT_BATCH_GRAMS
            : state.target_batch_grams);
        const resized =
          sel.batchGrams == null && !enteringProfessionalFromHome
            ? ({ ok: true, items: state.items } as const)
            : resizeRecipeBatch(
                state.items,
                state.target_batch_grams,
                targetBatchGrams,
                undefined,
                undefined,
                reservedMainGrams,
              );
        if (!resized.ok) {
          set({ batchResizeConflict: resized.conflict });
          return { ok: false, conflict: resized.conflict };
        }
        // PC-02 — choosing a machine IS a batch change, and the Ninja CREAMi
        // Deluxe's 670 g is the case that made this reachable. The same
        // canonical projection therefore applies here, and only where a resize
        // actually happened.
        const projectedItems =
          sel.batchGrams == null && !enteringProfessionalFromHome
            ? resized.items
            : rescaleWithOwnerStabilizerSystem(
                state,
                resized.items,
                targetBatchGrams,
                undefined,
                reservedMainGrams,
              );
        const batchSource =
          sel.batchGrams == null
            ? sel.kind === 'professional'
              ? enteringProfessionalFromHome
                ? 'PROFESSIONAL_DEFAULT'
                : state.batch_source
              : state.batch_source
            : (sel.batchSource ??
              (sel.kind === 'professional'
                ? 'PROFESSIONAL_USER_BATCH'
                : sel.machineId?.startsWith('custom-')
                  ? 'CUSTOM_MACHINE_BATCH'
                  : 'MACHINE_DEFAULT'));
        set((current) => ({
          machineKind: sel.kind,
          servingModeId: sel.servingModeId,
          machineId: sel.machineId,
          machineLabel: sel.label,
          machineTechnology:
            sel.kind === 'home'
              ? (sel.machineTechnology ??
                MACHINE_CATALOG.find((profile) => profile.id === sel.machineId)?.technology ??
                null)
              : null,
          // Route to the existing supported cell — no Engine change, just the temperature input.
          target_temperature_c: sel.temperatureC,
          target_batch_grams: targetBatchGrams,
          items: projectedItems,
          starterReservedMainGrams: nextStarterReservation(
            reservedMainGrams,
            projectedItems.reduce((total, item) => total + item.planned_grams, 0),
            targetBatchGrams,
          ),
          batch_source: batchSource,
          batchResizeConflict: null,
          machine_capacity_grams: sel.kind === 'home' ? (sel.capacityGrams ?? null) : null,
          machine_capacity_source:
            sel.kind === 'home' && sel.capacityGrams != null ? 'machine' : null,
          productBehaviorSnapshots: requireProductBehaviorRevalidation(
            current.productBehaviorSnapshots,
          ),
          dirty: true,
          draftRevision: current.draftRevision + 1,
        }));
        useRecipeProfileStore.getState().markRecalculationRequired();
        return { ok: true };
      },
      resetToDemo: () => {
        useIngredientTableUxStore.getState().reset();
        const base = fromPreset(DEFAULT_PRESET);
        const defaults =
          useRecipeProfileStore
            .getState()
            .defaultsFor(productDefaultsKey(base.visibleProductType)) ??
          useRecipeProfileStore.getState().defaultsFor(profileOwnerKey());
        // Same lifecycle rule as `loadRecipeInput`: an account default batch is
        // adopted only together with the Base that realizes it.
        const demoBatch = defaults
          ? resolveProfileBatch(defaults, base.items, base.target_batch_grams)
          : null;
        set((state) => ({
          ...base,
          ...(defaults && demoBatch
            ? {
                ...profileFields(defaults, demoBatch.items, base.category, demoBatch),
                items: demoBatch.items,
                baseOrder: demoBatch.items.map((item) => item.id),
              }
            : {}),
          formulation_strategy: 'optimal',
          draftRevision: state.draftRevision + 1,
          draftContextSeq: state.draftContextSeq + 1,
        }));
        const opened = useRecipeStore.getState();
        useRecipeProfileStore
          .getState()
          .openDraft(
            opened.draftContextSeq,
            defaults?.directionTargets ?? DEFAULT_DIRECTION_TARGETS,
            defaults?.directionIntents,
          );
      },
    }),
    {
      name: 'pinguino-recipe',
      partialize: recipePersistPartialize,
      merge: mergePersistedRecipeState,
    },
  ),
);
