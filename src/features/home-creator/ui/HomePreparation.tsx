import { useEffect, useMemo, useState } from 'react';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { machineEducationForSelection } from '@/features/education/machineEducation';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  completeProductionSession,
  confirmProductionTopUpTask,
  setProductionTopUpDraftGrams,
  type ProductionLineState,
} from '@/features/production-workspace/productionSession';
import { assessProductionRescue } from '@/features/production-workspace/productionRescue';
import {
  productionSessionAddressKey,
  useProductionSessionStore,
} from '@/features/production-workspace/productionSessionStore';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  productBehaviorRequiredLineIds,
  type ProductProcessReadiness,
} from '@/features/product-intelligence';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';
import { validateRecipeBehaviorOnServer } from '@/services/productIntelligence';
import { carbonatedProductsForRecipe } from '@/features/production-workspace/productionDegassing';
import {
  preparationOrderedBaseLines,
  preparationPlanForSession,
  type PreparationStep,
} from '@/features/production-workspace/preparationPlan';
import { educationCopy } from '@/copy/education.pl';
import { PreparationIllustrationImage } from '@/features/education/PreparationIllustrationImage';
import { homeCustomerNotice } from '../homeCustomerNotice';
import { useHomeDraftStore } from '../homeDraftStore';
import { HomeSection } from './HomeSection';

const primary =
  'inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold text-white disabled:opacity-40';
const secondary =
  'inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm disabled:opacity-40';

const sessionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `home-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function ActualEntry({
  line,
  onConfirm,
}: {
  line: ProductionLineState;
  onConfirm: (grams: number) => void;
}) {
  const [showActual, setShowActual] = useState(false);
  const [raw, setRaw] = useState(String(line.targetGrams));
  const grams = Number(raw.replace(',', '.'));
  const valid = Number.isFinite(grams) && grams >= 0;

  return (
    <div className="mt-5 space-y-3" data-testid="home-production-actual">
      {showActual ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm text-stone-600">Ile pokazuje teraz waga?</span>
          <span className="flex items-center gap-2">
            <input
              autoFocus
              inputMode="decimal"
              value={raw}
              onChange={(event) => setRaw(event.currentTarget.value)}
              className="h-12 w-32 rounded-xl border px-3 text-center font-mono"
              aria-label="Rzeczywista ilość w gramach"
              data-testid="home-production-actual-input"
            />
            <span>g</span>
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primary}
          style={{ background: 'var(--g-ink)' }}
          onClick={() => onConfirm(showActual ? grams : line.targetGrams)}
          disabled={showActual && !valid}
          data-testid="home-production-confirm-line"
        >
          {showActual ? 'Potwierdź ilość' : 'Dodałem dokładnie'}
        </button>
        {!showActual ? (
          <button
            type="button"
            className={secondary}
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            onClick={() => setShowActual(true)}
            data-testid="home-production-overage"
          >
            Dodałem za dużo
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The plan's heat step at its moment. Information only: no button, no state, no gate. */
function HeatStepNotice({ step }: { step: Extract<PreparationStep, { kind: 'heat' }> }) {
  return (
    <div
      className="mb-4 rounded-2xl border p-4"
      style={{ borderColor: 'var(--g-line)' }}
      data-testid="home-preparation-heat-step"
    >
      <h3 className="text-sm font-semibold">{step.title}</h3>
      <p className="mt-1 text-sm text-stone-700">
        {educationCopy.preparation.heat.lead} {step.productNames.join(', ')}
      </p>
      {step.details.map((detail) => (
        <p key={detail} className="mt-1 text-sm text-stone-500">
          {detail}
        </p>
      ))}
    </div>
  );
}

export function HomePreparation({
  name,
  onSave,
  onShare,
  onCommunity,
}: {
  name: string;
  onSave: () => void;
  onShare: () => void;
  onCommunity: () => void;
}) {
  const recipe = useRecipeStore();
  const draft = useHomeDraftStore();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const production = useProductionSessionStore();
  const activateSessionForAddress = production.activateSessionForAddress;
  const [error, setError] = useState<string | null>(null);
  const [taredLineIds, setTaredLineIds] = useState<readonly string[]>([]);
  const [productionGate, setProductionGate] = useState<{
    key: string;
    status: 'loading' | 'ready' | 'blocked';
    message: string | null;
  } | null>(null);
  const plannedInput = useMemo(() => buildRecipeInput(recipe), [recipe]);
  const plannedComposition = useMemo(() => recipeCompositionFromState(recipe), [recipe]);
  const gateKey = useMemo(
    () =>
      JSON.stringify({
        ownerUserId,
        recipe: plannedInput,
        toppings: plannedComposition.toppings,
        snapshots: plannedComposition.behaviorSnapshots ?? {},
      }),
    [ownerUserId, plannedComposition, plannedInput],
  );
  const source = useMemo(
    () => ({
      // Production may begin before Save. This stable local draft address keeps the
      // physical run continuous when an immutable recipe version is created later.
      recipeId: draft.draftId,
      recipeVersionId: null,
      recipeVersionNumber: null,
      recipeName: name,
    }),
    [draft.draftId, name],
  );
  const address = useMemo(
    () => ({ ownerUserId, recipeId: source.recipeId, recipeVersionId: source.recipeVersionId }),
    [ownerUserId, source.recipeId, source.recipeVersionId],
  );
  const addressKey = productionSessionAddressKey(address);

  useEffect(() => {
    activateSessionForAddress(address);
  }, [activateSessionForAddress, address, addressKey]);

  useEffect(() => {
    const current = useProductionSessionStore.getState();
    if (current.session || current.activeAddressKey !== addressKey) return;
    let cancelled = false;

    void (async () => {
      if (!ownerUserId) {
        if (!cancelled) {
          setProductionGate({
            key: gateKey,
            status: 'blocked',
            message: 'Zaloguj się, aby bezpiecznie rozpocząć przygotowanie.',
          });
        }
        return;
      }
      const localAuthority = evaluateRecipeConstraintAuthority({
        recipe: plannedInput,
        snapshots: plannedComposition.behaviorSnapshots ?? {},
        module: 'RECIPE_VERSION',
        technicalOnlyMainLineIds: plannedComposition.ownerReviewGate?.technicalOnlyMainLineIds,
      });
      if (!localAuthority.valid) {
        if (!cancelled) {
          setProductionGate({
            key: gateKey,
            status: 'blocked',
            message:
              homeCustomerNotice(localAuthority.issues[0]?.messagePl ?? null) ??
              'Nie możemy jeszcze potwierdzić tego kroku przygotowania.',
          });
        }
        return;
      }

      const requiredLineIds = productBehaviorRequiredLineIds({
        items: plannedInput.items,
        toppings: plannedComposition.toppings,
      });
      let processReadiness: ProductProcessReadiness = {
        schemaVersion: 1,
        status: 'READY',
        blockers: [],
        advisories: [],
      };
      if (requiredLineIds.length > 0) {
        const validation = await validateRecipeBehaviorOnServer({
          recipe: plannedInput,
          toppings: plannedComposition.toppings,
          snapshots: plannedComposition.behaviorSnapshots ?? {},
          module: 'PRODUCTION',
          accountId: ownerUserId,
        });
        if (!validation.ready) {
          if (!cancelled) {
            setProductionGate({
              key: gateKey,
              status: 'blocked',
              message:
                'Nie możemy jeszcze potwierdzić przygotowania dla wszystkich wybranych produktów.',
            });
          }
          return;
        }
        processReadiness = validation.processReadiness ?? processReadiness;
      }
      if (cancelled || useProductionSessionStore.getState().activeAddressKey !== addressKey) return;
      const carbonated = carbonatedProductsForRecipe(plannedInput, plannedComposition);
      const processAdvisories = [...processReadiness.blockers, ...processReadiness.advisories];
      useProductionSessionStore.getState().startNewSession({
        ownerUserId,
        source,
        plannedInput,
        plannedComposition,
        now: new Date().toISOString(),
        sessionId: sessionId(),
        processReadiness: processAdvisories.length > 0 ? 'READY_WITH_INFO' : 'READY',
        processAdvisories,
        degassingRequired: carbonated.length > 0,
        carbonatedProductIds: carbonated.map((product) => product.productId),
      });
      setProductionGate({ key: gateKey, status: 'ready', message: null });
    })().catch(() => {
      if (!cancelled) {
        setProductionGate({
          key: gateKey,
          status: 'blocked',
          message: 'Nie udało się potwierdzić przygotowania. Spróbuj ponownie.',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [addressKey, gateKey, ownerUserId, plannedComposition, plannedInput, source]);

  const session = production.session;
  const guide = useMemo(
    () => machineEducationForSelection(recipe.machineId, recipe.machineTechnology),
    [recipe.machineId, recipe.machineTechnology],
  );
  const rescue = useMemo(() => (session ? assessProductionRescue(session) : null), [session]);
  // The same preparation plan PRO Production renders: order, instruction and notes.
  const plan = useMemo(
    () => (session ? preparationPlanForSession(session, guide) : null),
    [guide, session],
  );
  const rescueResolved = Boolean(
    session?.lastDeviationDecision &&
    session.lastDeviationDecision.sourceActualRevision === session.durableActualRevision &&
    session.lastDeviationDecision.rescueRevision === session.durableRescueRevision,
  );
  const baseDone = Boolean(
    session && session.lines.length > 0 && session.lines.every((line) => line.confirmed),
  );
  const activeBase = session
    ? (preparationOrderedBaseLines(session).find((line) => !line.confirmed) ?? null)
    : null;
  const activeAddon = session?.addonLines.find((line) => !line.confirmed) ?? null;
  const activeTopUp = session?.topUpTasks.find((task) => task.status === 'pending') ?? null;
  const machineStepCompleted = Boolean(session && baseDone && session.stage === 'addons');
  const activeLine = baseDone && machineStepCompleted ? activeAddon : activeBase;
  const planStepForLine = (lineId: string) =>
    plan?.steps.find(
      (step): step is Extract<PreparationStep, { kind: 'line' }> =>
        step.kind === 'line' && step.lineId === lineId,
    ) ?? null;
  const beforeStartStep =
    plan?.steps.find(
      (step): step is Extract<PreparationStep, { kind: 'machine_before' }> =>
        step.kind === 'machine_before',
    ) ?? null;
  const machineStep =
    plan?.steps.find(
      (step): step is Extract<PreparationStep, { kind: 'machine' }> => step.kind === 'machine',
    ) ?? null;
  const heatStep =
    plan?.steps.find(
      (step): step is Extract<PreparationStep, { kind: 'heat' }> => step.kind === 'heat',
    ) ?? null;
  // Shown once the heated part is weighed, until the machine step is done. Information only.
  const heatStepDue = Boolean(
    session &&
    heatStep &&
    !machineStepCompleted &&
    session.addonLines.every((line) => !line.confirmed) &&
    heatStep.precedingLineIds.every(
      (lineId) => session.lines.find((line) => line.lineId === lineId)?.confirmed === true,
    ),
  );
  // On the machine card only when no Base line is added after the heated part.
  const heatStepOnMachineCard = Boolean(
    session &&
    heatStep &&
    session.lines.every((line) => heatStep.precedingLineIds.includes(line.lineId)),
  );
  const activeStep = activeLine ? planStepForLine(activeLine.lineId) : null;
  const allDone = Boolean(
    session &&
    baseDone &&
    session.addonLines.every((line) => line.confirmed) &&
    machineStepCompleted,
  );

  const confirm = (line: ProductionLineState, grams: number) => {
    setError(null);
    try {
      useProductionSessionStore.getState().setDraftActual(line.lineId, grams);
      useProductionSessionStore.getState().confirmLine(line.lineId, new Date().toISOString());
      const confirmed = useProductionSessionStore.getState().session;
      if (confirmed) {
        // Only a Base confirmation reaches the machine handoff; confirming a topping
        // must not send the customer back to the machine step.
        const justCompletedBase =
          confirmed.lines.some((candidate) => candidate.lineId === line.lineId) &&
          confirmed.lines.every((candidate) => candidate.confirmed);
        useProductionSessionStore.getState().replaceSession({
          ...confirmed,
          // The shared confirmer opens `addons` as soon as BASE is complete. HOME
          // holds that existing Production stage until the customer confirms the
          // canonical machine handoff, then opens the late-addition stage below.
          stage: justCompletedBase ? 'base' : confirmed.stage,
          durableActualRevision: confirmed.durableActualRevision + 1,
          lastDeviationDecision: null,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się potwierdzić ilości.');
    }
  };

  if (!session) {
    const blocked = productionGate?.key === gateKey && productionGate.status === 'blocked';
    return (
      <HomeSection
        id="preparation"
        fill={false}
        data-testid={blocked ? 'home-preparation-blocked' : 'home-preparation'}
      >
        <p className="text-sm text-stone-600" role={blocked ? 'alert' : undefined}>
          {blocked
            ? productionGate?.message
            : 'Potwierdzamy kroki przygotowania dla tej receptury…'}
        </p>
      </HomeSection>
    );
  }

  if (!guide) {
    return (
      <HomeSection id="preparation" fill={false} data-testid="home-preparation-blocked">
        <h2 className="text-2xl font-semibold">Brakuje instrukcji urządzenia</h2>
        <p className="mt-3 text-sm text-stone-600">
          Wybierz ponownie urządzenie. Nie pokażemy niepotwierdzonego procesu.
        </p>
      </HomeSection>
    );
  }

  const carbonatedProducts = carbonatedProductsForRecipe(
    session.plannedInput,
    session.plannedComposition,
  );

  if (session.status === 'completed') {
    return (
      <HomeSection id="preparation" fill={false} data-testid="home-production-complete">
        <p className="text-xs font-bold tracking-[0.12em] text-stone-400 uppercase">Gotowe</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{name}</h2>
        <p className="mt-3 text-sm text-stone-600">
          Partia została zakończona i zachowana na tym urządzeniu.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <button
            type="button"
            className={primary}
            style={{ background: 'var(--g-ink)' }}
            onClick={onSave}
          >
            Zapisz recepturę
          </button>
          <button
            type="button"
            className={secondary}
            style={{ borderColor: 'var(--g-line)' }}
            onClick={onShare}
          >
            Udostępnij
          </button>
          <button
            type="button"
            className={secondary}
            style={{ borderColor: 'var(--g-line)' }}
            onClick={onCommunity}
          >
            Opublikuj w Community
          </button>
        </div>
      </HomeSection>
    );
  }

  return (
    <HomeSection id="preparation" fill={false} data-testid="home-preparation">
      <p className="text-xs font-bold tracking-[0.12em] text-stone-400 uppercase">Przygotowanie</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{name}</h2>

      {beforeStartStep && session.lines.every((line) => !line.confirmed) ? (
        <div
          className="mt-4 rounded-2xl border p-4"
          style={{ borderColor: 'var(--g-line)' }}
          data-testid="home-preparation-before-start"
        >
          <h3 className="text-sm font-semibold">{beforeStartStep.title}</h3>
          <ul className="mt-1 text-sm text-stone-700">
            {beforeStartStep.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
          <p className="mt-1 text-sm text-stone-500">{beforeStartStep.timing}</p>
        </div>
      ) : null}

      {/* Owner addendum 2026-09-17: no separate heat reminder with OK — the heat
          treatment is one step of the plan, shown at its moment below. */}
      {session.degassingRequired && !session.degassingAcknowledged ? (
        <div
          className="mt-6 rounded-2xl border p-5"
          style={{ borderColor: 'var(--g-line)' }}
          data-testid="home-production-degassing"
        >
          <h3 className="text-lg font-semibold">Najpierw odgazuj</h3>
          <p className="mt-2 text-sm text-stone-600">Przed użyciem należy całkowicie odgazować:</p>
          <ul className="mt-2 text-sm text-stone-700">
            {carbonatedProducts.map((product) => (
              <li key={product.productId}>• {product.name}</li>
            ))}
          </ul>
          <button
            type="button"
            className={`${primary} mt-4`}
            style={{ background: 'var(--g-ink)' }}
            onClick={() =>
              useProductionSessionStore
                .getState()
                .replaceSession({
                  ...session,
                  degassingAcknowledged: true,
                  degassingAcknowledgedAt: new Date().toISOString(),
                })
            }
          >
            Odgazowane
          </button>
        </div>
      ) : !rescueResolved && rescue?.state === 'options' ? (
        <div
          className="mt-6 rounded-2xl border p-5"
          style={{ borderColor: 'var(--g-line)' }}
          data-testid="home-rescue-options"
        >
          <h3 className="text-lg font-semibold">Uratujmy tę partię</h3>
          <p className="mt-2 text-sm text-stone-600">
            Wybierz jeden z wariantów sprawdzonych przez silnik.
          </p>
          <div className="mt-4 grid gap-2">
            {rescue.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="rounded-xl border p-4 text-left"
                style={{ borderColor: 'var(--g-line)' }}
                data-testid={`home-rescue-${option.id}`}
                onClick={() => {
                  try {
                    const next = applyVerifiedRescueInput(session, option.candidateInput);
                    useProductionSessionStore.getState().replaceSession({
                      ...next,
                      lastDeviationDecision: {
                        strategy: option.id,
                        acceptedAt: new Date().toISOString(),
                        sourceActualRevision: session.durableActualRevision,
                        rescueRevision: next.durableRescueRevision,
                        finalMassG: option.finalMassG,
                        scoreDisplay: option.scoreDisplay,
                      },
                    });
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : 'Nie udało się zastosować korekty.',
                    );
                  }
                }}
              >
                <span className="block font-semibold">{option.title}</span>
                <span className="mt-1 block text-sm text-stone-600">{option.explanation}</span>
              </button>
            ))}
          </div>
        </div>
      ) : !rescueResolved && rescue?.state === 'impossible' ? (
        <p
          className="mt-6 rounded-xl border p-4 text-sm"
          role="alert"
          data-testid="home-rescue-impossible"
        >
          {rescue.reason}
        </p>
      ) : activeTopUp ? (
        <div className="mt-6" data-testid="home-rescue-top-up">
          <p className="text-sm text-stone-500">Korekta partii</p>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <h3 className="text-xl font-semibold">{activeTopUp.ingredientName}</h3>
            <span className="font-mono text-xl">+{activeTopUp.draftDeltaG} g</span>
          </div>
          {!taredLineIds.includes(activeTopUp.taskId) ? (
            <button
              type="button"
              className={`${primary} mt-5`}
              style={{ background: 'var(--g-ink)' }}
              onClick={() => setTaredLineIds((current) => [...current, activeTopUp.taskId])}
              data-testid="home-rescue-top-up-tare"
            >
              TARA
            </button>
          ) : (
            <button
              type="button"
              className={`${primary} mt-5`}
              style={{ background: 'var(--g-ink)' }}
              data-testid="home-rescue-top-up-confirm"
              onClick={() => {
                try {
                  const current = useProductionSessionStore.getState().session;
                  if (!current) return;
                  const drafted = setProductionTopUpDraftGrams(
                    current,
                    activeTopUp.taskId,
                    activeTopUp.authorizedDeltaG,
                  );
                  useProductionSessionStore
                    .getState()
                    .replaceSession(
                      confirmProductionTopUpTask(
                        drafted,
                        activeTopUp.taskId,
                        new Date().toISOString(),
                      ),
                    );
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : 'Nie udało się potwierdzić korekty.',
                  );
                }
              }}
            >
              Dodałem
            </button>
          )}
        </div>
      ) : baseDone && !machineStepCompleted ? (
        <div className="mt-6" data-testid="home-machine-step">
          {heatStepDue && heatStepOnMachineCard && heatStep ? (
            <HeatStepNotice step={heatStep} />
          ) : null}
          <h3 className="text-xl font-semibold">{guide.title}</h3>
          {machineStep?.illustration ? (
            <PreparationIllustrationImage
              illustration={machineStep.illustration}
              sizes="320px"
              className="mt-4 w-full max-w-xs"
            />
          ) : null}
          <ol className="mt-4 space-y-3 text-sm text-stone-700">
            {guide.steps.map((step, index) => (
              <li key={step}>
                {index + 1}. {step}
              </li>
            ))}
          </ol>
          {/* The shared plan decides which timing belongs here (a verified bowl
              pre-freeze was already shown before start). */}
          {machineStep?.timing ? (
            <p className="mt-4 text-sm text-stone-500">{machineStep.timing}</p>
          ) : null}
          {/* The customer does the machine step and moves on: a missing numeric
              time never holds the flow, and the click claims no elapsed time. */}
          <button
            type="button"
            className={`${primary} mt-6`}
            style={{ background: 'var(--g-ink)' }}
            onClick={() =>
              useProductionSessionStore
                .getState()
                .replaceSession({ ...session, stage: 'addons' })
            }
            data-testid="home-machine-complete"
          >
            Gotowe
          </button>
        </div>
      ) : activeLine ? (
        <div className="mt-6" data-testid={baseDone ? 'home-topping-step' : 'home-base-step'}>
          {!baseDone && heatStepDue && heatStep ? <HeatStepNotice step={heatStep} /> : null}
          <p className="text-sm text-stone-500">
            {activeStep?.instruction ?? (baseDone ? 'Dodaj po obróbce' : 'Dodaj do naczynia')}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <h3 className="text-xl font-semibold">{activeLine.name}</h3>
            <span className="font-mono text-xl">{Math.round(activeLine.targetGrams)} g</span>
          </div>
          {activeStep?.note ? (
            <p className="mt-1 text-sm text-stone-500" data-testid="home-production-line-note">
              {activeStep.note}
            </p>
          ) : null}
          {!taredLineIds.includes(activeLine.lineId) ? (
            <button
              type="button"
              className={`${primary} mt-5`}
              style={{ background: 'var(--g-ink)' }}
              onClick={() => setTaredLineIds((current) => [...current, activeLine.lineId])}
              data-testid="home-production-tare"
            >
              TARA
            </button>
          ) : (
            <ActualEntry line={activeLine} onConfirm={(grams) => confirm(activeLine, grams)} />
          )}
        </div>
      ) : allDone ? (
        <button
          type="button"
          className={`${primary} mt-6 w-full`}
          style={{ background: 'var(--g-ink)' }}
          data-testid="home-production-finish"
          onClick={() => {
            try {
              const current = useProductionSessionStore.getState().session;
              if (!current) return;
              useProductionSessionStore
                .getState()
                .replaceSession(
                  completeProductionSession(
                    current,
                    calculateRecipe(buildFinalActualInput(current)),
                    new Date().toISOString(),
                    ownerUserId,
                  ),
                );
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Nie udało się zakończyć partii.');
            }
          }}
        >
          Gotowe
        </button>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm" role="alert" style={{ color: 'var(--g-attention-ink)' }}>
          {error}
        </p>
      ) : null}
    </HomeSection>
  );
}
