/**
 * PRO MOBILE UX v2 · A3 — an optimistic cockpit state must survive the render in
 * which its route has not arrived yet.
 *
 * Found in browser QA on the A3 fix: React Router 7 delivers the new location in a
 * transition, so for a render or two after a module states its intent the route
 * still names the module it came FROM. The route-sync treated that render as an
 * external change and reverted the intent: tapping Receptura from an open Monitor,
 * or „Otwórz ustawienia" sent from any open module, closed the sheet instead of
 * opening the recipe module (measured: sheet gone ~200 ms after the tap).
 */
import { describe, expect, it } from 'vitest';
import {
  nextMobileCockpitState,
  optimisticMobileCockpitState,
  reconcileMobileCockpitRoute,
  type MobileCockpitState,
} from './mobileCockpitModal';

type Tab = 'profile' | 'monitor' | 'production' | 'summary';

/** One render: the surface reconciles its state with the route it is handed. */
function renderWithRoute(state: MobileCockpitState<Tab>, route: Tab): MobileCockpitState<Tab> {
  let current = state;
  // A set-state during render re-runs the render; it must settle.
  for (let pass = 0; pass < 3; pass += 1) {
    const next = reconcileMobileCockpitRoute(current, route, 'profile');
    if (!next) return current;
    current = next;
  }
  throw new Error('the route reconciliation did not settle');
}

describe('A3 — the cockpit keeps its intent until its route arrives', () => {
  it('opens Receptura from an open Monitor sheet (the bottom bar)', () => {
    let state: MobileCockpitState<Tab> = { activeTab: 'monitor', open: true };
    state = optimisticMobileCockpitState(nextMobileCockpitState(state, 'profile'), 'monitor');
    state = renderWithRoute(state, 'monitor'); // before the transition lands
    state = renderWithRoute(state, 'profile'); // the route arrives
    expect(state).toEqual({ activeTab: 'profile', open: true });
  });

  it('opens Receptura for „Otwórz ustawienia" sent from any open module', () => {
    for (const from of ['monitor', 'production', 'summary'] as const) {
      let state: MobileCockpitState<Tab> = { activeTab: from, open: true };
      state = optimisticMobileCockpitState({ activeTab: 'profile', open: true }, state.activeTab);
      state = renderWithRoute(renderWithRoute(state, from), 'profile');
      expect(state).toEqual({ activeTab: 'profile', open: true });
    }
  });

  it('documents the defect: the old route rule reverted the intent and closed the sheet', () => {
    const oldRule = (state: MobileCockpitState<Tab>, route: Tab): MobileCockpitState<Tab> =>
      state.activeTab !== route ? { activeTab: route, open: route !== 'profile' } : state;
    let state: MobileCockpitState<Tab> = { activeTab: 'profile', open: true }; // intent, from Monitor
    state = oldRule(state, 'monitor');
    state = oldRule(state, 'profile');
    expect(state).toEqual({ activeTab: 'profile', open: false });
  });

  it('still follows an EXTERNAL route change — a deep link or the back button', () => {
    expect(renderWithRoute({ activeTab: 'profile', open: false }, 'monitor')).toEqual({
      activeTab: 'monitor',
      open: true,
    });
    expect(renderWithRoute({ activeTab: 'monitor', open: true }, 'profile')).toEqual({
      activeTab: 'profile',
      open: false,
    });
    // An intent is pending, but the route goes somewhere else entirely.
    const pending = optimisticMobileCockpitState<Tab>(
      { activeTab: 'profile', open: true },
      'monitor',
    );
    expect(renderWithRoute(pending, 'production')).toEqual({ activeTab: 'production', open: true });
  });

  it('marks nothing as pending when the tap does not navigate', () => {
    const stay = optimisticMobileCockpitState<Tab>(
      { activeTab: 'monitor', open: false },
      'monitor',
    );
    expect(stay).toEqual({ activeTab: 'monitor', open: false });
    expect(reconcileMobileCockpitRoute(stay, 'monitor', 'profile')).toBeNull();
  });
});
