import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import { MasterLabelEditor } from '@/features/master-label/MasterLabelEditor';
import type { ProductionWorkspaceView } from './useProductionWorkspace';
import { ProductionActualControl } from './ProductionActualControl';
import { productionStepForGrams } from './productionSession';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { CatalogVerificationBadge } from '@/features/global-catalog/CatalogVerificationBadge';

const formatPhysicalMassG = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');

export function ProductionCockpit({
  production,
  onOpenPreview,
  onRecalculate,
  onReturnToRecipe,
}: {
  production: ProductionWorkspaceView;
  onOpenPreview: () => void;
  onRecalculate: () => void;
  onReturnToRecipe: () => void;
}) {
  const { session, progress, rescue, score } = production;
  const toppingProgress = production.toppingProgress;
  const rescueAuthorization = production.rescueAuthorization ?? { status: 'idle' as const };
  const rescueAuthorizationInvalidation = production.rescueAuthorizationInvalidation ?? null;
  const rescuePreviewRef = useRef<HTMLElement>(null);
  const rescueAuthorizationId =
    rescueAuthorization.status === 'preview'
      ? rescueAuthorization.authorization.authorizationId
      : null;
  useEffect(() => {
    if (rescueAuthorization.status === 'preview') rescuePreviewRef.current?.focus();
  }, [rescueAuthorization.status, rescueAuthorizationId]);
  const prerequisite = production.prerequisite;
  const prerequisiteAction = prerequisite
    ? prerequisite.action === 'open_preview'
      ? onOpenPreview
      : prerequisite.action === 'recalculate'
        ? onRecalculate
        : prerequisite.action === 'archive_stale_session'
          ? () => {
              if (
                typeof window === 'undefined' ||
                window.confirm(
                  'Zarchiwizować nieaktualną sesję Produkcji? Jej zapis pozostanie w lokalnej historii.',
                )
              ) {
                production.archiveStaleSession();
              }
            }
          : onReturnToRecipe
    : onReturnToRecipe;
  const completedRecordVisible =
    session?.status === 'completed' &&
    session.completionSnapshot !== null &&
    prerequisite?.code !== 'owner_mismatch';
  if (prerequisite && !completedRecordVisible) {
    return (
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
    );
  }
  if (!session || !progress) {
    return (
      <section
        className="m-3 rounded-[18px] border border-ink/10 bg-white p-5 text-ink shadow-pro-e0"
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
          disabled={production.sessionStarting}
          className="pro-focus-ring mt-4 min-h-11 w-full rounded-[12px] bg-ink px-4 py-2 text-xs font-semibold text-white shadow-pro-sm disabled:cursor-wait disabled:opacity-60"
          data-testid="start-production-session"
        >
          {production.sessionStarting ? 'Uruchamianie partii…' : 'Rozpocznij partię'}
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
    );
  }

  if (session.status === 'completed' && session.completionSnapshot) {
    return (
      <div data-testid="production-completed">
        <section className="m-3 rounded-[18px] border border-status-ideal/25 bg-status-ideal/[0.07] p-4 text-ink">
          <p className="text-xs font-semibold tracking-[0.06em] text-[#2f6f3c] uppercase">
            Produkcja zakończona
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
            onClick={prerequisite ? prerequisiteAction : () => void production.startNewSession()}
            className="pro-focus-ring mt-3 min-h-11 rounded-[12px] bg-ink px-3 py-2 text-xs font-semibold text-white"
          >
            {prerequisite ? prerequisite.actionLabel : 'Rozpocznij nową partię'}
          </button>
          {prerequisite ? (
            <p className="mt-2 text-xs leading-relaxed text-stone-700" role="status">
              {prerequisite.message}
            </p>
          ) : null}
        </section>
        <MasterLabelEditor snapshot={session.completionSnapshot} />
      </div>
    );
  }

  return (
    <div className="pro-scroll-safe space-y-3 p-3 text-ink" data-testid="production-cockpit">
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
          <span className="text-right">
            <span className="block text-xs font-medium text-stone-500">
              Przewidywane dopasowanie partii
            </span>
            <span className="mt-1 block font-mono text-xl font-semibold tabular-nums text-ink">
              {score.display}
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
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-stone-500">W naczyniu</dt>
            <dd className="font-mono font-semibold tabular-nums text-ink">
              {formatPhysicalMassG(progress.confirmedMassG)} g
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Przewidywany finał</dt>
            <dd className="font-mono font-semibold tabular-nums text-ink">
              {formatPhysicalMassG(progress.forecastFinalMassG)} g
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-[12px] bg-status-ideal/10 px-3 py-2 text-xs text-[#2f6f3c]">
          Ocena dotyczy przewidywanego składu po zakończeniu bieżącej partii · {score.display}
        </p>
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

      {rescue?.state === 'options' && rescueAuthorization.status === 'preview' ? (
        <section
          ref={rescuePreviewRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="pro-module border-attention/30 bg-pro-amber/55 p-3"
          data-testid="production-rescue-authorized-preview"
          data-candidate-fingerprint={rescueAuthorization.authorization.candidateFingerprint}
        >
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[#8a5b23] uppercase">
            Preview autoryzowany przez serwer
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-ink">
                {rescueAuthorization.authorization.preview.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-700">
                {rescueAuthorization.authorization.preview.explanation}
              </p>
            </div>
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-ink">
              {rescueAuthorization.authorization.preview.finalMassG.toFixed(0)} g ·{' '}
              {rescueAuthorization.authorization.preview.scoreDisplay}
            </span>
          </div>
          {rescueAuthorization.authorization.preview.instructions.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-[12px] border border-ink/8 bg-white/80 p-2.5">
              {rescueAuthorization.authorization.preview.instructions.map((instruction, index) => (
                <li
                  key={`${instruction.lineId ?? 'new'}-${instruction.ingredientName}-${instruction.kind}-${index}`}
                  className="flex justify-between gap-3 text-xs text-stone-700"
                >
                  <span>
                    {instruction.kind === 'add' ? 'Dodaj jeszcze' : 'Nowy plan'} ·{' '}
                    {instruction.ingredientName}
                  </span>
                  <strong className="shrink-0 font-mono tabular-nums text-ink">
                    {instruction.kind === 'add' ? '+' : '→ '}
                    {(instruction.kind === 'add'
                      ? instruction.grams
                      : instruction.finalTargetGrams
                    ).toFixed(0)}{' '}
                    g
                  </strong>
                </li>
              ))}
            </ul>
          ) : null}
          {rescueAuthorization.error ? (
            <p className="mt-3 text-xs text-status-error" role="alert">
              {rescueAuthorization.error}
            </p>
          ) : null}
          {rescueAuthorizationInvalidation ? (
            <p className="mt-3 text-xs text-status-error" role="alert">
              {rescueAuthorizationInvalidation === 'expired'
                ? 'Autoryzacja Preview wygasła. Odśwież propozycję Rescue.'
                : 'Stan partii zmienił się. Odśwież propozycję Rescue.'}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {rescueAuthorizationInvalidation ? (
              <>
                <button
                  type="button"
                  disabled
                  className="min-h-11 cursor-not-allowed rounded-[12px] bg-ink px-3 py-2 text-xs font-semibold text-white opacity-40"
                  data-testid="apply-authorized-production-rescue"
                >
                  Zastosuj Rescue
                </button>
                <button
                  type="button"
                  onClick={() => void production.refreshRescueAuthorization()}
                  disabled={production.persistenceBusy}
                  className="pro-focus-ring min-h-11 rounded-[12px] border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink shadow-pro-sm disabled:cursor-wait disabled:opacity-60"
                  data-testid="refresh-production-rescue-authorization"
                >
                  Odśwież propozycję Rescue
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => production.dismissRescueAuthorization()}
                  disabled={production.persistenceBusy}
                  className="pro-focus-ring min-h-11 rounded-[12px] border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
                >
                  Wybierz inną propozycję
                </button>
                <button
                  type="button"
                  onClick={() => void production.consumeAuthorizedRescue()}
                  disabled={production.persistenceBusy || Boolean(rescueAuthorizationInvalidation)}
                  className="pro-focus-ring min-h-11 rounded-[12px] bg-ink px-3 py-2 text-xs font-semibold text-white shadow-pro-sm disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="apply-authorized-production-rescue"
                >
                  Zastosuj Rescue
                </button>
              </>
            )}
          </div>
        </section>
      ) : null}

      {rescue?.state === 'options' && rescueAuthorization.status !== 'preview' ? (
        <section
          aria-live="polite"
          className="pro-module border-attention/30 bg-pro-amber/55 p-3"
          data-testid="production-rescue-options"
        >
          <h3 className="text-xs font-semibold text-ink">Korekta po odchyleniu</h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            Wybierz kierunek. Bezpieczny Preview zostanie obliczony i autoryzowany przez serwer.
          </p>
          <div className="mt-2 space-y-2">
            {rescue.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => void production.requestRescueAuthorization(option.id)}
                disabled={
                  production.persistenceBusy || rescueAuthorization.status === 'authorizing'
                }
                className="pro-focus-ring min-h-11 w-full rounded-lg border border-ink/12 bg-white p-2.5 text-left shadow-pro-sm transition-transform hover:-translate-y-px hover:border-ink/35 disabled:cursor-wait disabled:opacity-60"
                data-testid={`authorize-production-rescue-${option.id}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-xs text-ink">{option.title}</strong>
                  <span className="text-[10px] font-semibold tracking-[0.05em] text-[#8a5b23] uppercase">
                    {rescueAuthorization.status === 'authorizing' &&
                    rescueAuthorization.stableOptionId === option.id
                      ? 'Autoryzowanie…'
                      : 'Pokaż Preview'}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-stone-600">
                  {option.explanation}
                </span>
              </button>
            ))}
          </div>
          {rescueAuthorization.status === 'error' ? (
            <div className="mt-3 rounded-[12px] border border-status-error/20 bg-white/75 p-3">
              <p className="text-xs text-status-error" role="alert">
                {rescueAuthorization.message}
              </p>
              <button
                type="button"
                onClick={() => void production.refreshRescueAuthorization()}
                disabled={production.persistenceBusy}
                className="pro-focus-ring mt-2 min-h-11 w-full rounded-[12px] bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                Odśwież propozycję Rescue
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

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
              <p className="mt-1 text-xs text-stone-600">
                Nie uruchamiają korekty ani Rescue bazy.
              </p>
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

      <ReadinessFrame
        state="W PRZYGOTOWANIU"
        title="Brakuje składnika · automatyczne etapy"
        compact
        tone="light"
        details={{
          limitation:
            'Zamienniki w połowie produkcji i automatyczne etapy nie mają jeszcze pełnego kontraktu canonical/allergen/process.',
          calculationImpact:
            'Potwierdzona masa pozostaje zachowana; PI nie tworzy niezweryfikowanej korekty.',
          remaining: 'Podłączyć verified substitute oraz Heat/Cold Process bez inferencji z nazw.',
        }}
      >
        <button
          type="button"
          disabled
          className="w-full rounded-[12px] border border-nonprod-soft/40 px-3 py-2 text-xs font-semibold text-nonprod-soft"
        >
          Brakuje składnika · W PRZYGOTOWANIU
        </button>
      </ReadinessFrame>

      <button
        type="button"
        disabled={
          production.persistenceBusy || !progress.coherent || !(toppingProgress?.coherent ?? true)
        }
        onClick={() => void production.complete()}
        className="pro-focus-ring h-11 w-full rounded-xl bg-ink px-3 text-xs font-semibold text-white shadow-pro-sm transition-transform enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:bg-stone-300"
        data-testid="complete-production"
      >
        {production.persistenceBusy
          ? 'Zapisywanie partii…'
          : progress.coherent && (toppingProgress?.coherent ?? true)
            ? 'Zakończ produkcję'
            : session.stage === 'addons'
              ? `Potwierdź toppingi · ${(toppingProgress?.totalCount ?? 0) - (toppingProgress?.confirmedCount ?? 0)}`
              : `Potwierdź bazę · ${progress.totalCount - progress.confirmedCount}`}
      </button>
    </div>
  );
}
import { useEffect, useRef } from 'react';
