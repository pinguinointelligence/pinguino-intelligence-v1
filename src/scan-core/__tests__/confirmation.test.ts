import { describe, expect, it } from 'vitest';
import { Confirmation, type Read } from '../confirmation';

const r = (frame: number, text: string, lineCount = 5, over: Partial<Read> = {}): Read => ({
  frameIndex: frame,
  tMs: frame * 33,
  text,
  lineCount,
  moduleNative: 2.3,
  source: 'native',
  ...over,
});

describe('fast lane', () => {
  it('confirms on two agreeing reads from different frames with lineCount ≥ 4 and module ≥ 2', () => {
    const c = new Confirmation();
    expect(c.push(r(1, 'A')).status).toBe('reading');
    const s = c.push(r(2, 'A'));
    expect(s.status).toBe('confirmed');
    expect(s.lane).toBe('fast');
    expect(s.frames).toEqual([1, 2]);
  });
  it('fast lane needs the two reads within 400 ms (audit); later agreement goes to the consensus lane', () => {
    const c = new Confirmation();
    c.push({ frameIndex: 1, tMs: 0, text: 'A', lineCount: 5, moduleNative: 2.3, source: 'native' });
    const late = c.push({
      frameIndex: 20,
      tMs: 900,
      text: 'A',
      lineCount: 5,
      moduleNative: 2.3,
      source: 'native',
    });
    expect(late.status).toBe('reading');
  });
  it('never confirms from two results of the same frame', () => {
    const c = new Confirmation();
    c.push(r(7, 'A'));
    expect(c.push(r(7, 'A')).status).toBe('reading');
  });
  it('§17: rectified-only agreement never confirms, however many frames; one non-rectified agreeing read unlocks it', () => {
    const alone = new Confirmation();
    for (let i = 0; i < 12; i += 1)
      alone.push(r(200 + i * 3, '8411092731130', 6, { source: 'rectified', tMs: 6000 + i * 100 }));
    expect(alone.state.status).toBe('reading');
    const mixed = new Confirmation();
    for (let i = 0; i < 5; i += 1)
      mixed.push(r(300 + i * 3, '8411092731130', 6, { source: 'rectified', tMs: 9000 + i * 100 }));
    const st = mixed.push(r(320, '8411092731130', 6, { source: 'native', tMs: 9500 }));
    expect(st.status).toBe('confirmed');
    expect(['fast', 'consensus']).toContain(st.lane);
    const alias = new Confirmation();
    for (let i = 0; i < 6; i += 1)
      alias.push(r(139 + i * 3, '0141200001098', 5, { source: 'rectified', tMs: 5700 + i * 160 }));
    expect(alias.state.status).toBe('reading');
  });
  it('low lineCount or small modules fall to the slow lane', () => {
    const c = new Confirmation();
    c.push(r(1, 'A', 2));
    expect(c.push(r(2, 'A', 2)).status).toBe('reading');
    expect(c.push(r(3, 'A', 2)).status).toBe('reading');
    expect(c.push(r(4, 'A', 2)).status).toBe('confirmed');
    expect(c.state.lane).toBe('consensus');
    const d = new Confirmation();
    d.push(r(1, 'A', 6, { moduleNative: 1.2 }));
    expect(d.push(r(2, 'A', 6, { moduleNative: 1.2 })).status).toBe('reading');
  });
});

describe('D1 approach-40cm alias sequence (real frames 100–146 from the Safari bundle)', () => {
  // frame, value, lineCount, source — the correct code is 7622210669315; module ≈ 1.1 px at 40 cm
  const seq: Array<[number, string, number, Read['source']]> = [
    [100, '7622210669315', 2, 'native'],
    [107, '7622210669315', 4, 'native'],
    [118, '1608180669315', 4, 'native'],
    [121, '1608180669315', 3, 'native'],
    [122, '7622210669315', 2, 'native'],
    [123, '1608180669315', 5, 'native'],
    [123, '1618080669315', 3, 'native'],
    [126, '7622210669315', 2, 'native'],
    [134, '1618080669315', 3, 'native'],
    [138, '7622210669315', 3, 'native'],
    [141, '7622210669315', 3, 'native'],
    [146, '1608180669315', 2, 'native'],
  ];
  it('never confirms a wrong value at 1.1 px modules; the correct value confirms on the slow lane', () => {
    const c = new Confirmation();
    let confirmed = null as null | { value: string | null; lane: string | null; at: number | null };
    for (const [f, t, l, s] of seq) {
      const st = c.push({
        frameIndex: f,
        tMs: f * 33,
        text: t,
        lineCount: l,
        moduleNative: 1.1,
        source: s,
      });
      if (st.status === 'confirmed') {
        confirmed = { value: st.value, lane: st.lane, at: st.confirmedAt };
        break;
      }
    }
    expect(confirmed?.value).toBe('7622210669315');
    expect(confirmed?.lane).toBe('consensus');
  });
});
