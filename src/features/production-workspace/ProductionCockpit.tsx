import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import { MasterLabelEditor } from '@/features/master-label/MasterLabelEditor';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

const formatPhysicalMassG = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');

export function ProductionCockpit({ production }: { production: ProductionWorkspaceView }) {
  const { session, progress, rescue, score } = production;
  if (production.practicalReady === false) {
    return (
      <section
        className="m-3 rounded-[20px] border border-[#d7b768]/35 bg-[#d7b768]/10 p-4 text-white"
        role="status"
        data-testid="production-practical-block"
      >
        <p className="text-xs font-semibold tracking-[0.04em] text-attention-soft uppercase">
          Wymaga receptury wykonawczej
        </p>
        <p className="mt-2 text-xs leading-relaxed text-white/72">
          {production.practicalBlockMessage}
        </p>
      </section>
    );
  }
  if (!session || !progress) {
    return (
      <p className="p-3 text-xs text-stone-500" role="status">
        Przygotowywanie bezpiecznej sesji produkcji…
      </p>
    );
  }

  if (session.status === 'completed' && session.completionSnapshot) {
    return (
      <div data-testid="production-completed">
        <section className="m-3 rounded-[20px] border border-status-ideal/25 bg-status-ideal/[0.08] p-4 text-white">
          <p className="text-xs font-semibold tracking-[0.06em] text-[#c9d4c2] uppercase">
            Produkcja zakończona
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <strong className="text-sm text-white">{session.source.recipeName}</strong>
            <span className="font-mono text-lg font-semibold tabular-nums text-white">
              {formatPhysicalMassG(session.completionSnapshot.actualFinalMassG)} g
            </span>
          </div>
          <button
            type="button"
            onClick={production.startNewSession}
            className="mt-3 min-h-11 rounded-[14px] border border-white/15 px-3 py-2 text-xs font-semibold text-white"
          >
            Rozpocznij nową partię
          </button>
        </section>
        <MasterLabelEditor snapshot={session.completionSnapshot} />
      </div>
    );
  }

  return (
    <div className="pro-scroll-safe space-y-3 p-3 text-white" data-testid="production-cockpit">
      <section className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.05] p-4 shadow-pro-e0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#d7b768]">Produkcja</p>
            <strong className="mt-1 block text-lg text-white">
              {progress.confirmedCount} / {progress.totalCount} składników
            </strong>
          </div>
          <span className="text-right">
            <span className="block text-xs font-medium text-white/55">
              Przewidywane dopasowanie partii
            </span>
            <span className="mt-1 block font-mono text-xl font-semibold tabular-nums text-white">
              {score.display}
            </span>
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full bg-status-ideal transition-[width]"
            style={{
              width: `${progress.totalCount > 0 ? (progress.confirmedCount / progress.totalCount) * 100 : 0}%`,
            }}
          />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-white/55">W naczyniu</dt>
            <dd className="font-mono font-semibold tabular-nums text-white">
              {formatPhysicalMassG(progress.confirmedMassG)} g
            </dd>
          </div>
          <div>
            <dt className="text-white/55">Przewidywany finał</dt>
            <dd className="font-mono font-semibold tabular-nums text-white">
              {formatPhysicalMassG(progress.forecastFinalMassG)} g
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-[14px] bg-status-ideal/12 px-3 py-2 text-xs text-[#c9d4c2]">
          Ocena dotyczy przewidywanego składu po zakończeniu bieżącej partii · {score.display}
        </p>
      </section>

      {session.source.recipeVersionId === null ? (
        <ReadinessFrame
          state="CZĘŚCIOWO PODŁĄCZONE"
          title="Źródło: bieżący szkic"
          compact
          tone="dark"
          details={{
            limitation: 'Run nie jest jeszcze powiązany z trwałym ID wersji receptury.',
            calculationImpact:
              'Plan sesji jest zamrożony lokalnie i pozostaje oddzielony od receptury.',
            remaining: 'Zapisać recepturę i utworzyć run przez ProductionRepository.',
          }}
        >
          <p className="text-xs text-white/72">
            Do produkcji komercyjnej użyj zapisanej wersji receptury.
          </p>
        </ReadinessFrame>
      ) : null}

      {rescue?.state === 'options' ? (
        <section
          className="pro-module border-attention/30 bg-pro-amber/55 p-3"
          data-testid="production-rescue-options"
        >
          <h3 className="text-xs font-semibold text-ink">Korekta po odchyleniu</h3>
          <div className="mt-2 space-y-2">
            {rescue.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => production.applyVerifiedRescue(option.candidateInput)}
                className="pro-focus-ring w-full rounded-lg border border-ink/12 bg-white p-2.5 text-left shadow-pro-sm transition-transform hover:-translate-y-px hover:border-ink/35"
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-xs text-ink">{option.title}</strong>
                  <span className="font-mono text-xs tabular-nums text-ink">
                    {option.finalMassG.toFixed(0)} g · {option.scoreDisplay}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-stone-600">
                  {option.explanation}
                </span>
                {option.instructions.length > 0 ? (
                  <span className="mt-2 block space-y-0.5">
                    {option.instructions.map((instruction) => (
                      <span
                        key={`${instruction.lineId}-${instruction.ingredientName}-${instruction.kind}`}
                        className="flex justify-between text-xs"
                      >
                        <span>
                          {instruction.kind === 'add' ? 'Dodaj jeszcze' : 'Nowy plan'} ·{' '}
                          {instruction.ingredientName}
                        </span>
                        <strong className="font-mono tabular-nums">
                          {instruction.kind === 'add' ? '+' : '→ '}
                          {instruction.grams.toFixed(0)} g
                        </strong>
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {rescue?.state === 'impossible' ? (
        <section
          className="border border-status-error/30 bg-status-error/[0.035] p-3"
          data-testid="production-rescue-impossible"
        >
          <h3 className="text-xs font-semibold text-[#e7a891]">Brak możliwej korekty</h3>
          <p className="mt-1 text-xs leading-relaxed text-white/72">{rescue.reason}</p>
        </section>
      ) : null}

      <ReadinessFrame
        state="W PRZYGOTOWANIU"
        title="Brakuje składnika · etapy · toppingi"
        compact
        tone="dark"
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
        disabled={!progress.coherent}
        onClick={production.complete}
        className="pro-focus-ring h-11 w-full rounded-xl bg-ink px-3 text-xs font-semibold text-white shadow-pro-sm transition-transform enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:bg-stone-300"
        data-testid="complete-production"
      >
        {progress.coherent
          ? 'Zakończ produkcję'
          : `Potwierdź pozostałe · ${progress.totalCount - progress.confirmedCount}`}
      </button>
    </div>
  );
}
