/**
 * Pure helpers for the DEV snapshot audit list — kept in a `.ts` sibling so the view exports only
 * components (react-refresh clean). No React, no IO, read-only.
 */
import type { ProductSnapshotRow } from '@/services/productSnapshots';

export type SnapshotTypeFilter = string; // 'all' | a change_type

/** Distinct change_types present, in first-seen order, for the filter dropdown. */
export function snapshotChangeTypes(snapshots: readonly ProductSnapshotRow[]): string[] {
  const seen: string[] = [];
  for (const s of snapshots) if (!seen.includes(s.change_type)) seen.push(s.change_type);
  return seen;
}

/** Filter snapshots by change_type ('all' passes everything). */
export function filterSnapshotsByType(
  snapshots: readonly ProductSnapshotRow[],
  filter: SnapshotTypeFilter,
): ProductSnapshotRow[] {
  if (filter === 'all' || filter === '') return [...snapshots];
  return snapshots.filter((s) => s.change_type === filter);
}

/** Count snapshots by change_type, in first-seen order. */
export function summarizeSnapshots(
  snapshots: readonly ProductSnapshotRow[],
): { change_type: string; count: number }[] {
  const order = snapshotChangeTypes(snapshots);
  return order.map((change_type) => ({
    change_type,
    count: snapshots.filter((s) => s.change_type === change_type).length,
  }));
}
