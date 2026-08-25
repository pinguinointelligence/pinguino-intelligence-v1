import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG_VERSION, ENGINE_VERSION, calculateRecipe, proposeCorrections } from '@/engine';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore, type RecipeState } from '@/stores/recipeStore';
import { buildRecipeInput, recipeContext } from '@/features/studio/buildRecipeInput';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import {
  buildProductionForecastInput,
  buildFinalActualInput,
  completeProductionSession,
  confirmProductionLine,
  hydrateProductionSessionFromRun,
  mergePendingProductionDrafts,
  productionProgress,
  productionSourceFingerprint,
  reopenProductionRecord,
  toppingProductionProgress,
  topUpProductionLine,
  type ProductionSession,
} from './productionSession';
import { useProductionSessionStore } from './productionSessionStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import {
  applyEffectiveCustomerPrices,
  applyEffectiveCustomerPricesToToppings,
} from '@/features/pro-core/effectiveRecipePricing';
import {
  practicalRecipeInputFingerprint,
  practicalizeRecipeCandidate,
} from '@/features/practical-recipe/practicalRecipe';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { productBehaviorRequiredLineIds } from '@/features/product-intelligence';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';
import { validateRecipeBehaviorOnServer } from '@/services/productIntelligence';
import { buildRecipeVersion } from '@/features/pro-core/recipeVersioning';
import { productionCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { resolveProductionRepository } from '@/features/pro-core/proCoreProductionRepo';
import type {
  ProductionRescueAuthorization,
  RecordActualArgs,
} from '@/services/proCore/productionRepository';
import {
  isProductionRescueAuthorizationRefreshError,
  isProductionRescueOptionUnavailableError,
} from '@/services/proCore/supabaseProduction';
import type {
  ProductionRescueStableOptionId,
  ProductionRun,
} from '@/features/pro-core/productionContracts';
import type {
  ProductProcessReadiness,
  ProductProcessReadinessDetail,
} from '@/features/product-intelligence';
import {
  productionRecipeLifecycleState,
  productionVersionFingerprint,
} from './productionReadinessState';
import { carbonatedProductsForRecipe } from './productionDegassing';

export type ProductionRescueAuthorizationInvalidation = 'expired' | 'revision_mismatch' | null;

export type ProductionRescueAuthorizationState =
  | { status: 'idle' }
  | {
      status: 'authorizing';
      runId: string;
      stableOptionId: ProductionRescueStableOptionId;
      expectedActualRevision: number;
      expectedRescueRevision: number;
      authorizeIdempotencyKey: string;
    }
  | {
      status: 'preview';
      authorization: ProductionRescueAuthorization;
      consumeIdempotencyKey: string;
      refreshRequired: boolean;
      error: string | null;
    }
  | {
      status: 'error';
      runId: string;
      stableOptionId: ProductionRescueStableOptionId;
      expectedActualRevision: number;
      expectedRescueRevision: number;
      authorizeIdempotencyKey: string;
      message: string;
    };

export type ProductionRescueOptionEvaluation =
  | { status: 'loading' }
  | {
      status: 'available';
      authorization: ProductionRescueAuthorization;
      consumeIdempotencyKey: string;
    }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; reason: string };

export interface ProductionRescueOptionsEvaluationState {
  basisKey: string | null;
  options: Partial<Record<ProductionRescueStableOptionId, ProductionRescueOptionEvaluation>>;
}

export const productionRescueAuthorizationInvalidation = (
  authorization: Pick<
    ProductionRescueAuthorization,
    'expectedActualRevision' | 'expectedRescueRevision' | 'expiresAt'
  >,
  basis: Pick<ProductionSession, 'durableActualRevision' | 'durableRescueRevision'> | null,
  nowMs = Date.now(),
): ProductionRescueAuthorizationInvalidation => {
  if (
    !basis ||
    authorization.expectedActualRevision !== basis.durableActualRevision ||
    authorization.expectedRescueRevision !== basis.durableRescueRevision
  ) {
    return 'revision_mismatch';
  }
  const expiresAtMs = Date.parse(authorization.expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs ? 'expired' : null;
};

/**
 * OWNER RULE §16 — when the original batch can no longer be saved, say exactly
 * that, with its mass, instead of a generic authorization failure.
 */
export const rescueOptionUnavailableMessage = (
  stableOptionId: ProductionRescueStableOptionId,
  originalTargetG: number,
  error: unknown,
): string => {
  if (!isProductionRescueOptionUnavailableError(error)) {
    return 'Nie udało się obliczyć tej opcji.';
  }
  const target = Number.isInteger(originalTargetG)
    ? originalTargetG.toFixed(0)
    : originalTargetG.toFixed(1);
  if (stableOptionId === 'keep_original_batch') {
    return `Niedostępne — pozostałych ilości nie można bezpiecznie dostosować do ${target} g.`;
  }
  if (stableOptionId === 'enlarge_batch') {
    return 'Niedostępne — nie znaleziono bezpiecznej większej partii dla obecnych ilości.';
  }
  return 'Niedostępne — obecna partia nie mieści się w bezpiecznym zakresie.';
};

const productionRescueIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `production-rescue-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const productionRescueChoices = [
  {
    id: 'keep_original_batch',
    title: 'Zachowaj pierwotną partię',
    explanation: 'Dostosujemy tylko ilości, których jeszcze nie dodano.',
  },
  {
    id: 'enlarge_batch',
    title: 'Powiększ partię',
    explanation: 'Dodamy potrzebne ilości, aby zachować możliwie ten sam profil.',
  },
  {
    id: 'leave_as_is',
    title: 'Kontynuuj bez korekty',
    explanation: 'Nie zmienimy dalszego planu i zaakceptujesz przewidywany wynik.',
  },
] as const satisfies ReadonlyArray<{
  id: ProductionRescueStableOptionId;
  title: string;
  explanation: string;
}>;

export const browserProductionRescueDecision = (session: ProductionSession | null) => {
  const hasConfirmedDeviation = Boolean(
    session?.status === 'in_progress' &&
    session.lines.some(
      (line) => line.confirmed && Math.abs(line.physicalAddedGrams - line.targetGrams) > 0.000001,
    ),
  );
  return hasConfirmedDeviation
    ? { state: 'options' as const, options: productionRescueChoices }
    : { state: 'not_needed' as const, options: [] as const };
};

export const reusableRescueAuthorizeKey = (
  state: ProductionRescueAuthorizationState,
  session: Pick<ProductionSession, 'sessionId' | 'durableActualRevision' | 'durableRescueRevision'>,
  stableOptionId: ProductionRescueStableOptionId,
): string | null =>
  state.status === 'error' &&
  state.runId === session.sessionId &&
  state.stableOptionId === stableOptionId &&
  state.expectedActualRevision === session.durableActualRevision &&
  state.expectedRescueRevision === session.durableRescueRevision
    ? state.authorizeIdempotencyKey
    : null;

export function durableActual(session: ProductionSession, by: string): RecordActualArgs {
  const durableLines = [...session.lines, ...session.addonLines];
  const baseComplete = session.lines.every((line) => line.confirmed);
  return {
    by,
    expectedActualRevision: session.durableActualRevision,
    expectedRescueRevision: session.durableRescueRevision,
    items: durableLines.map((line) => ({
      id: line.lineId,
      name: line.name,
      actualGrams: line.confirmed ? line.physicalAddedGrams : null,
      confirmedAt: line.confirmed ? line.confirmedAt : null,
      confirmationOrder: line.confirmed ? line.confirmationOrder : null,
    })),
    actualTotalMixG: baseComplete
      ? session.lines.reduce((sum, line) => sum + line.physicalAddedGrams, 0)
      : null,
    substitutions: [
      ...session.substitutions.map((item) => ({
        originalIngredientId: item.originalLineId,
        originalName: item.originalCanonicalIngredientId ?? item.originalLineId,
        substituteName: item.substituteName,
        grams: item.grams,
        reason: item.reason,
      })),
    ],
    operatorNotes: session.internalProductionNote || null,
  };
}

export const durableRescueRequiresReconciliation = (
  remote: Pick<ProductionRun, 'rescue'>,
  local: Pick<ProductionSession, 'durableRescueRevision'> | null,
): boolean =>
  Boolean(remote.rescue && local && remote.rescue.revision !== local.durableRescueRevision);

export type DurableProductionRecoveryRelation =
  'missing_remote' | 'new_rescue' | 'new_actual' | 'same';

class MissingDurableProductionRunError extends Error {
  constructor() {
    super('Local Production session has no matching durable run.');
    this.name = 'MissingDurableProductionRunError';
  }
}

export const durableProductionRecoveryRelation = (
  local: Pick<ProductionSession, 'durableRescueRevision' | 'durableActualRevision'> | null,
  remote: Pick<ProductionRun, 'rescue' | 'actual'> | null,
): DurableProductionRecoveryRelation => {
  if (local && !remote) return 'missing_remote';
  if (!local || !remote) return 'same';
  if (durableRescueRequiresReconciliation(remote, local)) return 'new_rescue';
  if (remote.actual && remote.actual.revision !== local.durableActualRevision) return 'new_actual';
  return 'same';
};

/**
 * A matching durable revision still has to be hydrated on recovery. The local
 * browser copy may contain an unfinished stepper or record-correction draft,
 * while only the server owns the recorded physical facts used to decide whether
 * that draft is still meaningful.
 */
export const shouldHydrateDurableProductionRecovery = (
  relation: DurableProductionRecoveryRelation,
): boolean => relation !== 'missing_remote';

export const productionSourceForRecipe = (
  recipe: Pick<
    RecipeState,
    'savedRecipeId' | 'savedRecipeName' | 'currentVersionId' | 'currentVersionNumber'
  >,
  executableVersionMatchesCurrent: boolean,
) => ({
  recipeId: recipe.savedRecipeId,
  recipeVersionId:
    executableVersionMatchesCurrent && recipe.savedRecipeId && recipe.currentVersionId
      ? recipe.currentVersionId
      : null,
  recipeVersionNumber: executableVersionMatchesCurrent ? recipe.currentVersionNumber : null,
  recipeName: recipe.savedRecipeName?.trim() || 'Bieżąca receptura',
});

export type ProductionPrerequisiteCode =
  | 'preview_required'
  | 'preview_not_applied'
  | 'saved_version_required'
  | 'product_authority_required'
  | 'whole_grams_required'
  | 'server_validation_pending'
  | 'server_validation_failed'
  | 'repository_unavailable'
  | 'repository_recovery'
  | 'stale_source'
  | 'owner_mismatch';

export type ProductionPrerequisiteAction =
  'open_preview' | 'recalculate' | 'return_to_recipe' | 'archive_stale_session';

export type ProductionPrerequisite = {
  code: ProductionPrerequisiteCode;
  eyebrow: string;
  title: string;
  message: string;
  action: ProductionPrerequisiteAction;
  actionLabel: string;
};

const prerequisite = (
  code: ProductionPrerequisiteCode,
  title: string,
  message: string,
  action: ProductionPrerequisiteAction,
  actionLabel: string,
): ProductionPrerequisite => ({
  code,
  eyebrow: 'Wymaga receptury wykonawczej',
  title,
  message,
  action,
  actionLabel,
});

export function useProductionWorkspace(enabled: boolean) {
  const recipe = useRecipeStore();
  const persona = useProCorePersona();
  const repositoryState = useMemo(() => resolveProductionRepository(), []);
  const ownerUserId = useAuthStore((state) =>
    state.status === 'authed' ? (state.user?.id ?? null) : null,
  );
  const session = useProductionSessionStore((state) => state.session);
  const setDraftActual = useProductionSessionStore((state) => state.setDraftActual);
  const archiveCurrentSession = useProductionSessionStore((state) => state.archiveCurrentSession);
  const replaceSession = useProductionSessionStore((state) => state.replaceSession);
  const restoreDurableSession = useProductionSessionStore((state) => state.restoreDurableSession);
  const constraints = useConstraintStudioStore((state) => state.constraints);
  const preview = useConstraintStudioStore((state) => state.preview);
  const recalculationTerminal = useConstraintStudioStore((state) => state.recalculationTerminal);
  const awaitingRecalculation = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  const [behaviorServerGate, setBehaviorServerGate] = useState<{
    key: string | null;
    ready: boolean;
    message: string | null;
    processReadiness: ProductProcessReadiness | null;
  }>({ key: null, ready: false, message: null, processReadiness: null });
  const [sessionStart, setSessionStart] = useState<{
    busy: boolean;
    error: string | null;
  }>({ busy: false, error: null });
  const [persistence, setPersistence] = useState<{
    busy: boolean;
    error: string | null;
  }>({ busy: false, error: null });
  const [recovery, setRecovery] = useState<{
    key: string | null;
    busy: boolean;
    error: string | null;
    orphanedLocal: boolean;
  }>({ key: null, busy: false, error: null, orphanedLocal: false });
  const [rescueAuthorization, setRescueAuthorization] =
    useState<ProductionRescueAuthorizationState>({ status: 'idle' });
  const rescueAuthorizationRef = useRef<ProductionRescueAuthorizationState>({ status: 'idle' });
  const updateRescueAuthorization = useCallback(
    (
      next:
        | ProductionRescueAuthorizationState
        | ((current: ProductionRescueAuthorizationState) => ProductionRescueAuthorizationState),
    ) => {
      const resolved = typeof next === 'function' ? next(rescueAuthorizationRef.current) : next;
      rescueAuthorizationRef.current = resolved;
      setRescueAuthorization(resolved);
    },
    [],
  );
  const [rescueAuthorizationClock, setRescueAuthorizationClock] = useState(() => Date.now());
  const [rescueOptionsEvaluation, setRescueOptionsEvaluation] =
    useState<ProductionRescueOptionsEvaluationState>({ basisKey: null, options: {} });
  const [selectedRescueOption, setSelectedRescueOption] = useState<{
    basisKey: string | null;
    optionId: ProductionRescueStableOptionId | null;
  }>({ basisKey: null, optionId: null });
  const [rescueOptionsRetryRevision, setRescueOptionsRetryRevision] = useState(0);
  const [reconcileRevision, setReconcileRevision] = useState(0);
  const [preStartHeatAcknowledgementKey, setPreStartHeatAcknowledgementKey] = useState<
    string | null
  >(null);
  const [preStartDegassingAcknowledgementKey, setPreStartDegassingAcknowledgementKey] = useState<
    string | null
  >(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (rescueAuthorization.status !== 'preview') return;
    const expiresAtMs = Date.parse(rescueAuthorization.authorization.expiresAt);
    const delay = expiresAtMs - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timeout = globalThis.setTimeout(
      () => setRescueAuthorizationClock(Date.now()),
      Math.min(delay + 1, 2_147_483_647),
    );
    return () => globalThis.clearTimeout(timeout);
  }, [rescueAuthorization]);

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
  const currentProductionVersionFingerprint = useMemo(
    () => productionVersionFingerprint(plannedInput, plannedComposition),
    [plannedComposition, plannedInput],
  );
  const recipeLifecycle = useMemo(
    () =>
      productionRecipeLifecycleState({
        workingInput: plannedInput,
        practicalAudit: recipe.practicalRecipeAudit,
        calculationStale: awaitingRecalculation,
        currentProductionFingerprint: currentProductionVersionFingerprint,
        savedProductionFingerprint: recipe.savedProductionFingerprint,
        savedVersionId: recipe.currentVersionId,
        legacySavedStateClean: !recipe.dirty,
      }),
    [
      awaitingRecalculation,
      currentProductionVersionFingerprint,
      plannedInput,
      recipe.currentVersionId,
      recipe.dirty,
      recipe.practicalRecipeAudit,
      recipe.savedProductionFingerprint,
    ],
  );

  const practicalGate = useMemo(() => {
    if (recipeLifecycle === 'TECHNICALLY_STALE') {
      return {
        ready: false,
        prerequisite:
          recalculationTerminal?.state === 'PREVIEW_READY' && preview
            ? prerequisite(
                'preview_not_applied',
                'Zastosuj recepturę wykonawczą',
                'Podgląd wykonawczy jest gotowy, ale nie został jeszcze zastosowany. Produkcja nie uruchomi się z samego podglądu.',
                'open_preview',
                'Otwórz podgląd',
              )
            : prerequisite(
                'preview_required',
                'Najpierw przelicz recepturę',
                'Produkcja korzysta wyłącznie ze zweryfikowanej receptury wykonawczej w pełnych gramach.',
                'recalculate',
                'Przelicz recepturę',
              ),
      };
    }
    const result = practicalizeRecipeCandidate(plannedInput, constraints);
    if (!result.ok) {
      return {
        ready: false,
        prerequisite: prerequisite(
          'whole_grams_required',
          'Zastosuj pełne gramy',
          result.messagePl,
          'recalculate',
          'Otwórz podgląd',
        ),
      };
    }
    return practicalRecipeInputFingerprint(result.audit.executableInput) ===
      practicalRecipeInputFingerprint(plannedInput)
      ? { ready: true, prerequisite: null }
      : {
          ready: false,
          prerequisite: prerequisite(
            'whole_grams_required',
            'Zastosuj pełne gramy',
            'Bieżący szkic nie jest jeszcze wykonawczą recepturą pełnogramową.',
            'recalculate',
            'Otwórz podgląd',
          ),
        };
  }, [constraints, plannedInput, preview, recalculationTerminal, recipeLifecycle]);

  const source = useMemo(
    () => productionSourceForRecipe(recipe, recipeLifecycle === 'READY'),
    [recipe, recipeLifecycle],
  );
  const recoveryKey = `${ownerUserId ?? 'anon'}:${source.recipeVersionId ?? 'unsaved'}`;
  const currentSourceFingerprint = useMemo(
    () => productionSourceFingerprint(plannedInput, plannedComposition),
    [plannedComposition, plannedInput],
  );
  const sessionOwnerMismatch = Boolean(session && session.ownerUserId !== ownerUserId);
  const staleSource = Boolean(
    session &&
    !sessionOwnerMismatch &&
    session.status === 'in_progress' &&
    session.sourceFingerprint !== currentSourceFingerprint,
  );
  const requiredBehaviorLineIds = useMemo(
    () =>
      productBehaviorRequiredLineIds({
        items: plannedInput.items,
        toppings: plannedComposition.toppings,
      }),
    [plannedComposition.toppings, plannedInput.items],
  );
  const behaviorValidationKey = useMemo(
    () =>
      JSON.stringify({
        ownerUserId,
        recipe: plannedInput,
        toppings: plannedComposition.toppings,
        snapshots: plannedComposition.behaviorSnapshots ?? {},
      }),
    [ownerUserId, plannedComposition, plannedInput],
  );
  const behaviorServerReady =
    requiredBehaviorLineIds.length === 0 ||
    (behaviorServerGate.key === behaviorValidationKey && behaviorServerGate.ready);
  const behaviorServerMessage =
    behaviorServerGate.key === behaviorValidationKey ? behaviorServerGate.message : null;

  useEffect(() => {
    if (
      !enabled ||
      !repositoryState.repository ||
      !ownerUserId ||
      !source.recipeVersionId ||
      !practicalGate.ready
    )
      return;
    let cancelled = false;
    const reconcile = async () => {
      setRecovery({ key: recoveryKey, busy: true, error: null, orphanedLocal: false });
      try {
        const localSession = sessionRef.current;
        let remote = localSession
          ? await repositoryState.repository!.getRun(localSession.sessionId, ownerUserId)
          : null;
        if (durableProductionRecoveryRelation(localSession, remote) === 'missing_remote') {
          throw new MissingDurableProductionRunError();
        }
        if (!remote) {
          const active = await repositoryState.repository!.listRuns(ownerUserId, {
            recipeVersionId: source.recipeVersionId!,
            status: 'in_progress',
            sort: 'newest',
            limit: 2,
          });
          if (active.items.length > 1) {
            throw new Error('Multiple active Production runs require owner review.');
          }
          remote = active.items[0] ?? null;
        }
        if (cancelled || !remote) return;
        if (remote.status === 'cancelled') {
          if (localSession?.sessionId === remote.runId) archiveCurrentSession();
          return;
        }
        const recoveryRelation = durableProductionRecoveryRelation(localSession, remote);
        if (shouldHydrateDurableProductionRecovery(recoveryRelation)) {
          const hydrated = hydrateProductionSessionFromRun(
            remote,
            source,
            plannedInput,
            plannedComposition,
          );
          restoreDurableSession(
            localSession && remote.status !== 'completed'
              ? mergePendingProductionDrafts(hydrated, localSession)
              : hydrated,
          );
        }
      } catch (caught) {
        if (!cancelled) {
          setRecovery({
            key: recoveryKey,
            busy: false,
            error:
              'Nie udało się uzgodnić lokalnej sesji z trwałym zapisem Produkcji. Wróć do receptury i spróbuj ponownie.',
            orphanedLocal: caught instanceof MissingDurableProductionRunError,
          });
        }
        return;
      } finally {
        if (!cancelled) setRecovery((current) => ({ ...current, busy: false }));
      }
    };
    void reconcile();
    return () => {
      cancelled = true;
    };
  }, [
    archiveCurrentSession,
    enabled,
    ownerUserId,
    plannedComposition,
    plannedInput,
    practicalGate.ready,
    recoveryKey,
    reconcileRevision,
    repositoryState.repository,
    restoreDurableSession,
    session?.sessionId,
    session?.status,
    session?.rescueAddedItems.length,
    source,
  ]);

  const recoveryPending =
    enabled &&
    practicalGate.ready &&
    Boolean(repositoryState.repository && ownerUserId && source.recipeVersionId) &&
    (recovery.key !== recoveryKey || recovery.busy);
  const recoveryError = recovery.key === recoveryKey ? recovery.error : null;
  const recoveryOrphanedLocal =
    recovery.key === recoveryKey && recovery.orphanedLocal && recoveryError !== null;

  useEffect(() => {
    if (!enabled || !practicalGate.ready || plannedInput.items.length === 0) return;
    let cancelled = false;
    const validationPromise = validateRecipeBehaviorOnServer({
      recipe: plannedInput,
      toppings: plannedComposition.toppings,
      snapshots: plannedComposition.behaviorSnapshots ?? {},
      module: 'PRODUCTION',
      accountId: ownerUserId,
    });
    void validationPromise
      .then((validation) => {
        if (cancelled) return;
        if (!validation.ready) {
          setBehaviorServerGate({
            key: behaviorValidationKey,
            ready: false,
            message:
              'Produkcja wymaga odświeżenia bieżącej weryfikacji produktów. Obliczenie receptury pozostaje bez zmian.',
            processReadiness: validation.processReadiness ?? null,
          });
          return;
        }
        setBehaviorServerGate({
          key: behaviorValidationKey,
          ready: true,
          message: null,
          processReadiness: validation.processReadiness ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setBehaviorServerGate({
            key: behaviorValidationKey,
            ready: false,
            message:
              'Produkcja zablokowana: nie udało się potwierdzić aktualnej klasyfikacji produktu.',
            processReadiness: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    behaviorValidationKey,
    enabled,
    ownerUserId,
    plannedComposition,
    plannedInput,
    practicalGate.ready,
    requiredBehaviorLineIds.length,
  ]);

  const productionPrerequisite = sessionOwnerMismatch
    ? prerequisite(
        'owner_mismatch',
        'Otwórz własną sesję',
        'Zapisana sesja należy do innego konta i nie może zostać otwarta.',
        'return_to_recipe',
        'Wróć do receptury',
      )
    : repositoryState.unavailable
      ? prerequisite(
          'repository_unavailable',
          'Produkcja chwilowo niedostępna',
          'Nie udało się połączyć z bezpiecznym repozytorium Produkcji. Receptura nie została zmieniona.',
          'return_to_recipe',
          'Wróć do receptury',
        )
      : staleSource
        ? prerequisite(
            'stale_source',
            'Źródło Produkcji jest nieaktualne',
            'Receptura zmieniła się po przygotowaniu tej sesji. Zarchiwizuj starą sesję, aby zachować jej zapis i przygotować nową partię.',
            'archive_stale_session',
            'Zarchiwizuj starą sesję',
          )
        : (practicalGate.prerequisite ??
          (practicalGate.ready && source.recipeVersionId === null
            ? prerequisite(
                'saved_version_required',
                'Zapisz wersję wykonawczą',
                'Produkcja wymaga dokładnej, niezmiennej wersji receptury. Zapisz zastosowaną recepturę przed rozpoczęciem partii.',
                'return_to_recipe',
                'Wróć i zapisz recepturę',
              )
            : null) ??
          (practicalGate.ready && !behaviorServerReady
            ? prerequisite(
                behaviorServerMessage ? 'product_authority_required' : 'server_validation_pending',
                behaviorServerMessage
                  ? 'Nie udało się potwierdzić produktów'
                  : 'Potwierdzamy aktualną recepturę',
                behaviorServerMessage ??
                  'Trwa bezpieczna weryfikacja produktów dla bieżącej receptury wykonawczej.',
                'return_to_recipe',
                'Wróć do receptury',
              )
            : null) ??
          (practicalGate.ready && (recoveryPending || recoveryError)
            ? prerequisite(
                'repository_recovery',
                recoveryOrphanedLocal
                  ? 'Lokalna sesja nie ma trwałego runu'
                  : recoveryError
                    ? 'Nie udało się odzyskać partii'
                    : 'Odzyskujemy partię',
                recoveryOrphanedLocal
                  ? 'Zachowaj osieroconą sesję w lokalnej historii i odłącz ją, aby bezpiecznie sprawdzić lub rozpocząć partię dla zapisanej wersji.'
                  : (recoveryError ??
                      'Sprawdzamy trwały zapis, aby nie uruchomić drugi raz tej samej partii.'),
                recoveryOrphanedLocal ? 'archive_stale_session' : 'return_to_recipe',
                recoveryOrphanedLocal ? 'Zachowaj i odłącz lokalną sesję' : 'Wróć do receptury',
              )
            : null));

  const forecastInput = useMemo(
    () =>
      session && !staleSource && !sessionOwnerMismatch
        ? buildProductionForecastInput(session)
        : plannedInput,
    [plannedInput, session, sessionOwnerMismatch, staleSource],
  );
  const forecastResult = useMemo(() => calculateRecipe(forecastInput), [forecastInput]);
  const rescue = useMemo(() => browserProductionRescueDecision(session), [session]);
  const rescueAuthorizationRunId =
    rescueAuthorization.status === 'preview'
      ? rescueAuthorization.authorization.runId
      : rescueAuthorization.status === 'authorizing' || rescueAuthorization.status === 'error'
        ? rescueAuthorization.runId
        : null;
  const activeRescueAuthorization: ProductionRescueAuthorizationState =
    rescueAuthorization.status === 'idle' || rescueAuthorizationRunId === session?.sessionId
      ? rescueAuthorization
      : { status: 'idle' };
  const rescueAuthorizationInvalidation =
    activeRescueAuthorization.status === 'preview'
      ? activeRescueAuthorization.refreshRequired
        ? 'revision_mismatch'
        : productionRescueAuthorizationInvalidation(
            activeRescueAuthorization.authorization,
            session,
            rescueAuthorizationClock,
          )
      : null;
  const progress = useMemo(() => (session ? productionProgress(session) : null), [session]);
  const toppingProgress = useMemo(
    () => (session ? toppingProductionProgress(session) : null),
    [session],
  );
  const score = monitorScoreView(forecastResult, forecastInput).match;
  const plannedScore = useMemo(
    () => monitorScoreView(calculateRecipe(plannedInput), plannedInput).match,
    [plannedInput],
  );
  const rescueOptionsBasisKey =
    session && rescue.state === 'options'
      ? `${session.sessionId}:${session.durableActualRevision}:${session.durableRescueRevision}`
      : null;
  const rescueOptionsEvaluationKey = rescueOptionsBasisKey
    ? `${rescueOptionsBasisKey}:${rescueOptionsRetryRevision}`
    : null;

  useEffect(() => {
    if (
      !enabled ||
      !repositoryState.repository ||
      !session ||
      rescue.state !== 'options' ||
      rescueOptionsBasisKey === null ||
      rescueOptionsEvaluationKey === null
    ) {
      return;
    }
    let cancelled = false;
    const basisSession = session;
    const loadingOptions = Object.fromEntries(
      productionRescueChoices.map((option) => [option.id, { status: 'loading' as const }]),
    );
    for (const option of productionRescueChoices) {
      void repositoryState.repository
        .authorizeRescue({
          runId: basisSession.sessionId,
          stableOptionId: option.id,
          expectedActualRevision: basisSession.durableActualRevision,
          expectedRescueRevision: basisSession.durableRescueRevision,
          idempotencyKey: `production-decision:${basisSession.sessionId}:${basisSession.durableActualRevision}:${basisSession.durableRescueRevision}:${option.id}`,
        })
        .then((authorization) => {
          if (cancelled) return;
          const latest = sessionRef.current;
          if (
            latest?.sessionId !== basisSession.sessionId ||
            latest.durableActualRevision !== basisSession.durableActualRevision ||
            latest.durableRescueRevision !== basisSession.durableRescueRevision
          ) {
            return;
          }
          setRescueOptionsEvaluation((current) =>
            current.basisKey === rescueOptionsEvaluationKey
              ? {
                  ...current,
                  options: {
                    ...current.options,
                    [option.id]: {
                      status: 'available',
                      authorization,
                      consumeIdempotencyKey: productionRescueIdempotencyKey(),
                    },
                  },
                }
              : {
                  basisKey: rescueOptionsEvaluationKey,
                  options: {
                    ...loadingOptions,
                    [option.id]: {
                      status: 'available',
                      authorization,
                      consumeIdempotencyKey: productionRescueIdempotencyKey(),
                    },
                  },
                },
          );
        })
        .catch((error) => {
          if (cancelled) return;
          const unavailable = isProductionRescueOptionUnavailableError(error);
          const originalTarget = basisSession.plannedInput.target_batch_grams;
          const confirmedMass = productionProgress(basisSession).confirmedMassG;
          const reason =
            option.id === 'keep_original_batch' && confirmedMass > originalTarget + 0.000001
              ? `Niedostępne — w naczyniu jest już więcej niż ${originalTarget.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g.`
              : rescueOptionUnavailableMessage(option.id, originalTarget, error);
          setRescueOptionsEvaluation((current) =>
            current.basisKey === rescueOptionsEvaluationKey
              ? {
                  ...current,
                  options: {
                    ...current.options,
                    [option.id]: unavailable
                      ? { status: 'unavailable', reason }
                      : { status: 'error', reason },
                  },
                }
              : {
                  basisKey: rescueOptionsEvaluationKey,
                  options: {
                    ...loadingOptions,
                    [option.id]: unavailable
                      ? { status: 'unavailable', reason }
                      : { status: 'error', reason },
                  },
                },
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    repositoryState.repository,
    rescue.state,
    rescueOptionsBasisKey,
    rescueOptionsEvaluationKey,
    rescueOptionsRetryRevision,
    session,
  ]);

  const currentRescueOptionsEvaluation =
    rescueOptionsEvaluationKey === null
      ? {}
      : rescueOptionsEvaluation.basisKey === rescueOptionsEvaluationKey
        ? rescueOptionsEvaluation.options
        : Object.fromEntries(
            productionRescueChoices.map((option) => [option.id, { status: 'loading' as const }]),
          );
  const rescueOptionsCalculating = Object.values(currentRescueOptionsEvaluation).some(
    (option) => option?.status === 'loading',
  );
  const recommendedRescueOptionId = rescueOptionsCalculating
    ? undefined
    : productionRescueChoices.find(
        (option) => currentRescueOptionsEvaluation[option.id]?.status === 'available',
      )?.id;
  const effectiveSelectedRescueOptionId =
    (selectedRescueOption.basisKey === rescueOptionsEvaluationKey
      ? selectedRescueOption.optionId
      : null) ??
    recommendedRescueOptionId ??
    null;
  const nameProcessDetails = (details: ProductProcessReadinessDetail[]) =>
    details.map((detail) => {
      const line = detail.lineId
        ? (forecastInput.items.find((item) => item.id === detail.lineId) ??
          plannedComposition.toppings.find((item) => item.id === detail.lineId))
        : undefined;
      return { ...detail, ...(line ? { productName: line.ingredient.name } : {}) };
    });
  // PROCESS IS INFORMATIONAL ONLY (owner decision, 2026-08-23). Whatever is
  // known about a product's process is surfaced as an advisory; nothing here
  // can be BLOCKED, and Production never waits on process evidence, a hot/cold
  // classification or a declared thermal route.
  const processReadiness: ProductProcessReadiness = session
    ? {
        schemaVersion: 1,
        status: session.processAdvisories.length > 0 ? 'READY_WITH_INFO' : 'READY',
        blockers: [],
        advisories: nameProcessDetails(session.processAdvisories),
      }
    : behaviorServerGate.key === behaviorValidationKey && behaviorServerGate.processReadiness
      ? (() => {
          const advisories = nameProcessDetails([
            ...behaviorServerGate.processReadiness.blockers,
            ...behaviorServerGate.processReadiness.advisories,
          ]);
          return {
            schemaVersion: 1 as const,
            status: advisories.length > 0 ? ('READY_WITH_INFO' as const) : ('READY' as const),
            blockers: [],
            advisories,
          };
        })()
      : { schemaVersion: 1, status: 'READY', blockers: [], advisories: [] };
  const heatAdvisories = processReadiness.advisories.filter(
    (advisory) => advisory.code === 'HEAT_TREATMENT_INDICATED',
  );
  const heatInformationAcknowledged =
    heatAdvisories.length === 0 ||
    (session
      ? session.heatInformationAcknowledgedAt !== null
      : preStartHeatAcknowledgementKey === behaviorValidationKey);
  const carbonatedProducts = useMemo(
    () => carbonatedProductsForRecipe(plannedInput, plannedComposition),
    [plannedComposition, plannedInput],
  );
  const degassingAcknowledgementKey = useMemo(
    () =>
      JSON.stringify({
        behaviorValidationKey,
        products: carbonatedProducts.map((product) => [product.productId, product.grams]),
      }),
    [behaviorValidationKey, carbonatedProducts],
  );
  const degassingRequired = session ? session.degassingRequired : carbonatedProducts.length > 0;
  const degassingAcknowledged =
    !degassingRequired ||
    (session
      ? session.degassingAcknowledged && session.degassingAcknowledgedAt !== null
      : preStartDegassingAcknowledgementKey === degassingAcknowledgementKey);
  const canStartProduction =
    productionPrerequisite === null && heatInformationAcknowledged && degassingAcknowledged;
  const corrections = useMemo(
    () =>
      proposeCorrections({
        input: forecastInput,
        context: recipeContext(forecastInput),
        redact: false,
      }),
    [forecastInput],
  );

  const requestRescueAuthorization = async (
    stableOptionId: ProductionRescueStableOptionId,
  ): Promise<void> => {
    const currentSession = sessionRef.current;
    if (!currentSession || !repositoryState.repository || persistence.busy) return;
    if (
      rescue?.state !== 'options' ||
      !rescue.options.some((option) => option.id === stableOptionId)
    ) {
      return;
    }
    const authorizeIdempotencyKey =
      reusableRescueAuthorizeKey(rescueAuthorization, currentSession, stableOptionId) ??
      productionRescueIdempotencyKey();
    updateRescueAuthorization({
      status: 'authorizing',
      runId: currentSession.sessionId,
      stableOptionId,
      expectedActualRevision: currentSession.durableActualRevision,
      expectedRescueRevision: currentSession.durableRescueRevision,
      authorizeIdempotencyKey,
    });
    setPersistence({ busy: true, error: null });
    try {
      const authorization = await repositoryState.repository.authorizeRescue({
        runId: currentSession.sessionId,
        stableOptionId,
        expectedActualRevision: currentSession.durableActualRevision,
        expectedRescueRevision: currentSession.durableRescueRevision,
        idempotencyKey: authorizeIdempotencyKey,
      });
      const pending = rescueAuthorizationRef.current;
      const latestSession = sessionRef.current;
      if (
        pending.status !== 'authorizing' ||
        pending.authorizeIdempotencyKey !== authorizeIdempotencyKey ||
        pending.runId !== currentSession.sessionId ||
        pending.stableOptionId !== stableOptionId ||
        pending.expectedActualRevision !== currentSession.durableActualRevision ||
        pending.expectedRescueRevision !== currentSession.durableRescueRevision ||
        latestSession?.sessionId !== currentSession.sessionId ||
        latestSession.durableActualRevision !== currentSession.durableActualRevision ||
        latestSession.durableRescueRevision !== currentSession.durableRescueRevision
      ) {
        return;
      }
      setRescueAuthorizationClock(Date.now());
      updateRescueAuthorization({
        status: 'preview',
        authorization,
        consumeIdempotencyKey: productionRescueIdempotencyKey(),
        refreshRequired: false,
        error: null,
      });
    } catch (error) {
      const pending = rescueAuthorizationRef.current;
      if (
        pending.status !== 'authorizing' ||
        pending.authorizeIdempotencyKey !== authorizeIdempotencyKey
      ) {
        return;
      }
      updateRescueAuthorization({
        status: 'error',
        runId: currentSession.sessionId,
        stableOptionId,
        expectedActualRevision: currentSession.durableActualRevision,
        expectedRescueRevision: currentSession.durableRescueRevision,
        authorizeIdempotencyKey,
        message: rescueOptionUnavailableMessage(
          stableOptionId,
          currentSession.plannedInput.target_batch_grams,
          error,
        ),
      });
      setPersistence({
        busy: false,
        error: 'Nie zmieniono partii. Spróbuj obliczyć opcję ponownie.',
      });
    } finally {
      setPersistence((current) => ({ ...current, busy: false }));
    }
  };

  const refreshRescueAuthorization = async (): Promise<void> => {
    if (activeRescueAuthorization.status === 'preview') {
      await requestRescueAuthorization(activeRescueAuthorization.authorization.stableOptionId);
      return;
    }
    if (activeRescueAuthorization.status === 'error') {
      await requestRescueAuthorization(activeRescueAuthorization.stableOptionId);
    }
  };

  const consumeRescueAuthorization = async (
    selectedAuthorization: Extract<ProductionRescueAuthorizationState, { status: 'preview' }>,
  ): Promise<void> => {
    if (
      productionRescueAuthorizationInvalidation(
        selectedAuthorization.authorization,
        sessionRef.current,
      ) ||
      !repositoryState.repository ||
      persistence.busy
    ) {
      return;
    }
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    setPersistence({ busy: true, error: null });
    try {
      const consumed = await repositoryState.repository.consumeRescue({
        authorizationId: selectedAuthorization.authorization.authorizationId,
        expectedActualRevision: selectedAuthorization.authorization.expectedActualRevision,
        expectedRescueRevision: selectedAuthorization.authorization.expectedRescueRevision,
        idempotencyKey: selectedAuthorization.consumeIdempotencyKey,
      });
      const durableRun = await repositoryState.repository.getRun(consumed.runId, ownerUserId ?? '');
      if (!durableRun?.rescue) {
        throw new Error('Durable Production Rescue authority was not returned.');
      }
      const latestSession = sessionRef.current;
      if (!latestSession || latestSession.sessionId !== consumed.runId) {
        throw new Error('The active Production run changed while Rescue was being applied.');
      }
      updateRescueAuthorization({ status: 'idle' });
      const hydrated = hydrateProductionSessionFromRun(
        durableRun,
        source,
        plannedInput,
        plannedComposition,
      );
      replaceSession(
        mergePendingProductionDrafts(
          {
            ...hydrated,
            lastDeviationDecision: {
              strategy: selectedAuthorization.authorization.stableOptionId,
              acceptedAt:
                durableRun.rescue?.acceptedAt ?? selectedAuthorization.authorization.authorizedAt,
              sourceActualRevision: selectedAuthorization.authorization.expectedActualRevision,
              rescueRevision: durableRun.rescue?.revision ?? hydrated.durableRescueRevision,
              finalMassG: selectedAuthorization.authorization.preview.finalMassG,
              scoreDisplay: selectedAuthorization.authorization.preview.scoreDisplay,
            },
          },
          latestSession,
        ),
      );
    } catch (error) {
      if (isProductionRescueAuthorizationRefreshError(error)) {
        updateRescueAuthorization((current) =>
          current.status === 'preview'
            ? {
                ...current,
                refreshRequired: true,
                error: 'Stan partii zmienił się od chwili obliczenia.',
              }
            : current,
        );
      } else {
        setPersistence({
          busy: false,
          error: 'Nie zastosowano korekty. Plan partii pozostaje bez zmian.',
        });
      }
      setReconcileRevision((current) => current + 1);
    } finally {
      setPersistence((current) => ({ ...current, busy: false }));
    }
  };

  const consumeAuthorizedRescue = async (): Promise<void> => {
    if (activeRescueAuthorization.status !== 'preview' || rescueAuthorizationInvalidation) return;
    await consumeRescueAuthorization(activeRescueAuthorization);
  };

  const selectRescueOption = (stableOptionId: ProductionRescueStableOptionId): void => {
    const evaluated = currentRescueOptionsEvaluation[stableOptionId];
    if (evaluated?.status !== 'available') return;
    setSelectedRescueOption({ basisKey: rescueOptionsEvaluationKey, optionId: stableOptionId });
    updateRescueAuthorization({
      status: 'preview',
      authorization: evaluated.authorization,
      consumeIdempotencyKey: evaluated.consumeIdempotencyKey,
      refreshRequired: false,
      error: null,
    });
  };

  const applySelectedRescueOption = async (): Promise<void> => {
    if (!effectiveSelectedRescueOptionId) return;
    const evaluated = currentRescueOptionsEvaluation[effectiveSelectedRescueOptionId];
    if (evaluated?.status !== 'available') return;
    const selected: Extract<ProductionRescueAuthorizationState, { status: 'preview' }> = {
      status: 'preview',
      authorization: evaluated.authorization,
      consumeIdempotencyKey: evaluated.consumeIdempotencyKey,
      refreshRequired: false,
      error: null,
    };
    updateRescueAuthorization(selected);
    await consumeRescueAuthorization(selected);
  };

  return {
    session,
    source,
    plannedInput,
    forecastInput,
    forecastResult,
    rescue,
    rescueAuthorization: activeRescueAuthorization,
    rescueAuthorizationInvalidation,
    progress,
    toppingProgress,
    score,
    plannedScore,
    rescueOptionStates: currentRescueOptionsEvaluation,
    rescueOptionsCalculating,
    recommendedRescueOptionId: recommendedRescueOptionId ?? null,
    selectedRescueOptionId: effectiveSelectedRescueOptionId,
    deviationDecisionUnresolved: rescue.state === 'options',
    corrections,
    processReadiness,
    /**
     * OWNER RULE §2/§3 — Production speaks only about heat that is POSITIVELY
     * indicated by verified metadata. An unknown process is not a Production
     * event: it stays under the product `?` and renders nothing here.
     */
    heatInformation: heatAdvisories,
    heatInformationAcknowledged,
    carbonatedProducts,
    degassingRequired,
    degassingAcknowledged,
    practicalReady: canStartProduction,
    prerequisite: productionPrerequisite,
    sessionStarting: sessionStart.busy || recoveryPending,
    sessionStartError: sessionStart.error,
    persistenceBusy: persistence.busy,
    persistenceError: persistence.error,
    currentSourceFingerprint,
    acknowledgeHeatInformation: async () => {
      if (!session) {
        if (heatAdvisories.length > 0) {
          setPreStartHeatAcknowledgementKey(behaviorValidationKey);
        }
        return;
      }
      if (!repositoryState.repository || persistence.busy) return;
      if (session.heatInformationAcknowledgedAt) return;
      setPersistence({ busy: true, error: null });
      try {
        const durableRun = await repositoryState.repository.acknowledgeHeatInformation(
          session.sessionId,
        );
        replaceSession(
          mergePendingProductionDrafts(
            hydrateProductionSessionFromRun(durableRun, source, plannedInput, plannedComposition),
            session,
          ),
        );
      } catch {
        setPersistence({
          busy: false,
          error: 'Nie zapisano potwierdzenia informacji o obróbce. Partia pozostaje bez zmian.',
        });
        setReconcileRevision((current) => current + 1);
        return;
      } finally {
        setPersistence((current) => ({ ...current, busy: false }));
      }
    },
    acknowledgeDegassing: async () => {
      if (!degassingRequired) return;
      if (!session) {
        setPreStartDegassingAcknowledgementKey(degassingAcknowledgementKey);
        return;
      }
      if (!repositoryState.repository || persistence.busy) return;
      if (session.degassingAcknowledgedAt) return;
      setPersistence({ busy: true, error: null });
      try {
        const durableRun = await repositoryState.repository.acknowledgeDegassing(session.sessionId);
        replaceSession(
          mergePendingProductionDrafts(
            hydrateProductionSessionFromRun(durableRun, source, plannedInput, plannedComposition),
            session,
          ),
        );
      } catch {
        setPersistence({
          busy: false,
          error: 'Nie zapisano potwierdzenia odgazowania. Partia pozostaje bez zmian.',
        });
        setReconcileRevision((current) => current + 1);
        return;
      } finally {
        setPersistence((current) => ({ ...current, busy: false }));
      }
    },
    archiveStaleSession: async () => {
      if (!session || persistence.busy) return;
      if (recoveryOrphanedLocal) {
        archiveCurrentSession();
        setRecovery((current) => ({
          ...current,
          error: null,
          orphanedLocal: false,
        }));
        return;
      }
      if (!staleSource || !repositoryState.repository) return;
      setPersistence({ busy: true, error: null });
      try {
        await repositoryState.repository.transition(
          session.sessionId,
          'cancelled',
          ownerUserId ?? '',
        );
        archiveCurrentSession();
      } catch {
        setPersistence({
          busy: false,
          error: 'Nie udało się bezpiecznie zarchiwizować trwałego runu Produkcji.',
        });
        setReconcileRevision((current) => current + 1);
        return;
      } finally {
        setPersistence((current) => ({ ...current, busy: false }));
      }
    },
    requestRescueAuthorization,
    refreshRescueAuthorization,
    consumeAuthorizedRescue,
    selectRescueOption,
    applySelectedRescueOption,
    retryRescueOptions: () => setRescueOptionsRetryRevision((current) => current + 1),
    dismissRescueAuthorization: () => updateRescueAuthorization({ status: 'idle' }),
    setDraftActual: (lineId: string, grams: number) => {
      if (persistence.busy) return;
      updateRescueAuthorization({ status: 'idle' });
      setDraftActual(lineId, grams);
    },
    confirmLine: async (lineId: string) => {
      if (!session || !repositoryState.repository || persistence.busy) return;
      updateRescueAuthorization({ status: 'idle' });
      const previous = [...session.lines, ...session.addonLines].find(
        (line) => line.lineId === lineId,
      );
      if (!previous) return;
      const candidate = confirmProductionLine(session, lineId, new Date().toISOString());
      setPersistence({ busy: true, error: null });
      try {
        const durableRun = await repositoryState.repository.recordActual(session.sessionId, {
          ...durableActual(candidate, ownerUserId ?? ''),
          eventContext: {
            action: previous.recordCorrectionCount > 0 ? 'record_correction' : 'confirm',
            lineId,
            previousActualG:
              previous.recordCorrectionCount > 0 ? previous.physicalAddedGrams : null,
          },
        });
        replaceSession(
          mergePendingProductionDrafts(
            hydrateProductionSessionFromRun(durableRun, source, plannedInput, plannedComposition),
            candidate,
          ),
        );
      } catch {
        setPersistence({
          busy: false,
          error:
            'Nie zapisano potwierdzenia. Wartość pozostaje szkicem i można spróbować ponownie.',
        });
        setReconcileRevision((current) => current + 1);
        return;
      } finally {
        setPersistence((current) => ({ ...current, busy: false }));
      }
    },
    /**
     * OWNER RULE §12/§20 — the operator added the missing grams. The committed
     * physical mass grows to the current plan target; it never shrinks, and the
     * frozen plan is untouched.
     */
    topUpLine: async (lineId: string, totalGrams: number) => {
      if (!session || !repositoryState.repository || persistence.busy) return;
      const candidate = topUpProductionLine(session, lineId, totalGrams, new Date().toISOString());
      setPersistence({ busy: true, error: null });
      try {
        const durableRun = await repositoryState.repository.recordActual(session.sessionId, {
          ...durableActual(candidate, ownerUserId ?? ''),
          eventContext: {
            action: 'top_up',
            lineId,
            previousActualG:
              [...session.lines, ...session.addonLines].find((line) => line.lineId === lineId)
                ?.physicalAddedGrams ?? null,
          },
        });
        replaceSession(
          mergePendingProductionDrafts(
            hydrateProductionSessionFromRun(durableRun, source, plannedInput, plannedComposition),
            candidate,
          ),
        );
      } catch {
        setPersistence({
          busy: false,
          error: 'Nie zapisano dodanej ilości. Wartość w naczyniu pozostaje bez zmian.',
        });
        setReconcileRevision((current) => current + 1);
      } finally {
        setPersistence((current) => ({ ...current, busy: false }));
      }
    },
    reopenRecord: (lineId: string) => {
      if (!session || persistence.busy) return;
      // Opening the editor is a local draft operation. The last confirmed
      // physical fact stays durable until the operator explicitly confirms a
      // corrected entry, so reload can never turn a real amount into null.
      replaceSession(reopenProductionRecord(session, lineId));
    },
    complete: async () => {
      if (!session || !repositoryState.repository || persistence.busy) return;
      if (browserProductionRescueDecision(session).state !== 'not_needed') {
        setPersistence({
          busy: false,
          error: 'Najpierw wybierz sposób postępowania z odchyleniem.',
        });
        return;
      }
      setPersistence({ busy: true, error: null });
      try {
        const completionCandidate = completeProductionSession(
          session,
          calculateRecipe(buildFinalActualInput(session)),
          new Date().toISOString(),
          ownerUserId,
        );
        if (!completionCandidate.completionSnapshot) {
          throw new Error('Completed Production snapshot was not created.');
        }
        const durableRun = await repositoryState.repository.completeRun(
          session.sessionId,
          durableActual(session, ownerUserId ?? ''),
          completionCandidate.completionSnapshot,
        );
        const completedSession = hydrateProductionSessionFromRun(
          durableRun,
          source,
          plannedInput,
          plannedComposition,
        );
        replaceSession(completedSession);
      } catch {
        setPersistence({
          busy: false,
          error: 'Nie udało się trwale zakończyć partii. Sesja pozostaje otwarta.',
        });
        setReconcileRevision((current) => current + 1);
        return;
      } finally {
        setPersistence((current) => ({ ...current, busy: false }));
      }
    },
    startNewSession: async () => {
      if (!canStartProduction || sessionStart.busy) return;
      setSessionStart({ busy: true, error: null });
      try {
        const localAuthority = evaluateRecipeConstraintAuthority({
          recipe: plannedInput,
          snapshots: plannedComposition.behaviorSnapshots ?? {},
          // The persisted snapshot belongs to the immutable recipe version.
          // Its cached PRODUCTION bit can therefore be older than the fresh
          // server decision (notably for advisory-only process evidence). Keep
          // this local exact-candidate gate on immutable RECIPE_VERSION authority,
          // then require canonical server PRODUCTION validation immediately
          // below and again in production_start_run_v2.
          module: 'RECIPE_VERSION',
          technicalOnlyMainLineIds: plannedComposition.ownerReviewGate?.technicalOnlyMainLineIds,
        });
        if (!localAuthority.valid) {
          setSessionStart({
            busy: false,
            error:
              localAuthority.issues[0]?.messagePl ??
              'Produkcja zablokowana: receptura nie spełnia pełnej weryfikacji profilu.',
          });
          return;
        }
        if (requiredBehaviorLineIds.length > 0) {
          const validation = await validateRecipeBehaviorOnServer({
            recipe: plannedInput,
            toppings: plannedComposition.toppings,
            snapshots: plannedComposition.behaviorSnapshots ?? {},
            module: 'PRODUCTION',
            accountId: ownerUserId,
          });
          // Only product authority can hold Production. Process readiness is
          // information and is deliberately not consulted here.
          if (!validation.ready) {
            setBehaviorServerGate({
              key: behaviorValidationKey,
              ready: false,
              message:
                'Produkcja wymaga odświeżenia bieżącej weryfikacji produktów. Obliczenie receptury pozostaje bez zmian.',
              processReadiness: validation.processReadiness ?? null,
            });
            return;
          }
        }
        if (
          !repositoryState.repository ||
          !source.recipeId ||
          !source.recipeVersionId ||
          !source.recipeVersionNumber ||
          !ownerUserId
        ) {
          throw new Error('Durable Production source is unavailable.');
        }
        const createdAt = recipe.currentVersionDate ?? new Date().toISOString();
        const version = buildRecipeVersion(
          {
            recipeId: source.recipeId,
            ownerUserId,
            versionNumber: source.recipeVersionNumber,
            recipeInput: plannedInput,
            productComposition: plannedComposition,
            trace: {
              engineVersion: ENGINE_VERSION,
              configVersion: CONFIG_VERSION,
              mapperDatasetVersion: null,
            },
            source: 'manual',
            createdBy: ownerUserId,
            createdAt,
            productProfile: plannedInput.category,
            temperatureC: plannedInput.target_temperature_c,
          },
          source.recipeVersionId,
        );
        const activeRun = await repositoryState.repository.startRun({
          ownerUserId,
          version,
          target: { kind: 'weight_g', grams: plannedInput.target_batch_grams },
          capabilities: productionCapabilitiesFor(persona),
          by: ownerUserId,
        });
        const heatAcknowledgedRun =
          heatAdvisories.length > 0
            ? await repositoryState.repository.acknowledgeHeatInformation(activeRun.runId)
            : activeRun;
        const acknowledgedRun =
          carbonatedProducts.length > 0
            ? await repositoryState.repository.acknowledgeDegassing(heatAcknowledgedRun.runId)
            : heatAcknowledgedRun;
        restoreDurableSession(
          hydrateProductionSessionFromRun(
            acknowledgedRun,
            source,
            plannedInput,
            plannedComposition,
          ),
        );
        setPreStartHeatAcknowledgementKey(null);
        setPreStartDegassingAcknowledgementKey(null);
      } catch {
        setSessionStart({
          busy: false,
          error: 'Nie udało się bezpiecznie rozpocząć partii. Plan nie został uruchomiony.',
        });
        setReconcileRevision((current) => current + 1);
        return;
      } finally {
        setSessionStart((current) => ({ ...current, busy: false }));
      }
    },
  };
}

export type ProductionWorkspaceView = ReturnType<typeof useProductionWorkspace>;
