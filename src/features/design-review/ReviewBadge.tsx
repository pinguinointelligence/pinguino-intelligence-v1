/**
 * ReviewBadge — the red `DO PRZEGLĄDU` marker (Masterpiece UX/UI Phase 3).
 *
 * Renders ONLY in owner/QA review mode (dev or the flagged staging deploy + pro capability) —
 * `useReviewMode` gates it; normal customers never see it. Carries text + a glyph (never color
 * alone), and the registry reason on hover/click (title + expandable detail via the overlay).
 */
import { useReviewMode } from './useReviewMode';
import { REVIEW_ITEMS } from './reviewItems';

export function ReviewBadge({ itemId }: { itemId: string }) {
  const enabled = useReviewMode();
  if (!enabled) return null;
  const item = REVIEW_ITEMS.find((entry) => entry.id === itemId);
  if (!item) return null;
  return (
    <span
      data-testid={`review-badge-${item.id}`}
      title={`${item.id}: ${item.reason}`}
      className="inline-flex items-center gap-1 rounded border border-review/40 bg-review/10 px-1.5 py-0.5 align-middle text-[0.6rem] font-medium tracking-[0.08em] text-review uppercase"
    >
      {/* flag glyph — meaning is carried by icon + text, never color alone */}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
        <path d="M5 21V4m0 0h13l-3 4 3 4H5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      DO PRZEGLĄDU
    </span>
  );
}
