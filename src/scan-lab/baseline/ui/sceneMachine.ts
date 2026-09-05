/**
 * Pure state machine for the tester flow (B18). No DOM, no clocks — fully unit-testable.
 * intro → device → camera → probe → (scene_ready → scene_recording → scene_done)* → summary
 */
export type FlowStep =
  | 'intro'
  | 'device'
  | 'camera'
  | 'probe'
  | 'scene_ready'
  | 'scene_recording'
  | 'scene_done'
  | 'summary'
  | 'error';

export interface FlowState {
  step: FlowStep;
  modelLabel: string;
  declaredCode: string | null;
  sceneIndex: number;
  /** attempt number of the CURRENT scene (1-based). */
  attempt: number;
  /** sceneId → attempts completed (kept in summary). */
  completed: Record<string, number>;
  skipped: string[];
  errorMessage: string | null;
  /** step to return to after an error is dismissed */
  resumeStep: FlowStep | null;
}

export type FlowAction =
  | { type: 'START' }
  | { type: 'SET_DEVICE'; modelLabel: string; declaredCode: string | null }
  | { type: 'CAMERA_READY' }
  | { type: 'PROBE_DONE' }
  | { type: 'SCENE_START' }
  | { type: 'SCENE_FINISHED' }
  | { type: 'SCENE_RETRY' }
  | { type: 'SCENE_NEXT' }
  | { type: 'SCENE_SKIP' }
  | { type: 'FINISH' }
  | { type: 'FAIL'; message: string }
  | { type: 'DISMISS_ERROR' }
  | {
      type: 'RESUME';
      modelLabel: string;
      declaredCode: string | null;
      sceneIndex: number;
      completed: Record<string, number>;
      skipped: string[];
    };

export const initialFlowState: FlowState = {
  step: 'intro',
  modelLabel: '',
  declaredCode: null,
  sceneIndex: 0,
  attempt: 1,
  completed: {},
  skipped: [],
  errorMessage: null,
  resumeStep: null,
};

export function normalizeDeclaredCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 8 || digits.length === 12 || digits.length === 13 ? digits : null;
}

export function flowReducer(
  state: FlowState,
  action: FlowAction,
  sceneCount: number,
  sceneIds: readonly string[],
): FlowState {
  switch (action.type) {
    case 'START':
      return state.step === 'intro' ? { ...state, step: 'device' } : state;
    case 'SET_DEVICE': {
      const modelLabel = action.modelLabel.trim();
      if (!modelLabel) return state;
      return {
        ...state,
        step: 'camera',
        modelLabel,
        declaredCode: normalizeDeclaredCode(action.declaredCode),
      };
    }
    case 'CAMERA_READY':
      return state.step === 'camera' ? { ...state, step: 'probe' } : state;
    case 'PROBE_DONE':
      return state.step === 'probe'
        ? { ...state, step: sceneCount > 0 ? 'scene_ready' : 'summary' }
        : state;
    case 'SCENE_START':
      return state.step === 'scene_ready' ? { ...state, step: 'scene_recording' } : state;
    case 'SCENE_FINISHED': {
      if (state.step !== 'scene_recording') return state;
      const id = sceneIds[state.sceneIndex] ?? String(state.sceneIndex);
      return {
        ...state,
        step: 'scene_done',
        completed: { ...state.completed, [id]: state.attempt },
      };
    }
    case 'SCENE_RETRY':
      return state.step === 'scene_done' || state.step === 'scene_recording'
        ? { ...state, step: 'scene_ready', attempt: state.attempt + 1 }
        : state;
    case 'SCENE_NEXT': {
      if (state.step !== 'scene_done') return state;
      const next = state.sceneIndex + 1;
      return next >= sceneCount
        ? { ...state, step: 'summary' }
        : { ...state, step: 'scene_ready', sceneIndex: next, attempt: 1 };
    }
    case 'SCENE_SKIP': {
      if (state.step !== 'scene_ready' && state.step !== 'scene_done') return state;
      const id = sceneIds[state.sceneIndex] ?? String(state.sceneIndex);
      const skipped =
        state.step === 'scene_ready' && !state.completed[id]
          ? [...state.skipped, id]
          : state.skipped;
      const next = state.sceneIndex + 1;
      return next >= sceneCount
        ? { ...state, step: 'summary', skipped }
        : { ...state, step: 'scene_ready', sceneIndex: next, attempt: 1, skipped };
    }
    case 'FINISH':
      return { ...state, step: 'summary' };
    case 'FAIL':
      return {
        ...state,
        step: 'error',
        errorMessage: action.message,
        resumeStep: state.step === 'error' ? state.resumeStep : state.step,
      };
    case 'DISMISS_ERROR': {
      if (state.step !== 'error') return state;
      const back =
        state.resumeStep === 'scene_recording' ? 'scene_ready' : (state.resumeStep ?? 'intro');
      return { ...state, step: back, errorMessage: null, resumeStep: null };
    }
    case 'RESUME':
      return {
        ...state,
        step: 'camera',
        modelLabel: action.modelLabel,
        declaredCode: action.declaredCode,
        sceneIndex: Math.min(Math.max(0, action.sceneIndex), Math.max(0, sceneCount - 1)),
        attempt: 1,
        completed: { ...action.completed },
        skipped: [...action.skipped],
      };
    default:
      return state;
  }
}
