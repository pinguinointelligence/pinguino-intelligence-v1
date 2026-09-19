/**
 * DESIGN V3.0 IV D–I — HOME production: „HOME wygląda jak HOME, a od chwili robienia lodów
 * działa jak PRO”.
 *
 * HOME is only the HOST here. From the moment the batch starts it IS the batch PRO runs:
 * `ProductionProcessHost` brings the one live `useProductionWorkspace`, the durable run
 * behind it and `useDurableProductionProcess` as its controller. HOME adds its frame and
 * nothing else — „‹ Wróć”, „Zapisz”, its bottom-sheet layer, the step memory kept with the
 * draft, and the accepted „Partia gotowa” screen.
 *
 * OD-24 (Owner 19.09.2026): the one thing HOME must do before the shared authority can
 * start is give the recipe a durable version to point at. A signed-in customer gets it
 * WITHOUT being made to save to „Receptury → Moje" — `ensureDurableProductionRecipe`
 * writes a technical, hidden snapshot through the same save authority a library save uses.
 * There is no second batch beside this one for a signed-in customer: a failure is shown and
 * retried, never quietly downgraded to a run that exists only in this browser.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONFIG_VERSION, ENGINE_VERSION } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { ensureDurableProductionRecipe } from '@/features/production-workspace/ensureDurableProductionRecipe';
import { productionVersionFingerprint } from '@/features/production-workspace/productionReadinessState';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { productionMachineGuide } from '@/features/education/machineEducation';
import { ProductionProcessHost } from '@/features/production-workspace/ProductionProcessHost';
import type {
  ProductionPrerequisiteCode,
  ProductionWorkspaceView,
} from '@/features/production-workspace/useProductionWorkspace';
import {
  ProcessBackButton,
  ProcessColumn,
  ProcessDone,
} from '@/features/production-workspace/process/ProductionProcessParts';
import { productionProcessCopy } from '@/features/production-workspace/process/productionProcessCopy';
import {
  formatProductionGrams,
  type ProductionProcessController,
} from '@/features/production-workspace/process/productionProcessSteps';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { useHomeDraftStore } from '../homeDraftStore';
import { HomeLayer } from './HomeLayer';

const pillButton =
  'inline-flex h-11 min-w-0 items-center justify-center rounded-full border border-[var(--g-line)] bg-white px-2.5 text-[14px] font-semibold whitespace-nowrap text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';
const primaryButton =
  'inline-flex h-[52px] w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

const WAITING = 'Potwierdzamy kroki przygotowania dla tej receptury…';
const UNAVAILABLE = 'Produkcja jest chwilowo niedostępna. Spróbuj ponownie.';
const SIGN_IN = 'Zaloguj się, aby bezpiecznie rozpocząć przygotowanie.';

/**
 * The shared gate answers a PRO operator in a PRO operator's words. The RULE is the same
 * one for both — only the sentence is HOME's. A prerequisite that is simply work in flight
 * is not an error and says nothing alarming.
 */
const HOME_PREREQUISITE_MESSAGE: Record<ProductionPrerequisiteCode, string | null> = {
  // The snapshot is being written right now: this one clears by itself.
  saved_version_required: null,
  server_validation_pending: null,
  repository_unavailable: UNAVAILABLE,
  repository_recovery: UNAVAILABLE,
  owner_mismatch: 'Ta partia należy do innego konta.',
  stale_source: 'Receptura zmieniła się po przygotowaniu tej partii. Wróć i zacznij od nowa.',
  product_authority_required:
    'Nie możemy jeszcze potwierdzić przygotowania dla wszystkich wybranych produktów.',
  process_authority_required:
    'Nie możemy jeszcze potwierdzić przygotowania dla wszystkich wybranych produktów.',
  server_validation_failed: 'Nie udało się potwierdzić przygotowania. Spróbuj ponownie.',
  preview_required: 'Ta receptura wymaga jeszcze przeliczenia. Wróć i przelicz ją.',
  preview_not_applied: 'Ta receptura wymaga jeszcze przeliczenia. Wróć i przelicz ją.',
  whole_grams_required: 'Ta receptura wymaga jeszcze przeliczenia. Wróć i przelicz ją.',
};

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
  /** „Zapisz” — the batch is kept in its step; back to the recipe. */
  onSaveBatch: () => void;
  onSave: () => void;
  onShare: () => void;
  onCommunity: () => void;
  /** The recipe is saved and unchanged: „Udostępnij” becomes the one black action. */
  saved?: boolean;
  notice?: string | null;
}) {
  const recipe = useRecipeStore();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const persona = useProCorePersona();
  const capabilities = useMemo(() => recipeCapabilitiesFor(persona), [persona]);
  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const preparationSteps = useHomeDraftStore((state) => state.preparationSteps);
  const plannedInput = useMemo(() => buildRecipeInput(recipe), [recipe]);
  const plannedComposition = useMemo(() => recipeCompositionFromState(recipe), [recipe]);
  /** OD-24: the recipe state a durable snapshot belongs to — the same fingerprint PRO uses. */
  const productionFingerprint = useMemo(
    () => productionVersionFingerprint(plannedInput, plannedComposition),
    [plannedComposition, plannedInput],
  );
  /* Only the ASYNC failure needs remembering, and only for the recipe state it happened
     to: a later edit is a new question, not the same refusal. */
  const [snapshotError, setSnapshotError] = useState<{ key: string; message: string } | null>(null);
  const repositoryMissing = ownerUserId !== null && repoState.repository === null;

  /* ── the durable reference, before the shared authority is asked for a batch ──────── */
  useEffect(() => {
    // Not signed in is not a failure to report — it is simply not this screen's job.
    if (!ownerUserId) return;
    const live = useRecipeStore.getState();
    // A library recipe brings its own immutable version; nothing technical is written for it.
    const alreadyDurable =
      (live.savedRecipeId !== null && live.savedProductionFingerprint === productionFingerprint) ||
      live.productionSnapshotFingerprint === productionFingerprint;
    if (alreadyDurable) return;
    const repository = repoState.repository;
    if (!repository) return;
    let cancelled = false;
    void ensureDurableProductionRecipe({
      repository,
      ownerUserId,
      recipeInput: plannedInput,
      productComposition: plannedComposition,
      title: name,
      capabilities,
      trace: { engineVersion: ENGINE_VERSION, configVersion: CONFIG_VERSION },
      /* Nothing on record describes THIS recipe state — that is why we are here. The
         reuse rule lives in the authority; what it needs from the screen is the truth. */
      existing: {
        recipeId: live.savedRecipeId ?? live.productionSnapshotRecipeId,
        versionId: live.currentVersionId ?? live.productionSnapshotVersionId,
        versionNumber: live.currentVersionNumber ?? live.productionSnapshotVersionNumber,
        matchesCurrentRecipe: false,
      },
    })
      .then((durable) => {
        if (cancelled) return;
        /* NOT `markSaved`: the customer did not save anything, and their recipe must not
           start claiming they did. This records only what the run points at. */
        useRecipeStore.getState().markProductionSnapshot({
          recipeId: durable.recipeId,
          versionId: durable.versionId,
          versionNumber: durable.versionNumber,
          fingerprint: productionFingerprint,
        });
      })
      .catch(() => {
        if (!cancelled) setSnapshotError({ key: productionFingerprint, message: UNAVAILABLE });
      });
    return () => {
      cancelled = true;
    };
  }, [
    capabilities,
    name,
    ownerUserId,
    plannedComposition,
    plannedInput,
    productionFingerprint,
    repoState.repository,
  ]);

  // The SAME machine hand-off authority PRO's Production uses — one rule, one file.
  const guide = useMemo(
    () =>
      productionMachineGuide({
        machineKind: recipe.machineKind,
        machineId: recipe.machineId,
        machineTechnology: recipe.machineTechnology,
      }),
    [recipe.machineId, recipe.machineKind, recipe.machineTechnology],
  );
  // A Professional recipe (an official Gellatti recipe opened in HOME keeps its
  // Professional machine, §16) has no home-machine guide. PRO Production runs such a
  // batch with no machine hand-off (`machineGuide: null`); HOME does exactly the same
  // rather than ending in „Brakuje instrukcji urządzenia” with no way on (served
  // 2026-09-18: Mango Sorbet → „Zróbmy to”). A HOME machine with no confirmed guide
  // still stops below — that is an unconfirmed process, not a missing hand-off.
  const professionalWithoutGuide = guide === null && recipe.machineKind === 'professional';
  const back = <ProcessBackButton onClick={onBack} testId="home-production-back" />;

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
    <ProductionProcessHost
      name={name}
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
      /* „Przerwanie w HOME”: the steps with no production record (machine preparation, the
         heat step) are remembered with the draft, so „Wróć”, „Zapisz” and a refresh come
         back to the same step. */
      stepMemory={{
        doneStepIds: (sessionId) =>
          preparationSteps?.sessionId === sessionId ? preparationSteps.doneStepIds : [],
        onStepDone: (sessionId, stepId) =>
          useHomeDraftStore.getState().markPreparationStepDone(sessionId, stepId),
      }}
      empty={(production) => (
        <HomeProductionStart
          production={production}
          back={back}
          error={
            !ownerUserId
              ? SIGN_IN
              : repositoryMissing
                ? UNAVAILABLE
                : snapshotError?.key === productionFingerprint
                  ? snapshotError.message
                  : null
          }
        />
      )}
      done={(production, controller) => (
        <HomeProductionDone
          production={production}
          controller={controller}
          name={name}
          back={back}
          onSave={onSave}
          onShare={onShare}
          onCommunity={onCommunity}
          saved={saved}
          notice={notice}
        />
      )}
    />
  );
}

/**
 * HOME never asks „czy zaczynamy?” twice: the customer already tapped „Zróbmy to”. This
 * asks the SHARED authority for the batch as soon as it says the recipe is ready, and
 * otherwise says, in HOME's words, what it is still waiting for.
 */
function HomeProductionStart({
  production,
  back,
  error,
}: {
  production: ProductionWorkspaceView;
  back: ReactNode;
  error: string | null;
}) {
  // The view is rebuilt every render; the effect must watch the STATE, not its identity.
  const live = useRef(production);
  useEffect(() => {
    live.current = production;
  });
  const startedFor = useRef<string | null>(null);
  const versionId = production.source.recipeVersionId ?? '';
  const ready = versionId !== '' && production.practicalReady && !production.sessionStarting;

  useEffect(() => {
    if (!ready || startedFor.current === versionId) return;
    // One request per durable version: a failed start is reported, not retried in a loop.
    startedFor.current = versionId;
    void live.current.startNewSession();
  }, [ready, versionId]);

  const degassing =
    production.degassingRequired &&
    !production.degassingAcknowledged &&
    production.carbonatedProducts.length > 0;
  if (degassing) {
    /* The shared authority takes this confirmation BEFORE the run starts, so HOME asks for
       it here — in the one wording the process itself uses. */
    return (
      <ProcessColumn testId="home-preparation-degassing">
        <div className="flex min-h-11 items-center">{back}</div>
        <h2 className="mt-4 text-2xl font-semibold">{productionProcessCopy.degasTitle}</h2>
        <p className="mt-3 text-sm text-stone-600">{productionProcessCopy.degasLead}</p>
        <ul className="mt-3 grid gap-1.5 text-sm text-stone-700">
          {production.carbonatedProducts.map((product) => (
            <li key={product.productId} className="flex items-baseline justify-between gap-3">
              <span>• {product.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatProductionGrams(product.grams)}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void production.acknowledgeDegassing()}
          disabled={production.persistenceBusy}
          data-testid="home-production-degassed"
          className={`${primaryButton} mt-5`}
          style={{ background: 'var(--g-ink)' }}
        >
          {productionProcessCopy.degasDone}
        </button>
      </ProcessColumn>
    );
  }

  const blocked =
    error ??
    production.sessionStartError ??
    (production.prerequisite ? HOME_PREREQUISITE_MESSAGE[production.prerequisite.code] : null);
  return (
    <ProcessColumn testId={blocked ? 'home-preparation-blocked' : 'home-preparation'}>
      <div className="flex min-h-11 items-center">{back}</div>
      <p className="mt-4 text-sm text-stone-600" role={blocked ? 'alert' : undefined}>
        {blocked ?? WAITING}
      </p>
    </ProcessColumn>
  );
}

/** „Partia gotowa” — the accepted H4 screen, over the finished DURABLE run. */
function HomeProductionDone({
  production,
  controller,
  name,
  back,
  onSave,
  onShare,
  onCommunity,
  saved,
  notice,
}: {
  production: ProductionWorkspaceView;
  controller: ProductionProcessController;
  name: string;
  back: ReactNode;
  onSave: () => void;
  onShare: () => void;
  onCommunity: () => void;
  saved: boolean;
  notice: string | null;
}) {
  const session = production.session!;
  /* H4-10A — the mass the customer actually ends up with. The completion snapshot is the
     authority: it is `calculateFinalProduct(…, 'actual_batch')`, so the toppings that were
     really added are already inside it. The fallback counts the same two things by hand. */
  const finalMassG =
    session.completionSnapshot?.actualFinalMassG ??
    [...session.lines, ...session.addonLines].reduce(
      (sum, line) => sum + line.physicalAddedGrams,
      0,
    );
  return (
    <ProcessColumn testId="home-production-complete">
      <div className="flex min-h-11 items-center">{back}</div>
      <ProcessDone
        subtitle={`${name} · ${formatProductionGrams(finalMassG)}`}
        stepTitles={controller.steps.map((step) => step.title)}
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
