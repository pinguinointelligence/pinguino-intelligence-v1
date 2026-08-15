import { useEffect, useRef } from 'react';

export function NewRecipeConfirmationDialog({
  open,
  onConfirm,
  onCancel,
  title = 'Rozpocząć nową recepturę?',
  description = 'Niezapisane zmiany w bieżącej recepturze zostaną usunięte.',
  confirmLabel = 'Nowa receptura',
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string | null;
  confirmLabel?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-ink/35 px-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        const first = controls.at(0);
        const last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-recipe-confirm-title"
        aria-describedby={description ? 'new-recipe-confirm-description' : undefined}
        className="w-full max-w-md rounded-[24px] border border-ink/10 bg-white p-6 text-ink shadow-pro-e3"
      >
        <h2 id="new-recipe-confirm-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p
            id="new-recipe-confirm-description"
            className="mt-2 text-sm leading-6 text-stone-600"
          >
            {description}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-10 rounded-[12px] border border-ink/15 px-4 text-sm font-semibold text-ink"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 rounded-[12px] bg-ink px-4 text-sm font-semibold text-white shadow-pro-sm"
            data-testid="confirm-new-recipe"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
