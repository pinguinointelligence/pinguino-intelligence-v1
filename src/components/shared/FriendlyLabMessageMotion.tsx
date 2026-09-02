import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  FRIENDLY_LAB_MESSAGE_MOTION,
  type FriendlyLabMessageTiming,
} from './friendlyLabMotionTiming';

type MotionPhase = 'entering' | 'visible' | 'leaving' | 'hidden';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * One presentation-only lifecycle for Friendly Lab feedback.
 *
 * Progress and action-bound messages never auto-hide. Informational and
 * important success messages get a guaranteed fully-visible dwell before the
 * calm exit. No caller state, workflow trigger or business outcome is changed.
 */
export function FriendlyLabMessageMotion({
  children,
  timing,
  className,
  role = 'status',
  testId,
}: {
  children: ReactNode;
  timing: FriendlyLabMessageTiming;
  className?: string;
  role?: 'status' | undefined;
  testId?: string;
}) {
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [phase, setPhase] = useState<MotionPhase>(reducedMotion ? 'visible' : 'entering');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (!reducedMotion) {
      timers.push(setTimeout(() => setPhase('visible'), 20));
    }

    const visibleMs =
      timing === 'informational'
        ? FRIENDLY_LAB_MESSAGE_MOTION.informationalVisibleMs
        : timing === 'important'
          ? FRIENDLY_LAB_MESSAGE_MOTION.importantVisibleMs
          : null;

    if (visibleMs !== null) {
      const leaveAt = visibleMs + (reducedMotion ? 0 : FRIENDLY_LAB_MESSAGE_MOTION.entryMs + 20);
      timers.push(setTimeout(() => setPhase(reducedMotion ? 'hidden' : 'leaving'), leaveAt));
      if (!reducedMotion) {
        timers.push(
          setTimeout(() => setPhase('hidden'), leaveAt + FRIENDLY_LAB_MESSAGE_MOTION.exitMs),
        );
      }
    }

    return () => timers.forEach(clearTimeout);
  }, [reducedMotion, timing]);

  if (phase === 'hidden') return null;

  return (
    <div
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      className={cn('gellatti-friendly-message-motion', className)}
      data-friendly-lab-message="true"
      data-friendly-lab-timing={timing}
      data-motion-phase={phase}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
