import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { isTopmostDialogShell, registerDialogShell } from './dialogShellRegistry';

/**
 * THE one modal primitive for PINGÜINO Pro line-level dialogs.
 *
 * Escape, focus trap, focus restore and body scroll lock in one place. It was
 * previously private to `IngredientRow`; the mobile ingredient editor needed
 * the SAME behaviour as a bottom sheet, so the primitive was lifted here
 * instead of growing a second, slightly different modal (owner §16).
 *
 * `placement="bottom"` is the thumb-reachable variant: the panel is anchored to
 * the bottom edge, keeps clear of the home indicator via
 * `env(safe-area-inset-bottom)`, and uses the same border/radius/elevation
 * language as the centered variant.
 */
/**
 * Canonical widths. One family, three members — never a per-dialog number.
 * The desktop values are the panel's own width; every one of them stays inside
 * the viewport on a phone through the same `94vw`/gutter clamp.
 */
const PANEL_WIDTH = {
  compact: 'sm:w-[min(420px,94vw)]',
  default: 'sm:w-[min(520px,94vw)]',
  wide: 'sm:w-[min(680px,94vw)]',
} as const;

const CENTERED_WIDTH = {
  compact: 'w-[min(420px,94vw)]',
  default: 'w-[min(520px,94vw)]',
  wide: 'w-[min(680px,94vw)]',
} as const;

export function DialogShell({
  label,
  testId,
  children,
  onClose,
  placement = 'center',
  panelClassName,
  tone = 'default',
  size = 'default',
  dismissOnBackdrop = false,
  showCloseControl = false,
  closeLabel = 'Zamknij',
  closeTestId,
  panelTestId,
  panelState,
  initialFocusTestId,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
  onClose: () => void;
  placement?: 'center' | 'bottom' | 'responsive';
  panelClassName?: string;
  /**
   * The panel's own surface treatment.
   *
   * It lives HERE, not in `panelClassName`, because this component sets both
   * `border-*` and `shadow-*` in its base class string and `cn` is a plain
   * joiner, not tailwind-merge. A caller that adds `border-[var(--g-orange)]`
   * or `ring-2` therefore ships a SECOND declaration of a property this
   * component already owns, and the CSS cascade — not the caller — decides
   * which one paints. Both of those were tried and neither rendered: the border
   * lost to `border-ink/15`, and the ring populated `--tw-ring-shadow` while
   * `shadow-pro-e3` kept sole ownership of `box-shadow`. Measured on served
   * staging both times. Selecting one complete treatment here means there is
   * only ever one declaration per property, so nothing can be outranked.
   */
  tone?: 'default' | 'attention';
  /**
   * The panel's canonical WIDTH, chosen from a fixed family rather than typed
   * per dialog.
   *
   * The audit that produced this found five different widths in thirteen
   * dialogs — 520, 680, 500, `max-w-sm` twice — each written inline, three of
   * them fighting the shell's own `w-[min(520px,94vw)]` and winning or losing
   * on source order. `default` is the reference the owner accepted (the
   * „Maksymalna ilość została osiągnięta" notice). Reach for `wide` only when
   * the content genuinely needs it, and `compact` only for a short form.
   */
  size?: 'compact' | 'default' | 'wide';
  dismissOnBackdrop?: boolean;
  showCloseControl?: boolean;
  closeLabel?: string;
  closeTestId?: string;
  panelTestId?: string;
  panelState?: string;
  initialFocusTestId?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const shellId = useRef<symbol>(undefined as unknown as symbol);
  if (shellId.current === undefined) shellId.current = Symbol('dialog-shell');
  const [isTopmost, setIsTopmost] = useState(true);
  useEffect(() => {
    const id = shellId.current;
    return registerDialogShell(id, () => setIsTopmost(isTopmostDialogShell(id)));
  }, []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    const initialFocus = initialFocusTestId
      ? focusable().find((node) => node.dataset.testid === initialFocusTestId)
      : null;
    (initialFocus ?? focusable()[0])?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [initialFocusTestId]);

  const overlay = (
    <div
      className={cn(
        'fixed inset-0 z-[70] bg-black/45',
        // ONE overlay reads as active at a time. A shell that is no longer the
        // topmost keeps its own state but stops painting a second scrim and
        // stops taking pointer events, so a flow that briefly holds two shells
        // cannot present them as two stacked windows.
        isTopmost ? null : 'pointer-events-none bg-transparent',
        placement === 'bottom'
          ? 'flex flex-col justify-end p-0'
          : placement === 'responsive'
            ? 'flex flex-col justify-end p-0 sm:flex-row sm:items-center sm:justify-center sm:p-4'
            : 'grid place-items-center p-[var(--pro-dialog-gutter)] sm:p-4',
      )}
      data-testid={testId}
      data-placement={placement}
      data-dialog-shell="gellatti"
      data-dialog-active={isTopmost ? 'true' : 'false'}
      data-overlay-scope="viewport"
      onMouseDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={panelTestId}
        data-dialog-panel="gellatti"
        data-dialog-tone={tone}
        data-dialog-size={size}
        data-dialog-active={isTopmost ? 'true' : 'false'}
        aria-hidden={isTopmost ? undefined : true}
        data-dialog-state={panelState}
        data-terminal-state={panelState}
        className={cn(
          'relative overflow-y-auto border bg-white text-ink [overscroll-behavior:contain]',
          // EXACTLY ONE border colour and EXACTLY ONE box-shadow, chosen here.
          // The attention treatment keeps the same elevation and adds the warm
          // ring as part of the SAME shadow value, so it cannot be replaced by
          // the elevation shadow the way a separate `ring-*` utility was.
          tone === 'attention'
            ? 'border-[var(--g-orange)] shadow-[0_0_0_4px_rgba(245,138,7,0.18),0_8px_18px_rgba(16,17,19,0.12),0_28px_72px_rgba(16,17,19,0.24)]'
            : 'border-ink/15 shadow-pro-e3',
          placement === 'bottom'
            ? 'max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))] w-full rounded-t-[22px] border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]'
            : placement === 'responsive'
              ? cn(
                  'max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))] w-full rounded-t-[22px] border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] sm:max-h-[min(86vh,760px)] sm:rounded-[24px] sm:border sm:p-5',
                  PANEL_WIDTH[size],
                )
              : cn('max-h-[min(86vh,760px)] rounded-[24px] p-5', CENTERED_WIDTH[size]),
          panelClassName,
        )}
      >
        {showCloseControl ? (
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => onCloseRef.current()}
            data-testid={closeTestId}
            className="pro-focus-ring absolute top-3 right-3 z-10 inline-flex size-10 items-center justify-center rounded-full border border-[var(--g-line-strong)] bg-white text-[var(--g-text-secondary)] transition-colors hover:border-ink/35 hover:text-[var(--g-graphite)]"
          >
            <svg aria-hidden viewBox="0 0 20 20" className="size-4">
              <path
                d="m6 6 8 8M14 6l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only">{closeLabel}</span>
          </button>
        ) : null}
        {children}
      </section>
    </div>
  );

  // A dialog mounted inside a transformed/contained workspace column can make
  // `position: fixed` relative to that column instead of the browser viewport.
  // Portalling the one shared shell to <body> keeps every overlay uniformly
  // dimmed and centered above the complete two-column application. SSR keeps
  // the same markup inline until a document exists.
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}
