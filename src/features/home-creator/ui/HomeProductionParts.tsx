/**
 * DESIGN V3.0 IV D–I — the presentational pieces of HOME production: the frame, the
 * numbered step cards, the weighed row with its ✓ at the right edge (corrections II/III:
 * one 28 px circle in a 44 px button — active white with a green ring, confirmed green
 * with a white ✓, in the same place), the thumb-zone dock and „Partia gotowa”.
 *
 * Presentation only: every value and every action comes from `HomePreparation`, which
 * reads the canonical Production session and the ONE preparation plan. The amount field
 * is the canonical `DirectNumberControl` PRO Production uses, in HOME's light skin
 * (`homeProduction.css`).
 *
 * HOME look (IV): white, light lines, green only for confirmations, red only for a
 * difference in quantity and „NIE MIKSUJ”.
 */
import type { ReactNode } from 'react';
import { DirectNumberControl } from '@/features/ingredient-builder/DirectNumberControl';
import { productionControlDecimals } from '@/features/ingredient-builder/directNumberControlModel';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import './homeProduction.css';

const copy = homeCreatorCopy.production;

const GREEN = '#3f9b58';
const RED = '#a3261d';

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" className={className}>
      <path
        d="M3.5 8.5 6.6 11.4 12.5 4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeBackButton({ onClick, testId }: { onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="-ml-2.5 inline-flex min-h-11 items-center gap-0.5 rounded-full py-0 pr-3 pl-1.5 text-[15px] font-semibold text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
    >
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="none">
        <path
          d="M10 3 5 8l5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {homeCreatorCopy.nav.back}
    </button>
  );
}

/** The frame's column: HOME's width on every device, the dock ends the page. */
export function HomeProductionColumn({
  testId,
  children,
}: {
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      id="preparation"
      data-testid={testId}
      className="home-production mx-auto flex min-h-[calc(100svh-var(--home-header-height,64px))] w-full max-w-[600px] flex-col bg-white px-4 pt-3 sm:px-6"
    >
      {children}
    </section>
  );
}

/**
 * The 44 px confirmation with its one 28 px circle (III). `later` rows keep the quiet
 * grey circle and stay usable: a ✓ there confirms that row at its plan.
 */
export function HomeTick({
  state,
  label,
  onClick,
  testId,
  disabled = false,
}: {
  state: 'current' | 'done' | 'later';
  label: string;
  onClick?: () => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={label}
      aria-pressed={state === 'done'}
      data-testid={testId}
      data-tick-state={state}
      className="grid size-11 shrink-0 place-items-center rounded-full focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ink disabled:cursor-default"
    >
      <span
        className={cn(
          'grid size-7 place-items-center rounded-full p-[5px]',
          state === 'done'
            ? 'text-white'
            : state === 'current'
              ? 'bg-white'
              : 'text-[#8a847b] opacity-50 shadow-[inset_0_0_0_1.5px_#bdb6aa]',
        )}
        style={
          state === 'done'
            ? { background: GREEN }
            : state === 'current'
              ? { color: GREEN, boxShadow: `inset 0 0 0 1.5px ${GREEN}` }
              : undefined
        }
      >
        <CheckGlyph className="size-full" />
      </span>
    </button>
  );
}

/** Step progress under the title: the current step black, the rest light (IV). */
export function HomeStepBar({ total, current }: { total: number; current: number }) {
  return (
    <div
      className="mt-3.5 mb-4 grid auto-cols-fr grid-flow-col gap-1"
      aria-hidden="true"
      data-testid="home-production-bar"
    >
      {Array.from({ length: total }, (_, index) => (
        <i
          key={index}
          className={cn('h-1 rounded', index === current ? 'bg-[var(--g-ink)]' : 'bg-[#efebe4]')}
        />
      ))}
    </div>
  );
}

export function HomeDoneSummary({ names }: { names: readonly string[] }) {
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_26px] items-center gap-2.5 rounded-[14px] border border-[#ebe7e0] bg-white px-3 py-2.5"
      data-testid="home-production-done-summary"
    >
      <div className="min-w-0">
        <b className="block text-[14.5px] leading-[1.25] font-medium text-[var(--g-ink)]">
          {copy.doneSteps(names.length)}
        </b>
        <small className="mt-0.5 block text-[12.5px] leading-[1.4] text-[#6f6a62]">
          {names.join(' · ')}
        </small>
      </div>
      <span
        className="grid size-[26px] place-items-center rounded-full p-1.5 text-white"
        style={{ background: GREEN }}
        role="img"
        aria-label={copy.added}
      >
        <CheckGlyph className="size-full" />
      </span>
    </li>
  );
}

export function HomeFutureStep({
  number,
  title,
  detail,
}: {
  number: number;
  title: string;
  detail: string | null;
}) {
  return (
    <li
      className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5 rounded-[14px] border border-[#f1ede7] bg-white px-3 py-2.5"
      data-testid="home-production-next-step"
    >
      <span className="grid size-[26px] place-items-center rounded-full font-mono text-[12.5px] font-semibold text-[#8a857d] shadow-[inset_0_0_0_1px_#e4e0d9]">
        {number}
      </span>
      <div className="min-w-0">
        <b className="block text-[14.5px] leading-[1.25] font-medium text-[#8a857d]">{title}</b>
        {detail ? (
          <small className="mt-0.5 block truncate text-[12.5px] text-[#8a857d]">{detail}</small>
        ) : null}
      </div>
    </li>
  );
}

export function HomeCurrentStep({
  number,
  total,
  title,
  kind,
  children,
}: {
  number: number;
  total: number;
  title: string;
  kind: string;
  children: ReactNode;
}) {
  return (
    <li
      aria-label={`${homeCreatorCopy.production.dockStep(number, total)}: ${title}`}
      className="rounded-[14px] border-[1.5px] border-[var(--g-ink)] bg-white px-3 pt-3.5 pb-3"
      data-testid="home-production-step"
      data-step-kind={kind}
    >
      <div className="mb-2.5 grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5">
        <span className="grid size-[26px] place-items-center rounded-full bg-[var(--g-ink)] font-mono text-[12.5px] font-semibold text-white">
          {number}
        </span>
        <div className="min-w-0">
          <em className="mb-[3px] block font-mono text-[11px] leading-none font-semibold tracking-[0.08em] text-[#8a857d] uppercase not-italic">
            {copy.now}
          </em>
          <b
            className="block text-[16px] leading-[1.2] font-bold text-[var(--g-ink)]"
            data-testid="home-production-step-title"
          >
            {title}
          </b>
        </div>
      </div>
      {children}
    </li>
  );
}

/** A step's own text: what the plan says to do, and its quieter note. */
export function HomeStepText({
  text,
  note,
  children,
}: {
  text: string | null;
  note?: ReactNode;
  children?: ReactNode;
}) {
  if (!text && !note && !children) return null;
  return (
    <div className="mb-2 px-1">
      {text ? (
        <p className="text-[16px] leading-[1.3] font-semibold text-[var(--g-ink)]">{text}</p>
      ) : null}
      {note ? <div className="mt-1 text-[13px] leading-[1.4] text-[#5f5a52]">{note}</div> : null}
      {children}
    </div>
  );
}

/** „NIE MIKSUJ” — red only for this and for a difference in quantity (IV). */
export function HomeNoMix({ inBox = false }: { inBox?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-fit items-center justify-self-start rounded-md border-[1.5px] bg-white px-2 text-[11px] leading-none font-extrabold tracking-[0.08em]',
        inBox ? 'mb-0.5' : 'mt-2',
      )}
      style={{ borderColor: RED, color: RED }}
      data-testid="home-production-no-mix"
    >
      {copy.noMix}
    </span>
  );
}

/** A light box inside a step (the heat step's lists, a machine's set-aside toppings). */
export function HomeStepBox({
  label,
  tone = 'plain',
  children,
  testId,
}: {
  label?: string;
  tone?: 'plain' | 'no-mix';
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="mt-3 grid gap-1 rounded-xl bg-white px-3 py-2.5 text-[13px] leading-[1.45] text-[#3b3833]"
      style={{
        boxShadow:
          tone === 'no-mix' ? 'inset 0 0 0 1px rgba(163, 38, 29, 0.3)' : 'inset 0 0 0 1px #ebe7e0',
      }}
      data-testid={testId}
    >
      {label ? (
        <em className="font-mono text-[11px] leading-[1.2] font-semibold tracking-[0.06em] text-[#77736c] uppercase not-italic">
          {label}
        </em>
      ) : null}
      {children}
    </div>
  );
}

/** The weighed rows of a step: name + state on the left, grams, then the ✓. */
export function HomeWeighList({ children }: { children: ReactNode }) {
  return (
    <div className="grid border-t border-[#f1ede7]" data-testid="home-production-rows">
      {children}
    </div>
  );
}

export function HomeWeighRow({
  rowKey,
  name,
  sub,
  subTone,
  grams,
  tick,
  onOpen,
  emphasis = false,
}: {
  rowKey: string;
  name: string;
  sub: string;
  subTone: 'done' | 'current' | 'later';
  grams: string;
  tick: ReactNode;
  onOpen?: () => void;
  emphasis?: boolean;
}) {
  const nameBlock = (
    <>
      <b
        className={cn(
          'block truncate leading-[1.25]',
          emphasis ? 'text-[15px] font-bold' : 'text-[14px] font-medium',
          subTone === 'done' ? 'text-[#8a847b]' : 'text-[var(--g-ink)]',
        )}
      >
        {name}
      </b>
      <small
        className={cn(
          'block text-[12px] leading-[1.3]',
          subTone === 'done'
            ? 'font-semibold text-[#2f6b45]'
            : subTone === 'current'
              ? 'font-semibold text-[#3b3833]'
              : 'text-[#8a847b]',
        )}
      >
        {sub}
      </small>
    </>
  );
  return (
    <div
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto_44px] items-center gap-1 pr-2 pl-3',
        emphasis ? 'pt-0.5' : 'border-b border-[#f1ede7] py-0.5',
      )}
      data-testid={`home-production-row-${rowKey}`}
      data-row-state={subTone}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 py-[9px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          {nameBlock}
        </button>
      ) : (
        <div className="min-w-0 py-[9px]">{nameBlock}</div>
      )}
      <span
        className={cn(
          'font-mono leading-none font-semibold tabular-nums',
          emphasis ? 'text-[18px]' : 'text-[15px]',
          subTone === 'done' ? 'font-medium text-[#8a847b]' : 'text-[var(--g-ink)]',
        )}
      >
        {grams}
      </span>
      {tick}
    </div>
  );
}

/**
 * The row being weighed: the same row, then „Ile jest w naczyniu?” under the name with
 * the canonical amount control starting AT the plan. A different number only shows the
 * difference in red; the ✓ (or „Gotowe”) confirms.
 */
export function HomeWeighCurrent({
  row,
  lineId,
  name,
  guidance,
  value,
  min,
  step,
  deviation,
  onChange,
  onTypingChange,
}: {
  row: ReactNode;
  lineId: string;
  name: string;
  guidance: ReactNode;
  value: number;
  min: number;
  step: number;
  deviation: { text: string; next: string | null } | null;
  onChange: (grams: number) => void;
  onTypingChange: (typing: boolean) => void;
}) {
  return (
    <div
      className="my-1.5 rounded-xl bg-white"
      style={{
        boxShadow: deviation ? 'inset 0 0 0 1px rgba(163, 38, 29, 0.5)' : 'inset 0 0 0 1px #d9d5ce',
      }}
      data-testid="home-production-current-row"
      data-deviation={deviation ? 'true' : 'false'}
    >
      {row}
      <div className="px-3 pb-3">
        {guidance}
        <p className="mb-1.5 text-[13px] leading-[1.2] font-semibold text-[#3b3833]">
          {copy.vesselQuestion}
        </p>
        <div
          className="home-production-qty"
          data-deviation={deviation ? 'true' : 'false'}
          onFocus={(event) => {
            if (event.target instanceof HTMLInputElement) onTypingChange(true);
          }}
          onBlur={(event) => {
            if (event.target instanceof HTMLInputElement) onTypingChange(false);
          }}
        >
          <DirectNumberControl
            value={value}
            step={step}
            min={min}
            decimals={productionControlDecimals(value, step)}
            suffix="g"
            ariaLabel={`${name} — ${copy.vesselQuestion}`}
            onChange={onChange}
            testId={`home-production-field-${lineId}`}
            preservePrecision
            widthPreset="fluid"
          />
        </div>
        {deviation ? (
          <div className="mt-2 grid gap-0.5" role="status" aria-live="polite">
            <b
              className="text-[13.5px] leading-[1.3] font-semibold"
              style={{ color: RED }}
              data-testid="home-production-difference"
            >
              {deviation.text}
            </b>
            {deviation.next ? (
              <span className="text-[12.5px] leading-[1.35] text-[#5f5a52]">{deviation.next}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The thumb-zone bar: what to do now on the left, ONE black action on the right. Sticky
 * at the bottom of the viewport, in the flow (it reserves its own height, so it never
 * covers the last step), clear of the home indicator — and, on a touch screen, away
 * while the amount is being typed, so it never sits on the keyboard (`homeProduction.css`).
 */
export function HomeProductionDock({
  lead,
  detail,
  action,
  onAction,
  disabled = false,
  typing = false,
}: {
  lead: string;
  detail: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
  typing?: boolean;
}) {
  return (
    <div
      className="home-production-dock sticky bottom-0 z-20 -mx-4 mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-transparent bg-white px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_0_0_100vmax_#fff] [border-image:linear-gradient(#efebe4,#efebe4)_1/1px_0_0_0/0_100vmax] [clip-path:inset(0_-100vmax)] sm:-mx-6 sm:px-6"
      data-testid="home-production-dock"
      data-typing={typing ? 'true' : 'false'}
    >
      <div className="min-w-0">
        <b
          className="block truncate text-[14px] leading-[1.25] font-semibold text-[var(--g-ink)]"
          data-testid="home-production-dock-lead"
        >
          {lead}
        </b>
        <span className="block truncate text-[13px] leading-[1.3] text-[#6f6a62]">{detail}</span>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        data-testid="home-production-next"
        className="inline-flex h-[52px] items-center justify-center rounded-full px-7 text-[16px] font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:opacity-40"
        style={{ background: 'var(--g-ink)' }}
      >
        {action}
      </button>
    </div>
  );
}

/** „Partia gotowa”: every step ✓ on the right, then the page's final actions. */
export function HomeProductionDone({
  subtitle,
  stepTitles,
  notice,
  saved,
  onSave,
  onShare,
  onCommunity,
}: {
  subtitle: string;
  stepTitles: readonly string[];
  notice: string | null;
  saved: boolean;
  onSave: () => void;
  onShare: () => void;
  onCommunity: () => void;
}) {
  const pill =
    'inline-flex h-11 min-w-0 items-center justify-center rounded-full border border-[var(--g-line)] bg-white px-2.5 text-[14px] font-semibold whitespace-nowrap text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';
  return (
    <>
      <div className="grid justify-items-center gap-1 pt-1 pb-[18px] text-center">
        <span
          className="mb-2 grid size-14 place-items-center rounded-full p-3.5 text-white"
          style={{ background: GREEN }}
        >
          <CheckGlyph className="size-full" />
        </span>
        <h2 className="text-[24px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
          {copy.doneTitle}
        </h2>
        <small className="text-[13.5px] leading-[1.35] text-[#6f6a62]">{subtitle}</small>
      </div>
      <ul
        className="grid grid-cols-2 gap-x-7 gap-y-2 rounded-2xl border border-[#ebe7e0] px-4 py-3.5"
        data-testid="home-production-done-steps"
      >
        {stepTitles.map((title, index) => (
          <li
            key={`${index}:${title}`}
            className="flex min-w-0 items-center justify-between gap-2.5 text-[13.5px] leading-[1.3] font-medium text-[#2f5b3e]"
          >
            <span className="min-w-0">{title}</span>
            <CheckGlyph className="size-[15px] shrink-0 text-[#3f9b58]" />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[15px] leading-[1.45] text-[#65635f]">{copy.doneKept}</p>
      {notice ? (
        <p
          className="mt-3 flex items-center justify-between gap-3 text-[14px] font-semibold text-[#2f6b45]"
          role="status"
          aria-live="polite"
          data-testid="home-production-done-notice"
        >
          <span>{notice}</span>
          {saved ? <CheckGlyph className="size-4 shrink-0" /> : null}
        </p>
      ) : null}
      <div
        className="sticky bottom-0 z-20 -mx-4 mt-auto grid gap-2.5 border-t border-transparent bg-white px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_0_0_100vmax_#fff] [border-image:linear-gradient(#efebe4,#efebe4)_1/1px_0_0_0/0_100vmax] [clip-path:inset(0_-100vmax)] sm:-mx-6 sm:px-6"
        data-testid="home-production-done-actions"
      >
        <div className="grid grid-cols-2 gap-2">
          {saved ? (
            <button type="button" className={pill} onClick={onSave} data-testid="home-done-save">
              {copy.saveRecipe}
            </button>
          ) : (
            <button type="button" className={pill} onClick={onShare} data-testid="home-done-share">
              {copy.share}
            </button>
          )}
          <button
            type="button"
            className={pill}
            onClick={onCommunity}
            data-testid="home-done-community"
          >
            {copy.community}
          </button>
        </div>
        <button
          type="button"
          onClick={saved ? onShare : onSave}
          data-testid={saved ? 'home-done-share' : 'home-done-save'}
          className="inline-flex h-[52px] w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          style={{ background: 'var(--g-ink)' }}
        >
          {saved ? copy.share : copy.saveRecipe}
        </button>
      </div>
    </>
  );
}
