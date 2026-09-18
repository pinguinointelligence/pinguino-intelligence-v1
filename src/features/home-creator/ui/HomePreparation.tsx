/**
 * DESIGN V3.0 IV D–I — HOME production: „HOME wygląda jak HOME, a od chwili robienia lodów
 * działa jak PRO”.
 *
 * HOME is only the HOST here. It starts the canonical Production session for its draft
 * (the unchanged start gate below: local recipe authority, server ProductBehavior
 * validation, the draft address — Save is never forced), picks the machine's guide, and
 * frames the ONE batch process (`production-workspace/process`): „‹ Wróć”, „Zapisz”, its
 * bottom-sheet layer and the „Partia gotowa” actions. The steps, the weighing with the ✓,
 * „Korekta partii”, „Co się stało?”, the machine step, „NIE MIKSUJ” and the summary are
 * the shared process presentation driven by `useLocalProductionProcess` — the same one
 * the Produkcja area hosts.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  machineEducationForSelection,
  type MachineEducationGuide,
} from '@/features/education/machineEducation';
import type { ProductionSession } from '@/features/production-workspace/productionSession';
import {
  productionSessionAddressKey,
  useProductionSessionStore,
} from '@/features/production-workspace/productionSessionStore';
import { ProductionProcess } from '@/features/production-workspace/process/ProductionProcess';
import {
  ProcessBackButton,
  ProcessColumn,
  ProcessDone,
} from '@/features/production-workspace/process/ProductionProcessParts';
import { formatProductionGrams } from '@/features/production-workspace/process/productionProcessSteps';
import { useLocalProductionProcess } from '@/features/production-workspace/process/useLocalProductionProcess';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  productBehaviorRequiredLineIds,
  type ProductProcessReadiness,
} from '@/features/product-intelligence';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';
import { validateRecipeBehaviorOnServer } from '@/services/productIntelligence';
import { carbonatedProductsForRecipe } from '@/features/production-workspace/productionDegassing';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { homeCustomerNotice } from '../homeCustomerNotice';
import { useHomeDraftStore } from '../homeDraftStore';
import { HomeLayer } from './HomeLayer';

const sessionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `home-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const pillButton =
  'inline-flex h-11 min-w-0 items-center justify-center rounded-full border border-[var(--g-line)] bg-white px-2.5 text-[14px] font-semibold whitespace-nowrap text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';
const primaryButton =
  'inline-flex h-[52px] w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

export function HomePreparation({
  name,
  onBack,
  onSaveBatch,
  onSave,
  onShare,
  onCommunity,
  saved = false,
  notice = null,
}: {
  name: string;
  /** „‹ Wróć” — back to the recipe; the batch stays in its step. */
  onBack: () => void;
  /** „Zapisz” — the batch is kept on this device in its step; back to the recipe. */
  onSaveBatch: () => void;
  onSave: () => void;
  onShare: () => void;
  onCommunity: () => void;
  /** The recipe is saved and unchanged: „Udostępnij” becomes the one black action. */
  saved?: boolean;
  notice?: string | null;
}) {
  const recipe = useRecipeStore();
  const draft = useHomeDraftStore();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const production = useProductionSessionStore();
  const activateSessionForAddress = production.activateSessionForAddress;
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
  // A Professional recipe (an official Gellatti recipe opened in HOME keeps its
  // Professional machine, §16) has no home-machine guide. PRO Production runs such a
  // batch with no machine hand-off (`machineGuide: null`); HOME does exactly the same
  // rather than ending in „Brakuje instrukcji urządzenia” with no way on (served
  // 2026-09-18: Mango Sorbet → „Zróbmy to”). A HOME machine with no confirmed guide
  // still stops below — that is an unconfirmed process, not a missing hand-off.
  const professionalWithoutGuide = guide === null && recipe.machineKind === 'professional';
  const back = <ProcessBackButton onClick={onBack} testId="home-production-back" />;

  if (!session) {
    const blocked = productionGate?.key === gateKey && productionGate.status === 'blocked';
    return (
      <ProcessColumn testId={blocked ? 'home-preparation-blocked' : 'home-preparation'}>
        <div className="flex min-h-11 items-center">{back}</div>
        <p className="mt-4 text-sm text-stone-600" role={blocked ? 'alert' : undefined}>
          {blocked
            ? productionGate?.message
            : 'Potwierdzamy kroki przygotowania dla tej receptury…'}
        </p>
      </ProcessColumn>
    );
  }

  if (!guide && !professionalWithoutGuide) {
    return (
      <ProcessColumn testId="home-preparation-blocked">
        <div className="flex min-h-11 items-center">{back}</div>
        <h2 className="mt-4 text-2xl font-semibold">Brakuje instrukcji urządzenia</h2>
        <p className="mt-3 text-sm text-stone-600">
          Wybierz ponownie urządzenie. Nie pokażemy niepotwierdzonego procesu.
        </p>
      </ProcessColumn>
    );
  }

  return (
    <HomeProductionRun
      key={session.sessionId}
      session={session}
      guide={guide}
      name={name}
      back={back}
      ownerUserId={ownerUserId}
      onSaveBatch={onSaveBatch}
      onSave={onSave}
      onShare={onShare}
      onCommunity={onCommunity}
      saved={saved}
      notice={notice}
    />
  );
}

/** One running (or finished) HOME batch in the shared process presentation. */
function HomeProductionRun({
  session,
  guide,
  name,
  back,
  ownerUserId,
  onSaveBatch,
  onSave,
  onShare,
  onCommunity,
  saved,
  notice,
}: {
  session: ProductionSession;
  guide: MachineEducationGuide | null;
  name: string;
  back: ReactNode;
  ownerUserId: string | null;
  onSaveBatch: () => void;
  onSave: () => void;
  onShare: () => void;
  onCommunity: () => void;
  saved: boolean;
  notice: string | null;
}) {
  const preparationSteps = useHomeDraftStore((state) => state.preparationSteps);
  const process = useLocalProductionProcess({
    session,
    guide,
    // „Przerwanie w HOME”: the steps with no record in the session (machine preparation,
    // the heat step) are remembered with the draft, so „Wróć”, „Zapisz” and a refresh
    // return to the same step.
    doneStepIds:
      preparationSteps?.sessionId === session.sessionId ? preparationSteps.doneStepIds : [],
    onStepDone: (runId, stepId) =>
      useHomeDraftStore.getState().markPreparationStepDone(runId, stepId),
    operatorUserId: ownerUserId,
  });

  if (session.status === 'completed') {
    const finalMassG =
      session.completionSnapshot?.actualFinalMassG ??
      session.lines.reduce((sum, line) => sum + line.physicalAddedGrams, 0);
    return (
      <ProcessColumn testId="home-production-complete">
        <div className="flex min-h-11 items-center">{back}</div>
        <ProcessDone
          subtitle={`${name} · ${formatProductionGrams(finalMassG)}`}
          stepTitles={process.steps.map((step) => step.title)}
          note={homeCreatorCopy.production.doneKept}
          notice={notice}
          noticeConfirmed={saved}
          actions={
            <>
              <div className="grid grid-cols-2 gap-2">
                {saved ? (
                  <button
                    type="button"
                    className={pillButton}
                    onClick={onSave}
                    data-testid="home-done-save"
                  >
                    {homeCreatorCopy.recipe.save}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={pillButton}
                    onClick={onShare}
                    data-testid="home-done-share"
                  >
                    {homeCreatorCopy.recipeScreen.share}
                  </button>
                )}
                <button
                  type="button"
                  className={pillButton}
                  onClick={onCommunity}
                  data-testid="home-done-community"
                >
                  {homeCreatorCopy.recipeScreen.community}
                </button>
              </div>
              <button
                type="button"
                onClick={saved ? onShare : onSave}
                data-testid={saved ? 'home-done-share' : 'home-done-save'}
                className={primaryButton}
                style={{ background: 'var(--g-ink)' }}
              >
                {saved ? homeCreatorCopy.recipeScreen.share : homeCreatorCopy.recipe.save}
              </button>
            </>
          }
        />
      </ProcessColumn>
    );
  }

  return (
    <ProductionProcess
      controller={process}
      name={name}
      machineId={guide?.sourceMachineId ?? null}
      back={back}
      hostAction={
        <button
          type="button"
          onClick={onSaveBatch}
          data-testid="home-production-save"
          className="inline-flex h-10 items-center rounded-full border border-[var(--g-line)] bg-white px-[18px] text-[14px] font-semibold text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {homeCreatorCopy.production.saveBatch}
        </button>
      }
      sheetFrame={HomeLayer}
      testId="home-preparation"
    />
  );
}
