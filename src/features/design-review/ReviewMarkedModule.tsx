/**
 * Owner/QA-only review marker. It remains available on staging review sessions, while
 * normal customer surfaces fail closed and do not inherit internal review language.
 */
import type { ReactNode } from 'react';
import { useReviewMode } from './useReviewMode';

export type ReviewMarkBadge = 'DO PRZEGLĄDU' | 'OPCJONALNE' | 'ADVANCED' | 'ADVANCED / REVIEW';

export function ReviewMarkedModule({
  id,
  title,
  badge = 'DO PRZEGLĄDU',
  note,
  children,
}: {
  /** Stable module id — becomes `data-testid="review-marked-<id>"`. */
  id: string;
  title: string;
  badge?: ReviewMarkBadge;
  /** Optional one-line honest description under the summary. */
  note?: string;
  children: ReactNode;
}) {
  const enabled = useReviewMode();
  if (!enabled) return null;
  return (
    <details
      data-testid={`review-marked-${id}`}
      data-review-badge={badge}
      className="rounded-[16px] border border-ink/10 border-l-2 border-l-review bg-white text-ink shadow-pro-sm"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-[13px] font-medium text-ink">{title}</span>
        <span className="inline-flex items-center gap-1 rounded border border-review/40 bg-review/10 px-1.5 py-0.5 text-xs font-medium tracking-[0.06em] text-review uppercase">
          {/* flag glyph — meaning carried by icon + text, never color alone */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            aria-hidden
          >
            <path d="M5 21V4m0 0h13l-3 4 3 4H5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {badge}
        </span>
      </summary>
      {note ? <p className="px-4 pb-1 text-xs leading-relaxed text-stone-600">{note}</p> : null}
      <div className="px-4 pt-1 pb-4">{children}</div>
    </details>
  );
}
