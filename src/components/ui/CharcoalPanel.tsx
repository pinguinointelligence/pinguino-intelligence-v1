import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type PanelPadding = 'md' | 'lg';

const PADDINGS: Record<PanelPadding, string> = {
  md: 'p-6',
  lg: 'p-8 md:p-10',
};

interface CharcoalPanelProps extends HTMLAttributes<HTMLElement> {
  padding?: PanelPadding;
}

/** Deep charcoal contrast panel — the inset counterpart of the landing band (Design Lock §3). */
export function CharcoalPanel({ padding = 'lg', className, ...rest }: CharcoalPanelProps) {
  return (
    <section
      className={cn('rounded-lg bg-ink text-ivory', PADDINGS[padding], className)}
      {...rest}
    />
  );
}
