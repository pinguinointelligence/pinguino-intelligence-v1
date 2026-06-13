import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { Plan } from '@/access/plans';
import { useSessionStore } from '@/stores/sessionStore';

const t = copy.studio.internalToggle;

/**
 * Internal demo/pro preview switch — DEV only, NOT a subscription (no payment
 * provider, no auth). Real plan gating is Phase 4.
 */
export function StudioModeToggle() {
  const plan = useSessionStore((state) => state.plan);
  const setPlan = useSessionStore((state) => state.setPlan);

  if (!import.meta.env.DEV) return null;

  const options: Array<{ value: Plan; label: string }> = [
    { value: 'demo', label: t.demo },
    { value: 'pro', label: t.pro },
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className="inline-flex overflow-hidden rounded-md border border-ink/15"
        role="group"
        aria-label={t.label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPlan(option.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              plan === option.value ? 'bg-ink text-paper' : 'bg-paper text-stone-600 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="text-[0.625rem] text-stone-400">{t.note}</span>
    </div>
  );
}
