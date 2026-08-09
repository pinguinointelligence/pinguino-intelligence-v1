import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import { MasterLabelEditor } from '@/features/master-label/MasterLabelEditor';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

export function ProductionCockpit({ production }: { production: ProductionWorkspaceView }) {
  const { session, progress, rescue, score } = production;
  if (!session || !progress) {
    return (
      <p className="p-3 text-xs text-nonprod">
        Przygotowywanie produkcji · W PRZYGOTOWANIU…
      </p>
    );
  }

  if (session.status === 'completed' && session.completionSnapshot) {
    return (
      <div data-testid="production-completed">
        <section className="border-b border-status-ideal/25 bg-status-ideal/[0.04] p-3">
          <p className="text-[9px] font-semibold tracking-[0.12em] text-status-ideal uppercase">Produkcja zakończona</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <strong className="text-sm text-ink">{session.source.recipeName}</strong>
            <span className="font-mono text-lg font-semibold tabular-nums text-ink">
              {session.completionSnapshot.actualFinalMassG.toFixed(1)} g
            </span>
          </div>
          <button
            type="button"
            onClick={production.startNewSession}
            className="mt-3 border border-ink/15 px-3 py-2 text-[10px] font-semibold text-ink"
          >
            Rozpocznij nową partię
          </button>
        </section>
        <MasterLabelEditor snapshot={session.completionSnapshot} />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3" data-testid="production-cockpit">
      <section className="border border-ink/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold tracking-[0.12em] text-stone-500 uppercase">Produkcja</p>
            <strong className="mt-1 block text-lg text-ink">
              {progress.confirmedCount} / {progress.totalCount} składników
            </strong>
          </div>
          <span className="font-mono text-xl font-semibold tabular-nums text-ink">{score.display}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden bg-stone-100">
          <span
            className="block h-full bg-ink transition-[width]"
            style={{ width: `${progress.totalCount > 0 ? (progress.confirmedCount / progress.totalCount) * 100 : 0}%` }}
          />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <dt className="text-stone-500">W naczyniu</dt>
            <dd className="font-mono font-semibold tabular-nums text-ink">{progress.confirmedMassG.toFixed(1)} g</dd>
          </div>
          <div>
            <dt className="text-stone-500">Przewidywany finał</dt>
            <dd className="font-mono font-semibold tabular-nums text-ink">{progress.forecastFinalMassG.toFixed(1)} g</dd>
          </div>
        </dl>
        <p className="mt-2 text-[10px] text-stone-500">Przewidywany wynik końcowy · {score.display}</p>
      </section>

      {session.source.recipeVersionId === null ? (
        <ReadinessFrame
          state="CZĘŚCIOWO PODŁĄCZONE"
          title="Źródło: bieżący szkic"
          compact
          details={{
            limitation: 'Run nie jest jeszcze powiązany z trwałym ID wersji receptury.',
            calculationImpact: 'Plan sesji jest zamrożony lokalnie i pozostaje oddzielony od receptury.',
            remaining: 'Zapisać recepturę i utworzyć run przez ProductionRepository.',
          }}
        >
          <p className="text-[10px] text-stone-600">Do produkcji komercyjnej użyj zapisanej wersji receptury.</p>
        </ReadinessFrame>
      ) : null}

      {rescue?.state === 'options' ? (
        <section className="border border-attention/30 bg-attention/[0.04] p-3" data-testid="production-rescue-options">
          <h3 className="text-xs font-semibold text-ink">Korekta po odchyleniu</h3>
          <div className="mt-2 space-y-2">
            {rescue.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => production.applyVerifiedRescue(option.candidateInput)}
                className="w-full border border-ink/15 bg-white p-2 text-left hover:border-ink/35"
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-[11px] text-ink">{option.title}</strong>
                  <span className="font-mono text-[10px] tabular-nums text-ink">{option.finalMassG.toFixed(1)} g · {option.scoreDisplay}</span>
                </span>
                <span className="mt-1 block text-[9px] leading-relaxed text-stone-500">{option.explanation}</span>
                {option.instructions.length > 0 ? (
                  <span className="mt-2 block space-y-0.5">
                    {option.instructions.map((instruction) => (
                      <span key={`${instruction.lineId}-${instruction.ingredientName}-${instruction.kind}`} className="flex justify-between text-[10px]">
                        <span>{instruction.kind === 'add' ? 'Dodaj jeszcze' : 'Nowy plan'} · {instruction.ingredientName}</span>
                        <strong className="font-mono tabular-nums">
                          {instruction.kind === 'add' ? '+' : '→ '}{instruction.grams.toFixed(1)} g
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
        <section className="border border-status-error/30 bg-status-error/[0.035] p-3" data-testid="production-rescue-impossible">
          <h3 className="text-xs font-semibold text-status-error">Brak możliwej korekty</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-stone-600">{rescue.reason}</p>
        </section>
      ) : null}

      <ReadinessFrame
        state="W PRZYGOTOWANIU"
        title="Brakuje składnika · etapy · toppingi"
        compact
        details={{
          limitation: 'Zamienniki w połowie produkcji i automatyczne etapy nie mają jeszcze pełnego kontraktu canonical/allergen/process.',
          calculationImpact: 'Potwierdzona masa pozostaje zachowana; PI nie tworzy niezweryfikowanej korekty.',
          remaining: 'Podłączyć verified substitute oraz Heat/Cold Process bez inferencji z nazw.',
        }}
      >
        <button type="button" disabled className="w-full border border-nonprod/35 px-3 py-2 text-[10px] font-semibold text-nonprod">
          Brakuje składnika · W PRZYGOTOWANIU
        </button>
      </ReadinessFrame>

      <button
        type="button"
        disabled={!progress.coherent}
        onClick={production.complete}
        className="h-11 w-full bg-ink px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-300"
        data-testid="complete-production"
      >
        {progress.coherent ? 'Zakończ produkcję' : `Potwierdź pozostałe · ${progress.totalCount - progress.confirmedCount}`}
      </button>
    </div>
  );
}
