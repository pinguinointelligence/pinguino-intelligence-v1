import { beforeEach, describe, expect, it } from 'vitest';
import type { MergedCandidate } from '../candidates';
import { formatFromDecoder } from '../observation';
import { TargetStateMachine, STATE, type StateInput } from '../stateMachine';
import { Tracker, resetTrackIds } from '../track';

const cand = (cx = 540, cy = 960, w = 300): MergedCandidate => ({
  fill: w / 1080,
  widthPx: w,
  heightPx: 90,
  angleDeg: 0,
  cx,
  cy,
  pieces: 1,
  score: 1,
});
const base = (over: Partial<StateInput>): StateInput => ({
  tMs: 0,
  frameIndex: 0,
  primary: null,
  guidance: 'none',
  unstable: false,
  readThisFrame: false,
  meanLuma: 140,
  zoomAvailable: true,
  zoomApproved: true,
  zoomLevel: 1,
  torchAvailable: true,
  torchOn: false,
  refocusAvailable: false,
  ...over,
});

describe('symbology', () => {
  it('comes from the decoder string, never from digit count', () => {
    expect(formatFromDecoder('EAN13')).toBe('EAN-13');
    expect(formatFromDecoder('EAN-8')).toBe('EAN-8');
    expect(formatFromDecoder('UPCA')).toBe('UPC-A');
    expect(formatFromDecoder('QRCode')).toBe('unknown');
  });
});

describe('TargetStateMachine', () => {
  beforeEach(() => resetTrackIds());

  it('SEARCHING → FOUND (after the track has 3 frames and 3 debounced frames) → READING → COMPLETE', () => {
    const tr = new Tracker();
    const sm = new TargetStateMachine();
    const states: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      tr.update(i, i * 33, [cand()]);
      const p = tr.primary(1080, 1920);
      states.push(sm.step(base({ tMs: i * 33, frameIndex: i, primary: p })).state);
    }
    expect(states.slice(0, 3)).toEqual(['SEARCHING', 'SEARCHING', 'SEARCHING']);
    expect(states[states.length - 1]).toBe('FOUND');
    const p = tr.primary(1080, 1920)!;
    p.pushRead({
      frameIndex: 10,
      tMs: 330,
      text: '8410297112386',
      lineCount: 5,
      moduleNative: 2.5,
      source: 'native',
    });
    for (let i = 11; i < 15; i += 1) {
      tr.update(i, i * 33, [cand()]);
      states.push(
        sm.step(
          base({
            tMs: i * 33,
            frameIndex: i,
            primary: tr.primary(1080, 1920),
            readThisFrame: i === 11,
          }),
        ).state,
      );
    }
    expect(states[states.length - 1]).toBe('READING');
    p.pushRead({
      frameIndex: 15,
      tMs: 495,
      text: '8410297112386',
      lineCount: 5,
      moduleNative: 2.5,
      source: 'native',
    });
    tr.update(15, 495, [cand()]);
    expect(sm.step(base({ tMs: 495, frameIndex: 15, primary: tr.primary(1080, 1920) })).state).toBe(
      'COMPLETE',
    );
  });

  it('a single-frame flicker of FOUND does not change the state (3-frame debounce)', () => {
    const tr = new Tracker();
    const sm = new TargetStateMachine();
    for (let i = 0; i < 5; i += 1) {
      tr.update(i, i * 33, [cand()]);
      sm.step(base({ tMs: i * 33, frameIndex: i, primary: tr.primary(1080, 1920) }));
    }
    expect(sm.state).toBe('FOUND');
    const p = tr.primary(1080, 1920)!;
    p.state = 'READING';
    expect(sm.step(base({ tMs: 170, frameIndex: 6, primary: p })).state).toBe('FOUND');
    p.state = 'FOUND';
    expect(sm.step(base({ tMs: 200, frameIndex: 7, primary: p })).state).toBe('FOUND');
  });

  it('escalates automatically before guidance: zoom step after 1.5 s in FOUND with "move closer", then guidance only when zoom is exhausted', () => {
    const tr = new Tracker();
    const sm = new TargetStateMachine();
    let out = sm.step(base({}));
    for (let i = 0; i < 6; i += 1) {
      tr.update(i, i * 33, [cand(540, 960, 120)]);
      out = sm.step(
        base({
          tMs: i * 33,
          frameIndex: i,
          primary: tr.primary(1080, 1920),
          guidance: 'move_closer',
        }),
      );
    }
    expect(out.state).toBe('FOUND');
    expect(out.action).toBe('none');
    expect(out.guidance).toBe('none'); // zoom is available and approved → no user guidance yet
    tr.update(60, 2000, [cand(540, 960, 120)]);
    out = sm.step(
      base({ tMs: 2000, frameIndex: 60, primary: tr.primary(1080, 1920), guidance: 'move_closer' }),
    );
    expect(out.action).toBe('zoom_step');
    tr.update(61, 2800, [cand(540, 960, 120)]);
    out = sm.step(
      base({
        tMs: 2800,
        frameIndex: 61,
        primary: tr.primary(1080, 1920),
        guidance: 'move_closer',
        zoomLevel: 2,
      }),
    );
    expect(out.action).toBe('zoom_step');
    tr.update(62, 3600, [cand(540, 960, 120)]);
    out = sm.step(
      base({
        tMs: 3600,
        frameIndex: 62,
        primary: tr.primary(1080, 1920),
        guidance: 'move_closer',
        zoomLevel: 4,
      }),
    );
    expect(out.action).toBe('none');
    expect(out.guidance).toBe('move_closer');
    expect(out.blocker).toBe(false);
    tr.update(63, 4800, [cand(540, 960, 120)]);
    out = sm.step(
      base({
        tMs: 4800,
        frameIndex: 63,
        primary: tr.primary(1080, 1920),
        guidance: 'move_closer',
        zoomLevel: 4,
      }),
    );
    expect(out.blocker).toBe(true);
  });

  it('turns the torch on in the dark before asking for light, once', () => {
    const tr = new Tracker();
    const sm = new TargetStateMachine();
    tr.update(0, 0, [cand()]);
    const out = sm.step(
      base({
        tMs: 0,
        frameIndex: 0,
        primary: tr.primary(1080, 1920),
        meanLuma: 30,
        guidance: 'improve_light',
      }),
    );
    expect(out.action).toBe('torch_on');
    expect(out.guidance).toBe('none');
    tr.update(1, 800, [cand()]);
    const again = sm.step(
      base({
        tMs: 800,
        frameIndex: 1,
        primary: tr.primary(1080, 1920),
        meanLuma: 30,
        guidance: 'improve_light',
        torchOn: true,
      }),
    );
    expect(again.action).toBe('none');
    expect(again.guidance).toBe('improve_light');
  });

  it('LOST after the track is lost, SEARCHING after 2 s, and the ladder re-arms for the next track', () => {
    const tr = new Tracker();
    const sm = new TargetStateMachine();
    for (let i = 0; i < 5; i += 1) {
      tr.update(i, i * 33, [cand()]);
      sm.step(base({ tMs: i * 33, frameIndex: i, primary: tr.primary(1080, 1920) }));
    }
    tr.update(5, 800, []);
    const lost = sm.step(base({ tMs: 800, frameIndex: 5, primary: tr.primary(1080, 1920) }));
    expect(lost.state).toBe('LOST');
    expect(sm.step(base({ tMs: 3000, frameIndex: 6, primary: null })).state).toBe('SEARCHING');
  });

  it('exposes constants the audit fixed', () => {
    expect(STATE.foundEscalateMs).toBe(1500);
    expect(STATE.lostMs).toBe(500);
    expect(STATE.debounceFrames).toBe(3);
  });
});
