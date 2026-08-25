import { useEffect, useRef, useState } from 'react';
import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import type { ProductionWorkspaceView } from './useProductionWorkspace';
import { ProductionActualControl } from './ProductionActualControl';
import { productionStepForGrams } from './productionSession';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { CatalogVerificationBadge } from '@/features/global-catalog/CatalogVerificationBadge';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { ScoreRing } from '@/features/pro-workbench/ScoreRing';
import type { TenPointScore } from '@/features/recipe-score';
import { DialogShell } from '@/components/ui/DialogShell';

const formatPhysicalMassG = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');

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
  return (
    <section
      className={`rounded-[12px] border px-3 py-3 text-ink ${
        acknowledged
          ? 'border-status-ideal/30 bg-status-ideal/[0.07]'
          : 'border-[#d9c49a] bg-[#fbf8f1]'
      }`}
      role="status"
      data-testid="production-heat-information"
      data-acknowledged={acknowledged ? 'true' : 'false'}
    >
      <p className="text-xs font-semibold leading-relaxed">
        {acknowledged ? 'Informacja potwierdzona' : 'Pamiętaj o obróbce'}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
        Dla poniższych składników wskazana jest obróbka na ciepło:
      </p>
      <ul className="mt-2 space-y-1 text-xs text-stone-700">
        {products.map((productName) => (
          <li key={productName}>{productName}</li>
        ))}
      </ul>
      {acknowledged ? null : (
        <button
          type="button"
          onClick={() => void production.acknowledgeHeatInformation()}
          disabled={production.persistenceBusy}
          className="pro-focus-ring mt-3 min-h-11 rounded-[12px] bg-ink px-4 py-2 text-xs font-semibold text-white shadow-pro-sm disabled:cursor-wait disabled:opacity-60"
          data-testid="acknowledge-production-heat-information"
        >
          OK
        </button>
      )}
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
        {archiveDialogOpen ? (
          <DialogShell
            label="Zarchiwizować nieaktualną sesję?"
            testId="production-archive-session-dialog"
            placement="responsive"
            onClose={() => setArchiveDialogOpen(false)}
          >
            <div className="p-5 sm:p-0">
              <h2 className="text-lg font-semibold text-ink">Zarchiwizować nieaktualną sesję?</h2>
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
                  Zarchiwizuj sesję
                </button>
              </div>
            </div>
          </DialogShell>
        ) : null}
      </>
    );
  }
  if (!session || !progress) {
    return (
      <div className="space-y-3 p-3 text-ink">
        <HeatInformationCard production={production} />
        <DegassingCard production={production} />
        <section
          className="rounded-[18px] border border-ink/10 bg-white p-5 shadow-pro-e0"
          data-testid="production-start-ready"
        >
          <p className="text-[10px] font-semibold tracking-[0.09em] text-[#8a5b23] uppercase">
            Receptura wykonawcza gotowa
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{production.source.recipeName}</h2>
              <p className="mt-1 text-xs text-stone-600">
                {production.source.recipeVersionNumber
                  ? `Wersja ${production.source.recipeVersionNumber}`
                  : 'Zweryfikowany bieżący szkic'}
              </p>
            </div>
            <strong className="shrink-0 font-mono text-lg tabular-nums">
              {formatPhysicalMassG(production.plannedInput.target_batch_grams)} g
            </strong>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-ink/8 py-3 text-xs">
            <div>
              <dt className="text-stone-500">Składniki bazy</dt>
              <dd className="mt-1 font-mono font-semibold tabular-nums text-ink">
                {production.plannedInput.items.length}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Źródło</dt>
              <dd className="mt-1 font-semibold text-ink">
                {production.source.recipeVersionId ? 'Zapisana wersja' : 'Bieżąca receptura'}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => void production.startNewSession()}
            disabled={production.sessionStarting || !production.practicalReady}
            className="pro-focus-ring mt-4 min-h-11 w-full rounded-[12px] bg-ink px-4 py-2 text-xs font-semibold text-white shadow-pro-sm disabled:cursor-wait disabled:opacity-60"
            data-testid="start-production-session"
          >
            {production.sessionStarting
              ? 'Uruchamianie partii…'
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
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
            Start zamrozi dokładny plan, wersję produktu i pełnogramową gramaturę tej partii.
          </p>
        </section>
      </div>
    );
  }

  if (session.status === 'completed' && session.completionSnapshot) {
    return (
      <div data-testid="production-completed">
        <section className="m-3 rounded-[18px] border border-status-ideal/25 bg-status-ideal/[0.07] p-4 text-ink">
          <p className="text-xs font-semibold tracking-[0.06em] text-[#2f6f3c] uppercase">
            Partia gotowa
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <strong className="text-sm text-ink">{session.source.recipeName}</strong>
            <span className="font-mono text-lg font-semibold tabular-nums text-ink">
              {formatPhysicalMassG(session.completionSnapshot.actualFinalMassG)} g
            </span>
          </div>
          {session.completionSnapshot.productComposition.toppings.some((item) =>
            isCatalogLabelToppingIngredient(item.ingredient),
          ) ? (
            <div
              className="mt-3 flex flex-wrap gap-2"
              data-testid="production-completed-catalog-provenance"
            >
              {session.completionSnapshot.productComposition.toppings.map((item) =>
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
          <button
            type="button"
            onClick={onOpenLabel}
            disabled={!onOpenLabel}
            className={cn(buttonClasses('primary', 'md'), 'mt-4 w-full justify-center')}
            data-testid="production-go-to-label"
          >
            Przejdź do etykiety
          </button>
          <button
            type="button"
            onClick={prerequisite ? prerequisiteAction : () => void production.startNewSession()}
            className="pro-focus-ring mt-2 min-h-11 w-full rounded-[12px] border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink"
          >
            {prerequisite ? prerequisite.actionLabel : 'Rozpocznij nową partię'}
          </button>
          {prerequisite ? (
            <p className="mt-2 text-xs leading-relaxed text-stone-700" role="status">
              {prerequisite.message}
            </p>
          ) : null}
        </section>
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

  return (
    <div
      className="pro-scroll-safe space-y-3 p-3 pb-24 text-ink sm:pb-3"
      data-testid="production-cockpit"
    >
      {production.persistenceError ? (
        <p
          className="rounded-[12px] border border-status-error/25 bg-status-error/[0.04] px-3 py-2 text-xs leading-relaxed text-status-error"
          role="alert"
          data-testid="production-persistence-error"
        >
          {production.persistenceError}
        </p>
      ) : null}
      <section className="overflow-hidden rounded-[18px] border border-ink/10 bg-white p-4 shadow-pro-e0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#d7b768]">Produkcja</p>
            <strong className="mt-1 block text-lg text-ink">
              {progress.confirmedCount} / {progress.totalCount} składników
            </strong>
          </div>
          <span className="flex items-center gap-2 text-left">
            <ScoreRing score={score.score} testId="production-score-ring" />
            <span>
              <span className="block text-xs font-semibold text-ink">Przewidywany wynik</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-stone-600">
                {score.label}
              </span>
            </span>
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/8">
          <span
            className="block h-full rounded-full bg-status-ideal transition-[width]"
            style={{
              width: `${progress.totalCount > 0 ? (progress.confirmedCount / progress.totalCount) * 100 : 0}%`,
            }}
          />
        </div>
        {/* §22/§23 LIVE MONITOR — physical truth first, plan second, and the
            gap between them. `W naczyniu` is measured only from confirmed
            additions; `Plan aktualny` follows an accepted scale-up. */}
        <dl className="mt-3 grid grid-cols-3 gap-3 text-xs" data-testid="production-live-monitor">
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
          state="CZĘŚCIOWO PODŁĄCZONE"
          title="Źródło: bieżący szkic"
          compact
          tone="light"
          details={{
            limitation: 'Run nie jest jeszcze powiązany z trwałym ID wersji receptury.',
            calculationImpact:
              'Plan sesji jest zamrożony lokalnie i pozostaje oddzielony od receptury.',
            remaining: 'Zapisać recepturę i utworzyć run przez ProductionRepository.',
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
          className="rounded-[18px] border border-[#d9c49a] bg-[#fbf8f1] p-4"
          data-testid="production-rescue-options"
        >
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[#8a5b23] uppercase">
            Decyzja po odchyleniu
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ink">
            Jak chcesz postąpić z odchyleniem?
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            Potwierdzonych ilości nie odejmiemy. Możesz wybrać tylko wynik bezpiecznie obliczony dla
            obecnej zawartości naczynia.
          </p>
          <div className="mt-3 space-y-2">
            {(
              [
                {
                  id: 'keep_original_batch',
                  title: `Zachowaj ${formatPhysicalMassG(progress.originalTargetMassG)} g`,
                  explanation:
                    'Dostosujemy ilości, których jeszcze nie dodano. Potwierdzonych ilości nie odejmiemy.',
                },
                {
                  id: 'enlarge_batch',
                  title: 'Powiększ partię',
                  explanation:
                    'Dodamy odpowiednie ilości, aby zachować możliwie ten sam profil receptury.',
                },
                {
                  id: 'leave_as_is',
                  title: 'Kontynuuj bez korekty',
                  explanation: `Nie zmienimy dalszego planu${production.plannedScore?.score && score.score ? `. Przewidywany wynik: ${production.plannedScore.score} → ${score.score}.` : '.'}`,
                },
              ] as const
            ).map((option) => {
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
                    'pro-focus-ring w-full rounded-[12px] border bg-white p-3 text-left transition-colors',
                    selected ? 'border-ink shadow-pro-sm' : 'border-ink/10',
                    option.id === 'leave_as_is' &&
                      previewScore &&
                      production.plannedScore?.score &&
                      previewScore < production.plannedScore.score
                      ? 'border-attention/35 bg-pro-amber/40'
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
                            ? `Powiększ partię do ${formatPhysicalMassG(preview.finalMassG)} g`
                            : option.title}
                        </strong>
                        {recommended ? (
                          <span className="rounded-md border border-[#d9c49a] bg-[#efe8dc] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] text-[#765224] uppercase">
                            Rekomendowane
                          </span>
                        ) : null}
                        {selected ? (
                          <span className="text-[10px] font-semibold text-ink">✓ Wybrano</span>
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
                  ? 'Zastosuj nową partię'
                  : 'Zastosuj korektę'}
          </button>
        </section>
      ) : session.lastDeviationDecision ? (
        <section
          className="rounded-[14px] border border-status-ideal/25 bg-status-ideal/[0.06] p-3"
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

      <HeatInformationCard production={production} />
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
              <p className="mt-1 text-xs text-stone-600">Nie uruchamiają korekty bazy.</p>
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
              Zaakceptowałeś kontynuację bez korekty.
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
      <aside
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/12 bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_rgba(31,29,26,0.12)] backdrop-blur sm:hidden"
        data-testid="production-mobile-sticky-status"
        aria-label="Status bieżącej produkcji"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3 items-center gap-2 text-[11px] text-stone-600">
          <strong className="font-mono text-sm tabular-nums text-ink">
            {progress.confirmedCount} / {progress.totalCount}
          </strong>
          <span className="text-center">
            W naczyniu{' '}
            <strong className="block font-mono text-xs tabular-nums text-ink">
              {formatPhysicalMassG(progress.confirmedMassG)} g
            </strong>
          </span>
          <span className="text-right">
            Plan{' '}
            <strong className="block font-mono text-xs tabular-nums text-ink">
              {formatPhysicalMassG(progress.currentPlanMassG)} g
            </strong>
          </span>
        </div>
      </aside>
    </div>
  );
}
