/**
 * Plany → the Podgląd · Home · Pro comparison (DESIGN V3.0 §P1).
 *
 * „Trzy kolumny: Podgląd · Home · Pro. Na telefonie nazwy zostają po lewej,
 * a kolumny są wąskie — dalej widać, co jest gdzie."
 *
 * The layout is one CSS grid at every width: the row name holds a flexible
 * first column and the three plan columns are fixed and narrow, so a phone
 * keeps the same table instead of collapsing into three stacked lists where
 * nothing lines up. The Pro column carries a quiet tint on wide screens, which
 * is the design's „delikatnie podświetlona" and nothing louder.
 *
 * Every cell comes from `COMPARISON_ROWS`, which reads the persona capability
 * matrix. This file draws; it decides nothing.
 */
import { cn } from '@/lib/cn';
import {
  COMPARISON_COLUMNS,
  COMPARISON_ROWS,
  type ComparisonCell,
  type ComparisonRow,
} from '@/billing/plans/planComparison';

/** A hairline check — the same restrained glyph the plan cards use. */
function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** An en dash, not a cross: the absence is calm, not a failure. */
function Absent() {
  return <span aria-hidden>—</span>;
}

function Cell({ cell, plan, row }: { cell: ComparisonCell; plan: string; row: string }) {
  const label =
    cell.kind === 'yes' ? 'jest' : cell.kind === 'limited' ? cell.note : 'brak';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 px-1 py-3 text-center',
        plan === 'pro' && 'sm:bg-[var(--g-ivory)]/60',
      )}
      data-testid={`comparison-cell-${row}-${plan}`}
      data-cell={cell.kind}
    >
      <span className="sr-only">{`${label}`}</span>
      {cell.kind === 'yes' ? (
        <span className="text-[var(--g-ink)]" aria-hidden>
          <Check />
        </span>
      ) : cell.kind === 'limited' ? (
        <span
          className="text-[11px] leading-tight font-medium text-[var(--g-ink)]"
          aria-hidden
        >
          {cell.note}
        </span>
      ) : (
        <span className="text-[var(--g-text-muted)]">
          <Absent />
        </span>
      )}
    </div>
  );
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)] sm:grid-cols-[minmax(0,1fr)_repeat(3,7rem)]';

export function PlanComparisonTable({ rows = COMPARISON_ROWS }: { rows?: readonly ComparisonRow[] }) {
  return (
    <section className="mt-14" aria-labelledby="plan-comparison-heading" data-testid="plan-comparison">
      <h2
        id="plan-comparison-heading"
        className="text-[19px] font-semibold tracking-[-0.01em] text-[var(--g-ink)]"
      >
        Co dostajesz w każdym planie
      </h2>

      <div className="mt-5 border-y border-[var(--g-line)]">
        {/* Column heads */}
        <div className={cn(GRID, 'border-b border-[var(--g-line)]')}>
          <div className="px-1 py-3" />
          {COMPARISON_COLUMNS.map((column) => (
            <div
              key={column.id}
              className={cn(
                'px-1 py-3 text-center text-[11px] font-semibold tracking-[0.08em] uppercase',
                column.id === 'pro'
                  ? 'text-[var(--g-ink)] sm:bg-[var(--g-ivory)]/60'
                  : 'text-[var(--g-text-secondary)]',
              )}
              data-testid={`comparison-column-${column.id}`}
            >
              {column.label}
            </div>
          ))}
        </div>

        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(GRID, 'border-b border-[var(--g-line)] last:border-b-0')}
            data-testid={`comparison-row-${row.id}`}
          >
            <div className="flex flex-col justify-center py-3 pr-2">
              <span className="text-[13px] leading-snug font-medium text-[var(--g-ink)]">
                {row.label}
              </span>
              {row.hint ? (
                <span className="mt-0.5 text-[11px] leading-snug text-[var(--g-text-secondary)]">
                  {row.hint}
                </span>
              ) : null}
            </div>
            <Cell cell={row.demo} plan="demo" row={row.id} />
            <Cell cell={row.home} plan="home" row={row.id} />
            <Cell cell={row.pro} plan="pro" row={row.id} />
          </div>
        ))}
      </div>
    </section>
  );
}
