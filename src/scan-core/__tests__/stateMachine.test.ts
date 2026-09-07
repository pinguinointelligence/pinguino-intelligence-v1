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

  /**
   * OWNER RULING 2026-09-06 — the camera never zooms itself.
   *
   * This test used to pin the opposite: two automatic zoom steps before the customer was told
   * anything. Owner QA found the ladder running away to ×10 on a real phone, at which point the
   * code no longer fits the frame and scanning is impossible. The rule is now: no automatic zoom,
   * ever; say "move closer" straight away, because a customer can undo their own movement and
   * cannot undo a zoom they never asked for.
   */
  it('never zooms the camera by itself — it asks the customer to move closer, immediately', () => {
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
    // the guidance is no longer suppressed while a zoom step is "pending" — there is none
    expect(out.guidance).toBe('move_closer');

    // and it stays 'none' for the action however long the same candidate is held, at any age
    for (const tMs of [2000, 2800, 3600, 4800, 9000, 20000]) {
      tr.update(60 + tMs, tMs, [cand(540, 960, 120)]);
      const held = sm.step(
        base({
          tMs,
          frameIndex: 60 + tMs,
          primary: tr.primary(1080, 1920),
          guidance: 'move_closer',
        }),
      );
      expect(held.action, `action at ${tMs} ms`).toBe('none');
      out = held;
    }
    // the persistent blocker still arrives, so the customer is never left guessing
    expect(out.blocker).toBe(true);
  });

  it('re-acquiring the same code cannot re-arm any camera escalation', () => {
    // the runaway was powered by `rearm()` zeroing a per-track budget every time the track id
    // changed — and a code lost for >500 ms gets a NEW id. With no ladder there is no budget to
    // re-arm, so a code repeatedly lost and re-found must still never trigger a camera action.
    const tr = new Tracker();
    const sm = new TargetStateMachine();
    sm.step(base({}));
    for (let round = 0; round < 8; round += 1) {
      const t0 = round * 4000;
      for (let i = 0; i < 6; i += 1) {
        tr.update(round * 100 + i, t0 + i * 33, [cand(540, 960, 120)]);
        const out = sm.step(
          base({
            tMs: t0 + i * 33,
            frameIndex: round * 100 + i,
            primary: tr.primary(1080, 1920),
            guidance: 'move_closer',
          }),
        );
        expect(out.action, `round ${round} frame ${i}`).toBe('none');
      }
      // lose it for well over the tracker's 500 ms, which used to mint a fresh id and a fresh budget
      tr.update(round * 100 + 50, t0 + 2000, []);
      expect(
        sm.step(
          base({ tMs: t0 + 2000, frameIndex: round * 100 + 50, primary: null, guidance: 'none' }),
        ).action,
      ).toBe('none');
    }
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
