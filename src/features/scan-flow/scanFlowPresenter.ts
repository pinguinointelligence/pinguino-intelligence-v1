/**
 * SOL-048 — what the customer is allowed to READ while the scanner works.
 *
 * Owner QA 2026-09-06: "komunikaty zmieniają się tak szybko, że klient nie jest w stanie ich
 * przeczytać… UI wygląda, jakby wariowało." Two separate defects sat behind that sentence:
 *
 *  - the visible line was a pure function of the LATEST FRAME, recomputed on every render, and the
 *    frame arrives at camera rate. Nothing bounded how OFTEN the words could change, so thresholds
 *    (position at cx 0.28/0.72, blur at sharpRel 0.5) flickered between two hints many times a second;
 *  - nothing bound an in-flight answer to the scan that asked for it. A late response — a label
 *    analysis, a finalize, a discovery — overwrote whatever was on screen, including a finished one.
 *
 * This module owns BOTH rules and nothing else. It is pure: no React, no network, no timer of its
 * own — `now` is always an argument, so every contract below is deterministic. The stage names are
 * INTERNAL: they order the flow and are never rendered.
 *
 * It reuses the generation-counter shape the recalculation pipeline already uses for the same class
 * of problem (`beginPiRecalculation` / `isCurrentPiRun` in constraintStudioStore); nothing here is a
 * second state store — the Phase union remains the single source of what the flow IS.
 */

export type ScanStage =
  | 'SCANNING'
  | 'CODE_FOUND'
  | 'CHECKING_PRODUCT'
  | 'NEEDS_EVIDENCE'
  | 'READY'
  | 'NOT_USABLE'
  | 'ERROR';

/** how far along the journey a stage is. Terminal stages share the top rank. */
export const STAGE_RANK: Readonly<Record<ScanStage, 0 | 1 | 2 | 3>> = Object.freeze({
  SCANNING: 0,
  CODE_FOUND: 1,
  CHECKING_PRODUCT: 2,
  NEEDS_EVIDENCE: 2,
  READY: 3,
  NOT_USABLE: 3,
  ERROR: 3,
});

/** a stage the customer acts on: the scanner has finished talking and is waiting for them */
export function isTerminal(stage: ScanStage): boolean {
  return stage === 'READY' || stage === 'NOT_USABLE' || stage === 'ERROR';
}

/**
 * How long a sentence must stay before another may replace it. Anchored on the accepted
 * CONFIRM_DWELL_MS (700 ms) and on the length of the Polish hints; a shorter floor is what the owner
 * read as "going crazy". A terminal answer is never delayed by it.
 */
export const MIN_DWELL_MS = 900;

export interface ScanPresentation {
  stage: ScanStage;
  /** the sentence the customer reads. Empty means: show nothing yet. */
  line: string;
  /** when this line became visible */
  since: number;
}

export interface PresenterState {
  generation: number;
  current: ScanPresentation;
  /** a line that must wait for the current one to have been readable */
  queued: ScanPresentation | null;
}

export interface PresentUpdate {
  generation: number;
  stage: ScanStage;
  line: string;
  now: number;
}

export type PresentReason =
  | 'published'
  | 'queued'
  | 'unchanged'
  | 'stale_generation'
  | 'terminal_latched';

export interface PresentResult {
  state: PresenterState;
  published: boolean;
  reason: PresentReason;
}

export function createPresenter(now: number): PresenterState {
  return { generation: 1, current: { stage: 'SCANNING', line: '', since: now }, queued: null };
}

/**
 * A new scan begins: a fresh generation, so every answer still in flight for the previous one is
 * ignored from here on. This is also the ONLY way a terminal state is released.
 */
export function beginScan(state: PresenterState, now: number): PresenterState {
  return {
    generation: state.generation + 1,
    current: { stage: 'SCANNING', line: '', since: now },
    queued: null,
  };
}

/** is this answer still the one the customer is waiting for? */
export function isCurrent(state: PresenterState, generation: number): boolean {
  return state.generation === generation;
}

export function present(state: PresenterState, update: PresentUpdate): PresentResult {
  // (1) an answer from a scan the customer has already left cannot speak at all — not even to queue
  if (update.generation !== state.generation)
    return { state, published: false, reason: 'stale_generation' };

  const current = state.current;

  // (2) the same words again are not a change; re-publishing them would restart the dwell clock
  if (update.stage === current.stage && update.line === current.line)
    return { state, published: false, reason: 'unchanged' };

  // (3) once the scanner has finished talking, only a NEW scan may move it off that answer. A late
  //     label analysis must never drag a saved product back to "checking…".
  if (isTerminal(current.stage) && !isTerminal(update.stage))
    return { state, published: false, reason: 'terminal_latched' };

  // (4) a terminal answer is never delayed: the customer is waiting for exactly this.
  const next: ScanPresentation = { stage: update.stage, line: update.line, since: update.now };
  if (isTerminal(update.stage))
    return {
      state: { ...state, current: next, queued: null },
      published: true,
      reason: 'published',
    };

  // (5) progress backwards is not shown at all — a stage that has been passed cannot be re-announced
  if (STAGE_RANK[update.stage] < STAGE_RANK[current.stage])
    return { state, published: false, reason: 'unchanged' };

  // (6) otherwise the new line waits until the current one has been readable
  const readableFor = update.now - current.since;
  if (current.line !== '' && readableFor < MIN_DWELL_MS)
    return { state: { ...state, queued: next }, published: false, reason: 'queued' };

  return { state: { ...state, current: next, queued: null }, published: true, reason: 'published' };
}

/** when the caller should look again, or null when nothing is waiting */
export function nextTickAt(state: PresenterState): number | null {
  return state.queued ? state.current.since + MIN_DWELL_MS : null;
}

/** the dwell has passed: promote whatever was waiting */
export function tick(state: PresenterState, now: number): PresenterState {
  if (!state.queued || now < state.current.since + MIN_DWELL_MS) return state;
  return { ...state, current: { ...state.queued, since: now }, queued: null };
}

/**
 * The internal stage of a flow phase. The Phase union stays the single source of truth about what
 * the flow IS; this only says how far along it is, so the rules above can order two answers.
 */
export function stageOfPhaseKind(
  kind: string,
  opts: { engineReady?: boolean; cameraFailed?: boolean } = {},
): ScanStage {
  switch (kind) {
    case 'camera':
      return opts.cameraFailed ? 'ERROR' : 'SCANNING';
    case 'confirmed':
      return 'CODE_FOUND';
    case 'resolving':
      return 'CHECKING_PRODUCT';
    case 'ask_add':
    case 'label':
    case 'family':
    case 'fields':
      return 'NEEDS_EVIDENCE';
    case 'known':
    case 'saved':
      return opts.engineReady === false ? 'NOT_USABLE' : 'READY';
    case 'requested':
    case 'guest':
    case 'offline':
      return 'NOT_USABLE';
    case 'error':
      return 'ERROR';
    default:
      return 'SCANNING';
  }
}
