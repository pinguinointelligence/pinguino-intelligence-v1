import { useEffect, useMemo } from 'react';
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
import { productBehaviorModuleGate } from '@/features/product-intelligence';

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
  }, [constraints, lastApplied, plannedInput, recipe.practicalRecipeAudit, recipe.productBehaviorSnapshots]);

  const source = useMemo(() => productionSourceForRecipe(recipe), [recipe]);

  useEffect(() => {
    if (!enabled || !practicalGate.ready || plannedInput.items.length === 0) return;
    ensureSession({
      ownerUserId,
      source,
      plannedInput,
      plannedComposition,
      now: new Date().toISOString(),
      sessionId: newSessionId(),
    });
  }, [enabled, ensureSession, ownerUserId, plannedComposition, plannedInput, practicalGate.ready, source]);

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
    practicalReady: practicalGate.ready,
    practicalBlockMessage: practicalGate.message,
    setDraftActual,
    confirmLine: (lineId: string) => confirmLine(lineId, new Date().toISOString()),
    reopenRecord,
    applyVerifiedRescue,
    complete: () => complete(new Date().toISOString(), ownerUserId),
    startNewSession: () =>
      startNewSession({
        ownerUserId,
        source,
        plannedInput,
        plannedComposition,
        now: new Date().toISOString(),
        sessionId: newSessionId(),
      }),
  };
}

export type ProductionWorkspaceView = ReturnType<typeof useProductionWorkspace>;
