/**
 * DESIGN V3.0 HOME — one frame for every HOME sheet (corrections XIII + XII).
 *
 * On a phone and a portrait tablet a HOME sheet is a compact layer stuck to the bottom:
 * height from its content, never taller than the room under the header (the inside
 * scrolls instead), the main actions last under the thumb, 12 px above them, the same
 * radius, shadow and handle as the ingredient panel, the recipe dimmed above. From
 * 1024 px it is a light centred modal. That frame is the shared `home-layer` placement of
 * `DialogShell` (`homeLayer.css`); this file only adds the keyboard lift and the two
 * pieces every HOME sheet repeats — its heading and its foot.
 */
import type { CSSProperties, ReactNode } from 'react';
import { DialogShell } from '@/components/ui/DialogShell';
import { useKeyboardInset } from '@/components/ui/useKeyboardInset';
import { cn } from '@/lib/cn';

export const homeLayerPrimaryButton =
  'pro-focus-ring inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-full bg-[var(--g-ink)] px-5 text-[15.5px] font-semibold text-white disabled:opacity-40';
export const homeLayerSecondaryButton =
  'pro-focus-ring inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-[var(--g-line)] bg-white px-[18px] text-[14px] font-semibold text-[var(--g-ink)]';
export const homeLayerDangerButton =
  'pro-focus-ring inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[15.5px] font-semibold text-[#a3261d] shadow-[inset_0_0_0_1px_rgba(16,17,19,0.2)] transition-colors hover:bg-[#fdf5f4]';
export const homeLayerTextButton =
  'pro-focus-ring inline-flex h-12 shrink-0 items-center justify-center rounded-full px-3.5 text-[15px] font-semibold text-[var(--g-ink)]';

export function HomeLayer({
  label,
  testId,
  panelTestId,
  onClose,
  onBackdrop,
  initialFocusTestId,
  size = 'default',
  children,
}: {
  label: string;
  testId: string;
  panelTestId?: string;
  /** Escape. */
  onClose: () => void;
  /** A tap on the dimmed page around the layer; defaults to `onClose`. */
  onBackdrop?: () => void;
  initialFocusTestId?: string;
  size?: 'default' | 'wide';
  children: ReactNode;
}) {
  const keyboardInset = useKeyboardInset();
  return (
    <DialogShell
      label={label}
      testId={testId}
      panelTestId={panelTestId}
      placement="home-layer"
      size={size}
      onClose={onClose}
      onBackdrop={onBackdrop ?? onClose}
      initialFocusTestId={initialFocusTestId}
      panelStyle={
        keyboardInset > 0
          ? ({ '--home-layer-keyboard': `${keyboardInset}px` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </DialogShell>
  );
}

export function HomeLayerHeading({
  title,
  subtitle,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('shrink-0', className)}>
      <h2 className="text-[18px] leading-[1.25] font-semibold text-[var(--g-ink)]">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-[13px] leading-[1.35] text-[var(--g-text-muted)]">{subtitle}</p>
      ) : null}
    </div>
  );
}

/** The actions, last, under the thumb — 12 px above them, like the ingredient panel. */
export function HomeLayerFoot({ children }: { children: ReactNode }) {
  return <div className="mt-7 flex shrink-0 items-center gap-3">{children}</div>;
}
