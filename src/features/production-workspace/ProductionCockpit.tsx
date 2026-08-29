import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import type { ProductionWorkspaceView } from './useProductionWorkspace';
import { ProductionActualControl } from './ProductionActualControl';
import { productionLotCodeForRun, productionStepForGrams } from './productionSession';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { CatalogVerificationBadge } from '@/features/global-catalog/CatalogVerificationBadge';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { ScoreRing } from '@/features/pro-workbench/ScoreRing';
import type { TenPointScore } from '@/features/recipe-score';
import { DialogShell } from '@/components/ui/DialogShell';
import { recipeTechnicalFit } from '@/features/recipe-score';
import { PublishToCommunityDialog } from '@/features/community/ui/PublishToCommunityDialog';
import { useCreatorProfile } from '@/features/community/useCreatorProfile';

const formatPhysicalMassG = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');

const communityDismissed = (key: string | null): boolean => {
  if (key === null || typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === '1';
};

const scoreFromDisplay = (display: string | undefined): TenPointScore | null => {
  const value = Number(display?.match(/^(\d{1,2})\/10$/)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? (value as TenPointScore) : null;
};

/**
 * OWNER RULE §2 — HEAT INFORMATION IS A REMINDER, NOT A ROUTE.
 *
 * This renders only when authoritative metadata POSITIVELY indicates that a
 * named product is meant to be heated. It selects no process, changes no gram,
 * touches no ProductBehavior and blocks nothing. An unknown process renders
 * nothing at all (§3) — that fact belongs under the product `?`.
 */
function HeatInformationCard({ production }: { production: ProductionWorkspaceView }) {
  const advisories = production.heatInformation ?? [];
  const products = [
    ...new Set(
      advisories
        .map((detail) => detail.productName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  if (products.length === 0) return null;
  const acknowledged = production.heatInformationAcknowledged;
  if (acknowledged) return null;
  return (
    <section
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 rounded-[12px] border border-[#d9c49a] bg-[#fbf8f1] px-3 py-2.5 text-ink xl:hidden"
      role="status"
      data-testid="production-heat-information"
      data-acknowledged={acknowledged ? 'true' : 'false'}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-relaxed">Pamiętaj o obróbce</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600">
          Dla poniższych składników wskazana jest obróbka na ciepło:
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-stone-700">
          {products.map((productName) => (
            <li key={productName}>{productName}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => void production.acknowledgeHeatInformation()}
        disabled={production.persistenceBusy}
        className="pro-focus-ring min-h-11 self-start rounded-[10px] bg-ink px-3 py-1.5 text-xs font-semibold text-white shadow-pro-sm disabled:cursor-wait disabled:opacity-60"
        data-testid="acknowledge-production-heat-information"
      >
        OK
      </button>
    </section>
  );
}

function MachineOperationCard({ production }: { production: ProductionWorkspaceView }) {
  const guide = production.machineGuide;
  if (!guide) return null;
  return (
    <section
      className="rounded-[18px] border border-ink/10 bg-white p-4 text-ink shadow-pro-e0"
      data-testid="production-machine-instructions"
      data-machine-id={guide.sourceMachineId ?? undefined}
    >
      <p className="text-[10px] font-semibold tracking-[0.09em] text-stone-500 uppercase">
        Instrukcja maszyny
      </p>
      <h2 className="mt-1 text-sm font-semibold text-ink">{guide.title}</h2>
      <ol className="mt-3 space-y-2 pl-5 text-xs leading-relaxed text-stone-700">
        {guide.steps.map((step) => (
          <li key={step} className="list-decimal pl-1">
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DegassingCard({ production }: { production: ProductionWorkspaceView }) {
  if (!production.degassingRequired || production.carbonatedProducts.length === 0) return null;
  const acknowledged = production.degassingAcknowledged;
  return (
    <section
      className={cn(
        'rounded-[14px] border px-4 py-4 text-ink shadow-pro-e0',
        acknowledged
          ? 'border-status-ideal/25 bg-status-ideal/[0.06]'
          : 'border-sky-200 bg-[linear-gradient(145deg,#f8fcff_0%,#eef8ff_100%)]',
      )}
      role="status"
      data-testid="production-degassing"
      data-acknowledged={acknowledged ? 'true' : 'false'}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-700">
        Napój gazowany
      </p>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-ink">
        Przed użyciem należy całkowicie odgazować:
      </p>
      <ul className="mt-2 space-y-1.5 text-xs text-stone-700">
        {production.carbonatedProducts.map((product) => (
          <li key={product.productId} className="flex items-baseline justify-between gap-3">
            <span>• {product.name}</span>
            <span className="shrink-0 font-mono font-semibold tabular-nums text-ink">
              {formatPhysicalMassG(product.grams)} g
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => void production.acknowledgeDegassing()}
        disabled={acknowledged || production.persistenceBusy}
        className={cn(
          'pro-focus-ring mt-4 min-h-11 w-full rounded-[12px] px-4 py-2 text-xs font-semibold shadow-pro-sm',
          acknowledged
            ? 'cursor-default border border-status-ideal/25 bg-white text-status-ideal'
            : 'bg-ink text-white disabled:cursor-wait disabled:opacity-60',
        )}
        data-testid="acknowledge-production-degassing"
      >
        ✓ Odgazowane
      </button>
    </section>
  );
}

export function ProductionCockpit({
  production,
  onOpenPreview,
  onRecalculate,
  onReturnToRecipe,
  onOpenLabel,
}: {
  production: ProductionWorkspaceView;
  onOpenPreview: () => void;
  onRecalculate: () => void;
  onReturnToRecipe: () => void;
  onOpenLabel?: () => void;
}) {
  const { session, progress, rescue, score } = production;
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [communityDialogKey, setCommunityDialogKey] = useState<string | null>(null);
  const publishableRecipeId = session?.source.recipeId ?? null;
  const publishableVersion = session?.source.recipeVersionNumber ?? null;
  const communityDismissalKey =
    publishableRecipeId && publishableVersion
      ? `pinguino:production-community-dismissed:${publishableRecipeId}:v${publishableVersion}`
      : null;
  const [dismissedCommunityKey, setDismissedCommunityKey] = useState<string | null>(null);
  const canPublishCompletion =
    session?.status === 'completed' && publishableRecipeId !== null && publishableVersion !== null;
  const hasCreatorProfile = useCreatorProfile(canPublishCompletion);
  const communityCardDismissed =
    communityDismissalKey === null ||
    dismissedCommunityKey === communityDismissalKey ||
    communityDismissed(communityDismissalKey);
  const communityDialogOpen = communityDialogKey === communityDismissalKey;
  const dismissCommunityCard = () => {
    setDismissedCommunityKey(communityDismissalKey);
    setCommunityDialogKey(null);
    if (communityDismissalKey && typeof window !== 'undefined') {
      window.localStorage.setItem(communityDismissalKey, '1');
    }
  };
  const toppingProgress = production.toppingProgress;
  const rescuePreviewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (rescue?.state === 'options') rescuePreviewRef.current?.focus();
  }, [rescue?.state]);
  const prerequisite = production.prerequisite;
  const prerequisiteAction = prerequisite
    ? prerequisite.action === 'open_preview'
      ? onOpenPreview
      : prerequisite.action === 'recalculate'
        ? onRecalculate
        : prerequisite.action === 'archive_stale_session'
          ? () => setArchiveDialogOpen(true)
          : onReturnToRecipe
    : onReturnToRecipe;
  const completedRecordVisible =
    session?.status === 'completed' &&
    session.completionSnapshot !== null &&
    prerequisite?.code !== 'owner_mismatch';
  const archiveSessionDialog = archiveDialogOpen ? (
    <DialogShell
      label="Zarchiwizować nieaktualną partię?"
      testId="production-archive-session-dialog"
      placement="responsive"
      onClose={() => setArchiveDialogOpen(false)}
    >
      <div className="p-5 sm:p-0">
        <h2 className="text-lg font-semibold text-ink">Zarchiwizować nieaktualną partię?</h2>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          Zapis partii pozostanie w historii. Bieżąca receptura nie zostanie zmieniona.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setArchiveDialogOpen(false)}
            className="pro-focus-ring min-h-11 rounded-[10px] border border-ink/15 bg-white px-4 text-xs font-semibold text-ink"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => {
              setArchiveDialogOpen(false);
              void production.archiveStaleSession();
            }}
            className="pro-focus-ring min-h-11 rounded-[10px] bg-ink px-4 text-xs font-semibold text-white"
          >
            Zarchiwizuj partię
          </button>
        </div>
      </div>
    </DialogShell>
  ) : null;
  if (prerequisite && !completedRecordVisible) {
    return (
      <>
        <section
          className="m-3 rounded-[18px] border border-[#d9c49a] bg-[#fbf8f1] p-5 text-ink shadow-pro-e0"
          role="status"
          data-testid="production-practical-block"
          data-prerequisite={prerequisite.code}
        >
          <p className="text-[10px] font-semibold tracking-[0.09em] text-[#8a5b23] uppercase">
            {prerequisite.eyebrow}
          </p>
          <h2 className="mt-2 text-base font-semibold text-ink">{prerequisite.title}</h2>
          <p className="mt-2 text-xs leading-relaxed text-stone-700">{prerequisite.message}</p>
          <button
            type="button"
            onClick={prerequisiteAction}
            className="pro-focus-ring mt-4 min-h-11 w-full rounded-[12px] bg-ink px-4 py-2 text-xs font-semibold text-white shadow-pro-sm"
            data-testid="production-prerequisite-action"
          >
            {prerequisite.actionLabel}
          </button>
          {production.persistenceError ? (
            <p className="mt-2 text-xs leading-relaxed text-status-error" role="alert">
              {production.persistenceError}
            </p>
          ) : null}
        </section>
        {archiveSessionDialog}
      </>
    );
  }
  if (!session || !progress) {
    return (
      <div className="space-y-3 p-3 text-ink xl:space-y-2.5 xl:p-0">
        <HeatInformationCard production={production} />
        <MachineOperationCard production={production} />
        <DegassingCard production={production} />
        {/* GELLATTI V2.1 §17: the ingredient progress is the FIRST card of the
            Production column — the batch card sits under it, not above it. The
            READY state shows `0 / N` and no invented predicted Score. */}
        <section
          className="rounded-[10px] border border-[var(--g-line)] bg-white px-4 py-3 shadow-none"
          data-testid="production-ready-progress"
        >
          <div className="flex min-h-[58px] flex-col justify-center">
            <strong className="block font-mono text-[15px] font-bold tabular-nums text-[var(--g-ink)]">
              0 / {production.plannedInput.items.length} składników
            </strong>
            <div
              className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--g-progress-track)]"
              role="progressbar"
              aria-label="Postęp ważenia składników"
              aria-valuemin={0}
              aria-valuemax={production.plannedInput.items.length}
              aria-valuenow={0}
            >
              <span className="block h-full w-0 rounded-full bg-[var(--g-progress-fill)]" />
            </div>
          </div>
        </section>
        <section
          className="rounded-[10px] border border-[var(--g-line)] bg-white p-4 shadow-none"
          data-testid="production-start-ready"
        >
          <p className="text-[9px] font-bold tracking-[0.09em] text-[#8a5b23] uppercase">
            Wszystko gotowe do rozpoczęcia partii
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold lg:text-[16px]">
                {production.source.recipeName}
              </h2>
              <p className="mt-1 text-xs text-stone-600">
                {production.source.recipeVersionNumber
                  ? `Wersja ${production.source.recipeVersionNumber}`
                  : 'Zweryfikowany bieżący szkic'}
              </p>
            </div>
            <strong className="shrink-0 font-mono text-lg font-bold tabular-nums lg:text-[20px]">
              {formatPhysicalMassG(production.plannedInput.target_batch_grams)} g
            </strong>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-[9px] bg-[var(--g-ivory)] px-2.5 py-2">
              <dt className="text-[9px] text-[var(--g-text-field-label)]">Składniki bazy</dt>
              <dd className="mt-1 font-mono text-[12px] font-bold tabular-nums text-[var(--g-ink)]">
                {production.plannedInput.items.length}
              </dd>
            </div>
            <div className="rounded-[9px] bg-[var(--g-ivory)] px-2.5 py-2">
              <dt className="text-[9px] text-[var(--g-text-field-label)]">Źródło</dt>
              <dd className="mt-1 text-[12px] font-bold text-[var(--g-ink)]">
                {production.source.recipeVersionId ? 'Zapisana wersja' : 'Bieżąca receptura'}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => void production.startNewSession()}
            disabled={production.sessionStarting || !production.practicalReady}
            className="pro-focus-ring mt-3 min-h-11 w-full rounded-[9px] bg-[var(--g-graphite)] px-4 py-2 text-xs font-semibold text-white shadow-none disabled:cursor-wait disabled:opacity-45 lg:min-h-[42px] lg:text-[11px]"
            data-testid="start-production-session"
          >
            {production.sessionStarting
              ? 'Rozpoczynamy partię…'
              : production.degassingRequired && !production.degassingAcknowledged
                ? 'Najpierw potwierdź odgazowanie'
                : (production.heatInformation?.length ?? 0) > 0 &&
                    !production.heatInformationAcknowledged
                  ? 'Najpierw potwierdź informację'
                  : 'Rozpocznij partię'}
          </button>
          {production.sessionStartError ? (
            <p className="mt-2 text-xs leading-relaxed text-status-error" role="alert">
              {production.sessionStartError}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  if (session.status === 'completed' && session.completionSnapshot) {
    const snapshot = session.completionSnapshot;
    const finalFit = recipeTechnicalFit(snapshot.finalResult);
    const finalCost = snapshot.finalProduct?.costs?.total_cost ?? null;
    const lotCode =
      snapshot.lotCode ??
      productionLotCodeForRun(
        session.sessionId,
        snapshot.productionCompletedAt ?? session.completedAt ?? session.startedAt,
      );
    return (
      <div data-testid="production-completed">
        <section
          className="m-3 rounded-[14px] border border-ink/10 bg-white p-4 text-ink shadow-pro-e0"
          aria-label="Podsumowanie ukończonej partii"
        >
          <div className="flex items-end justify-between gap-3">
            <strong className="text-sm text-ink">{session.source.recipeName}</strong>
            <span className="font-mono text-lg font-semibold tabular-nums text-ink">
              {formatPhysicalMassG(snapshot.actualFinalMassG)} g
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-ink/8 py-3 text-xs">
            <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
              <ScoreRing score={finalFit.score} testId="production-final-score-ring" />
              <span>
                <dt className="text-stone-500">Wynik końcowy</dt>
                <dd className="mt-0.5 font-semibold text-ink">{finalFit.label}</dd>
              </span>
            </div>
            <div>
              <dt className="text-stone-500">Nr partii</dt>
              <dd className="mt-1 truncate font-mono font-semibold tabular-nums text-ink">
                {lotCode}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Koszt partii</dt>
              <dd className="mt-1 font-mono font-semibold tabular-nums text-ink">
                {finalCost === null ? 'Brak pełnych danych' : `${finalCost.toFixed(2)} €`}
              </dd>
            </div>
          </dl>
          {(production.heatInformation?.length ?? 0) > 0 ? (
            <p
              className="mt-3 text-[11px] leading-relaxed text-stone-600"
              data-testid="production-completed-process-reminder"
            >
              <strong className="font-semibold text-ink">Obróbka na ciepło:</strong>{' '}
              {[
                ...new Set(
                  production.heatInformation
                    .map((detail) => detail.productName?.trim())
                    .filter((name): name is string => Boolean(name)),
                ),
              ].join(', ')}
            </p>
          ) : null}
          {snapshot.productComposition.toppings.some((item) =>
            isCatalogLabelToppingIngredient(item.ingredient),
          ) ? (
            <div
              className="mt-3 flex flex-wrap gap-2"
              data-testid="production-completed-catalog-provenance"
            >
              {snapshot.productComposition.toppings.map((item) =>
                isCatalogLabelToppingIngredient(item.ingredient) ? (
                  <span key={item.id} className="flex items-center gap-2 text-xs text-stone-700">
                    <span className="max-w-44 truncate">{item.ingredient.name}</span>
                    <CatalogVerificationBadge
                      status={item.ingredient.verification_status}
                      tone="light"
                    />
                  </span>
                ) : null,
              )}
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:items-start">
            <button
              type="button"
              onClick={onOpenLabel}
              disabled={!onOpenLabel}
              className={cn(buttonClasses('primary', 'md'), 'w-full sm:w-auto')}
              data-testid="production-go-to-label"
            >
              Przejdź do etykiety
            </button>
            <button
              type="button"
              onClick={prerequisite ? prerequisiteAction : () => void production.startNewSession()}
              className={cn(buttonClasses('ghost', 'md'), 'w-full sm:w-auto')}
            >
              {prerequisite ? prerequisite.actionLabel : 'Rozpocznij partię'}
            </button>
          </div>
          {prerequisite ? (
            <p className="mt-2 text-xs leading-relaxed text-stone-700" role="status">
              {prerequisite.message}
            </p>
          ) : null}
          {canPublishCompletion && !communityCardDismissed ? (
            <aside
              className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-3"
              data-testid="production-community-invitation"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">Pokaż swój wynik w Community</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                  Opcjonalnie udostępnij zapisaną wersję tej receptury.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={buttonClasses('ghost', 'sm')}
                  onClick={() => setCommunityDialogKey(communityDismissalKey)}
                >
                  Udostępnij
                </button>
                <button
                  type="button"
                  className="pro-focus-ring grid size-10 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink"
                  onClick={dismissCommunityCard}
                  aria-label="Ukryj zaproszenie do Community"
                  title="Ukryj"
                >
                  ×
                </button>
              </div>
            </aside>
          ) : null}
        </section>
        {communityDialogOpen && publishableRecipeId && publishableVersion ? (
          <PublishToCommunityDialog
            recipeId={publishableRecipeId}
            versionNumber={publishableVersion}
            defaultTitle={session.source.recipeName}
            hasCreatorProfile={hasCreatorProfile}
            completionContext
            onPublished={dismissCommunityCard}
            onClose={() => setCommunityDialogKey(null)}
          />
        ) : null}
        {archiveSessionDialog}
      </div>
    );
  }

  const baseRemaining = progress.totalCount - progress.confirmedCount;
  const toppingRemaining =
    (toppingProgress?.totalCount ?? 0) - (toppingProgress?.confirmedCount ?? 0);
  const decisionUnresolved = production.deviationDecisionUnresolved ?? rescue?.state === 'options';
  const correctionCalculating = production.rescueOptionsCalculating ?? false;
  const completionReady =
    progress.coherent &&
    (toppingProgress?.coherent ?? true) &&
    !decisionUnresolved &&
    !correctionCalculating;
  const lowerScoreAccepted =
    session.lastDeviationDecision?.strategy === 'leave_as_is' &&
    production.plannedScore?.score != null &&
    score.score != null &&
    score.score < production.plannedScore.score;
  const decisionOptions = [
    {
      id: 'keep_original_batch',
      title: `Zachowaj ${formatPhysicalMassG(progress.currentPlanMassG)} g`,
      explanation:
        'Dostosujemy ilości, których jeszcze nie dodano. Potwierdzonych ilości nie odejmiemy.',
    },
    {
      id: 'enlarge_batch',
      title: 'Minimalna bezpieczna korekta',
      explanation: 'Dodamy najmniejszą ilość materiału, która przywraca twarde zakresy.',
    },
    {
      id: 'restore_original_recipe',
      title: 'Przywróć oryginalną recepturę',
      explanation:
        'Dodamy odpowiednie ilości wszystkich potrzebnych produktów, aby wrócić do wyjściowych proporcji.',
    },
    {
      id: 'leave_as_is',
      title: 'Kontynuuj bez korekty',
      explanation: `Nie zmienimy dalszego planu${production.plannedScore?.score && score.score ? `. Przewidywany wynik: ${production.plannedScore.score} → ${score.score}.` : '.'}`,
    },
  ] as const;
  const everyDecisionUnavailable =
    rescue?.state === 'options' &&
    decisionOptions.every(
      (option) => production.rescueOptionStates?.[option.id]?.status === 'unavailable',
    );
  const visibleDecisionOptions = decisionOptions.filter(
    (option) => production.rescueOptionStates?.[option.id]?.status !== 'unavailable',
  );
  const completionLabel = production.persistenceBusy
    ? 'Zapisywanie partii…'
    : correctionCalculating
      ? 'Obliczamy korektę…'
      : decisionUnresolved
        ? 'Wybierz sposób korekty'
        : baseRemaining > 0
          ? baseRemaining === 1
            ? 'Pozostał 1 składnik'
            : `Pozostały ${baseRemaining} składniki`
          : toppingRemaining > 0
            ? toppingRemaining === 1
              ? 'Pozostał 1 topping'
              : `Pozostały ${toppingRemaining} toppingi`
            : session.addonLines.length > 0
              ? 'Zakończ produkcję'
              : 'Zakończ ważenie bazy';
  const progressPercent =
    progress.totalCount > 0 ? (progress.confirmedCount / progress.totalCount) * 100 : 0;

  return (
    <div className="pro-scroll-safe space-y-3 p-3 text-ink xl:space-y-2.5 xl:p-0" data-testid="production-cockpit">
      <MachineOperationCard production={production} />
      {production.persistenceError ? (
        <p
          className="rounded-[12px] border border-status-error/25 bg-status-error/[0.04] px-3 py-2 text-xs leading-relaxed text-status-error"
          role="alert"
          data-testid="production-persistence-error"
        >
          {production.persistenceError}
        </p>
      ) : null}
      <section
        className="rounded-[10px] border border-[var(--g-line)] bg-white p-4 shadow-none"
        data-testid="production-batch-state"
      >
        {/* GELLATTI V2.1 §17: one progress header, minimum 58 px, with a
            FULL-WIDTH rail and exactly ONE predicted Score — rendered only when
            the runtime genuinely supplies it. */}
        <div className="flex min-h-[58px] items-center justify-between gap-4 border-b border-ink/8 pb-3">
          <div className="min-w-0 flex-1" data-testid="production-workspace-progress">
            <strong className="block font-mono text-[15px] font-bold tabular-nums text-[var(--g-ink)]">
              {progress.confirmedCount} / {progress.totalCount} składników
            </strong>
            <div
              className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--g-progress-track)]"
              role="progressbar"
              aria-label="Postęp ważenia składników"
              aria-valuemin={0}
              aria-valuemax={progress.totalCount}
              aria-valuenow={progress.confirmedCount}
            >
              <span
                className="block h-full rounded-full bg-[var(--g-progress-fill)] transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {score.score != null ? (
            <span className="flex shrink-0 items-center gap-2 text-left">
              <ScoreRing score={score.score} testId="production-score-ring" />
              <span className="hidden sm:block">
                <span className="block text-[11px] font-semibold text-ink">Przewidywany wynik</span>
                <span className="mt-0.5 block max-w-32 text-[10px] leading-snug text-stone-600">
                  {score.label}
                </span>
              </span>
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">
          Bieżąca partia
        </p>
        {/* §22/§23 LIVE MONITOR — physical truth first, plan second, and the
            gap between them. `W naczyniu` is measured only from confirmed
            additions; `Plan aktualny` follows an accepted scale-up. */}
        <dl className="mt-2 grid grid-cols-3 gap-3 text-xs" data-testid="production-live-monitor">
          <div>
            <dt className="text-stone-500">W naczyniu</dt>
            <dd
              className="font-mono font-semibold tabular-nums text-ink"
              data-testid="production-vessel-mass"
            >
              {formatPhysicalMassG(progress.confirmedMassG)} g
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Cel</dt>
            <dd
              className="font-mono font-semibold tabular-nums text-ink"
              data-testid="production-current-plan-mass"
            >
              {formatPhysicalMassG(progress.currentPlanMassG)} g
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">
              {progress.massBalanceState === 'above' ? 'Ponad plan' : 'Do dodania'}
            </dt>
            <dd
              className="font-mono font-semibold tabular-nums text-ink"
              data-testid="production-remaining-mass"
            >
              {progress.massBalanceState === 'above' ? '+' : ''}
              {formatPhysicalMassG(
                progress.massBalanceState === 'above'
                  ? progress.excessMassG
                  : progress.remainingMassG,
              )}{' '}
              g
            </dd>
          </div>
        </dl>
        {progress.targetChanged ? (
          <p
            className="mt-2 text-[11px] leading-relaxed text-stone-600"
            data-testid="production-target-changed"
          >
            Partia została zmieniona z {formatPhysicalMassG(progress.originalTargetMassG)} g na{' '}
            {formatPhysicalMassG(progress.currentPlanMassG)} g.
          </p>
        ) : null}
      </section>

      {session.source.recipeVersionId === null ? (
        <ReadinessFrame
          state="W PRZYGOTOWANIU"
          title="Bieżący szkic receptury"
          compact
          tone="light"
          details={{
            limitation: 'Ta partia nie jest jeszcze powiązana z zapisaną wersją receptury.',
            calculationImpact: 'Plan pozostaje oddzielony od receptury i nie zmienia jej danych.',
            remaining: 'Zapisz recepturę, a potem rozpocznij partię ponownie.',
          }}
        >
          <p className="text-xs text-stone-700">
            Do produkcji komercyjnej użyj zapisanej wersji receptury.
          </p>
        </ReadinessFrame>
      ) : null}

      {rescue?.state === 'options' ? (
        <section
          ref={rescuePreviewRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="border-y border-[#d9c49a]/70 bg-[#fbf8f1] px-3 py-3"
          data-testid="production-rescue-options"
        >
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[#8a5b23] uppercase">
            Korekta partii
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ink">Partia odbiega od planu</h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            Potwierdzonych ilości nie cofniemy. Wybierz bezpieczny sposób dalszej pracy
          </p>
          <div className="mt-3 grid gap-3" data-testid="production-decision-list">
            {visibleDecisionOptions.map((option) => {
              const evaluation = production.rescueOptionStates?.[option.id];
              const selected = production.selectedRescueOptionId === option.id;
              const recommended = production.recommendedRescueOptionId === option.id;
              const available = evaluation?.status === 'available';
              const preview = available ? evaluation.authorization.preview : null;
              const previewScore = scoreFromDisplay(preview?.scoreDisplay);
              const unavailable = evaluation?.status === 'unavailable';
              const failed = evaluation?.status === 'error';
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => production.selectRescueOption?.(option.id)}
                  disabled={!available || production.persistenceBusy}
                  aria-pressed={selected}
                  className={cn(
                    'pro-focus-ring w-full rounded-[10px] border border-ink/12 bg-white px-3 py-3 text-left shadow-pro-e0 transition-[border-color,background-color,box-shadow,transform] duration-150',
                    selected
                      ? 'border-ink/35 bg-[#fffdf9] shadow-pro-sm ring-1 ring-inset ring-ink/10'
                      : 'hover:border-ink/25 hover:bg-white hover:shadow-pro-sm active:translate-y-px active:bg-stone-50',
                    option.id === 'leave_as_is' &&
                      previewScore &&
                      production.plannedScore?.score &&
                      previewScore < production.plannedScore.score
                      ? 'bg-pro-amber/40 ring-attention/35'
                      : null,
                    !available && 'cursor-not-allowed opacity-65',
                  )}
                  data-testid={`production-decision-${option.id}`}
                  data-decision-state={
                    selected
                      ? 'selected'
                      : unavailable
                        ? 'unavailable'
                        : failed
                          ? 'error'
                          : (evaluation?.status ?? 'loading')
                  }
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-xs text-ink">
                          {preview && option.id === 'enlarge_batch'
                            ? `Minimalna bezpieczna korekta · ${formatPhysicalMassG(preview.finalMassG)} g`
                            : preview && option.id === 'restore_original_recipe'
                              ? `Przywróć oryginalną recepturę · ${formatPhysicalMassG(preview.finalMassG)} g`
                              : option.title}
                        </strong>
                        {recommended ? (
                          <span className="rounded-md border border-[#d9c49a] bg-[#efe8dc] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] text-[#765224] uppercase">
                            Rekomendowane
                          </span>
                        ) : null}
                        {selected ? (
                          <span className="rounded-md border border-status-ideal/25 bg-status-ideal/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-[#2f6f3c]">
                            ✓ Wybrano
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-stone-600">
                        {option.id === 'leave_as_is' &&
                        production.plannedScore?.score &&
                        previewScore
                          ? `Nie zmienimy dalszego planu. Przewidywany wynik: ${production.plannedScore.score} → ${previewScore}.`
                          : option.explanation}
                      </span>
                    </span>
                    {preview ? (
                      <span className="flex shrink-0 items-center gap-2">
                        <ScoreRing
                          score={scoreFromDisplay(preview.scoreDisplay)}
                          testId={`production-decision-score-${option.id}`}
                        />
                        <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                          {formatPhysicalMassG(preview.finalMassG)} g
                        </span>
                      </span>
                    ) : null}
                  </span>
                  {preview?.instructions.length ? (
                    <ul className="mt-2 space-y-1 border-t border-ink/8 pt-2">
                      {preview.instructions.map((instruction, index) => (
                        <li
                          key={`${instruction.lineId}-${index}`}
                          className="flex justify-between gap-3 text-[11px] text-stone-600"
                        >
                          <span>
                            {instruction.kind === 'add' ? 'Dodaj' : 'Nowy plan'} ·{' '}
                            {instruction.ingredientName}
                          </span>
                          <strong className="font-mono tabular-nums text-ink">
                            {instruction.kind === 'add' ? '+' : '→ '}
                            {formatPhysicalMassG(
                              instruction.kind === 'add'
                                ? instruction.grams
                                : instruction.finalTargetGrams,
                            )}{' '}
                            g
                          </strong>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {evaluation?.status === 'loading' || !evaluation ? (
                    <span className="mt-2 block text-[11px] text-stone-500">
                      Szukamy bezpiecznej korekty…
                    </span>
                  ) : unavailable || failed ? (
                    <span
                      className={cn(
                        'mt-2 block text-[11px] leading-relaxed',
                        failed ? 'text-status-error' : 'text-stone-600',
                      )}
                    >
                      {evaluation.reason}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {Object.values(production.rescueOptionStates ?? {}).some(
            (evaluation) => evaluation?.status === 'error',
          ) ? (
            <button
              type="button"
              onClick={() => production.retryRescueOptions?.()}
              disabled={production.persistenceBusy}
              className="pro-focus-ring mt-3 min-h-10 rounded-[10px] border border-ink/15 bg-white px-3 text-xs font-semibold text-ink"
            >
              Spróbuj ponownie
            </button>
          ) : null}
          {everyDecisionUnavailable ? (
            <div
              className="mt-3 rounded-[12px] border border-attention/30 bg-white px-3 py-3"
              role="alert"
              data-testid="production-decision-recovery"
            >
              <p className="text-xs font-semibold text-ink">
                Nie mamy bezpiecznej korekty dla tej partii
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                Jeśli wartość jest błędna, wybierz „Popraw zapis” w jej wierszu. Jeśli ilości
                w naczyniu są prawidłowe, przerwij partię i rozpocznij nową — nie dodawaj składników bez
                zatwierdzonego planu.
              </p>
              <button
                type="button"
                onClick={() => setCancelDialogOpen(true)}
                disabled={production.persistenceBusy}
                className="pro-focus-ring mt-3 min-h-10 rounded-[10px] border border-status-error/30 bg-white px-3 text-xs font-semibold text-status-error disabled:cursor-wait disabled:opacity-60"
                data-testid="production-abort-recovery"
              >
                Przerwij tę partię
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void production.applySelectedRescueOption?.()}
            disabled={
              production.persistenceBusy ||
              !production.selectedRescueOptionId ||
              production.rescueOptionStates?.[production.selectedRescueOptionId]?.status !==
                'available'
            }
            className="pro-focus-ring mt-3 min-h-11 w-full rounded-[10px] bg-ink px-4 text-xs font-semibold text-white shadow-pro-sm disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="apply-selected-production-decision"
          >
            {production.persistenceBusy
              ? 'Stosujemy decyzję…'
              : production.selectedRescueOptionId === 'leave_as_is'
                ? 'Akceptuję wynik i kontynuuję'
                : production.selectedRescueOptionId === 'enlarge_batch'
                  ? 'Zastosuj minimalną korektę'
                  : production.selectedRescueOptionId === 'restore_original_recipe'
                    ? 'Przywróć proporcje'
                    : 'Wybierz sposób korekty'}
          </button>
        </section>
      ) : session.lastDeviationDecision ? (
        <section
          className="border-y border-status-ideal/20 bg-status-ideal/[0.05] px-3 py-2.5"
          data-testid="production-decision-applied"
        >
          <p className="text-xs font-semibold text-[#2f6f3c]">
            {session.lastDeviationDecision.strategy === 'leave_as_is'
              ? 'Wynik zaakceptowany'
              : 'Plan skorygowany'}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-stone-600">
              Cel: {formatPhysicalMassG(progress.currentPlanMassG)} g
            </span>
            <span className="flex items-center gap-2">
              <ScoreRing score={score.score} testId="production-applied-decision-score" />
              <span className="text-xs font-semibold text-ink">Przewidywany wynik</span>
            </span>
          </div>
        </section>
      ) : null}

      {cancelDialogOpen
        ? createPortal(
            <DialogShell
              label="Przerwać tę partię?"
              testId="production-cancel-session-dialog"
              placement="responsive"
              onClose={() => setCancelDialogOpen(false)}
            >
              <div className="p-5 sm:p-0">
                <h2 className="text-lg font-semibold text-ink">Przerwać tę partię?</h2>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  Aktywna partia zostanie oznaczona jako przerwana. Zapis pozostanie w historii, a
                  potwierdzone ilości nie zostaną przepisane ani usunięte.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCancelDialogOpen(false)}
                    className="pro-focus-ring min-h-11 rounded-[10px] border border-ink/15 bg-white px-4 text-xs font-semibold text-ink"
                  >
                    Wróć do partii
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelDialogOpen(false);
                      void production.cancelCurrentSession();
                    }}
                    disabled={production.persistenceBusy}
                    className="pro-focus-ring min-h-11 rounded-[10px] bg-status-error px-4 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    Przerwij partię
                  </button>
                </div>
              </div>
            </DialogShell>,
            document.body,
          )
        : null}

      <DegassingCard production={production} />

      {session.stage === 'addons' && session.addonLines.length > 0 ? (
        <section
          className="overflow-hidden rounded-[22px] border border-status-ideal/25 bg-status-ideal/[0.06]"
          data-testid="production-topping-stage"
        >
          <div className="flex items-end justify-between gap-3 border-b border-ink/8 px-4 py-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.05em] text-[#2f6f3c] uppercase">
                Etap 2
              </p>
              <h3 className="mt-1 text-sm font-semibold text-ink">Toppingi po produkcji</h3>
              <p className="mt-1 text-xs text-stone-600">Nie uruchamiają korekty bazy</p>
            </div>
            <span className="font-mono text-sm tabular-nums text-ink">
              {toppingProgress?.confirmedCount ?? 0}/{toppingProgress?.totalCount ?? 0}
            </span>
          </div>
          <div className="divide-y divide-ink/8 px-3 py-1">
            {session.addonLines.map((line) => {
              const value = line.confirmed ? line.physicalAddedGrams : line.draftActualGrams;
              const difference = value - line.plannedGrams;
              const plannedTopping = session.plannedComposition.toppings.find(
                (item) => item.id === line.lineId,
              );
              const catalogIngredient =
                plannedTopping && isCatalogLabelToppingIngredient(plannedTopping.ingredient)
                  ? plannedTopping.ingredient
                  : null;
              return (
                <div
                  key={line.lineId}
                  className="py-3"
                  data-testid={`production-topping-${line.lineId}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-ink">
                        {line.name}
                      </span>
                      {catalogIngredient ? (
                        <CatalogVerificationBadge
                          status={catalogIngredient.verification_status}
                          tone="light"
                        />
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-stone-600">
                      plan {formatPhysicalMassG(line.plannedGrams)} g ·{' '}
                      <strong
                        className={
                          Math.abs(difference) <= 0.05 ? 'text-stone-600' : 'text-attention'
                        }
                      >
                        {difference > 0 ? '+' : ''}
                        {formatPhysicalMassG(difference)} g
                      </strong>
                    </span>
                  </div>
                  <ProductionActualControl
                    lineId={line.lineId}
                    ingredientName={`${line.name} — topping`}
                    value={value}
                    minimum={line.recordCorrectionCount > 0 ? 0 : line.physicalAddedGrams}
                    step={productionStepForGrams(line.targetGrams)}
                    confirmed={line.confirmed}
                    correctionMode={!line.confirmed && line.recordCorrectionCount > 0}
                    onChange={(grams) => production.setDraftActual(line.lineId, grams)}
                    onConfirm={() =>
                      line.confirmed
                        ? production.reopenRecord(line.lineId)
                        : production.confirmLine(line.lineId)
                    }
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-ink/8 px-4 py-3 text-xs">
            <span className="text-stone-600">Faktyczne toppingi</span>
            <strong className="font-mono tabular-nums text-ink">
              {formatPhysicalMassG(toppingProgress?.forecastMassG ?? 0)} g
            </strong>
          </div>
        </section>
      ) : null}

      {!decisionUnresolved ? (
        <button
          type="button"
          disabled={production.persistenceBusy || !completionReady}
          onClick={() => {
            if (lowerScoreAccepted) {
              setFinishDialogOpen(true);
              return;
            }
            void production.complete();
          }}
          className="pro-focus-ring h-11 w-full rounded-xl bg-ink px-3 text-xs font-semibold text-white shadow-pro-sm transition-transform enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:bg-stone-300"
          data-testid="complete-production"
        >
          {completionLabel}
        </button>
      ) : null}
      {finishDialogOpen && lowerScoreAccepted ? (
        <DialogShell
          label="Zakończyć ważenie bazy?"
          testId="production-lower-score-completion-dialog"
          placement="responsive"
          onClose={() => setFinishDialogOpen(false)}
        >
          <div className="p-5 sm:p-0">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-[#8a5b23] uppercase">
              Ostatnie potwierdzenie
            </p>
            <h2 className="mt-2 text-lg font-semibold text-ink">Zakończyć ważenie bazy?</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="flex items-center gap-2 rounded-[12px] border border-ink/10 p-3">
                <ScoreRing
                  score={production.plannedScore?.score ?? null}
                  testId="production-final-planned-score"
                />
                <span className="text-xs text-stone-600">Planowany wynik</span>
              </div>
              <span className="hidden text-stone-400 sm:block">→</span>
              <div className="flex items-center gap-2 rounded-[12px] border border-attention/25 bg-pro-amber/35 p-3">
                <ScoreRing score={score.score} testId="production-final-forecast-score" />
                <span className="text-xs text-stone-700">Obecna partia</span>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-stone-600">
              Zaakceptowałeś kontynuację bez korekty
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFinishDialogOpen(false)}
                className="pro-focus-ring min-h-11 rounded-[10px] border border-ink/15 bg-white px-4 text-xs font-semibold text-ink"
              >
                Wróć
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinishDialogOpen(false);
                  void production.complete();
                }}
                className="pro-focus-ring min-h-11 rounded-[10px] bg-ink px-4 text-xs font-semibold text-white"
              >
                Zakończ z wynikiem {score.score}
              </button>
            </div>
          </div>
        </DialogShell>
      ) : null}
    </div>
  );
}
