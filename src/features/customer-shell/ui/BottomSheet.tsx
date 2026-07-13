import type { ReactNode } from 'react';
import { useEffect, useId } from 'react';
import { cn } from '@/lib/cn';
import { color, elevation, motion, radius, safeArea, type } from './tokens';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional pinned footer (e.g. a confirm button) — sits above the safe area. */
  footer?: ReactNode;
  className?: string;
}

/**
 * iOS-style bottom sheet: dimmed backdrop + a panel that rises from the bottom
 * edge, rounded top, grabber handle, and safe-area padding so the last control
 * clears the home indicator. Closes on backdrop tap and Escape. Controlled and
 * presentational (mount/unmount driven by the caller's `open`).
 */
export function BottomSheet({ open, onClose, title, children, footer, className }: BottomSheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 motion-safe:animate-[fadeIn_150ms_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative z-10 flex max-h-[85vh] w-full max-w-[560px] flex-col bg-paper',
          radius.sheet,
          elevation.sheet,
          motion.transform,
          'motion-safe:animate-[sheetUp_240ms_cubic-bezier(0.32,0.72,0,1)]',
          className,
        )}
      >
        <div className="flex flex-col items-center pt-2.5">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-ink/15" />
        </div>
        {title ? (
          <div className="px-5 pb-1 pt-3">
            <h2 id={titleId} className={cn(type.heading, color.textPrimary)}>
              {title}
            </h2>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
        {footer ? (
          <div className={cn('border-t border-ink/10 px-5 pt-3', safeArea.bottom)}>{footer}</div>
        ) : (
          <div aria-hidden className={safeArea.bottom} />
        )}
      </div>

      {/* Scoped keyframes — no global CSS edited. */}
      <style>{`
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
