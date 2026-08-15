/**
 * THE ONE canonical recipe-save handler (S2/workbar). Every save entry point — the top workbar's
 * inline name+save, the SaveRecipeDialog AND the customer `/start` Home save — calls THIS hook, so
 * there is a single persistence path (pro-core RecipesRepository: atomic create-with-v1 /
 * DB-derived next-version / rename / archive). Never a second save handler.
 *
 * TWO PAYLOAD SOURCES, ONE HANDLER (Home-save repair): `/pro` saves the recipe-store draft and
 * owns its dirty/version link (the default, unchanged). The customer `/start` shell owns its own
 * engine result and NOT the Pro draft, so it passes an explicit `buildInput` + `target` and
 * `linkStoreDraft: false` — a Home save can therefore never hijack an unrelated Pro draft's
 * aggregate link, and there is still exactly one persistence path.
 *
 * HONEST failure: any backend error is surfaced (kept in `error`) and NEVER a false "saved" — the
 * caller keeps the draft + name + note and can retry; the visible version is not incremented.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CONFIG_VERSION, ENGINE_VERSION, type RecipeInput } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import {
  attachPracticalRecipeAudit,
  attachSavedPracticalRecipeAudit,
  practicalRecipeAuditMatchesInput,
  practicalizeRecipeCandidate,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import {
  ingredientRowMeta,
  useIngredientTableUxStore,
} from '@/features/ingredient-builder/ingredientTableUxStore';
import {
  attachRecipeProfileMetadata,
  profileSnapshotFromState,
} from '@/features/pro-workbench/recipeProfilePersistence';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
} from '@/features/product-intelligence';
import { validateRecipeBehaviorOnServer } from '@/services/productIntelligence';

const TRACE = {
  engineVersion: ENGINE_VERSION,
  configVersion: CONFIG_VERSION,
  mapperDatasetVersion: null,
};

/** The DEFAULT payload source: the Pro recipe-store draft (`/pro` behaviour, unchanged). */
const buildRecipeInputFromStore = (): RecipeInput => {
  const state = useRecipeStore.getState();
  const input = buildRecipeInput(state);
  const withProfile = attachRecipeProfileMetadata(
    input,
    profileSnapshotFromState(
      state,
      state.direction_targets,
      useRecipeProfileStore.getState().directionIntents,
    ),
    Object.fromEntries(
      state.items.flatMap((item) => {
        const metaByLineId = useIngredientTableUxStore.getState().metaByLineId;
        const meta = ingredientRowMeta(metaByLineId, item.id);
        const ownsDose = meta.dose.provenance !== 'NONE';
        return meta.role === 'addition' || meta.required || ownsDose
          ? [[
              item.id,
              {
                role: meta.role,
                required: meta.required,
                ...(ownsDose ? { dose: { ...meta.dose } } : {}),
              },
            ] as const]
          : [];
      }),
    ),
  );
  const last = useConstraintStudioStore.getState().history.at(-1);
  const currentWasApplied =
    last?.practicalization !== undefined &&
    JSON.stringify(last.after.input) === JSON.stringify(input);
  if (currentWasApplied) {
    return attachPracticalRecipeAudit(withProfile, last.practicalization!.exactInput, last!.at);
  }
  return practicalRecipeAuditMatchesInput(input, state.practicalRecipeAudit)
    ? attachSavedPracticalRecipeAudit(withProfile, state.practicalRecipeAudit!)
    : withProfile;
};

export type SaveBlockedReason = 'signin' | 'unavailable' | 'plan' | null;

/** The aggregate a save appends versions to / renames / archives. */
export interface CanonicalSaveTarget {
  recipeId: string;
  title: string;
}

export interface CanonicalRecipeSaveOptions {
  /**
   * Explicit payload builder — the calling surface's OWN recipe. Default: the Pro recipe-store
   * draft through `buildRecipeInput` (the machine-context gate seam), i.e. today's `/pro`
   * behaviour, unchanged.
   */
  buildInput?: () => RecipeInput;
  /**
   * Explicit linked aggregate. `undefined` (default) = the recipe store's link; `null` = this
   * surface has no linked aggregate; an object = save versions into THAT recipe.
   */
  target?: CanonicalSaveTarget | null;
  /**
   * Write the successful save back onto the Pro recipe-store draft link (default true). A surface
   * that does not own that draft passes false.
   */
  linkStoreDraft?: boolean;
}

/**
 * Pure target resolution — pinned by tests so the `/pro` default (the store's linked aggregate)
 * can never silently change when another surface passes its own target.
 */
export function resolveSaveTarget(
  option: CanonicalSaveTarget | null | undefined,
  store: { savedRecipeId: string | null; savedRecipeName: string | null },
): CanonicalSaveTarget | null {
  if (option !== undefined) return option;
  return store.savedRecipeId
    ? { recipeId: store.savedRecipeId, title: store.savedRecipeName ?? '' }
    : null;
}

export interface CanonicalRecipeSave {
  /** Why a save cannot proceed right now (null = OK to save). */
  blocked: SaveBlockedReason;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  /** Pro-only execution gate. Home supplies its own payload and is untouched. */
  practicalBlocked: boolean;
  practicalBlockMessage: string | null;
  /** Create a NEW recipe aggregate + immutable v1 with this name (+ optional first-version note). */
  createNew: (title: string, note?: string) => Promise<boolean>;
  /** Append a new immutable version to the currently-linked recipe (+ optional change note). */
  saveVersion: (note?: string) => Promise<boolean>;
  /** Rename the recipe AGGREGATE (recipe-level metadata) — never creates a content version. */
  rename: (title: string) => Promise<boolean>;
  /** Archive the currently-linked recipe. */
  archive: () => Promise<boolean>;
}

export function useCanonicalRecipeSave(
  options: CanonicalRecipeSaveOptions = {},
): CanonicalRecipeSave {
  const persona = useProCorePersona();
  const caps = recipeCapabilitiesFor(persona);
  const queryClient = useQueryClient();
  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const { repository, unavailable, isLocalDev } = repoState;

  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const authed = useAuthStore((s) => s.status) === 'authed';
  const ownerId = authUserId ?? (isLocalDev ? 'local-dev-user' : '');

  const storeSavedRecipeId = useRecipeStore((s) => s.savedRecipeId);
  const storeSavedRecipeName = useRecipeStore((s) => s.savedRecipeName);
  const markSaved = useRecipeStore((s) => s.markSaved);
  const draftRevision = useRecipeStore((s) => s.draftRevision);
  const constraints = useConstraintStudioStore((s) => s.constraints);

  const linkStoreDraft = options.linkStoreDraft ?? true;
  const buildInput = options.buildInput ?? (() => buildRecipeInputFromStore());
  const target = resolveSaveTarget(options.target, {
    savedRecipeId: storeSavedRecipeId,
    savedRecipeName: storeSavedRecipeName,
  });
  const savedRecipeId = target?.recipeId ?? null;
  const savedRecipeName = target?.title ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const practicalGate = useMemo(() => {
    // Intentional reactive invalidation: the canonical payload itself is read
    // trustlessly from the store so every material draft revision rechecks the gate.
    void draftRevision;
    // Explicit payloads belong to Home/other surfaces. This reconstruction is
    // deliberately Pro-only and must not change their accepted save contract.
    if (options.buildInput !== undefined) return { blocked: false, message: null };
    const input = buildRecipeInputFromStore();
    const state = useRecipeStore.getState();
    const composition = recipeCompositionFromState(state);
    const behaviorGate = productBehaviorModuleGate(
      state.productBehaviorSnapshots,
      'SAVE',
      productBehaviorRequiredLineIds({
        items: state.items,
        toppings: composition.toppings,
      }),
    );
    if (!behaviorGate.ready) {
      return {
        blocked: true,
        message:
          behaviorGate.reason ??
          'Receptura zawiera produkt bez zatwierdzonego uprawnienia do zapisu.',
      };
    }
    const last = useConstraintStudioStore.getState().history.at(-1);
    const currentWasApplied =
      last?.practicalization !== undefined &&
      JSON.stringify(last.after.input) === JSON.stringify(buildRecipeInput(state));
    const restoredVerified = practicalRecipeAuditMatchesInput(
      buildRecipeInput(state),
      state.practicalRecipeAudit,
    );
    if (!currentWasApplied && !restoredVerified) {
      return {
        blocked: true,
        message: 'Przed zapisem otwórz Preview i zastosuj zweryfikowaną recepturę wykonawczą.',
      };
    }
    const result = practicalizeRecipeCandidate(input, constraints);
    if (!result.ok) return { blocked: true, message: result.messagePl };
    const exactAsWritten = JSON.stringify(result.audit.executableInput) === JSON.stringify(input);
    return exactAsWritten
      ? { blocked: false, message: null }
      : {
          blocked: true,
          message:
            'Przed zapisem otwórz Preview i zastosuj zweryfikowaną recepturę w pełnych gramach.',
        };
  }, [constraints, draftRevision, options.buildInput]);

  const blocked: SaveBlockedReason = !authed
    ? 'signin'
    : unavailable || repository === null
      ? 'unavailable'
      : !caps.canSaveRecipe
        ? 'plan'
        : null;

  const invalidate = async (recipeId: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pro-core-recipes', ownerId] }),
      queryClient.invalidateQueries({ queryKey: ['saved-recipes'] }),
      recipeId
        ? queryClient.invalidateQueries({ queryKey: ['pro-core-recipe-versions', recipeId] })
        : Promise.resolve(),
    ]);
  };

  const validateCurrentBehavior = async (
    recipeInput: RecipeInput,
    productComposition: ReturnType<typeof recipeCompositionFromState> | null,
  ) => {
    // Explicit payloads belong to Home/other accepted surfaces and do not own
    // the Pro recipe behavior snapshot map.
    if (options.buildInput !== undefined) return;
    const state = useRecipeStore.getState();
    const validation = await validateRecipeBehaviorOnServer({
      recipe: recipeInput,
      toppings: productComposition?.toppings ?? [],
      snapshots: state.productBehaviorSnapshots,
      module: 'SAVE',
      accountId: authUserId,
    });
    if (!validation.ready) {
      throw new Error(
        `Zapis zablokowany: klasyfikacja produktu wymaga ponownego przeliczenia (${validation.staleLineIds.join(', ')}).`,
      );
    }
  };

  const run = async (
    fn: () => Promise<string | null>,
    requirePracticalRecipe = false,
  ): Promise<boolean> => {
    if (blocked !== null || !repository) return false;
    if (requirePracticalRecipe && practicalGate.blocked) {
      setError(practicalGate.message);
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const linkedId = await fn();
      await invalidate(linkedId);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się zapisać.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    blocked,
    busy,
    error,
    clearError: () => setError(null),
    practicalBlocked: practicalGate.blocked,
    practicalBlockMessage: practicalGate.message,
    createNew: (title, note) =>
      run(async () => {
        const recipeInput = buildInput();
        const productComposition =
          options.buildInput === undefined
            ? recipeCompositionFromState(useRecipeStore.getState())
            : null;
        await validateCurrentBehavior(recipeInput, productComposition);
        const { recipe, version } = await repository!.createRecipe({
          ownerUserId: ownerId,
          title: title.trim(),
          notes: note?.trim() || null,
          recipeInput,
          productComposition,
          trace: TRACE,
          source: 'manual',
          by: ownerId,
          capabilities: caps,
        });
        if (linkStoreDraft) {
          markSaved(
            recipe.recipeId,
            recipe.title,
            version.versionNumber,
            version.createdAt,
            readPracticalRecipeAudit(recipeInput),
          );
        }
        return recipe.recipeId;
      }, true),
    saveVersion: (note) =>
      run(async () => {
        if (!savedRecipeId) throw new Error('Brak powiązanej receptury.');
        const recipeInput = buildInput();
        const productComposition =
          options.buildInput === undefined
            ? recipeCompositionFromState(useRecipeStore.getState())
            : null;
        await validateCurrentBehavior(recipeInput, productComposition);
        const version = await repository!.saveNewVersion(
          savedRecipeId,
          recipeInput,
          TRACE,
          ownerId,
          {
            note: note?.trim() || undefined,
          },
          productComposition,
        );
        if (linkStoreDraft) {
          markSaved(
            savedRecipeId,
            useRecipeStore.getState().savedRecipeName ?? savedRecipeName ?? '',
            version.versionNumber,
            version.createdAt,
            readPracticalRecipeAudit(recipeInput),
          );
        }
        return savedRecipeId;
      }, true),
    rename: (title) =>
      run(async () => {
        if (!savedRecipeId) throw new Error('Brak powiązanej receptury.');
        const recipe = await repository!.renameRecipe(savedRecipeId, title.trim());
        // Rename is recipe-level metadata ONLY — update the name; never touch dirty/version
        // (unsaved content changes must survive a rename, and a rename is not a content version).
        if (linkStoreDraft) useRecipeStore.setState({ savedRecipeName: recipe.title });
        return savedRecipeId;
      }),
    archive: () =>
      run(async () => {
        if (!savedRecipeId) throw new Error('Brak powiązanej receptury.');
        await repository!.archiveRecipe(savedRecipeId, true);
        return savedRecipeId;
      }),
  };
}
