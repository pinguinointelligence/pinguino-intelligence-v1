import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'ghost' | 'ivory';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  ghost: 'border border-ink/15 text-ink hover:border-ink/40',
  /* Ivory fill carries SHELL text (visually identical on light routes) so the button
     never washes out inside `.theme-pro-dark`, where the ink token flips to ivory. */
  ivory: 'bg-ivory text-shell hover:bg-ivory/85',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-4 py-2 text-xs max-sm:min-h-11',
  md: 'min-h-11 px-5 py-2.5 text-sm',
};

/** Class recipe shared by <Button> and router <Link>s so links can look like buttons. */
export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  cn(
    'pro-focus-ring inline-flex items-center justify-center rounded-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
  );

/** Shared compact round action used by ingredient and recipe ellipsis controls. */
export const iconButtonClasses = (size: 'xs' | 'sm' | 'md' = 'sm') =>
  cn(
    'pro-focus-ring grid shrink-0 place-items-center rounded-full border border-ink/10 bg-white text-stone-500 transition-colors hover:border-ink/35 hover:text-ink',
    size === 'xs' ? 'size-7 text-[11px]' : size === 'sm' ? 'size-9 text-xs' : 'size-11 text-sm',
  );
