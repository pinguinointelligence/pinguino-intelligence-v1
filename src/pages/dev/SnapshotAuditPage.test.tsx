import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ listMyProducts: vi.fn(), listProductSnapshots: vi.fn() }));
vi.mock('@/services/products', () => ({ listMyProducts: h.listMyProducts }));
vi.mock('@/services/productSnapshots', () => ({ listProductSnapshots: h.listProductSnapshots }));

import { SnapshotAuditView, SnapshotAuditPage } from './SnapshotAuditPage';
import { filterSnapshotsByType, summarizeSnapshots } from './snapshotAuditFilters';
import type { ProductSnapshotRow } from '@/services/productSnapshots';

const snap = (over: Partial<ProductSnapshotRow> = {}): ProductSnapshotRow =>
  ({
    id: 's1', product_id: 'p1', owner_user_id: 'u1', snapshot_at: '2026-06-30T10:00:00Z',
    change_type: 'nutrition', detected_changes: { fat_percent: { from: null, to: 30.9 } }, created_at: '2026-06-30T10:00:00Z',
    price: null, package_size: null, ingredients_text: null, source_url: 'https://off', ocr_text: null,
    fat_percent: 30.9, saturated_fat_percent: null, carbohydrate_percent: null, total_sugars_percent: null,
    protein_percent: null, salt_percent: null, kcal_per_100g: null, ...over,
  }) as ProductSnapshotRow;

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('SnapshotAuditView', () => {
  it('shows change_type, source, and per-field from→to changes', () => {
    const t = text(render(<SnapshotAuditView snapshots={[snap()]} />));
    expect(t).toMatch(/nutrition/);
    expect(t).toMatch(/https:\/\/off/);
    expect(t).toMatch(/fat_percent/);
    expect(t).toMatch(/30\.9/);
  });

  it('labels a created snapshot with no diff', () => {
    const t = text(render(<SnapshotAuditView snapshots={[snap({ change_type: 'created', detected_changes: {} })]} />));
    expect(t).toMatch(/created/);
    expect(t).toMatch(/initial snapshot/);
  });

  it('shows an empty state when there are no snapshots', () => {
    expect(text(render(<SnapshotAuditView snapshots={[]} />))).toMatch(/No snapshots/);
  });

  it('renders a change_type summary + a type filter dropdown', () => {
    const t = text(render(<SnapshotAuditView snapshots={[snap(), snap({ id: 's2', change_type: 'created', detected_changes: {} })]} />));
    expect(t).toMatch(/2 snapshots/);
    expect(t).toMatch(/1 nutrition/);
    expect(t).toMatch(/1 created/);
  });
});

describe('snapshotAuditFilters', () => {
  const rows = [snap({ id: 'a', change_type: 'nutrition' }), snap({ id: 'b', change_type: 'created' }), snap({ id: 'c', change_type: 'nutrition' })];
  it('summarizes counts by change_type', () => {
    expect(summarizeSnapshots(rows)).toEqual([{ change_type: 'nutrition', count: 2 }, { change_type: 'created', count: 1 }]);
  });
  it('filters by change_type, all passes everything', () => {
    expect(filterSnapshotsByType(rows, 'all')).toHaveLength(3);
    expect(filterSnapshotsByType(rows, 'nutrition').map((s) => s.id)).toEqual(['a', 'c']);
    expect(filterSnapshotsByType(rows, 'created').map((s) => s.id)).toEqual(['b']);
  });
});

describe('SnapshotAuditPage — container', () => {
  it('renders and reads nothing on mount (no auto-run)', () => {
    const t = text(render(<SnapshotAuditPage />));
    expect(t).toMatch(/Product snapshot audit/);
    expect(t).toMatch(/Load my products/);
    expect(h.listMyProducts).not.toHaveBeenCalled();
    expect(h.listProductSnapshots).not.toHaveBeenCalled();
  });
});
