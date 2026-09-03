import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DialogShell } from './DialogShell';

/**
 * THE one Gellatti notice surface — informational notices, technical-limit
 * notices, safe automatic corrections, simple refusals, and warnings that need
 * an acknowledgement (owner 2026-09-03).
 *
 * Before this, a simple "you have reached the maximum" sentence was delivered
 * on the graphite `#191a1d` diagnostic panel the recalculation overlay uses,
 * while every other Gellatti surface is a light premium one. The same product
 * spoke in two visual languages depending on which subsystem happened to be
 * talking. This composes the EXISTING `DialogShell` primitive — escape, focus
 * trap, focus restore, scroll lock and the body portal are already solved there
 * and are deliberately not re-implemented — and adds only the Gellatti notice
 * layout on top of it.
 *
 * `tone`:
 * - `informational` (default) — a neutral line/shadow. Most notices are this.
 * - `attention` — the warm orange outline and glow. Reserved for a notice the
 *   user genuinely must register before continuing. Orange is not decoration:
 *   if every notice is orange, none of them is.
 *
 * `align`:
 * - `center` (default) — simple notices: centered headline, centered short body.
 * - `start` — a notice carrying structured content (a change list, a comparison)
 *   where centering would fight the content's own alignment.
 */
export function GellattiNotice({
  title,
  body,
  children,
  primaryLabel = 'OK',
  onPrimary,
  secondaryLabel,
  onSecondary,
  tone = 'informational',
  align = 'center',
  testId,
  primaryTestId,
  onClose,
}: {
  title: string;
  /** The short sentence(s) of a simple notice. */
  body?: ReactNode;
  /** Structured content for a notice that carries real choices or detail. */
  children?: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: 'informational' | 'attention';
  align?: 'center' | 'start';
  testId: string;
  /** Keeps an existing acknowledgement test id when a hand-rolled notice is
   * migrated onto this shell. Defaults to `<testId>-primary`. */
  primaryTestId?: string;
  /** Escape / backdrop. Defaults to the primary acknowledgement. */
  onClose?: () => void;
}) {
  const centered = align === 'center';
  return (
    <DialogShell
      label={title}
      testId={testId}
      onClose={onClose ?? onPrimary}
      placement="responsive"
      dismissOnBackdrop
      panelClassName={cn(
        'bg-white text-[var(--g-graphite)]',
        // The attention state is an OUTLINE and a glow, never a fill: a tinted
        // panel would drag the whole notice away from the Gellatti white
        // surface for what is a single line of emphasis.
        //
        // It is a RING, not a border, and deliberately so. `cn` is a plain
        // class joiner, not tailwind-merge, so a `border-*` here does not
        // replace DialogShell's own `border-ink/15` — both ship and CSS order
        // decides, which is how the first attempt declared an orange outline
        // that never painted. Measured on served staging: the panel border came
        // back `ink/15`. A ring occupies a property DialogShell does not set,
        // so it cannot be silently outranked.
        tone === 'attention' && 'ring-2 ring-[var(--g-orange)]',
      )}
    >
      <div
        data-notice-tone={tone}
        data-notice-align={align}
        className={cn('px-1 py-2 sm:px-2', centered && 'text-center')}
      >
        <h2
          className={cn(
            'text-[19px] leading-[1.3] font-bold tracking-[-0.01em] text-[var(--g-graphite)]',
            centered && 'mx-auto max-w-[26ch]',
          )}
          data-testid={`${testId}-title`}
        >
          {title}
        </h2>
        {body ? (
          <div
            className={cn(
              'mt-3 text-[14.5px] leading-[1.55] text-[var(--g-text-secondary)]',
              centered && 'mx-auto max-w-[38ch]',
            )}
            data-testid={`${testId}-body`}
          >
            {body}
          </div>
        ) : null}
        {children ? <div className="mt-4 text-left">{children}</div> : null}
        <div
          className={cn(
            'mt-6 flex flex-wrap gap-2',
            centered ? 'justify-center' : 'justify-end',
            // On a phone the acknowledgement is the thumb target, so it owns
            // the full width and the secondary sits under it.
            'max-sm:flex-col-reverse',
          )}
        >
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              data-testid={`${testId}-secondary`}
              className="pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--g-line-strong)] bg-white px-5 text-sm font-semibold text-[var(--g-text-secondary)] transition-colors hover:border-ink/35 hover:text-[var(--g-graphite)]"
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onPrimary}
            data-testid={primaryTestId ?? `${testId}-primary`}
            className={cn(
              'pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-bold transition-colors',
              // Graphite ink on the accent measures 7.5:1; white on the accent
              // would be 2.5:1 — the mistake already removed from Direction and
              // from the save tongue.
              tone === 'attention'
                ? 'bg-[var(--g-orange)] text-[var(--g-graphite)] hover:bg-[#e07f06]'
                : 'bg-[var(--g-graphite)] text-white hover:bg-ink-soft',
            )}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
