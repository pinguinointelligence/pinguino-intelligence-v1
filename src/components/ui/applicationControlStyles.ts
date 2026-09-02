import { cn } from '@/lib/cn';
import { buttonClasses, iconButtonClasses } from './buttonStyles';

/**
 * Application controls projected from the frozen current-PRO family.
 *
 * The source recipes in `buttonStyles.ts` stay untouched because they are used
 * by the accepted Recipe workbench. These compositions only add the responsive
 * context measured in the V2 owner gate: 40 px on desktop and a 44 px touch
 * target at 390 px. Compact and destructive actions keep their real desktop
 * variants instead of being normalised to one universal height.
 */
export const applicationPrimaryClasses = (className?: string) =>
  cn(
    buttonClasses('primary', 'sm'),
    '!rounded-[var(--radius-pro-studio)] max-sm:min-h-11 max-sm:px-5 max-sm:text-sm',
    className,
  );

export const applicationSecondaryClasses = (className?: string) =>
  cn(
    buttonClasses('ghost', 'sm'),
    '!rounded-[var(--radius-pro-studio)] bg-white max-sm:min-h-11 max-sm:px-5 max-sm:text-sm',
    className,
  );

export const applicationQuietClasses = (className?: string) =>
  cn(
    'pro-focus-ring inline-flex min-h-9 items-center justify-center rounded-[var(--radius-pro-studio)] px-1 text-[10px] font-normal text-stone-600 underline decoration-ink/20 underline-offset-4 transition-colors hover:text-ink max-sm:min-h-11 max-sm:text-xs',
    className,
  );

export const applicationCompactClasses = (className?: string) =>
  cn(
    'pro-focus-ring inline-flex min-h-8 items-center justify-center rounded-[var(--radius-pro-studio)] border border-ink/15 bg-white px-2 text-xs font-semibold text-ink transition-colors hover:border-ink/40 max-sm:min-h-11',
    className,
  );

export const applicationIconClasses = (className?: string) =>
  cn(iconButtonClasses('xs'), 'max-sm:size-11', className);

export const applicationDestructiveClasses = (className?: string) =>
  cn(
    'pro-focus-ring inline-flex min-h-9 items-center justify-center rounded-[var(--radius-pro-studio)] border border-status-error/35 bg-status-error/[0.06] px-3 text-[10px] font-semibold text-status-error transition-colors hover:border-status-error/60 max-sm:min-h-11 max-sm:px-4 max-sm:text-xs',
    className,
  );

export const applicationFieldClasses = (className?: string) =>
  cn(
    'pro-focus-ring h-10 w-full rounded-[var(--radius-pro-studio)] border border-ink/15 bg-white px-3 text-xs text-ink placeholder:text-stone-400 max-sm:h-11 max-sm:text-[13px]',
    className,
  );
