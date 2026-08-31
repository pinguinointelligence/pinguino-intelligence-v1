import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * THE Gellatti admin design layer.
 *
 * Admin is an operational workspace, so it may be denser than a customer page —
 * but it is still Gellatti. Before this module every section invented its own
 * heading scale (`text-3xl`, `-0.035em`), its own table (`border-ink/15`,
 * `bg-stone-50`), its own hand-picked panel fill and its own buttons, which is
 * how the operator ended up somewhere that looks like a different product.
 *
 * These are class recipes and small presentational wrappers only. No admin
 * business logic, no data access and no permission check lives here.
 *
 * The rules they encode, from the Design Book:
 *   surfaces   white working ground, `--g-ivory` for supporting panels
 *   hairlines  `--g-line`, never an ad-hoc ink/N alpha
 *   radius     12 px panels, 9 px controls (`--g-control-radius`)
 *   type       10 px/0.08em eyebrows, 12 px body, mono + tabular for figures
 *   accent     graphite for emphasis, orange reserved for the real action
 */

/** A titled operational panel — the admin equivalent of a destination card. */
export function AdminPanel({
  title,
  children,
  className,
  tone = 'paper',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  tone?: 'paper' | 'ivory';
}) {
  return (
    <section
      className={cn(
        'rounded-[12px] border border-[var(--g-line)] p-[18px]',
        tone === 'ivory' ? 'bg-[var(--g-ivory)]' : 'bg-white',
        className,
      )}
    >
      {title ? <AdminEyebrow className="mb-2">{title}</AdminEyebrow> : null}
      {children}
    </section>
  );
}

/** The one admin eyebrow — same 10 px/0.08em as every other Gellatti surface. */
export function AdminEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A figure with its label — the admin metric cell. */
export function AdminMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]">
      <AdminEyebrow>{label}</AdminEyebrow>
      <p className="mt-2 font-mono text-[22px] leading-[1.2] tabular-nums text-[var(--g-ink)]">
        {value}
      </p>
    </div>
  );
}

/* ── Tables ─────────────────────────────────────────────────────────────── */

/** Wraps a table so wide operational data scrolls inside its own card. */
export function AdminTableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-white">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const ADMIN_TABLE = 'w-full border-collapse text-left text-[12px]';
export const ADMIN_THEAD_ROW = 'border-b border-[var(--g-line)] bg-[var(--g-ivory)]';
export const ADMIN_TH =
  'px-3 py-2.5 text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase';
export const ADMIN_TD = 'border-b border-[var(--g-line-quiet)] px-3 py-3 align-top';

/* ── Controls ───────────────────────────────────────────────────────────── */

/** The one admin search/filter field. */
export const ADMIN_FIELD =
  'h-[var(--g-field-height)] w-full rounded-[var(--g-control-radius)] border border-[var(--g-line)] bg-white px-3 text-[13px] text-[var(--g-ink)] outline-none transition-colors placeholder:text-[var(--g-text-muted)] focus-visible:border-[var(--g-ink)]';

/** A compact row action — quiet by default, so the real action can stand out. */
export const ADMIN_ROW_ACTION =
  'pro-focus-ring inline-flex min-h-9 items-center rounded-[var(--g-control-radius)] border border-[var(--g-line)] bg-white px-3 text-[12px] font-semibold text-[var(--g-ink)] transition-colors hover:border-[var(--g-ink)]';

/* ── Status ─────────────────────────────────────────────────────────────── */

export type AdminStatusTone = 'neutral' | 'good' | 'attention' | 'quiet';

const STATUS_TONES: Record<AdminStatusTone, string> = {
  neutral: 'border-[var(--g-line)] bg-white text-[var(--g-ink)]',
  good: 'border-[#cfe3d4] bg-[#f4f8f4] text-[#2f6b40]',
  attention: 'border-[#f0d7ac] bg-[var(--g-attention-surface)] text-[var(--g-attention-ink)]',
  quiet: 'border-[var(--g-line)] bg-[var(--g-ivory)] text-[var(--g-text-secondary)]',
};

/** The one admin status pill. */
export function AdminStatus({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: AdminStatusTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-[10px] leading-none font-bold tracking-[0.04em] uppercase',
        STATUS_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Account state → tone, so the same state always reads the same way. */
export function accountStateTone(state: string): AdminStatusTone {
  const value = state.toLowerCase();
  if (value === 'active' || value === 'approved') return 'good';
  if (value === 'pending' || value === 'review') return 'attention';
  if (value === 'blocked' || value === 'suspended' || value === 'rejected') return 'quiet';
  return 'neutral';
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

/**
 * Market preferences as something an operator can read.
 *
 * This existed as `JSON.stringify(value ?? {})`, which printed a literal `{}`
 * into every row of the users table — raw storage shape leaking into the UI.
 */
export function formatMarketPreferences(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.trim() === '' ? '—' : value;
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(String).join(', ');
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => entry !== null && entry !== undefined && entry !== '',
    );
    if (entries.length === 0) return '—';
    return entries.map(([key, entry]) => `${key.toUpperCase()} ${String(entry)}`).join(' · ');
  }
  return String(value);
}
