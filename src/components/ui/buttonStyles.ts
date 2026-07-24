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
  sm: 'px-5 py-2.5 text-sm',
  md: 'px-7 py-3.5 text-sm',
};

/** Class recipe shared by <Button> and router <Link>s so links can look like buttons. */
export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    VARIANTS[variant],
    SIZES[size],
  );
