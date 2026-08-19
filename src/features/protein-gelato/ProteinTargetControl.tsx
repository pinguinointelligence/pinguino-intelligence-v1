import { cn } from '@/lib/cn';
import { PROTEIN_GELATO_TARGET } from '@/spine';
import { useRecipeStore } from '@/stores/recipeStore';

export function ProteinTargetControl({
  actualPercent,
  tone = 'paper',
}: {
  actualPercent: number;
  tone?: 'paper' | 'dark';
}) {
  const target = useRecipeStore((state) => state.target_protein_percent);
  const residual = actualPercent - target;
  const reached = Math.abs(residual) <= PROTEIN_GELATO_TARGET.tolerancePercent + 1e-9;
  const dark = tone === 'dark';

  return (
    <section
      className={cn(
        'border p-2.5',
        dark ? 'border-ivory/15 bg-ivory/[0.04]' : 'border-ink/15 bg-white',
      )}
      data-testid="protein-target-control"
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
            Wynik obliczony z aktualnego składu · cel PI {target.toFixed(1)}%
          </p>
        </div>
        <strong
          className={cn(
            'font-mono text-lg font-semibold tabular-nums',
            reached ? 'text-status-ideal' : dark ? 'text-status-risky' : 'text-amber-700',
          )}
          data-testid="protein-target-actual"
        >
          {actualPercent.toFixed(1)}%
        </strong>
      </div>
      <div
        className={cn(
          'mt-2 flex items-center justify-between border-t pt-2 text-[11px]',
          dark ? 'border-ivory/10 text-ivory/75' : 'border-ink/10 text-stone-600',
        )}
      >
        <span>
          {reached ? 'Cel osiągnięty' : residual < 0 ? 'Poniżej celu PI' : 'Powyżej celu PI'}
        </span>
        <strong className="font-mono tabular-nums">
          {residual >= 0 ? '+' : ''}
          {residual.toFixed(1)} pp
        </strong>
      </div>
      <p
        className={cn('mt-1.5 text-[10px] leading-snug', dark ? 'text-ivory/55' : 'text-stone-500')}
      >
        To metryka wyniku, nie sterownik gramatur. Bezpieczne zmiany składu wykonuje wyłącznie PI w
        Podglądzie.
      </p>
    </section>
  );
}
