/**
 * SOL-048 — the two rules the owner's "UI wygląda, jakby wariowało" needs, as pure contracts.
 * No jsdom, no timers: `now` is an argument, so every case below is deterministic.
 */
import { describe, expect, it } from 'vitest';
import {
  beginScan,
  createPresenter,
  isCurrent,
  isTerminal,
  MIN_DWELL_MS,
  nextTickAt,
  present,
  stageOfPhaseKind,
  tick,
  type PresenterState,
} from './scanFlowPresenter';

const at = (
  state: PresenterState,
  stage: Parameters<typeof present>[1]['stage'],
  line: string,
  now: number,
) => present(state, { generation: state.generation, stage, line, now });

describe('a late answer never speaks over the scan the customer is on (SOL-048)', () => {
  it('an update from an earlier scan publishes nothing and does not even queue', () => {
    let s = createPresenter(0);
    const stale = s.generation;
    s = beginScan(s, 100);
    expect(isCurrent(s, stale)).toBe(false);
    const r = present(s, { generation: stale, stage: 'NEEDS_EVIDENCE', line: 'Stare', now: 200 });
    expect(r.published).toBe(false);
    expect(r.reason).toBe('stale_generation');
    expect(r.state.current).toEqual(s.current);
    expect(r.state.queued).toBeNull();
  });

  it('a finished answer is latched: a late label analysis cannot drag it back', () => {
    let s = createPresenter(0);
    s = at(s, 'READY', 'Produkt jest gotowy.', 1000).state;
    const r = at(s, 'CHECKING_PRODUCT', 'Sprawdzam produkt…', 1100);
    expect(r.published).toBe(false);
    expect(r.reason).toBe('terminal_latched');
    expect(r.state.current.stage).toBe('READY');
  });

  it('only a new scan releases a finished answer', () => {
    let s = createPresenter(0);
    s = at(s, 'NOT_USABLE', 'Nie da się go użyć.', 1000).state;
    s = beginScan(s, 2000);
    const r = at(s, 'SCANNING', 'Skanuję kod…', 2001);
    expect(r.published).toBe(true);
    expect(r.state.current.stage).toBe('SCANNING');
  });

  it('one terminal answer may replace another — a refusal after a save is still the truth', () => {
    let s = createPresenter(0);
    s = at(s, 'READY', 'Gotowy.', 1000).state;
    const r = at(s, 'ERROR', 'Nie udało się zapisać.', 1010);
    expect(r.published).toBe(true);
    expect(r.state.current.stage).toBe('ERROR');
  });
});

describe('a sentence stays long enough to be read (SOL-048)', () => {
  it('a second hint within the dwell waits instead of replacing the first', () => {
    let s = createPresenter(0);
    s = at(s, 'SCANNING', 'Szukam kodu…', 0).state;
    const r = at(s, 'SCANNING', 'Trzymaj nieruchomo', 200);
    expect(r.published).toBe(false);
    expect(r.reason).toBe('queued');
    expect(r.state.current.line).toBe('Szukam kodu…');
    expect(nextTickAt(r.state)).toBe(MIN_DWELL_MS);
  });

  it('the waiting line appears once the dwell has passed, and only then', () => {
    let s = createPresenter(0);
    s = at(s, 'SCANNING', 'Szukam kodu…', 0).state;
    s = at(s, 'SCANNING', 'Trzymaj nieruchomo', 200).state;
    expect(tick(s, MIN_DWELL_MS - 1).current.line).toBe('Szukam kodu…');
    const after = tick(s, MIN_DWELL_MS);
    expect(after.current.line).toBe('Trzymaj nieruchomo');
    expect(after.queued).toBeNull();
    expect(nextTickAt(after)).toBeNull();
  });

  it('flapping between two hints shows the LAST one, once — not both, many times', () => {
    let s = createPresenter(0);
    s = at(s, 'SCANNING', 'Przybliż kod', 0).state;
    for (let i = 1; i <= 20; i += 1)
      s = at(s, 'SCANNING', i % 2 ? 'Odsuń kod od kamery' : 'Przybliż kod', i * 30).state;
    expect(s.current.line).toBe('Przybliż kod');
    s = tick(s, MIN_DWELL_MS);
    expect(s.current.line).toBe('Odsuń kod od kamery');
  });

  it('the very first sentence is never delayed — an empty screen has nothing to protect', () => {
    const s = createPresenter(0);
    const r = at(s, 'SCANNING', 'Szukam kodu…', 10);
    expect(r.published).toBe(true);
  });

  it('a finished answer is never delayed by the dwell', () => {
    let s = createPresenter(0);
    s = at(s, 'CHECKING_PRODUCT', 'Sprawdzam produkt…', 0).state;
    const r = at(s, 'READY', 'Produkt jest gotowy.', 50);
    expect(r.published).toBe(true);
    expect(r.state.queued).toBeNull();
  });

  it('the same words again are not a change and do not restart the clock', () => {
    let s = createPresenter(0);
    s = at(s, 'SCANNING', 'Szukam kodu…', 0).state;
    const r = at(s, 'SCANNING', 'Szukam kodu…', 500);
    expect(r.reason).toBe('unchanged');
    expect(r.state.current.since).toBe(0);
  });

  it('the flow never walks backwards: a passed stage is not re-announced', () => {
    let s = createPresenter(0);
    s = at(s, 'CHECKING_PRODUCT', 'Sprawdzam produkt…', 0).state;
    const r = at(s, 'CODE_FOUND', 'Widzę kod', 5000);
    expect(r.published).toBe(false);
    expect(r.state.current.stage).toBe('CHECKING_PRODUCT');
  });
});

describe('the internal stage of a flow phase', () => {
  it('orders the journey the customer actually walks', () => {
    expect(stageOfPhaseKind('camera')).toBe('SCANNING');
    expect(stageOfPhaseKind('confirmed')).toBe('CODE_FOUND');
    expect(stageOfPhaseKind('resolving')).toBe('CHECKING_PRODUCT');
    for (const k of ['ask_add', 'label', 'family', 'fields'])
      expect(stageOfPhaseKind(k)).toBe('NEEDS_EVIDENCE');
    expect(stageOfPhaseKind('saved')).toBe('READY');
    expect(stageOfPhaseKind('known', { engineReady: false })).toBe('NOT_USABLE');
    expect(stageOfPhaseKind('error')).toBe('ERROR');
    expect(stageOfPhaseKind('camera', { cameraFailed: true })).toBe('ERROR');
  });

  it('knows which stages are the scanner waiting for the customer', () => {
    expect(isTerminal('READY')).toBe(true);
    expect(isTerminal('NOT_USABLE')).toBe(true);
    expect(isTerminal('ERROR')).toBe(true);
    expect(isTerminal('CHECKING_PRODUCT')).toBe(false);
  });

  it('the internal names are never customer copy', () => {
    const s = createPresenter(0);
    const r = at(s, 'CHECKING_PRODUCT', 'Sprawdzam produkt…', 0);
    expect(r.state.current.line).not.toMatch(/[A-Z]{4,}_[A-Z]/);
  });
});
