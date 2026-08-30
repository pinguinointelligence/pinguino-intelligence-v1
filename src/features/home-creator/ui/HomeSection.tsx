/**
 * GELLATTI HOME — one calm section of the sequential flow (§82, §83).
 *
 * §82 is specific about what this must NOT be: not a dashboard, not one overloaded
 * screen, and crucially NOT a nested scroll area and NOT forced to 100vh. So a section
 * is a plain block in normal document flow with generous vertical rhythm — a long
 * ingredient list simply makes the document longer, exactly as the owner asked.
 *
 * `min-height` uses `svh` (small viewport height) rather than `vh` so mobile browser
 * chrome collapsing cannot make a section jump; it is a MINIMUM, never a cap.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';

export function HomeSection({
  id,
  children,
  onBack,
  className,
  fill = true,
  'data-testid': testId,
}: {
  id: string;
  children: ReactNode;
  /** §83: a subtle Back, offered from the second stage onward. */
  onBack?: (() => void) | null;
  className?: string;
  /** Give the section a comfortable minimum height; long content still grows. */
  fill?: boolean;
  'data-testid'?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId ?? `home-section-${id}`}
      className={cn(
        'mx-auto w-full max-w-[560px] scroll-mt-20 px-5 py-10 sm:px-6 lg:max-w-[720px] lg:py-16',
        fill && 'min-h-[calc(100svh-var(--home-header-height,64px))]',
        'flex flex-col justify-center',
        className,
      )}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          data-testid={`home-back-${id}`}
          className="mb-6 -ml-1 inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-lg px-1 text-[13px] transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          style={{ color: 'var(--g-text-muted)' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path
              d="M10 3 5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {homeCreatorCopy.nav.back}
        </button>
      ) : null}
      {children}
    </section>
  );
}
