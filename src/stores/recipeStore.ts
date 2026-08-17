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
  DEFAULT_DIRECTION_TARGETS,
  type ProfileSettingsSnapshot,
  useRecipeProfileStore,
} from '@/features/pro-workbench/recipeProfileStore';
import { PROTEIN_GELATO_TARGET } from '@/spine';
import {
  normalizeFormulationStrategy,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';
import {
  readPracticalRecipeAudit,
  type PracticalRecipeSavedAudit,
} from '@/features/practical-recipe/practicalRecipe';
import {
  readRecipeCompositionMetadata,
  type OwnerReviewRecipeGate,
  type RecipeCompositionMetadata,
  type RecipeToppingItem,
  type RecipeToppingIngredient,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  buildCanonicalNewRecipeStarter,
  DEFAULT_NEW_RECIPE_PROFILE,
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
  productBehaviorRequiredLineIds,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';

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
type CostPriority = NonNullable<RecipeGoals['cost_priority']>;
const normalizeProteinTarget = (value: number): number => {
  const finite = Number.isFinite(value) ? value : PROTEIN_GELATO_TARGET.defaultPercent;
  return (
    Math.round(Math.max(0, finite) / PROTEIN_GELATO_TARGET.inputStepPercent) *
    PROTEIN_GELATO_TARGET.inputStepPercent
  );
};

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
  target_protein_percent: number;
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
  /** Unsaved-changes flag: true after any edit, false after a load or a successful save. */
  dirty: boolean;
  /** Verified whole-gram provenance restored from a saved recipe/version. It
   * never grants Apply consent; every consumer matches its material fingerprint. */
  practicalRecipeAudit: PracticalRecipeSavedAudit | null;
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
  ) => void;
  setMachineCapacity: (grams: number | null) => void;
  setFlavorIntensity: (value: FlavorIntensity) => void;
  setCostPriority: (value: CostPriority) => void;
  setTargetProteinPercent: (value: number) => void;
  moveDirectionTarget: (axis: keyof RecipeDirectionTargets, delta: -1 | 1) => void;
  setDirectionTarget: (axis: keyof RecipeDirectionTargets, target: -1 | 0 | 1) => void;

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
    options?: { acknowledgeRecalculation?: boolean },
  ) =>
    | { ok: true }
    | { ok: false; code: 'invalid_line'; lineName: string }
    | { ok: false; code: 'duplicate_ingredient'; canonicalIds: string[] }
    | { ok: false; code: 'batch_mismatch'; sum: number; target: number }
    | { ok: false; code: 'write_verification_failed' };
  addIngredient: (ingredient: EngineIngredient, grams?: number) => void;
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
      versionDate?: string | null;
      composition?: RecipeCompositionMetadata | null;
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
  ) => void;
  /** Select a Pro machine/serving mode (S4): sets the routing temperature + context + optional batch. */
  setMachineSelection: (sel: {
    kind: 'professional' | 'home';
    servingModeId: string;
    machineId: string | null;
    label: string;
    temperatureC: number;
    batchGrams?: number | null;
    /** Home machines only: the machine's real usable capacity in grams. */
    capacityGrams?: number | null;
  }) => void;
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

/** Apply every durable percentage share to a new positive batch. Legacy
 * `lock_type: percent` rows without the sidecar still scale by their current
 * share while the previous batch is known. Physical actuals are immutable. */
const resizePercentLockedItems = (
  items: readonly RecipeItem[],
  previousBatchGrams: number,
  nextBatchGrams: number,
  percentByLineId?: Readonly<Record<string, number>>,
): RecipeItem[] => {
  if (!Number.isFinite(nextBatchGrams) || nextBatchGrams <= 0) return [...items];
  const previousBatchKnown = Number.isFinite(previousBatchGrams) && previousBatchGrams > 0;
  const ratio = previousBatchKnown ? nextBatchGrams / previousBatchGrams : 1;
  return items.map((item) => {
    if (item.actual_grams !== null) return item;
    const canonicalPercent = percentByLineId?.[item.id] ?? item.percent_constraint?.percent;
    if (
      canonicalPercent !== undefined &&
      Number.isFinite(canonicalPercent) &&
      canonicalPercent >= 0 &&
      canonicalPercent <= 100
    ) {
      return {
        ...item,
        planned_grams: (nextBatchGrams * canonicalPercent) / 100,
      };
    }
    return item.lock_type === 'percent' && previousBatchKnown
      ? { ...item, planned_grams: item.planned_grams * ratio }
      : item;
  });
};

/** Snapshot of a preset as fresh store state (items cloned so edits never touch preset data). */
const fromPreset = (preset: DemoPreset) => ({
  mode: 'classic' as const,
  formulation_strategy: normalizeFormulationStrategy(preset.mode),
  category: preset.category,
  visibleProductType: visibleTypeOf(preset.category),
  target_temperature_c: preset.target_temperature_c,
  target_batch_grams: preset.target_batch_grams,
  machine_capacity_grams: preset.machine_capacity_grams,
  machine_capacity_source: (preset.machine_capacity_grams === null ? null : 'manual') as
    'machine' | 'manual' | null,
  flavor_intensity: preset.flavor_intensity,
  cost_priority: preset.cost_priority,
  target_protein_percent: PROTEIN_GELATO_TARGET.defaultPercent,
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
  activePresetId: preset.id,
  newRecipeStarterTemplateId: null,
  newRecipeStarterKey: null,
  newRecipeStarterMaterialFingerprint: null,
  savedRecipeId: null,
  savedRecipeName: null,
  currentVersionNumber: null,
  currentVersionDate: null,
  machineKind: null,
  servingModeId: null,
  machineId: null,
  machineLabel: null,
  dirty: false,
  practicalRecipeAudit: null,
});

const profileOwnerKey = (): string => useAuthStore.getState().user?.id ?? 'local-device';
const productDefaultsKey = (visible: VisibleProductType): string =>
  `${profileOwnerKey()}:${visible}`;

const profileFields = (
  profile: ProfileSettingsSnapshot,
  items: RecipeItem[],
  currentCategory: ProductCategory,
) => ({
  mode: 'classic' as const,
  formulation_strategy: normalizeFormulationStrategy(profile.formulationStrategy),
  visibleProductType: profile.visibleProductType,
  category: internalCategoryFor(profile.visibleProductType, items, currentCategory),
  target_temperature_c: profile.targetTemperatureC,
  target_batch_grams: profile.targetBatchGrams,
  machine_capacity_grams: profile.machineKind === 'home' ? profile.machineCapacityGrams : null,
  machine_capacity_source: (profile.machineKind === 'home' && profile.machineCapacityGrams !== null
    ? 'machine'
    : null) as 'machine' | null,
  machineKind: profile.machineKind,
  servingModeId: profile.servingModeId,
  machineId: profile.machineId,
  machineLabel: profile.machineLabel,
  direction_targets: { ...profile.directionTargets },
  direction_targets_active: Object.values(profile.directionTargets).some((target) => target !== 0),
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
    machine_capacity_grams: state.machine_capacity_grams,
    machine_capacity_source: state.machine_capacity_source,
    flavor_intensity: state.flavor_intensity,
    cost_priority: state.cost_priority,
    target_protein_percent: state.target_protein_percent,
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
    savedRecipeId: state.savedRecipeId,
    savedRecipeName: state.savedRecipeName,
    currentVersionNumber: state.currentVersionNumber,
    currentVersionDate: state.currentVersionDate,
    machineKind: state.machineKind,
    servingModeId: state.servingModeId,
    machineId: state.machineId,
    machineLabel: state.machineLabel,
    dirty: state.dirty,
    practicalRecipeAudit: state.practicalRecipeAudit,
    draftContextSeq: state.draftContextSeq,
  };
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set) => ({
      ...fromPreset(DEFAULT_PRESET),
      excludedIngredientIds: [],
      unavailableMainIngredientIds: [],
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
        set((state) => ({
          visibleProductType: visible,
          // The internal Engine policy DERIVES from the visible type + real ingredients;
          // 'protein' is honest-unsupported and keeps the previous category untouched.
          category: internalCategoryFor(visible, state.items, state.category),
          productBehaviorSnapshots: requireProductBehaviorRevalidation(
            state.productBehaviorSnapshots,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      setServingMode: (servingModeId, temperatureC) =>
        set((state) => ({
          servingModeId,
          target_temperature_c: temperatureC,
          // A manual serving-mode choice keeps a professional machine route but clears a Home
          // route (a Home machine's mode is fixed by the machine — owner P0 route integrity).
          ...(state.machineKind === 'home'
            ? { machineKind: null, machineId: null, machineLabel: null }
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
      setBatchGrams: (target_batch_grams, percentByLineId) =>
        set((state) => {
          return {
            target_batch_grams,
            // A percentage lock is a share of the FINAL batch, not a delayed solver hint.
            // Keep its visible grams coherent at the same moment the user resizes the batch.
            // Physical actuals are never rewritten by this planning control.
            items: resizePercentLockedItems(
              state.items,
              state.target_batch_grams,
              target_batch_grams,
              percentByLineId,
            ),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
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
      setTargetProteinPercent: (value) =>
        set((state) => ({
          target_protein_percent: normalizeProteinTarget(value),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      moveDirectionTarget: (axis, delta) =>
        set((state) => {
          const current = state.direction_targets[axis];
          const next = Math.max(-1, Math.min(1, current + delta)) as RecipeDirectionTarget;
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
            grams < 0 ||
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
          ? Object.fromEntries(Object.entries(productBehaviorSnapshots).map(([lineId, snapshot]) => [
              lineId,
              preserveOwnerReviewGate(prior.ownerReviewGate, snapshot),
            ]))
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
          (hasActuals || Math.abs(writtenSum - input.target_batch_grams) <= 0.1);
        if (!intact) {
          // Rollback is itself a material write — the revision stays monotonic.
          set((state) => ({
            items: priorItems,
            baseOrder: priorBaseOrder,
            toppings: priorToppings,
            productBehaviorSnapshots: priorProductBehaviorSnapshots,
            compositionMigrationAmbiguities: priorMigrationAmbiguities,
            target_batch_grams: priorBatch,
            draftRevision: state.draftRevision + 1,
          }));
          return { ok: false, code: 'write_verification_failed' };
        }
        if (options?.acknowledgeRecalculation === false) {
          useRecipeProfileStore.getState().markRecalculationRequired();
        } else {
          useRecipeProfileStore.getState().acknowledgeRecalculation();
        }
        return { ok: true };
      },

      addIngredient: (ingredient, grams = 100) =>
        set((state) => {
          const canonicalId = canonicalIngredientId(ingredient);
          const restoresUnavailableMain = state.unavailableMainIngredientIds.some(
            (id) => canonicalIngredientIdFromSourceId(id) === canonicalId,
          );
          const existingIndex = state.items.findIndex(
            (item) => canonicalIngredientId(item.ingredient) === canonicalId,
          );
          const normalizedIngredient = normalizeIngredientIdentity(ingredient);
          const items =
            existingIndex >= 0
              ? state.items.map((item, index) =>
                  index === existingIndex ? { ...item, ingredient: normalizedIngredient } : item,
                )
              : [
                  ...state.items,
                  {
                    ...makeLine(normalizedIngredient, grams),
                    lock_type: restoresUnavailableMain ? ('main' as const) : ('unlocked' as const),
                  },
                ];
          const orderedItems = sortedBaseItems(items);
          return {
            items: orderedItems,
            baseOrder:
              existingIndex >= 0
                ? state.baseOrder
                : [
                    ...state.baseOrder.filter((id) => orderedItems.some((item) => item.id === id)),
                    orderedItems.at(-1)!.id,
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
        }),

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
          }
          else delete next[lineId];
          return {
            productBehaviorSnapshots: next,
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
          return {
            productBehaviorSnapshots: Object.fromEntries(
              entries.map(([lineId, snapshot]) => [
                lineId,
                preserveOwnerReviewGate(state.ownerReviewGate, snapshot),
              ]),
            ),
          };
        }),

      removeItem: (lineId) =>
        set((state) => {
          const items = state.items.filter((item) => item.id !== lineId);
          if (items.length === state.items.length) return {}; // unknown line — no-op
          return {
            items,
            baseOrder: state.baseOrder.filter((id) => items.some((item) => item.id === id)),
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
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId ? { ...item, planned_grams: Math.max(0, grams) } : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
      setDirectionTarget: (axis, target) =>
        set((state) => {
          if (state.direction_targets[axis] === target) return {};
          return {
            direction_targets: { ...state.direction_targets, [axis]: target },
            direction_targets_active:
              target !== 0 ||
              Object.entries(state.direction_targets).some(
                ([key, value]) => key !== axis && value !== 0,
              ),
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
          return {
            items: state.items.map((item) => {
              const grams = gramsByLineId[item.id];
              return grams !== undefined && Number.isFinite(grams)
                ? { ...item, planned_grams: Math.max(0, grams) }
                : item;
            }),
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
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId
              ? (() => {
                  const withoutRange = { ...item };
                  delete withoutRange.range_constraint;
                  delete withoutRange.percent_constraint;
                  delete withoutRange.grams_constraint;
                  if (lockType !== 'main') delete withoutRange.main_ratio_weight;
                  return { ...withoutRange, lock_type: lockType };
                })()
              : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),

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
          const snapshotRequired = productBehaviorRequiredLineIds({ items: state.items }).includes(
            lineId,
          );
          if (mainBehaviorBlockReason(state.productBehaviorSnapshots[lineId], snapshotRequired))
            return {};
          return {
            items: state.items.map((item) =>
              item.id === lineId ? { ...item, lock_type: 'main' } : item,
            ),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),

      setStandardIngredient: (lineId) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== lineId || item.lock_type !== 'main') return item;
            const next = { ...item };
            delete next.main_ratio_weight;
            return {
              ...next,
              lock_type: item.range_constraint || item.grams_constraint
                ? ('grams' as const)
                : item.percent_constraint
                  ? ('percent' as const)
                  : ('unlocked' as const),
            };
          }),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),

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
        const profile = metadata ?? defaults;
        const normalizedItems = input.items.map((item) => {
          const normalized = normalizeRecipeItemIdentity({ ...item });
          return normalized.lock_type === 'grams' && normalized.planned_grams === 0
            ? { ...normalized, lock_type: 'unlocked' as const }
            : normalized;
        });
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
        set((state) => ({
          draftRevision: state.draftRevision + 1,
          draftContextSeq: state.draftContextSeq + 1,
          ...(profile
            ? profileFields(profile, normalizedItems, input.category)
            : {
                mode: 'classic' as const,
                category: input.category,
                visibleProductType: visibleTypeOf(input.category),
                target_temperature_c: input.target_temperature_c,
                target_batch_grams: input.target_batch_grams,
                machine_capacity_grams: input.machine_capacity_grams,
                machine_capacity_source:
                  input.machine_capacity_grams === null ? null : ('manual' as const),
                machineKind: null,
                servingModeId: null,
                machineId: null,
                machineLabel: null,
              }),
          formulation_strategy: normalizeFormulationStrategy(
            profile?.formulationStrategy ?? input.goals?.formulation_strategy ?? input.mode,
          ),
          flavor_intensity: input.goals?.flavor_intensity ?? 'balanced',
          cost_priority: input.goals?.cost_priority ?? 'balanced',
          target_protein_percent: normalizeProteinTarget(
            input.goals?.target_protein_percent ?? PROTEIN_GELATO_TARGET.defaultPercent,
          ),
          direction_targets: {
            ...(profile?.directionTargets ??
              input.goals?.direction_targets ??
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
          items: normalizedItems,
          baseOrder: orderedBaseItems(
            normalizedItems,
            compositionMetadata?.baseOrder ?? normalizedItems.map((item) => item.id),
          ).map((item) => item.id),
          toppings: sortedToppings(loadedToppings),
          productBehaviorSnapshots: structuredClone(compositionMetadata?.behaviorSnapshots ?? {}),
          ownerReviewGate: compositionMetadata?.ownerReviewGate
            ? structuredClone(compositionMetadata.ownerReviewGate)
            : null,
          compositionMigrationAmbiguities: migrationAmbiguities,
          excludedIngredientIds: [...(input.goals?.excluded_ingredient_ids ?? [])],
          unavailableMainIngredientIds: [...(input.goals?.unavailable_main_ingredient_ids ?? [])],
          activePresetId: null,
          newRecipeStarterTemplateId: null,
          newRecipeStarterKey: null,
          newRecipeStarterMaterialFingerprint: null,
          savedRecipeId: link.savedId ?? null,
          savedRecipeName: link.savedName ?? null,
          currentVersionNumber: link.versionNumber ?? null,
          currentVersionDate: link.versionDate ?? null,
          dirty: false,
          practicalRecipeAudit,
        }));
        const opened = useRecipeStore.getState();
        useIngredientTableUxStore.getState().hydrateRecipeMeta(profile?.ingredientUxByLineId ?? {});
        useRecipeProfileStore
          .getState()
          .openDraft(opened.draftContextSeq, opened.direction_targets, profile?.directionIntents);
      },
      markSaved: (id, name, versionNumber, versionDate = null, practicalRecipeAudit) =>
        set({
          savedRecipeId: id,
          savedRecipeName: name,
          currentVersionNumber: versionNumber,
          currentVersionDate: versionDate,
          dirty: false,
          newRecipeStarterTemplateId: null,
          newRecipeStarterKey: null,
          newRecipeStarterMaterialFingerprint: null,
          ...(practicalRecipeAudit === undefined ? {} : { practicalRecipeAudit }),
        }),
      startNewRecipe: (requestedVisible) => {
        useIngredientTableUxStore.getState().reset();
        // The legacy owner-level snapshot is the only current account-default
        // source that can designate a preferred product profile. Never infer
        // that profile from whichever unrelated recipe happens to be open.
        const legacyDefaults = useRecipeProfileStore.getState().defaultsFor(profileOwnerKey());
        const visible =
          requestedVisible ?? legacyDefaults?.visibleProductType ?? DEFAULT_NEW_RECIPE_PROFILE;
        const specificDefaults = useRecipeProfileStore
          .getState()
          .defaultsFor(productDefaultsKey(visible));
        const defaults =
          specificDefaults ??
          (legacyDefaults?.visibleProductType === visible ? legacyDefaults : null);
        const formulationStrategy = normalizeFormulationStrategy(
          defaults?.formulationStrategy ?? 'optimal',
        );
        const starterServingMode = isNewRecipeServingModeId(defaults?.servingModeId)
          ? defaults.servingModeId
          : starterServingModeForTemperature(defaults?.targetTemperatureC);
        const starter = buildCanonicalNewRecipeStarter({
          visibleProductType: visible,
          servingModeId: starterServingMode,
          formulationStrategy,
          targetBatchGrams: defaults?.targetBatchGrams,
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
          machine_capacity_grams:
            defaults?.machineKind === 'home' ? defaults.machineCapacityGrams : null,
          machine_capacity_source:
            defaults?.machineKind === 'home' && defaults.machineCapacityGrams !== null
              ? 'machine'
              : null,
          direction_targets: {
            ...(defaults?.directionTargets ?? DEFAULT_DIRECTION_TARGETS),
          },
          direction_targets_active: Object.values(defaults?.directionTargets ?? {}).some(
            (target) => target !== 0,
          ),
          items: starter.items,
          baseOrder: starter.items.map((item) => item.id),
          activePresetId: null,
          newRecipeStarterTemplateId: starter.templateId,
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
            state.machineKind === 'home' &&
            state.target_temperature_c === starter.targetTemperatureC;
          return {
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
            newRecipeStarterKey: {
              visibleProductType: starter.visibleProductType,
              servingModeId: starter.servingModeId,
              formulationStrategy: starter.formulationStrategy,
              targetBatchGrams: starter.targetBatchGrams,
            },
            newRecipeStarterMaterialFingerprint: starterMaterialFingerprint,
            practicalRecipeAudit: null,
            ...(preserveHomeMachine
              ? {}
              : {
                  machineKind: 'professional' as const,
                  servingModeId: starter.servingModeId,
                  machineId: null,
                  machineLabel: null,
                  machine_capacity_grams: null,
                  machine_capacity_source: null,
                }),
            dirty: false,
            draftRevision: state.draftRevision + 1,
          };
        });
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
      setMachineSelection: (sel) =>
        set((state) => {
          const targetBatchGrams =
            sel.batchGrams != null ? sel.batchGrams : state.target_batch_grams;
          return {
            machineKind: sel.kind,
            servingModeId: sel.servingModeId,
            machineId: sel.machineId,
            machineLabel: sel.label,
            // Route to the existing supported cell — no Engine change, just the temperature input.
            target_temperature_c: sel.temperatureC,
            target_batch_grams: targetBatchGrams,
            items:
              sel.batchGrams != null
                ? resizePercentLockedItems(state.items, state.target_batch_grams, targetBatchGrams)
                : state.items,
            machine_capacity_grams: sel.kind === 'home' ? (sel.capacityGrams ?? null) : null,
            machine_capacity_source:
              sel.kind === 'home' && sel.capacityGrams != null ? 'machine' : null,
            productBehaviorSnapshots: requireProductBehaviorRevalidation(
              state.productBehaviorSnapshots,
            ),
            dirty: true,
            draftRevision: state.draftRevision + 1,
          };
        }),
      resetToDemo: () => {
        useIngredientTableUxStore.getState().reset();
        const base = fromPreset(DEFAULT_PRESET);
        const defaults =
          useRecipeProfileStore
            .getState()
            .defaultsFor(productDefaultsKey(base.visibleProductType)) ??
          useRecipeProfileStore.getState().defaultsFor(profileOwnerKey());
        set((state) => ({
          ...base,
          ...(defaults ? profileFields(defaults, base.items, base.category) : {}),
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
    { name: 'pinguino-recipe', partialize: recipePersistPartialize },
  ),
);
