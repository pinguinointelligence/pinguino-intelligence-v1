import type { Ref, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { color, safeArea, type } from './tokens';

interface StickyCtaProps {
  children: ReactNode;
  /** Optional short helper line above the action (e.g. total, disclaimer). */
  caption?: ReactNode;
  /**
   * Ref to the fixed bar itself, so a caller can measure its real rendered
   * height and reserve exactly that much bottom clearance — the caption wraps to
   * a different number of lines across viewports, so a fixed spacer is unsafe.
   */
  innerRef?: Ref<HTMLDivElement>;
  className?: string;
}

/**
 * Fixed bottom action bar. Sits above the safe-area inset and casts a soft top
 * edge so it reads as floating over content. It does NOT cover the last of the
 * scroll content — pair with `<CustomerSurface hasStickyCta>` (or add matching
 * bottom padding) so a spacer reserves its height.
 */
export function StickyCta({ children, caption, innerRef, className }: StickyCtaProps) {
  return (
    <div
      ref={innerRef}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur',
        'shadow-[0_-6px_24px_rgba(16,17,19,0.06)]',
        safeArea.bottom,
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[640px] px-5 pt-3 sm:px-8">
        {caption ? (
          <div className={cn('mb-2 text-center', type.caption, color.textMuted)}>{caption}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
