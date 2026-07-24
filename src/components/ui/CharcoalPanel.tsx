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

/** Deep charcoal contrast panel — the inset counterpart of the landing band (Design Lock §3).
 * Fills with the dedicated `charcoal` SURFACE token (== ink on light routes) so that inside
 * `.theme-pro-dark` — where the ink token flips to ivory for text — the panel stays a DARK
 * elevated surface with light text instead of washing out ivory-on-ivory (owner P0 repair). */
export function CharcoalPanel({ padding = 'lg', className, ...rest }: CharcoalPanelProps) {
  return (
    <section
      className={cn('rounded-lg bg-charcoal text-ivory', PADDINGS[padding], className)}
      {...rest}
    />
  );
}
