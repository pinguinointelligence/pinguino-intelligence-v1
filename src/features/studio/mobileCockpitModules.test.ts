/**
 * §R — the four modules behave identically in the mobile bar.
 *
 * Receptura was broken because „is the panel open" was DERIVED from „which
 * module is active" (`open = activeTab !== 'profile'`). Receptura's route is the
 * default one, so that expression was false for it always: tapping it dropped
 * the user back to the bare ingredient list and the recipe settings could not
 * be reached on a phone at all. Monitor, Produkcja and Etykieta worked only
 * because none of them is the default route — the bug was invisible from three
 * of the four modules.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  collapsedMobileCockpitRoute,
  nextMobileCockpitState,
  shouldRevealProductionWeighingOnNarrowViewport,
} from './mobileCockpitModal';

type Tab = 'profile' | 'monitor' | 'production' | 'summary';
const MODULES: readonly Tab[] = ['profile', 'monitor', 'production', 'summary'];

describe('mobile module selection', () => {
  it.each(MODULES)('R1 — tapping %s while closed opens it', (tab) => {
    expect(nextMobileCockpitState<Tab>({ activeTab: tab, open: false }, tab)).toEqual({
      activeTab: tab,
      open: true,
    });
  });

  it.each(MODULES)('R4 — tapping %s while open collapses it', (tab) => {
    expect(nextMobileCockpitState<Tab>({ activeTab: tab, open: true }, tab)).toEqual({
      activeTab: tab,
      open: false,
    });
  });

  it('R3 — tapping another module switches directly, staying open', () => {
    let state = { activeTab: 'profile' as Tab, open: true };
    for (const tab of ['monitor', 'production', 'summary', 'profile'] as Tab[]) {
      state = nextMobileCockpitState<Tab>(state, tab);
      expect(state).toEqual({ activeTab: tab, open: true });
    }
  });

  it('Receptura is not special — it opens exactly like the other three', () => {
    // The precise regression: this used to be unreachable.
    expect(nextMobileCockpitState<Tab>({ activeTab: 'profile', open: false }, 'profile').open).toBe(
      true,
    );
    // And every module answers the same way from the same starting state.
    const opened = MODULES.map(
      (tab) => nextMobileCockpitState<Tab>({ activeTab: tab, open: false }, tab).open,
    );
    expect(new Set(opened)).toEqual(new Set([true]));
  });

  it('collapsing then tapping again re-opens (R4 round trip)', () => {
    let state = { activeTab: 'profile' as Tab, open: true };
    state = nextMobileCockpitState<Tab>(state, 'profile');
    expect(state.open).toBe(false);
    state = nextMobileCockpitState<Tab>(state, 'profile');
    expect(state.open).toBe(true);
  });

  it('keeps an in-progress Production route when its cockpit is collapsed', () => {
    expect(collapsedMobileCockpitRoute<Tab>('production', 'profile', true)).toBe('production');
    expect(collapsedMobileCockpitRoute<Tab>('production', 'profile', false)).toBe('profile');
    expect(collapsedMobileCockpitRoute<Tab>('monitor', 'profile', false)).toBe('profile');
  });

  it('reveals weighing only for a newly started mobile Production session', () => {
    expect(
      shouldRevealProductionWeighingOnNarrowViewport({
        previousSessionId: null,
        currentSessionId: 'run-1',
        currentStatus: 'in_progress',
        activeTab: 'production',
        cockpitOpen: true,
        mobileViewport: true,
      }),
    ).toBe(true);

    expect(
      shouldRevealProductionWeighingOnNarrowViewport({
        previousSessionId: 'run-1',
        currentSessionId: 'run-1',
        currentStatus: 'in_progress',
        activeTab: 'production',
        cockpitOpen: true,
        mobileViewport: true,
      }),
    ).toBe(false);

    expect(
      shouldRevealProductionWeighingOnNarrowViewport({
        previousSessionId: null,
        currentSessionId: 'run-desktop',
        currentStatus: 'in_progress',
        activeTab: 'production',
        cockpitOpen: true,
        mobileViewport: false,
      }),
    ).toBe(false);
  });

  it('hands Production focus off only after the sheet is closed and the active row exists', () => {
    const surface = readFileSync(new URL('./StudioEngineSurface.tsx', import.meta.url), 'utf8');
    const focusEffect = surface.slice(
      surface.indexOf('!focusProductionAfterCollapseRef.current'),
      surface.indexOf(
        'useEffect(() => {',
        surface.indexOf('!focusProductionAfterCollapseRef.current'),
      ),
    );
    expect(focusEffect).toContain('mobileCockpitOpen');
    expect(focusEffect).toContain("activeTab !== 'production'");
    expect(focusEffect).toContain('requestAnimationFrame');
    expect(focusEffect).not.toContain('cancelAnimationFrame');
    expect(focusEffect).toContain('[data-production-active="true"] [role="spinbutton"]');
  });
});
