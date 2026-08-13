import { useEffect, useMemo, useState } from 'react';
import { calculateRecipe, proposeCorrections } from '@/engine';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore, type RecipeState } from '@/stores/recipeStore';
import { buildRecipeInput, recipeContext } from '@/features/studio/buildRecipeInput';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { assessProductionRescue } from './productionRescue';
import {
  buildProductionForecastInput,
  productionProgress,
  toppingProductionProgress,
} from './productionSession';
import { useProductionSessionStore } from './productionSessionStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import {
  applyEffectiveCustomerPrices,
  applyEffectiveCustomerPricesToToppings,
} from '@/features/pro-core/effectiveRecipePricing';
import {
  practicalRecipeAuditMatchesInput,
  practicalizeRecipeCandidate,
} from '@/features/practical-recipe/practicalRecipe';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
} from '@/features/product-intelligence';
import { validateRecipeBehaviorOnServer } from '@/services/productIntelligence';

const newSessionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `production-${Date.now().toString(36)}`;

export const productionSourceForRecipe = (
  recipe: Pick<RecipeState, 'dirty' | 'savedRecipeId' | 'savedRecipeName' | 'currentVersionNumber'>,
) => ({
  recipeId: recipe.savedRecipeId,
  recipeVersionId:
    !recipe.dirty && recipe.savedRecipeId && recipe.currentVersionNumber
      ? `${recipe.savedRecipeId}:v${recipe.currentVersionNumber}`
      : null,
  recipeVersionNumber: recipe.dirty ? null : recipe.currentVersionNumber,
  recipeName: recipe.savedRecipeName?.trim() || 'Bieżąca receptura',
});

export function useProductionWorkspace(enabled: boolean) {
  const recipe = useRecipeStore();
  const ownerUserId = useAuthStore((state) =>
    state.status === 'authed' ? (state.user?.id ?? null) : null,
  );
  const session = useProductionSessionStore((state) => state.session);
  const ensureSession = useProductionSessionStore((state) => state.ensureSession);
  const setDraftActual = useProductionSessionStore((state) => state.setDraftActual);
  const confirmLine = useProductionSessionStore((state) => state.confirmLine);
  const reopenRecord = useProductionSessionStore((state) => state.reopenRecord);
  const applyVerifiedRescue = useProductionSessionStore((state) => state.applyVerifiedRescue);
  const complete = useProductionSessionStore((state) => state.complete);
  const startNewSession = useProductionSessionStore((state) => state.startNewSession);
  const constraints = useConstraintStudioStore((state) => state.constraints);
  const lastApplied = useConstraintStudioStore((state) => state.history.at(-1));
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  const [behaviorServerGate, setBehaviorServerGate] = useState<{
    key: string | null;
    ready: boolean;
    message: string | null;
  }>({ key: null, ready: false, message: null });

  const plannedInput = useMemo(
    () => applyEffectiveCustomerPrices(buildRecipeInput(recipe, 'planning'), customerPrices),
    [customerPrices, recipe],
  );
  const plannedComposition = useMemo(
    () =>
      recipeCompositionFromState({
        ...recipe,
        toppings: applyEffectiveCustomerPricesToToppings(recipe.toppings, customerPrices),
      }),
    [customerPrices, recipe],
  );

  const practicalGate = useMemo(() => {
    const behaviorGate = productBehaviorModuleGate(
      recipe.productBehaviorSnapshots,
      'PRODUCTION',
      productBehaviorRequiredLineIds({
        items: recipe.items,
        toppings: recipe.toppings,
      }),
    );
    if (!behaviorGate.ready) {
      return {
        ready: false,
        message:
          behaviorGate.reason ??
          'Receptura zawiera produkt bez zatwierdzonego uprawnienia do Produkcji.',
      };
    }
    const currentWasApplied =
      lastApplied?.practicalization !== undefined &&
      JSON.stringify(lastApplied.after.input) === JSON.stringify(plannedInput);
    const restoredVerified = practicalRecipeAuditMatchesInput(
      plannedInput,
      recipe.practicalRecipeAudit,
    );
    if (!currentWasApplied && !restoredVerified) {
      return {
        ready: false,
        message:
          'Zastosuj najpierw zweryfikowane Preview receptury wykonawczej. Produkcja nie uruchamia niezweryfikowanego szkicu.',
      };
    }
    const result = practicalizeRecipeCandidate(plannedInput, constraints);
    if (!result.ok) return { ready: false, message: result.messagePl };
    return JSON.stringify(result.audit.executableInput) === JSON.stringify(plannedInput)
      ? { ready: true, message: null }
      : {
          ready: false,
          message:
            'Zastosuj najpierw zweryfikowane Preview w pełnych gramach. Produkcja nie uruchomi ułamkowego szkicu.',
        };
  }, [
    constraints,
    lastApplied,
    plannedInput,
    recipe.items,
    recipe.practicalRecipeAudit,
    recipe.productBehaviorSnapshots,
    recipe.toppings,
  ]);

  const source = useMemo(() => productionSourceForRecipe(recipe), [recipe]);
  const requiredBehaviorLineIds = useMemo(
    () => productBehaviorRequiredLineIds({
      items: plannedInput.items,
      toppings: plannedComposition.toppings,
    }),
    [plannedComposition.toppings, plannedInput.items],
  );
  const behaviorValidationKey = useMemo(
    () => JSON.stringify({
      ownerUserId,
      recipe: plannedInput,
      toppings: plannedComposition.toppings,
      snapshots: plannedComposition.behaviorSnapshots ?? {},
    }),
    [ownerUserId, plannedComposition, plannedInput],
  );
  const behaviorServerReady = requiredBehaviorLineIds.length === 0 || (
    behaviorServerGate.key === behaviorValidationKey && behaviorServerGate.ready
  );
  const behaviorServerMessage = behaviorServerGate.key === behaviorValidationKey
    ? behaviorServerGate.message
    : null;

  useEffect(() => {
    if (!enabled || !practicalGate.ready || plannedInput.items.length === 0) return;
    let cancelled = false;
    const validationPromise = requiredBehaviorLineIds.length === 0
      ? Promise.resolve({ ready: true, staleLineIds: [] as string[] })
      : validateRecipeBehaviorOnServer({
          recipe: plannedInput,
          toppings: plannedComposition.toppings,
          snapshots: plannedComposition.behaviorSnapshots ?? {},
          module: 'PRODUCTION',
          accountId: ownerUserId,
        });
    void validationPromise.then((validation) => {
      if (cancelled) return;
      if (!validation.ready) {
        setBehaviorServerGate({
          key: behaviorValidationKey,
          ready: false,
          message: `Produkcja zablokowana: klasyfikacja produktu wymaga ponownego przeliczenia (${validation.staleLineIds.join(', ')}).`,
        });
        return;
      }
      setBehaviorServerGate({ key: behaviorValidationKey, ready: true, message: null });
      ensureSession({
        ownerUserId,
        source,
        plannedInput,
        plannedComposition,
        now: new Date().toISOString(),
        sessionId: newSessionId(),
      });
    }).catch(() => {
      if (!cancelled) {
        setBehaviorServerGate({
          key: behaviorValidationKey,
          ready: false,
          message: 'Produkcja zablokowana: nie udało się potwierdzić aktualnej klasyfikacji produktu.',
        });
      }
    });
    return () => { cancelled = true; };
  }, [
    behaviorValidationKey,
    enabled,
    ensureSession,
    ownerUserId,
    plannedComposition,
    plannedInput,
    practicalGate.ready,
    requiredBehaviorLineIds.length,
    source,
  ]);

  const forecastInput = useMemo(
    () => (session ? buildProductionForecastInput(session) : plannedInput),
    [plannedInput, session],
  );
  const forecastResult = useMemo(() => calculateRecipe(forecastInput), [forecastInput]);
  const rescue = useMemo(
    () => (session?.status === 'in_progress' ? assessProductionRescue(session) : null),
    [session],
  );
  const progress = useMemo(() => (session ? productionProgress(session) : null), [session]);
  const toppingProgress = useMemo(
    () => (session ? toppingProductionProgress(session) : null),
    [session],
  );
  const score = monitorScoreView(forecastResult, forecastInput).match;
  const corrections = useMemo(
    () =>
      proposeCorrections({
        input: forecastInput,
        context: recipeContext(forecastInput),
        redact: false,
      }),
    [forecastInput],
  );

  return {
    session,
    source,
    plannedInput,
    forecastInput,
    forecastResult,
    rescue,
    progress,
    toppingProgress,
    score,
    corrections,
    practicalReady: practicalGate.ready && behaviorServerReady,
    practicalBlockMessage: practicalGate.message ?? behaviorServerMessage,
    setDraftActual,
    confirmLine: (lineId: string) => confirmLine(lineId, new Date().toISOString()),
    reopenRecord,
    applyVerifiedRescue: async (candidate: typeof plannedInput) => {
      const validation = await validateRecipeBehaviorOnServer({
        recipe: candidate,
        toppings: plannedComposition.toppings,
        snapshots: plannedComposition.behaviorSnapshots ?? {},
        module: 'BATCH_RESCUE',
        accountId: ownerUserId,
      });
      if (!validation.ready) {
        setBehaviorServerGate({
          key: behaviorValidationKey,
          ready: false,
          message: `Ratowanie partii zablokowane: klasyfikacja produktu wymaga ponownego przeliczenia (${validation.staleLineIds.join(', ')}).`,
        });
        return;
      }
      applyVerifiedRescue(candidate);
    },
    complete: () => complete(new Date().toISOString(), ownerUserId),
    startNewSession: async () => {
      if (requiredBehaviorLineIds.length > 0) {
        const validation = await validateRecipeBehaviorOnServer({
          recipe: plannedInput,
          toppings: plannedComposition.toppings,
          snapshots: plannedComposition.behaviorSnapshots ?? {},
          module: 'PRODUCTION',
          accountId: ownerUserId,
        });
        if (!validation.ready) {
          setBehaviorServerGate({
            key: behaviorValidationKey,
            ready: false,
            message: `Produkcja zablokowana: klasyfikacja produktu wymaga ponownego przeliczenia (${validation.staleLineIds.join(', ')}).`,
          });
          return;
        }
      }
      startNewSession({
        ownerUserId,
        source,
        plannedInput,
        plannedComposition,
        now: new Date().toISOString(),
        sessionId: newSessionId(),
      });
    },
  };
}

export type ProductionWorkspaceView = ReturnType<typeof useProductionWorkspace>;
