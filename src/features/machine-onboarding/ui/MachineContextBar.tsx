/**
 * §7.3 Home context bar — presentational.
 *
 *   Twoja maszyna: Ninja CREAMi Deluxe · pojemnik 706 ml   [Zmień]
 *
 * Hard rules (spec-pinned): NO engine name, NO technology code, NO
 * auto-chosen temperature. The capacity figure comes from the resolved
 * catalog record OR, once the user declared their own container (§8 „Używam
 * innego pojemnika”), from that own container — both via
 * `buildMachineContextView`; when the saved machine has no displayable vessel
 * figure the bar shows the name alone. `defaultBatchGrams` travels in the VIEW
 * MODEL for the batch surfaces — the bar never renders it.
 */
import { cn } from '@/lib/cn';
import { color, focusRing, motion, radius, type } from '@/features/customer-shell/ui/tokens';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';
import type { MachineContextView } from '../machineViews';

interface MachineContextBarProps {
  view: MachineContextView;
  /** „Zmień” — conscious machine change (§4.1); re-runs onboarding upstream. */
  onChange: () => void;
  className?: string;
}

export function MachineContextBar({ view, onChange, className }: MachineContextBarProps) {
  return (
    <div
      className={cn(
        'flex min-h-[44px] items-center gap-2 border-b border-ink/10 bg-paper px-4 py-2',
        className,
      )}
    >
      <p className={cn('min-w-0 flex-1 truncate', type.secondary, color.textSecondary)}>
        {copy.contextBar.prefix}{' '}
        <span className={cn('font-medium', color.textPrimary)}>{view.name}</span>
        {view.vesselMl !== null ? (
          <span> · {copy.contextBar.vessel(view.vesselMl)}</span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onChange}
        aria-label={copy.contextBar.changeAria}
        className={cn(
          'shrink-0 px-3 py-2 underline underline-offset-4',
          'min-h-[44px]',
          radius.control,
          type.secondary,
          color.textPrimary,
          motion.base,
          focusRing,
          'hover:bg-ink/[0.04] active:bg-ink/[0.06]',
        )}
      >
        {copy.contextBar.change}
      </button>
    </div>
  );
}
