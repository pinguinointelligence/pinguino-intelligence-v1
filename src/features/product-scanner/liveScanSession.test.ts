/**
 * LIVE SCANNER — the acceptance policy, tested against the owner's matrix.
 *
 * Every case here is a customer behaviour, not an implementation detail: what turns
 * green, what stays silent, and what must never be added twice.
 */
import { describe, expect, it } from 'vitest';
import type { FrameQuality } from './frameQuality';
import {
  EVIDENCE_WINDOW_MS,
  RECOGNITION_CONFIDENCE_FLOOR,
  RECOGNITION_EVIDENCE_REQUIRED,
  emptyLiveScanSession,
  observeFrame,
  removeAccepted,
  confirmedProducts,
  unresolvedProducts,
  type LiveScanSessionState,
  type ScanObservation,
} from './liveScanSession';

const good: FrameQuality = {
  exposure: 0.8,
  sharpness: 0.6,
  glare: 0.05,
  labelFill: 0.5,
  score: 80,
  acceptableForAutoCapture: true,
};
const blurry: FrameQuality = {
  ...good,
  sharpness: 0.1,
  score: 30,
  acceptableForAutoCapture: false,
};

const barcodeFrame = (at: number, ean = '5901234123457'): ScanObservation => ({
  at,
  quality: good,
  barcode: ean,
  barcodeValidated: true,
  catalogResolved: true,
  identityKey: `ean:${ean}`,
  label: 'OREO Original 154 g',
  route: 'LOCAL_BARCODE',
});

/**
 * A qualifying but NOT strong recognition: above the confidence floor, below the bar at
 * which one catalogue-confirmed identification counts as strong. This is the case that
 * genuinely needs repetition, and it is what these cases are about.
 */
const recognitionFrame = (at: number, key = 'pi:banana', confidence = 0.75): ScanObservation => ({
  at,
  quality: good,
  identityKey: key,
  label: key === 'pi:banana' ? 'Banan' : 'Jabłko',
  route: 'VISION_FALLBACK',
  catalogResolved: true,
  confidence,
});

/** Feed a sequence and return the final state plus every event. */
const run = (observations: readonly ScanObservation[], from = emptyLiveScanSession()) => {
  let state: LiveScanSessionState = from;
  const events = observations.map((o) => {
    const next = observeFrame(state, o);
    state = next.state;
    return next.event;
  });
  return { state, events };
};

describe('3 · a validated barcode locks immediately', () => {
  it('turns green on the first qualifying frame', () => {
    const { state, events } = run([barcodeFrame(1000)]);
    expect(events[0]?.kind).toBe('confirmed');
    expect(state.accepted).toHaveLength(1);
    expect(state.accepted[0]?.route).toBe('LOCAL_BARCODE');
    expect(state.accepted[0]?.label).toBe('OREO Original 154 g');
  });

  it('does not lock on an UNVALIDATED barcode', () => {
    const { state, events } = run([
      { ...barcodeFrame(1000), barcodeValidated: false, confidence: 0.2 },
    ]);
    expect(events[0]?.kind).toBe('searching');
    expect(state.accepted).toHaveLength(0);
  });
});

describe('OWNER CORRECTION · a valid barcode is not yet a product', () => {
  it('does NOT turn green when the barcode is unknown to the catalogue', () => {
    const unknownSku = { ...barcodeFrame(0), catalogResolved: false, label: 'EAN 5901234123457' };
    const { state, events } = run([unknownSku]);
    // Collected, but never presented as a confirmed product.
    expect(events[0]?.kind).toBe('unresolved');
    expect(state.accepted[0]?.acceptance).toBe('needs_resolution');
    expect(state.accepted[0]?.needsDeepScan).toBe(true);
    expect(confirmedProducts(state)).toHaveLength(0);
    expect(unresolvedProducts(state)).toHaveLength(1);
  });

  it('turns green only once the SKU resolves', () => {
    const { state, events } = run([barcodeFrame(0)]);
    expect(events[0]?.kind).toBe('confirmed');
    expect(state.accepted[0]?.acceptance).toBe('confirmed');
    expect(confirmedProducts(state)).toHaveLength(1);
  });
});

describe('1, 2 · fresh produce needs stable evidence, never one weak frame', () => {
  it('stays a candidate until enough frames agree', () => {
    const { state, events } = run([recognitionFrame(0), recognitionFrame(200)]);
    expect(events.map((e) => e.kind)).toEqual(['candidate', 'candidate']);
    expect(state.accepted).toHaveLength(0);
  });

  it('turns green on the third agreeing frame', () => {
    const { state, events } = run([
      recognitionFrame(0),
      recognitionFrame(200),
      recognitionFrame(400),
    ]);
    expect(events[2]?.kind).toBe('confirmed');
    expect(state.accepted).toHaveLength(1);
    expect(state.accepted[0]?.evidence).toBe(RECOGNITION_EVIDENCE_REQUIRED);
  });

  it('collects a second product without the camera closing', () => {
    const { state } = run([
      recognitionFrame(0),
      recognitionFrame(100),
      recognitionFrame(200), // Banan green
      recognitionFrame(300, 'pi:apple'),
      recognitionFrame(400, 'pi:apple'),
      recognitionFrame(500, 'pi:apple'), // Jabłko green
    ]);
    expect(state.accepted.map((p) => p.identityKey)).toEqual(['pi:banana', 'pi:apple']);
  });
});

describe('6 · bad frames are ignored silently and a later good one is accepted', () => {
  it('never accepts from an unusable frame, and does not reset progress', () => {
    const { state, events } = run([
      { ...recognitionFrame(0), quality: blurry },
      { ...recognitionFrame(100), quality: blurry },
      recognitionFrame(200),
      recognitionFrame(300),
      recognitionFrame(400),
    ]);
    expect(events.slice(0, 2).map((e) => e.kind)).toEqual([
      'ignored_low_quality',
      'ignored_low_quality',
    ]);
    expect(events[4]?.kind).toBe('confirmed');
    expect(state.accepted).toHaveLength(1);
  });

  it('refuses evidence below the confidence floor', () => {
    const weak = RECOGNITION_CONFIDENCE_FLOOR - 0.01;
    const { state, events } = run([
      recognitionFrame(0, 'pi:banana', weak),
      recognitionFrame(100, 'pi:banana', weak),
      recognitionFrame(200, 'pi:banana', weak),
      recognitionFrame(300, 'pi:banana', weak),
    ]);
    expect(new Set(events.map((e) => e.kind))).toEqual(new Set(['searching']));
    expect(state.accepted).toHaveLength(0);
  });

  it('forgets stale evidence once the window has passed', () => {
    const { state } = run([
      recognitionFrame(0),
      recognitionFrame(100),
      recognitionFrame(100 + EVIDENCE_WINDOW_MS + 1), // the first two no longer count
    ]);
    expect(state.accepted).toHaveLength(0);
  });
});

describe('strong evidence is weighed, not counted', () => {
  const strong = (at: number): ScanObservation => ({
    ...recognitionFrame(at),
    confidence: 0.95,
  });

  it('a confident, catalogue-confirmed identification still needs a second look', () => {
    const { events } = run([strong(0), strong(200)]);
    expect(events.map((e) => e.kind)).toEqual(['candidate', 'confirmed']);
  });

  it('but text that agrees with it is enough on its own', () => {
    // Two INDEPENDENT readings of the same label, not the same frame twice.
    const { events } = run([{ ...strong(0), corroboratedByText: true }]);
    expect(events[0]?.kind).toBe('confirmed');
  });

  it('a confident guess the catalogue did NOT confirm earns no shortcut', () => {
    const unconfirmed = { ...strong(0), catalogResolved: false };
    const { events } = run([unconfirmed, { ...unconfirmed, at: 200 }]);
    expect(events.map((e) => e.kind)).toEqual(['candidate', 'candidate']);
  });
});

describe('7 · the same product held in view produces exactly one result', () => {
  it('suppresses every further frame during the cooldown', () => {
    const { state, events } = run([
      barcodeFrame(0),
      barcodeFrame(500),
      barcodeFrame(1500),
      barcodeFrame(3000),
    ]);
    expect(events[0]?.kind).toBe('confirmed');
    expect(events.slice(1).map((e) => e.kind)).toEqual([
      'duplicate_suppressed',
      'duplicate_suppressed',
      'duplicate_suppressed',
    ]);
    expect(state.accepted).toHaveLength(1);
  });

  it('still suppresses it much later in the same sweep', () => {
    // A recipe cannot hold the same ingredient twice, so a second row would only be
    // dropped again downstream. Passing the milk again is not a second milk.
    const { state } = run([barcodeFrame(0), barcodeFrame(60_000)]);
    expect(state.accepted).toHaveLength(1);
  });

  it('a removed product can be scanned again straight away', () => {
    const first = run([barcodeFrame(0)]);
    const pruned = removeAccepted(first.state, 'ean:5901234123457');
    expect(pruned.accepted).toHaveLength(0);
    const again = observeFrame(pruned, barcodeFrame(100));
    expect(again.event.kind).toBe('confirmed');
  });
});

describe('10 · an unknown product is handed to the existing deep flow', () => {
  it('marks it for the contribution route instead of guessing', () => {
    const unknown: ScanObservation = {
      at: 0,
      quality: good,
      identityKey: 'unknown:blob-1',
      label: 'Nierozpoznany produkt',
      route: 'UNKNOWN',
      catalogResolved: false,
      confidence: 0.95,
    };
    const { state, events } = run([unknown, { ...unknown, at: 100 }, { ...unknown, at: 200 }]);
    expect(events[2]?.kind).toBe('unresolved');
    expect(state.accepted[0]?.needsDeepScan).toBe(true);
    expect(state.accepted[0]?.acceptance).toBe('needs_resolution');
    expect(unresolvedProducts(state)).toHaveLength(1);
  });

  it('a catalogue-matched product does NOT go to the deep flow', () => {
    const { state } = run([barcodeFrame(0)]);
    expect(state.accepted[0]?.needsDeepScan).toBe(false);
    expect(unresolvedProducts(state)).toHaveLength(0);
  });
});

describe('cost is measurable per route', () => {
  it('counts every qualifying and non-qualifying observation by route', () => {
    const { state } = run([
      barcodeFrame(0),
      { ...recognitionFrame(9000, 'pi:banana', 0.2), route: 'LOCAL_OCR' },
      recognitionFrame(9100),
      recognitionFrame(9200),
    ]);
    expect(state.counters.LOCAL_BARCODE).toBe(1);
    expect(state.counters.LOCAL_OCR).toBe(1);
    expect(state.counters.VISION_FALLBACK).toBe(2);
    expect(state.counters.CATALOG_MATCH).toBe(0);
  });
});

describe('nothing is named before it is known', () => {
  it('reports plain searching when no identity was produced', () => {
    const { state, events } = run([
      { at: 0, quality: good, identityKey: null, route: 'CATALOG_MATCH' },
    ]);
    expect(events[0]).toEqual({ kind: 'searching' });
    expect(state.accepted).toHaveLength(0);
  });
});
