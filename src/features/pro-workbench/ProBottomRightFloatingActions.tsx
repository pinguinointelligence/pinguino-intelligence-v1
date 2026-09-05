import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeProfileStore } from './recipeProfileStore';

const labels = copy.proWorkbench.floatingActions;

export function ProBottomRightFloatingActions({
  onMonitor,
  onRecalculate,
}: {
  onMonitor: () => void;
  onRecalculate: () => void;
}) {
  const working = useConstraintStudioStore(
    (state) => state.recalculationTerminal?.state === 'WORKING',
  );
  const recalcAttention = useRecipeProfileStore(
    (state) => state.preflightBlocker?.action === 'recalculate',
  );

  return (
    <nav
      aria-label={labels.ariaLabel}
      className="pro-bottom-right-floating-actions"
      data-testid="pro-bottom-right-floating-actions"
      data-position-authority="viewport"
    >
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => onMonitor()}
        className="!rounded-full bg-white/96 px-4 text-[11px] tracking-[0.06em] shadow-pro-e2 backdrop-blur-sm"
        data-testid="pro-floating-monitor"
      >
        {labels.monitor}
      </Button>
      <Button
        variant="primary"
        size="sm"
        type="button"
        onClick={onRecalculate}
        disabled={working}
        aria-busy={working}
        data-save-attention={recalcAttention ? 'true' : undefined}
        className={`!rounded-full px-5 text-[11px] tracking-[0.06em] shadow-pro-e2 ${
          recalcAttention ? 'pro-action-attention' : ''
        }`}
        data-testid="pro-floating-recalculate"
      >
        {working ? labels.recalculating : labels.recalculate}
      </Button>
    </nav>
  );
}
