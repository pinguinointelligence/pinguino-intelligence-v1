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
  const setTarget = useRecipeStore((state) => state.setTargetProteinPercent);
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
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-3">
        <div>
          <p
            className={cn(
              'text-[10px] font-semibold tracking-[0.08em] uppercase',
              dark ? 'text-ivory/65' : 'text-stone-500',
            )}
          >
            Cel białka
          </p>
          <p className={cn('mt-0.5 text-[11px]', dark ? 'text-ivory/65' : 'text-stone-600')}>
            Domyślnie 20,0% · wykonalność ocenia PI
          </p>
        </div>
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] border border-current/15">
          <button
            type="button"
            onClick={() => setTarget(target - PROTEIN_GELATO_TARGET.controlStepPercent)}
            className="h-8 border-r border-current/15 text-sm"
            aria-label="Zmniejsz cel białka o 1 punkt procentowy"
          >
            −
          </button>
          <label className="flex items-center px-1">
            <input
              type="number"
              min={0}
              step={PROTEIN_GELATO_TARGET.inputStepPercent}
              value={target}
              onChange={(event) => setTarget(event.currentTarget.valueAsNumber)}
              className={cn(
                'h-8 min-w-0 flex-1 bg-transparent text-right font-mono text-sm font-semibold tabular-nums outline-none',
                dark ? 'text-ivory' : 'text-ink',
              )}
              aria-label="Cel białka w procentach"
              data-testid="protein-target-input"
            />
            <span className={cn('ml-1 text-xs', dark ? 'text-ivory/60' : 'text-stone-500')}>%</span>
          </label>
          <button
            type="button"
            onClick={() => setTarget(target + PROTEIN_GELATO_TARGET.controlStepPercent)}
            className="h-8 border-l border-current/15 text-sm"
            aria-label="Zwiększ cel białka o 1 punkt procentowy"
          >
            +
          </button>
        </div>
      </div>
      <div
        className={cn(
          'mt-2 flex items-center justify-between border-t pt-2 text-[11px]',
          dark ? 'border-ivory/10 text-ivory/75' : 'border-ink/10 text-stone-600',
        )}
      >
        <span>Wynik aktualnej receptury</span>
        <strong
          className={cn(
            'font-mono tabular-nums',
            reached ? 'text-status-ideal' : dark ? 'text-status-risky' : 'text-amber-700',
          )}
          data-testid="protein-target-actual"
        >
          {actualPercent.toFixed(1)}%
        </strong>
      </div>
      <p
        className={cn('mt-1.5 text-[10px] leading-snug', dark ? 'text-ivory/55' : 'text-stone-500')}
      >
        Zmiana celu nie zmienia gramatur. Nową recepturę zobaczysz dopiero po „Przelicz z PI” i w
        Podglądzie.
      </p>
    </section>
  );
}
