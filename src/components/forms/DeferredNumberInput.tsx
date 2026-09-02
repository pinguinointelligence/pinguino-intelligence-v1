import { useRef, useState, type InputHTMLAttributes } from 'react';

const formatNumber = (value: number, decimals: number) =>
  Number.isFinite(value) ? String(Number(value.toFixed(decimals))) : '';

export function DeferredNumberInput({
  value,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  decimals = 0,
  onCommit,
  onInvalid,
  ...inputProps
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'onBlur'
> & {
  value: number;
  min?: number;
  max?: number;
  decimals?: number;
  onCommit: (value: number) => void;
  onInvalid?: () => void;
}) {
  const [draft, setDraft] = useState(() => formatNumber(value, decimals));
  const [editing, setEditing] = useState(false);
  const skipNextBlurCommit = useRef(false);

  const reset = () => {
    setDraft(formatNumber(value, decimals));
    setEditing(false);
  };
  const commit = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      onInvalid?.();
      reset();
      return;
    }
    const bounded = Math.min(max, Math.max(min, parsed));
    const normalized = Number(bounded.toFixed(decimals));
    setDraft(formatNumber(normalized, decimals));
    setEditing(false);
    onCommit(normalized);
  };

  return (
    <input
      {...inputProps}
      type="text"
      role="spinbutton"
      inputMode="decimal"
      aria-valuemin={Number.isFinite(min) ? min : undefined}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      aria-valuenow={Number.isFinite(value) ? value : undefined}
      value={editing ? draft : formatNumber(value, decimals)}
      onFocus={() => {
        setDraft(formatNumber(value, decimals));
        setEditing(true);
      }}
      onChange={(event) => {
        setEditing(true);
        setDraft(event.currentTarget.value.replace(',', '.'));
      }}
      onBlur={() => {
        if (skipNextBlurCommit.current) {
          skipNextBlurCommit.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.preventDefault();
          skipNextBlurCommit.current = true;
          reset();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
