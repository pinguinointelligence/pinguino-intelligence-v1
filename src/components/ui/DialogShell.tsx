import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

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
export function DialogShell({
  label,
  testId,
  children,
  onClose,
  placement = 'center',
  panelClassName,
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
        placement === 'bottom'
          ? 'flex flex-col justify-end p-0'
          : placement === 'responsive'
            ? 'flex flex-col justify-end p-0 sm:flex-row sm:items-center sm:justify-center sm:p-4'
            : 'grid place-items-center p-[var(--pro-dialog-gutter)] sm:p-4',
      )}
      data-testid={testId}
      data-placement={placement}
      data-dialog-shell="gellatti"
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
        data-dialog-state={panelState}
        data-terminal-state={panelState}
        className={cn(
          'relative overflow-y-auto border border-ink/15 bg-white text-ink shadow-pro-e3 [overscroll-behavior:contain]',
          placement === 'bottom'
            ? 'max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))] w-full rounded-t-[22px] border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]'
            : placement === 'responsive'
              ? 'max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))] w-full rounded-t-[22px] border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] sm:max-h-[min(86vh,760px)] sm:w-[min(520px,94vw)] sm:rounded-[24px] sm:border sm:p-5'
              : 'max-h-[min(86vh,760px)] w-[min(520px,94vw)] rounded-[24px] p-5',
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
