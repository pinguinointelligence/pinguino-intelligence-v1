import { cn } from '@/lib/cn';
import type { ProteinFormulationAssessment } from './proteinAuthority';
import { formatProteinPercentPl } from './proteinReadout';

/**
 * Protein v2 read-out. STRICTLY READ-ONLY.
 *
 * Owner decision: the user never sets a protein percentage. This panel reports
 * what the current recipe actually contains, whether that still earns the
 * product's „wysoka zawartość białka” claim, and — when the Engine measured a
 * structural cost — why more protein would not be an improvement.
 *
 * It renders no button, no slider and no input. Grams are changed only by the
 * Engine, through Preview.
 */
export function ProteinContentReadout({
  assessment,
  tone = 'paper',
}: {
  assessment: ProteinFormulationAssessment;
  tone?: 'paper' | 'dark';
}) {
  const dark = tone === 'dark';
  const actual = assessment.actualPercent;
  if (!assessment.applicable || actual === null) return null;

  const qualified = assessment.qualification.qualified;
  const energyShare = assessment.qualification.energySharePercent;
  const scoredWarnings = assessment.structure.warnings.filter((warning) => warning.scored);

  return (
    <section
      className={cn(
        'border p-2.5',
        dark ? 'border-ivory/15 bg-ivory/[0.04]' : 'border-ink/15 bg-white',
      )}
      data-testid="protein-content-readout"
      data-protein-qualified={qualified ? 'true' : 'false'}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div>
          <p
            className={cn(
              'text-[10px] font-semibold tracking-[0.08em] uppercase',
              dark ? 'text-ivory/65' : 'text-stone-500',
            )}
          >
            Białko w recepturze
          </p>
          <p className={cn('mt-0.5 text-[11px]', dark ? 'text-ivory/65' : 'text-stone-600')}>
            Wynik obliczony z aktualnego składu
          </p>
        </div>
        <strong
          className={cn(
            'font-mono text-lg font-semibold tabular-nums',
            dark ? 'text-ivory' : 'text-ink',
          )}
          data-testid="protein-content-actual"
        >
          {formatProteinPercentPl(actual)}
        </strong>
      </div>
      <div
        className={cn(
          'mt-2 flex items-center justify-between border-t pt-2 text-[11px]',
          dark ? 'border-ivory/10 text-ivory/75' : 'border-ink/10 text-stone-600',
        )}
      >
        <span>{qualified ? 'Wysoka zawartość białka' : 'Nie spełnia deklaracji białkowej'}</span>
        <strong
          className={cn(
            'font-mono tabular-nums',
            qualified ? 'text-status-ideal' : 'text-status-risky',
          )}
          data-testid="protein-content-energy-share"
        >
          {energyShare === null ? '—' : `${Math.round(energyShare)}% energii`}
        </strong>
      </div>
      {scoredWarnings.length > 0 ? (
        <ul
          className={cn(
            'mt-1.5 space-y-1 text-[10px] leading-snug',
            dark ? 'text-ivory/60' : 'text-stone-500',
          )}
          data-testid="protein-content-warnings"
        >
          {scoredWarnings.map((warning) => (
            <li key={warning.code}>{warning.messagePl}</li>
          ))}
        </ul>
      ) : null}
      <p
        className={cn('mt-1.5 text-[10px] leading-snug', dark ? 'text-ivory/55' : 'text-stone-500')}
      >
        To metryka wyniku, nie sterownik gramatur. Więcej białka nie oznacza lepszej receptury —
        bezpieczne zmiany składu wykonuje Gellatti w podglądzie.
      </p>
    </section>
  );
}
