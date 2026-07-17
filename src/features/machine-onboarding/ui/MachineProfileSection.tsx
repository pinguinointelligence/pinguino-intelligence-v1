/**
 * §8.6 Profile → „Moja maszyna” — presentational section.
 *
 * Shows the saved machine (name + catalog vessel figure + honest batch line),
 * „Zmień maszynę” (re-runs onboarding upstream), and — for custom machines —
 * „Edytuj dane maszyny”. The §8.4 vessel-only fallback stays visibly flagged.
 * Owner rule: grams are always framed „Zalecany wsad PINGÜINO”, never as a
 * manufacturer capacity.
 */
import { cn } from '@/lib/cn';
import { cardShell, color, type } from '@/features/customer-shell/ui/tokens';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';
import type { MachineProfileSectionView } from '../machineViews';

interface MachineProfileSectionProps {
  /** Null = no machine saved yet → the set-up entry point. */
  view: MachineProfileSectionView | null;
  onSetUp: () => void;
  onChange: () => void;
  /** Offered only for custom machines. */
  onEditCustom?: () => void;
}

export function MachineProfileSection({ view, onSetUp, onChange, onEditCustom }: MachineProfileSectionProps) {
  return (
    <section aria-label={copy.profile.title}>
      <h2 className={cn(type.title, color.textPrimary)}>{copy.profile.title}</h2>
      {view === null ? (
        <div className={cn('mt-4 p-5', cardShell)}>
          <p className={cn(type.secondary, color.textSecondary)}>{copy.profile.noMachine}</p>
          <div className="mt-4">
            <TouchButton onClick={onSetUp}>{copy.profile.setUp}</TouchButton>
          </div>
        </div>
      ) : (
        <div className={cn('mt-4 p-5', cardShell)}>
          <p className={cn(type.bodyStrong, color.textPrimary)}>{view.name}</p>
          {view.vesselMl !== null ? (
            <p className={cn('mt-1', type.secondary, color.textSecondary)}>
              {copy.contextBar.vessel(view.vesselMl)}
            </p>
          ) : null}
          {view.batch !== null ? (
            <p className={cn('mt-2', type.secondary, color.textSecondary)}>
              {view.batch.kind === 'user_choice' ? (
                view.batch.text
              ) : (
                <>
                  {view.batch.label}: <span className={color.textPrimary}>{view.batch.text}</span>
                  {view.batch.note !== null ? <> ({view.batch.note})</> : null}
                </>
              )}
            </p>
          ) : null}
          {view.vesselOnlyFallback ? (
            <p className={cn('mt-2 max-w-prose', type.caption, color.textMuted)}>
              {copy.profile.vesselOnlyFlag}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <TouchButton variant="secondary" onClick={onChange}>
              {copy.profile.change}
            </TouchButton>
            {view.isCustom && onEditCustom ? (
              <TouchButton variant="quiet" onClick={onEditCustom}>
                {copy.profile.editCustom}
              </TouchButton>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
