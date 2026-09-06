import { describe, expect, it } from 'vitest';
import {
  flowReducer,
  initialFlowState,
  normalizeDeclaredCode,
  type FlowAction,
  type FlowState,
} from '../ui/sceneMachine';

const IDS = ['a', 'b', 'c'];
const step = (s: FlowState, a: FlowAction) => flowReducer(s, a, IDS.length, IDS);
const run = (actions: FlowAction[], from: FlowState = initialFlowState) =>
  actions.reduce(step, from);

describe('flowReducer', () => {
  it('walks the happy path through every scene to the summary', () => {
    let s = run([
      { type: 'START' },
      { type: 'SET_DEVICE', modelLabel: ' iPhone ', declaredCode: '5901 2341 23457' },
      { type: 'CAMERA_READY' },
      { type: 'PROBE_DONE' },
    ]);
    expect(s.step).toBe('scene_ready');
    expect(s.modelLabel).toBe('iPhone');
    expect(s.declaredCode).toBe('5901234123457');
    for (let i = 0; i < IDS.length; i += 1) {
      s = run([{ type: 'SCENE_START' }, { type: 'SCENE_FINISHED' }], s);
      expect(s.step).toBe('scene_done');
      expect(s.completed[IDS[i]!]).toBe(1);
      s = step(s, { type: 'SCENE_NEXT' });
    }
    expect(s.step).toBe('summary');
  });

  it('refuses an empty model label and ignores out-of-order actions', () => {
    const s = step(
      { ...initialFlowState, step: 'device' },
      { type: 'SET_DEVICE', modelLabel: '   ', declaredCode: null },
    );
    expect(s.step).toBe('device');
    expect(step(initialFlowState, { type: 'SCENE_START' })).toBe(initialFlowState);
    expect(step(initialFlowState, { type: 'CAMERA_READY' })).toBe(initialFlowState);
  });

  it('retry increments the attempt and returns to ready for the same scene', () => {
    const base: FlowState = {
      ...initialFlowState,
      step: 'scene_done',
      sceneIndex: 1,
      attempt: 1,
      completed: { b: 1 },
    };
    const s = step(base, { type: 'SCENE_RETRY' });
    expect(s).toMatchObject({ step: 'scene_ready', sceneIndex: 1, attempt: 2 });
    const done = run([{ type: 'SCENE_START' }, { type: 'SCENE_FINISHED' }], s);
    expect(done.completed.b).toBe(2);
  });

  it('skip records the scene only when it was never completed, and ends at the summary', () => {
    const ready: FlowState = { ...initialFlowState, step: 'scene_ready', sceneIndex: 2 };
    const s = step(ready, { type: 'SCENE_SKIP' });
    expect(s.step).toBe('summary');
    expect(s.skipped).toEqual(['c']);
    const doneThenSkip = step(
      { ...initialFlowState, step: 'scene_done', sceneIndex: 0, completed: { a: 1 } },
      { type: 'SCENE_SKIP' },
    );
    expect(doneThenSkip.skipped).toEqual([]);
    expect(doneThenSkip.sceneIndex).toBe(1);
  });

  it('errors remember where to resume; a failure while recording resumes at ready', () => {
    const recording: FlowState = { ...initialFlowState, step: 'scene_recording', sceneIndex: 1 };
    const failed = step(recording, { type: 'FAIL', message: 'x' });
    expect(failed).toMatchObject({
      step: 'error',
      errorMessage: 'x',
      resumeStep: 'scene_recording',
    });
    const twice = step(failed, { type: 'FAIL', message: 'y' });
    expect(twice.resumeStep).toBe('scene_recording');
    expect(step(twice, { type: 'DISMISS_ERROR' })).toMatchObject({
      step: 'scene_ready',
      sceneIndex: 1,
      errorMessage: null,
    });
  });

  it('resumes a saved session at the camera step with a clamped scene index', () => {
    const s = step(initialFlowState, {
      type: 'RESUME',
      modelLabel: 'Note10+',
      declaredCode: null,
      sceneIndex: 99,
      completed: { a: 1, b: 1 },
      skipped: [],
    });
    expect(s).toMatchObject({ step: 'camera', sceneIndex: 2, attempt: 1, modelLabel: 'Note10+' });
  });
});

describe('normalizeDeclaredCode', () => {
  it('keeps 8/12/13 digit codes only', () => {
    expect(normalizeDeclaredCode('59012341 23457')).toBe('5901234123457');
    expect(normalizeDeclaredCode('96385074')).toBe('96385074');
    expect(normalizeDeclaredCode('12345')).toBeNull();
    expect(normalizeDeclaredCode('')).toBeNull();
    expect(normalizeDeclaredCode(null)).toBeNull();
  });
});
