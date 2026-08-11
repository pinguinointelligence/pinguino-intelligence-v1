import { DirectNumberControl } from '@/features/ingredient-builder/DirectNumberControl';
import { productionControlDecimals } from '@/features/ingredient-builder/directNumberControlModel';
import { cn } from '@/lib/cn';

interface ProductionActualControlProps {
  lineId: string;
  ingredientName: string;
  value: number;
  minimum: number;
  step: number;
  confirmed: boolean;
  correctionMode: boolean;
  onChange: (value: number) => void;
  onConfirm: () => void;
  describedBy?: string;
}

/**
 * Production uses the exact same numeric language as the recipe editor.
 * The confirm/correct action stays separate, so it cannot be mistaken for a
 * fourth value segment or silently change the physical-production contract.
 */
export function ProductionActualControl({
  lineId,
  ingredientName,
  value,
  minimum,
  step,
  confirmed,
  correctionMode,
  onChange,
  onConfirm,
  describedBy,
}: ProductionActualControlProps) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[minmax(0,1fr)_48px] items-stretch gap-2 rounded-[20px] p-1.5 transition-colors',
        correctionMode
          ? 'border border-attention/35 bg-pro-amber/70'
          : confirmed
            ? 'border border-status-ideal/25 bg-pro-sage/65'
            : 'border border-ink/8 bg-white/78',
      )}
      data-testid={`production-actual-control-${lineId}`}
      data-production-control-state={
        correctionMode ? 'correction' : confirmed ? 'confirmed' : 'addition'
      }
    >
      <DirectNumberControl
        value={value}
        step={step}
        min={minimum}
        decimals={productionControlDecimals(value, step)}
        suffix="g"
        ariaLabel={`${ingredientName} — faktyczna gramatura`}
        disabled={confirmed}
        onChange={onChange}
        testId={`production-stepper-${lineId}`}
        ariaDescribedBy={describedBy}
        preservePrecision
      />
      <button
        type="button"
        aria-label={
          confirmed
            ? `${ingredientName} — popraw zapis`
            : `${ingredientName} — potwierdź dodanie`
        }
        title={
          confirmed
            ? 'Zmienia zapis faktycznej ilości — użyj tylko jeśli poprzednia wartość została wpisana błędnie.'
            : 'Potwierdź, że ta ilość została fizycznie dodana.'
        }
        aria-describedby={describedBy}
        onClick={onConfirm}
        className={cn(
          'pro-focus-ring grid min-h-11 place-items-center rounded-[14px] border text-base font-semibold shadow-pro-e1 transition-transform enabled:hover:-translate-y-px',
          confirmed
            ? 'border-status-ideal/35 bg-white text-status-ideal'
            : 'border-ink bg-ink text-white',
        )}
      >
        {confirmed ? '↺' : '✓'}
      </button>
    </div>
  );
}
