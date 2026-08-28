import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FriendlyLabMessageMotion } from './FriendlyLabMessageMotion';
import {
  FRIENDLY_LAB_MOMENTS,
  FRIENDLY_LAB_MOMENT_EVENT,
  type FriendlyLabMomentEventDetail,
} from './friendlyLabMoment';

interface ActiveMoment {
  detail: FriendlyLabMomentEventDetail;
  sequence: number;
}

const MAX_REMEMBERED_MOMENTS = 100;

/**
 * The single application-level Friendly Lab feedback window.
 *
 * Business surfaces only announce confirmed transitions. This viewport owns
 * presentation, one-at-a-time replacement, deduplication, motion and safe
 * placement above page content but below modal overlays.
 */
export function FriendlyLabMomentViewport() {
  const [active, setActive] = useState<ActiveMoment | null>(null);
  const sequence = useRef(0);
  const seenKeys = useRef(new Set<string>());

  useEffect(() => {
    const showMoment = (event: Event) => {
      const detail = (event as CustomEvent<FriendlyLabMomentEventDetail>).detail;
      if (!detail || !FRIENDLY_LAB_MOMENTS[detail.kind] || !detail.dedupeKey) return;
      const eventKey = `${detail.kind}:${detail.dedupeKey}`;
      if (seenKeys.current.has(eventKey)) return;
      seenKeys.current.add(eventKey);
      if (seenKeys.current.size > MAX_REMEMBERED_MOMENTS) {
        const oldest = seenKeys.current.values().next().value;
        if (oldest) seenKeys.current.delete(oldest);
      }
      sequence.current += 1;
      setActive({ detail, sequence: sequence.current });
    };

    window.addEventListener(FRIENDLY_LAB_MOMENT_EVENT, showMoment);
    return () => window.removeEventListener(FRIENDLY_LAB_MOMENT_EVENT, showMoment);
  }, []);

  if (!active || typeof document === 'undefined') return null;
  const moment = FRIENDLY_LAB_MOMENTS[active.detail.kind];

  return createPortal(
    <div
      className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+var(--pro-header-height)+0.75rem)] left-1/2 z-[60] w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 sm:w-[400px]"
      data-testid="friendly-lab-moment-layer"
      data-moment-placement="top-center"
      data-moment-kind={active.detail.kind}
    >
      <FriendlyLabMessageMotion
        key={`${active.detail.dedupeKey}:${active.sequence}`}
        timing={moment.timing}
        className="overflow-hidden rounded-[14px] border border-ink/12 bg-white/97 text-ink shadow-pro-e3 backdrop-blur-xl"
        testId="friendly-lab-moment-card"
      >
        <div
          className="flex items-start gap-3 border-l-2 border-[#b58b32] px-4 py-3.5"
          data-moment-kind={active.detail.kind}
        >
          <span
            aria-hidden
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-[#2f6f3c]/20 bg-[#2f6f3c]/[0.07] text-[#2f6f3c]"
          >
            <svg viewBox="0 0 16 16" className="size-3" fill="none">
              <path
                d="m3.25 8.1 2.8 2.8 6.7-6.7"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-semibold leading-snug">{moment.title}</strong>
            {moment.description ? (
              <span className="mt-1 block text-xs leading-relaxed text-stone-600">
                {moment.description}
              </span>
            ) : null}
          </span>
        </div>
      </FriendlyLabMessageMotion>
    </div>,
    document.body,
  );
}
