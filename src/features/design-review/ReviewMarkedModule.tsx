/**
 * ReviewMarkedModule — the ALWAYS-VISIBLE red module marker on /pro/recipe
 * (owner P0 UX repair, 2026-07-24).
 *
 * Unlike `ReviewBadge` (gated to owner/QA review sessions), this marker is part of the
 * page itself: the owner decided every non-core module KEPT on the Pro recipe workspace
 * must be VISIBLY marked red — red left border + a red badge (`DO PRZEGLĄDU` /
 * `OPCJONALNE` / `ADVANCED` / `ADVANCED / REVIEW`) — and collapsed by default until the
 * review decides its fate. NOTHING is removed or CSS-hidden: the module renders inside,
 * fully functional, behind a calm native `<details>` (keyboard/focus preserved).
 *
 * Presentation only — no store writes, no gating logic, no engine imports.
 */
import type { ReactNode } from 'react';

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
  return (
    <details
      data-testid={`review-marked-${id}`}
      data-review-badge={badge}
      className="rounded-md border border-ivory/10 border-l-2 border-l-review bg-ivory/[0.02]"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-[13px] font-medium text-ivory">{title}</span>
        <span className="inline-flex items-center gap-1 rounded border border-review/40 bg-review/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-[0.08em] text-review uppercase">
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
      {note ? <p className="px-4 pb-1 text-xs leading-relaxed text-ivory/60">{note}</p> : null}
      <div className="px-4 pt-1 pb-4">{children}</div>
    </details>
  );
}
