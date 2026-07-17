/**
 * §8.5 auto-config transition — a short (~1.5 s) staged reveal of the four
 * checkmark lines, then the completion callback. No fake long analysis.
 *
 * prefers-reduced-motion: the staged animation is dropped — all lines render
 * at once and the handoff happens after one short beat (§21.4). The region is
 * aria-live so screen readers hear the confirmation either way.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { color, type } from '@/features/customer-shell/ui/tokens';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';

const STEP_MS = 280;
const DONE_EXTRA_MS = 400;
const REDUCED_DWELL_MS = 400;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface AutoConfigTransitionProps {
  /** The four §8.5 lines (see `autoConfigLines` — honest amount variant). */
  lines: readonly string[];
  /** Optional honest amount caption (e.g. „Zalecany wsad PINGÜINO: 450 g”). */
  amountDetail?: string | null;
  onDone: () => void;
}

export function AutoConfigTransition({ lines, amountDetail = null, onDone }: AutoConfigTransitionProps) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [visibleCount, setVisibleCount] = useState(reduced ? lines.length : 0);

  useEffect(() => {
    if (reduced) {
      // Instant per §21.4: no staged reveal, one short beat, then hand off.
      const done = setTimeout(onDone, REDUCED_DWELL_MS);
      return () => clearTimeout(done);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    lines.forEach((_, index) => {
      timers.push(setTimeout(() => setVisibleCount(index + 1), (index + 1) * STEP_MS));
    });
    timers.push(setTimeout(onDone, lines.length * STEP_MS + DONE_EXTRA_MS));
    return () => timers.forEach(clearTimeout);
    // The line list is stable for the life of one transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, onDone]);

  return (
    <div role="status" aria-live="polite" aria-label={copy.autoConfig.ariaLabel} className="py-10">
      <ul className="space-y-3">
        {lines.map((line, index) => {
          const visible = index < visibleCount;
          return (
            <li
              key={line}
              className={cn(
                'flex items-center gap-3 transition-opacity duration-200 motion-reduce:transition-none',
                type.body,
                color.textPrimary,
                visible ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden={!visible}
            >
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ink/20 bg-ink text-paper"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {line}
            </li>
          );
        })}
      </ul>
      {amountDetail ? (
        <p className={cn('mt-5', type.caption, color.textMuted)}>{amountDetail}</p>
      ) : null}
    </div>
  );
}
