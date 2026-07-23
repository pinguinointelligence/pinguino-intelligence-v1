/**
 * ReviewOverlay — the floating owner-review panel (Masterpiece UX/UI Phase 3).
 *
 * A small collapsed `DO PRZEGLĄDU (n)` pill in the bottom-left corner, visible ONLY in owner/QA
 * review mode (dev or flagged staging + pro capability). Expanding it lists the review items for
 * the CURRENT route first, then the full registry — each with its reason and suggested action —
 * so the owner can walk every flagged surface without any item being hidden or removed.
 * Decisions are NEVER made here: the checklist lives in docs/design/PINGUINO_REVIEW_ITEMS.md.
 */
import { useState } from 'react';
import { useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { useReviewMode } from './useReviewMode';
import { REVIEW_ITEMS, reviewItemsForPath, type ReviewItem } from './reviewItems';

const SUGGESTION_LABEL: Record<ReviewItem['suggestion'], string> = {
  keep: 'zachować',
  rename: 'zmienić nazwę',
  merge: 'scalić',
  relocate: 'przenieść',
  'hide-by-capability': 'ukryć wg uprawnień',
  'remove-later': 'usunąć później (decyzja właściciela)',
};

function ReviewRow({ item, current }: { item: ReviewItem; current: boolean }) {
  return (
    <li
      data-testid={`review-overlay-item-${item.id}`}
      className={cn('rounded-md border px-3 py-2', current ? 'border-review/50 bg-review/10' : 'border-ink/10')}
    >
      <p className="flex items-baseline gap-2 text-xs font-medium text-ink">
        <span className="text-review">{item.id}</span>
        <span className="min-w-0">{item.label}</span>
      </p>
      <p className="mt-1 text-[0.7rem] leading-relaxed text-stone-600">{item.reason}</p>
      <p className="mt-1 text-[0.65rem] text-stone-500">
        Trasa: <span className="font-mono">{item.route}</span> · Propozycja:{' '}
        {SUGGESTION_LABEL[item.suggestion]} · Decyzja właściciela: oczekuje
      </p>
    </li>
  );
}

/** The expanded panel — exported for direct presentational testing (no interaction needed). */
export function ReviewOverlayPanel({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  const currentItems = reviewItemsForPath(pathname);
  const currentIds = new Set(currentItems.map((item) => item.id));
  const otherItems = REVIEW_ITEMS.filter((item) => !currentIds.has(item.id));

  return (
    <div className="mb-2 max-h-[70vh] w-[min(92vw,420px)] overflow-y-auto rounded-lg border border-ink/15 bg-paper p-3 text-ink shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.65rem] font-medium tracking-label text-review uppercase">
          Tryb przeglądu właściciela — staging
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-stone-500 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          Zamknij
        </button>
      </div>
      <p className="mt-1 text-[0.7rem] leading-relaxed text-stone-500">
        Oznaczenia „DO PRZEGLĄDU” widzą wyłącznie sesje właściciela/QA. Nic nie zostało
        usunięte ani ukryte. Lista decyzji: docs/design/PINGUINO_REVIEW_ITEMS.md
      </p>
      {currentItems.length > 0 ? (
        <>
          <p className="mt-3 text-[0.65rem] font-medium tracking-label text-stone-400 uppercase">
            Na tej stronie
          </p>
          <ul className="mt-1 space-y-2">
            {currentItems.map((item) => (
              <ReviewRow key={item.id} item={item} current />
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-3 text-[0.65rem] font-medium tracking-label text-stone-400 uppercase">
        Wszystkie pozycje ({REVIEW_ITEMS.length})
      </p>
      <ul className="mt-1 space-y-2">
        {otherItems.map((item) => (
          <ReviewRow key={item.id} item={item} current={false} />
        ))}
      </ul>
    </div>
  );
}

export function DesignReviewOverlay() {
  const enabled = useReviewMode();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-[60] font-sans"
      data-testid="design-review-overlay"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {open ? <ReviewOverlayPanel pathname={location.pathname} onClose={() => setOpen(false)} /> : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="design-review-toggle"
        className="inline-flex items-center gap-1.5 rounded-full border border-review/50 bg-paper px-3 py-1.5 text-[0.65rem] font-medium tracking-[0.08em] text-review uppercase shadow-lg transition-colors hover:bg-review/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-review/50"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
          <path d="M5 21V4m0 0h13l-3 4 3 4H5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Do przeglądu ({REVIEW_ITEMS.length})
      </button>
    </div>
  );
}
