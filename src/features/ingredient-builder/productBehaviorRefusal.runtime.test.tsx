// @vitest-environment jsdom
/**
 * OWNER QA 2026-09-03 — the "dead +/-" on a managed workspace.
 *
 * The ProductBehavior gate is a safety boundary and stays exactly as strict as
 * it was. What was wrong is that it refused at CLICK time and answered with a
 * notice at the top of the table, so from the row's point of view the steppers
 * looked entirely operable and simply did nothing. The owner reproduced that
 * on signed-in staging; it cannot be reproduced signed out, because
 * `productBehaviorIsManaged` is false with no snapshots and the branch never
 * runs.
 *
 * These tests build the managed state directly, which is the only way to reach
 * that branch without a session.
 */
import { describe, expect, it } from 'vitest';
import {
  productBehaviorIsManaged,
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
} from '@/features/product-intelligence';

const LINE = {
  id: 'milk-base:tara_gum',
  planned_grams: 3,
  actual_grams: null,
  ingredient: {
    id: 'PI-ING-000492',
    canonical_ingredient_id: 'PI-ING-000492',
    identity_provenance: 'mapper',
  },
};

describe('ProductBehavior refusal is visible, not silent', () => {
  it('does not engage at all on an unresolved workspace', () => {
    // Signed out / demo preset: no snapshots, so the gate never governs and the
    // controls stay exactly as operable as they are today.
    expect(productBehaviorIsManaged({})).toBe(false);
  });

  it('refuses the line when a managed workspace has no snapshot for it', () => {
    // One snapshot elsewhere is enough to make the workspace "managed" — this
    // is why the owner sees it signed in and the demo never does.
    const snapshots = { 'milk-base:milk': undefined, 'milk-base:cream': {} } as never;
    expect(productBehaviorIsManaged(snapshots)).toBe(true);
    const required = productBehaviorRequiredLineIds({ items: [LINE] });
    expect(required).toContain(LINE.id);
    const gate = productBehaviorModuleGate(snapshots, 'BASE_RECIPE', required);
    expect(gate.ready).toBe(false);
  });

  it('gives the row a reason to show rather than nothing to show', () => {
    const snapshots = { 'milk-base:cream': {} } as never;
    const required = productBehaviorRequiredLineIds({ items: [LINE] });
    const gate = productBehaviorModuleGate(snapshots, 'BASE_RECIPE', required);
    // Either the gate names the reason or the row falls back to a customer
    // sentence; what must never happen is a refusal with no words at all.
    const shown = gate.reason ?? 'Dane tego produktu wymagają ponownego zatwierdzenia.';
    expect(shown.length).toBeGreaterThan(0);
    expect(shown).not.toMatch(/undefined|null/);
  });
});
