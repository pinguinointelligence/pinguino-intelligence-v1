/**
 * UserMonitorLayout (§14.3, §23.1) — defaults, pure reducers (toggle / pin /
 * reorder / reset) and the device-local persistence roundtrip.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultUserMonitorLayout,
  loadUserMonitorLayout,
  movePinned,
  parseUserMonitorLayout,
  pinMetric,
  resetUserMonitorLayout,
  saveUserMonitorLayout,
  toggleModule,
  unpinMetric,
  USER_MONITOR_LAYOUT_STORAGE_KEY,
  USER_MONITOR_MODULE_ORDER,
} from './userMonitorLayout';

describe('defaultUserMonitorLayout', () => {
  it('enables every module EXCEPT Tryb Expert (§14.2/9 „tylko gdy potrzebne")', () => {
    const layout = defaultUserMonitorLayout();
    for (const id of USER_MONITOR_MODULE_ORDER) {
      expect(layout.enabled[id]).toBe(id !== 'expert');
    }
    expect(layout.pinned).toEqual([]);
    expect(layout.version).toBe(1);
  });
});

describe('reducers — pure and non-mutating', () => {
  it('toggleModule flips one module and leaves the input untouched', () => {
    const before = defaultUserMonitorLayout();
    const after = toggleModule(before, 'cukry');
    expect(after.enabled.cukry).toBe(false);
    expect(before.enabled.cukry).toBe(true);
    expect(toggleModule(after, 'cukry').enabled.cukry).toBe(true);
  });

  it('pin/unpin keep a set-like pinned list in insertion order', () => {
    let layout = defaultUserMonitorLayout();
    layout = pinMetric(layout, 'pod');
    layout = pinMetric(layout, 'fat');
    layout = pinMetric(layout, 'pod'); // idempotent
    expect(layout.pinned).toEqual(['pod', 'fat']);
    layout = unpinMetric(layout, 'pod');
    expect(layout.pinned).toEqual(['fat']);
    expect(unpinMetric(layout, 'pod').pinned).toEqual(['fat']); // no-op
  });

  it('movePinned reorders (§14.3 „kolejność przypiętych") and no-ops at the edges', () => {
    let layout = defaultUserMonitorLayout();
    layout = pinMetric(layout, 'pod');
    layout = pinMetric(layout, 'fat');
    layout = pinMetric(layout, 'water');
    expect(movePinned(layout, 'water', 'up').pinned).toEqual(['pod', 'water', 'fat']);
    expect(movePinned(layout, 'pod', 'up').pinned).toEqual(['pod', 'fat', 'water']); // edge
    expect(movePinned(layout, 'water', 'down').pinned).toEqual(['pod', 'fat', 'water']); // edge
    expect(movePinned(layout, 'missing' as never, 'up')).toBe(layout); // unknown pin
  });

  it('reset restores the safe default (§14.3)', () => {
    let layout = toggleModule(defaultUserMonitorLayout(), 'woda');
    layout = pinMetric(layout, 'pod');
    expect(resetUserMonitorLayout()).toEqual(defaultUserMonitorLayout());
    expect(layout).not.toEqual(defaultUserMonitorLayout());
  });
});

describe('persistence — validation + roundtrip', () => {
  it('parse rejects garbage and drops unknown module ids (stale layouts never break)', () => {
    expect(parseUserMonitorLayout(null)).toBeNull();
    expect(parseUserMonitorLayout('x')).toBeNull();
    expect(parseUserMonitorLayout({ version: 2, enabled: {}, pinned: [] })).toBeNull();
    const parsed = parseUserMonitorLayout({
      version: 1,
      enabled: { cukry: false, ghost_module: true, expert: 'yes' },
      pinned: ['pod', 42, 'pod'],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.enabled.cukry).toBe(false);
    expect(parsed!.enabled.expert).toBe(false); // non-boolean ignored → default
    expect('ghost_module' in parsed!.enabled).toBe(false);
    expect(parsed!.pinned).toEqual(['pod']); // deduped, non-strings dropped
  });

  it('save → load roundtrips through an injected storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    let layout = toggleModule(defaultUserMonitorLayout(), 'expert');
    layout = pinMetric(layout, 'ice_fraction');
    saveUserMonitorLayout(layout, storage);
    expect(store.has(USER_MONITOR_LAYOUT_STORAGE_KEY)).toBe(true);
    expect(loadUserMonitorLayout(storage)).toEqual(layout);
  });

  it('missing storage / corrupt JSON → the safe default (never a throw)', () => {
    expect(loadUserMonitorLayout(null)).toEqual(defaultUserMonitorLayout());
    expect(loadUserMonitorLayout({ getItem: () => '{not json' })).toEqual(defaultUserMonitorLayout());
    expect(
      loadUserMonitorLayout({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toEqual(defaultUserMonitorLayout());
  });
});
