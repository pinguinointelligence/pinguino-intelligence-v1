import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import {
  acceleratedStepMultiplier,
  committedNumberValue,
  scrubbedValue,
} from './directNumberControlModel';

interface DirectNumberControlProps {
  value: number;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  suffix: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  testId: string;
  ariaDescribedBy?: string;
  preservePrecision?: boolean;
}

export function DirectNumberControl({
  value,
  step,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  decimals = 1,
  suffix,
  ariaLabel,
  disabled = false,
  onChange,
  testId,
  ariaDescribedBy,
  preservePrecision = false,
}: DirectNumberControlProps) {
  const accessibleValue = Number(value.toFixed(decimals));
  const valueRef = useRef(value);
  const [draft, setDraft] = useState(value.toFixed(decimals));
  const [editing, setEditing] = useState(false);
  const draftDirty = useRef(false);
  const repeatTimer = useRef<number | null>(null);
  const repeatCount = useRef(0);
  const repeated = useRef(false);
  const scrub = useRef<{
    pointerId: number;
    startX: number;
    startValue: number;
    detent: number;
  } | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(
    () => () => {
      if (repeatTimer.current !== null) window.clearTimeout(repeatTimer.current);
    },
    [],
  );

  const commit = (next: number) => {
    const committed = committedNumberValue({
      value: next,
      min,
      max,
      decimals,
      preservePrecision,
    });
    valueRef.current = committed;
    setDraft(committed.toFixed(decimals));
    draftDirty.current = false;
    setEditing(false);
    onChange(committed);
  };
  const nudge = (direction: -1 | 1, multiplier = 1) =>
    commit(valueRef.current + direction * step * multiplier);
  const stopRepeat = () => {
    if (repeatTimer.current !== null) window.clearTimeout(repeatTimer.current);
    repeatTimer.current = null;
  };
  const startRepeat = (direction: -1 | 1) => {
    if (disabled) return;
    stopRepeat();
    repeatCount.current = 0;
    repeated.current = false;
    const tick = () => {
      repeated.current = true;
      nudge(direction, acceleratedStepMultiplier(repeatCount.current));
      repeatCount.current += 1;
      repeatTimer.current = window.setTimeout(tick, repeatCount.current > 12 ? 55 : 90);
    };
    repeatTimer.current = window.setTimeout(tick, 360);
  };
  const onScrubStart = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (disabled) return;
    scrub.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: valueRef.current,
      detent: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onScrubMove = (event: ReactPointerEvent<HTMLInputElement>) => {
    const active = scrub.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - active.startX;
    const nextDetent = Math.trunc(deltaX / 12);
    if (nextDetent === active.detent) return;
    active.detent = nextDetent;
    commit(scrubbedValue(active.startValue, deltaX, step));
  };
  const onScrubEnd = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (scrub.current?.pointerId === event.pointerId) scrub.current = null;
  };

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[44px_minmax(68px,1fr)_44px] items-center overflow-hidden rounded-2xl border border-ink/12 bg-white shadow-pro-sm transition-shadow focus-within:border-ink/30 focus-within:shadow-pro-md',
        disabled && 'bg-stone-100 opacity-55',
      )}
      data-testid={testId}
      data-preserve-precision={preservePrecision ? 'true' : undefined}
    >
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {ariaLabel}: {value.toFixed(decimals)} {suffix}
      </span>
      {([-1, 1] as const).map((direction) => (
        <button
          key={direction}
          type="button"
          disabled={disabled}
          aria-label={`${ariaLabel} — ${direction < 0 ? 'zmniejsz' : 'zwiększ'}`}
          onPointerDown={() => startRepeat(direction)}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
          onPointerLeave={stopRepeat}
          onClick={() => {
            if (repeated.current) {
              repeated.current = false;
              return;
            }
            nudge(direction);
          }}
          className={cn(
            'row-start-1 grid size-11 place-items-center text-xl font-light text-ink transition-colors hover:bg-stone-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold disabled:cursor-not-allowed',
            direction > 0 && 'col-start-3',
          )}
        >
          {direction < 0 ? '−' : '+'}
        </button>
      ))}
      <label className="col-start-2 row-start-1 flex min-w-0 items-center justify-center border-x border-ink/18 px-1">
        <span className="sr-only">{ariaLabel}</span>
        <input
          type="text"
          role="spinbutton"
          inputMode="decimal"
          disabled={disabled}
          aria-valuemin={min}
          aria-valuemax={Number.isFinite(max) ? max : undefined}
          aria-valuenow={accessibleValue}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          value={editing ? draft : value.toFixed(decimals)}
          onFocus={() => {
            setDraft(valueRef.current.toFixed(decimals));
            draftDirty.current = false;
            setEditing(true);
          }}
          onChange={(event) => {
            draftDirty.current = true;
            setEditing(true);
            setDraft(event.currentTarget.value.replace(',', '.'));
          }}
          onBlur={() => {
            if (!draftDirty.current) {
              setDraft(valueRef.current.toFixed(decimals));
              setEditing(false);
              return;
            }
            const parsed = Number(draft);
            if (Number.isFinite(parsed)) commit(parsed);
            else {
              setDraft(valueRef.current.toFixed(decimals));
              setEditing(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              nudge(-1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              nudge(1);
            } else if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          onPointerDown={onScrubStart}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubEnd}
          onPointerCancel={onScrubEnd}
          data-scrubbable="horizontal"
          className="min-w-0 flex-1 touch-pan-y select-none bg-transparent text-right font-mono text-sm font-semibold tabular-nums text-ink outline-none disabled:cursor-not-allowed"
        />
        <span aria-hidden className="ml-1 shrink-0 text-xs font-semibold text-stone-600">
          {suffix}
        </span>
      </label>
    </div>
  );
}
