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
  /** Publish valid typed drafts while focused; toppings use this to keep sibling views live. */
  publishValidDraft?: boolean;
  /** Presentation-only missing-value emphasis; never changes numeric behavior. */
  softDanger?: boolean;
  /** Fixed recipe-table capacity. `percent` fits 100.0%; `grams` fits 10000 g. */
  widthPreset?: 'fluid' | 'percent' | 'grams';
  /**
   * `compact` is the DESKTOP recipe-table density (owner 2026-08-24): the row
   * was dominated by its controls, leaving long catalog names truncated far too
   * early. It keeps 28 px-wide adjustment segments inside the approved 32 px
   * housing and tightens the value column without shrinking the numerals.
   *
   * It is deliberately NOT used on touch surfaces — the mobile sheet keeps the
   * comfortable 44 px targets.
   */
  density?: 'comfortable' | 'compact' | 'responsive';
  /**
   * Entitlement masking. When set, the VALUE segment shows this text instead of the
   * number and every numeric interaction routes to `onMaskedInteract` rather than
   * mutating. Geometry is untouched: same segments, same widths, same lock — revealing
   * grams later changes the DATA, never the control. Omit it and nothing changes.
   */
  maskedValue?: string;
  /** Invoked when a masked control is operated — wire the existing paywall/auth route. */
  onMaskedInteract?: () => void;
  /** Optional fourth segment. It stays operable while the numeric segments are locked. */
  lockSegment?: {
    pressed: boolean;
    disabled?: boolean;
    ariaLabel: string;
    title: string;
    suffix: '%' | 'g';
    onToggle: () => void;
    testId: string;
  };
}

function LockGlyph() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="7" width="10" height="7" rx="2" />
      <path d="M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2" strokeLinecap="round" />
    </svg>
  );
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
  publishValidDraft = false,
  softDanger = false,
  widthPreset = 'fluid',
  density = 'comfortable',
  lockSegment,
  maskedValue,
  onMaskedInteract,
}: DirectNumberControlProps) {
  const masked = maskedValue !== undefined;
  const compact = density === 'compact';
  const responsive = density === 'responsive';
  /**
   * Compact shrinks the HOUSING, not the typography (owner, 2026-08-24): the
   * shell drops to 32 px while the value keeps its readable size, so rows get
   * shorter because the container tightened around the numbers rather than
   * because everything became tiny.
   */
  const segment = compact ? 'h-8 w-7' : responsive ? 'size-11 lg:h-8 lg:w-7' : 'size-11';
  const lockSegmentSize = compact
    ? 'h-8 w-[22px]'
    : responsive
      ? 'size-11 lg:h-8 lg:w-[22px]'
      : 'size-11';
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
        'grid min-w-0 max-w-full items-center overflow-hidden rounded-2xl border border-ink/12 bg-white shadow-pro-sm transition-[border-color,background-color,box-shadow] focus-within:border-ink/30 focus-within:shadow-pro-md',
        compact && 'h-8',
        responsive && 'lg:h-8 lg:rounded-xl lg:shadow-none',
        widthPreset === 'percent' &&
          (compact
            ? lockSegment
              ? 'w-[142px] grid-cols-[28px_64px_28px_22px]'
              : 'w-[114px] grid-cols-[28px_58px_28px]'
            : responsive
              ? lockSegment
                ? 'w-[204px] grid-cols-[44px_72px_44px_44px] lg:w-[142px] lg:grid-cols-[28px_64px_28px_22px]'
                : 'w-[160px] grid-cols-[44px_72px_44px] lg:w-[114px] lg:grid-cols-[28px_58px_28px]'
              : lockSegment
                ? 'w-[204px] grid-cols-[44px_72px_44px_44px]'
                : 'w-[160px] grid-cols-[44px_72px_44px]'),
        widthPreset === 'grams' &&
          (compact
            ? lockSegment
              ? 'w-[150px] grid-cols-[28px_72px_28px_22px]'
              : 'w-[122px] grid-cols-[28px_66px_28px]'
            : responsive
              ? lockSegment
                ? 'w-[220px] grid-cols-[44px_88px_44px_44px] lg:w-[150px] lg:grid-cols-[28px_72px_28px_22px]'
                : 'w-[176px] grid-cols-[44px_88px_44px] lg:w-[122px] lg:grid-cols-[28px_66px_28px]'
              : lockSegment
                ? 'w-[220px] grid-cols-[44px_88px_44px_44px]'
                : 'w-[176px] grid-cols-[44px_88px_44px]'),
        widthPreset === 'fluid' &&
          (compact
            ? lockSegment
              ? 'w-full grid-cols-[28px_minmax(66px,1fr)_28px_28px]'
              : 'w-full grid-cols-[28px_minmax(66px,1fr)_28px]'
            : responsive
              ? lockSegment
                ? 'w-full grid-cols-[44px_minmax(80px,1fr)_44px_44px] lg:grid-cols-[28px_minmax(66px,1fr)_28px_28px]'
                : 'w-full grid-cols-[44px_minmax(80px,1fr)_44px] lg:grid-cols-[28px_minmax(66px,1fr)_28px]'
              : lockSegment
                ? 'w-full grid-cols-[44px_minmax(80px,1fr)_44px_44px]'
                : 'w-full grid-cols-[44px_minmax(80px,1fr)_44px]'),
        compact ? 'rounded-xl shadow-none' : null,
        softDanger && 'ingredient-control-soft-danger',
        lockSegment?.pressed
          ? 'border-stone-400/70 bg-stone-100 shadow-[inset_0_1px_2px_rgb(16_17_19_/_0.06)]'
          : disabled && 'bg-[var(--g-ivory)]',
      )}
      data-testid={testId}
      data-control-density={density}
      data-preserve-precision={preservePrecision ? 'true' : undefined}
      data-publish-valid-draft={publishValidDraft ? 'true' : undefined}
      data-control-capacity={
        widthPreset === 'percent' ? '100.0%' : widthPreset === 'grams' ? '10000g' : 'fluid'
      }
      data-control-locked={lockSegment?.pressed ? 'true' : 'false'}
      data-soft-danger={softDanger ? 'true' : undefined}
      data-value-padding="roomy"
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
          onPointerDown={() => {
            if (masked) return;
            startRepeat(direction);
          }}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
          onPointerLeave={stopRepeat}
          onClick={() => {
            if (masked) {
              onMaskedInteract?.();
              return;
            }
            if (repeated.current) {
              repeated.current = false;
              return;
            }
            nudge(direction);
          }}
          className={cn(
            'row-start-1 grid place-items-center font-light text-ink transition-colors hover:bg-stone-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#f58a07] disabled:cursor-not-allowed disabled:text-stone-400',
            segment,
            compact ? 'text-base' : responsive ? 'text-xl lg:text-base' : 'text-xl',
            direction > 0 && 'col-start-3',
          )}
        >
          {direction < 0 ? '−' : '+'}
        </button>
      ))}
      <label
        className={cn(
          'col-start-2 row-start-1 flex h-full min-w-0 items-center justify-center border-x border-ink/18',
          compact ? 'px-1.5' : responsive ? 'px-2 lg:px-1.5' : 'px-2',
        )}
      >
        <span className="sr-only">{ariaLabel}</span>
        {masked ? (
          /* The mask lives INSIDE the value segment, so the row keeps its exact geometry
             when grams become visible: only the DATA changes, never the control. */
          <button
            type="button"
            aria-label={ariaLabel}
            data-testid={`${testId}-masked`}
            onClick={() => onMaskedInteract?.()}
            className="flex h-full w-full items-center justify-center font-mono text-[14px] text-stone-500 transition-colors hover:text-ink focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#f58a07]"
          >
            {maskedValue} {suffix}
          </button>
        ) : null}
        <input
          type="text"
          role="spinbutton"
          inputMode="decimal"
          hidden={masked}
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
            const nextDraft = event.currentTarget.value.replace(',', '.');
            draftDirty.current = true;
            setEditing(true);
            setDraft(nextDraft);
            const parsed = Number(nextDraft);
            if (publishValidDraft && nextDraft.trim() !== '' && Number.isFinite(parsed)) {
              const published = committedNumberValue({
                value: parsed,
                min,
                max,
                decimals,
                preservePrecision,
              });
              if (published !== valueRef.current) {
                valueRef.current = published;
                onChange(published);
              }
            }
          }}
          onBlur={() => {
            if (!draftDirty.current) {
              setDraft(valueRef.current.toFixed(decimals));
              setEditing(false);
              return;
            }
            const parsed = Number(draft);
            if (Number.isFinite(parsed)) {
              const committed = committedNumberValue({
                value: parsed,
                min,
                max,
                decimals,
                preservePrecision,
              });
              if (publishValidDraft && committed === valueRef.current) {
                setDraft(committed.toFixed(decimals));
                draftDirty.current = false;
                setEditing(false);
              } else commit(parsed);
            } else {
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
          className={cn(
            'h-full min-w-0 flex-1 touch-pan-y select-none bg-transparent text-right font-mono leading-none font-semibold tabular-nums text-ink outline-none disabled:cursor-not-allowed',
            compact ? 'text-[13px]' : responsive ? 'text-sm lg:text-[13px]' : 'text-sm',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'shrink-0 font-semibold text-stone-600',
            compact
              ? 'ml-0.5 text-[10px]'
              : responsive
                ? 'ml-1 text-xs lg:ml-0.5 lg:text-[10px]'
                : 'ml-1 text-xs',
          )}
        >
          {suffix}
        </span>
      </label>
      {lockSegment ? (
        <button
          type="button"
          disabled={lockSegment.disabled}
          aria-label={lockSegment.ariaLabel}
          aria-pressed={lockSegment.pressed}
          title={lockSegment.title}
          data-testid={lockSegment.testId}
          onClick={lockSegment.onToggle}
          className={cn(
            'col-start-4 row-start-1 inline-flex items-center justify-center border-l border-ink/18 transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#f58a07]',
            lockSegmentSize,
            lockSegment.pressed
              ? 'bg-stone-200 text-ink'
              : 'bg-white text-stone-500 hover:bg-stone-100 hover:text-ink',
            lockSegment.disabled && 'cursor-not-allowed opacity-35',
          )}
        >
          <LockGlyph />
        </button>
      ) : null}
    </div>
  );
}
