import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';

/**
 * @security Decorative only (Phase 6C Slice 2B, Masterplan §10). Locked Free
 * Preview panels are built from this shell and MUST NOT import @/engine, receive
 * a RecipeResult / exact values, or render real numbers — only static labels,
 * skeleton bars and "—" placeholders. The real panels are never mounted while
 * locked (do-not-mount ternary in StudioPage), so no exact value reaches the DOM.
 */
export function LockedPanel({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>{title}</SectionLabel>
        <span className="rounded border border-ivory/15 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-ivory/45 uppercase">
          {copy.studio.locked.chip}
        </span>
      </div>
      <div className="mt-5">{children}</div>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </Card>
  );
}

/** Decorative skeleton row: a label bar + a "—" placeholder (no real value). */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-1.5', className)}>
      <span aria-hidden className="h-2 w-28 rounded-full bg-ivory/[0.08]" />
      <span className="font-mono text-sm text-ivory/30">—</span>
    </div>
  );
}

/** Decorative indicator track (no values, purely cosmetic fill width). */
export function SkeletonBar({ fill = 'w-1/3' }: { fill?: string }) {
  return (
    <div aria-hidden className="mt-2 h-1.5 w-full rounded-full bg-ivory/10">
      <div className={cn('h-1.5 rounded-full bg-ivory/20', fill)} />
    </div>
  );
}
