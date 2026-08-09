import { useEffect, useMemo } from 'react';
import { calculateRecipe, proposeCorrections } from '@/engine';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput, recipeContext } from '@/features/studio/buildRecipeInput';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { assessProductionRescue } from './productionRescue';
import { buildProductionForecastInput, productionProgress } from './productionSession';
import { useProductionSessionStore } from './productionSessionStore';

const newSessionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `production-${Date.now().toString(36)}`;

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

  const plannedInput = useMemo(
    () =>
      buildRecipeInput(
        {
          mode: recipe.mode,
          formulation_strategy: recipe.formulation_strategy,
          category: recipe.category,
          target_temperature_c: recipe.target_temperature_c,
          target_batch_grams: recipe.target_batch_grams,
          machine_capacity_grams: recipe.machine_capacity_grams,
          machine_capacity_source: recipe.machine_capacity_source,
          flavor_intensity: recipe.flavor_intensity,
          cost_priority: recipe.cost_priority,
          target_protein_percent: recipe.target_protein_percent,
          items: recipe.items,
        },
        'planning',
      ),
    [
      recipe.mode,
      recipe.formulation_strategy,
      recipe.category,
      recipe.target_temperature_c,
      recipe.target_batch_grams,
      recipe.machine_capacity_grams,
      recipe.machine_capacity_source,
      recipe.flavor_intensity,
      recipe.cost_priority,
      recipe.target_protein_percent,
      recipe.items,
    ],
  );

  const source = useMemo(
    () => ({
      recipeId: recipe.savedRecipeId,
      recipeVersionId:
        recipe.savedRecipeId && recipe.currentVersionNumber
          ? `${recipe.savedRecipeId}:v${recipe.currentVersionNumber}`
          : null,
      recipeVersionNumber: recipe.currentVersionNumber,
      recipeName: recipe.savedRecipeName?.trim() || 'Bieżąca receptura',
    }),
    [
      recipe.savedRecipeId,
      recipe.savedRecipeName,
      recipe.currentVersionNumber,
    ],
  );

  useEffect(() => {
    if (!enabled || plannedInput.items.length === 0) return;
    ensureSession({
      ownerUserId,
      source,
      plannedInput,
      now: new Date().toISOString(),
      sessionId: newSessionId(),
    });
  }, [enabled, ensureSession, ownerUserId, plannedInput, source]);

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
    score,
    corrections,
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
        now: new Date().toISOString(),
        sessionId: newSessionId(),
      }),
  };
}

export type ProductionWorkspaceView = ReturnType<typeof useProductionWorkspace>;
