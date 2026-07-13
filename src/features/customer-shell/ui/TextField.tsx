import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { color, motion, radius, touch, type } from './tokens';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** Helper text shown under the field when there is no error. */
  hint?: string;
  /** Error message — swaps the border/ring to the error tone and is announced. */
  error?: string;
  /** Optional trailing adornment (e.g. a unit label or a mic button). */
  trailing?: ReactNode;
}

/**
 * Labelled text input. 52px tall, 17px value text (comfortable on mobile),
 * visible focus ring, explicit error state with an announced message. The label
 * is always rendered (no placeholder-as-label). Presentational only.
 */
export function TextField({
  label,
  hint,
  error,
  trailing,
  id,
  className,
  disabled,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedById = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  const invalid = Boolean(error);

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={inputId} className={cn('block', type.secondary, 'font-medium', color.textPrimary)}>
        {label}
      </label>
      <div
        className={cn(
          'mt-2 flex items-center gap-2 border bg-paper px-4',
          radius.control,
          touch.control,
          motion.base,
          invalid ? 'border-status-error/60' : 'border-ink/15',
          disabled && 'bg-stone-50 opacity-60',
          // Ring travels on the wrapper so trailing adornments stay inside the frame.
          'focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-paper',
          invalid ? 'focus-within:ring-status-error' : 'focus-within:ring-ink',
        )}
      >
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedById}
          className={cn(
            'w-full min-w-0 bg-transparent py-3 outline-none',
            type.body,
            color.textPrimary,
            'placeholder:text-stone-400',
          )}
          {...rest}
        />
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </div>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className={cn('mt-2', type.caption, color.statusError)}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className={cn('mt-2', type.caption, color.textMuted)}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
