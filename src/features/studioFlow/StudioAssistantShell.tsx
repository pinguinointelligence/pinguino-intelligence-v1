/**
 * StudioAssistantShell — the PL-first Conversational Assistant Shell UI.
 *
 * DETERMINISTIC, LOCAL-ONLY: drives the pure `conversationalAssistantFlow`
 * state machine in component state. No LLM, no DB, no persistence, and no
 * recipe SAVE. Submit commits a visibly selected (pending) answer first via
 * the pure `submitIntentDraft`, so a selected final answer is never ignored.
 *
 * The starter preview renders ONLY the tier-safe display object from
 * `redactStarterDraftForDisplay` — Demo/Free receives an object that
 * physically lacks gram amounts and any apply payload. The paid tier
 * (capability `canApplyStarterToStudio`, Home i Pro) may apply a `ready`
 * starter into the LOCAL Studio draft (`applyStarterRecipeInputToStudio`):
 * explicit click, replacement confirm, ONE undo snapshot, nothing saved.
 */
import { useState } from 'react';
import { useAccess } from '@/access/useAccess';
import { STUDIO_FLOW_COPY } from './studioFlowCopy';
import {
  answerCurrentQuestion,
  answerLabel,
  ASSISTANT_QUESTIONS,
  commitPendingAnswer,
  currentQuestion,
  goBack,
  initialAssistantState,
  isIntentComplete,
  resetAssistantFlow,
  startAssistantFlow,
  submitIntentDraft,
  type AssistantAnswerValue,
  type AssistantFlowState,
  type AssistantIntentDraft,
  type AssistantQuestion,
} from './conversationalAssistantFlow';
import { buildStarterRecipeDraft, type IntentRecipeDraft } from './intentRecipeDraft';
import { redactStarterDraftForDisplay } from './starterDraftDisplay';
import {
  applyStarterRecipeInputToStudio,
  studioHoldsUserDraft,
  undoStarterApplyToStudio,
  type StudioDraftSnapshot,
} from './applyStarterToStudio';
import {
  StarterDraftPreview,
  type StarterAppliedTrace,
  type StarterApplyStage,
} from './StarterDraftPreview';

const A = STUDIO_FLOW_COPY.pl.assistant;
const questionById = (id: string) => ASSISTANT_QUESTIONS.find((q) => q.id === id)!;

const emptyFor = (question: AssistantQuestion): AssistantAnswerValue =>
  question.kind === 'multi_choice' ? [] : '';

const pendingFor = (state: AssistantFlowState, question: AssistantQuestion): AssistantAnswerValue =>
  state.answers[question.id] ?? emptyFor(question);

const chipCls = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
    active ? 'border-ivory/50 bg-ivory/10 text-ivory' : 'border-ivory/15 text-ivory/60 hover:border-ivory/30'
  }`;
const buttonCls =
  'inline-flex items-center justify-center rounded-md border border-ivory/20 px-3 py-1.5 text-[11px] font-medium text-ivory transition-colors hover:border-ivory/40 disabled:cursor-not-allowed disabled:opacity-40';

export interface StudioAssistantShellProps {
  /** Deterministic initial UI state — preview/testing seam only; no runtime
   * caller sets it (the Studio mounts the shell bare). */
  initialUi?: { flow: AssistantFlowState; pending: AssistantAnswerValue };
}

export function StudioAssistantShell({ initialUi }: StudioAssistantShellProps = {}) {
  const { canViewExactGrams, canApplyStarterToStudio } = useAccess();
  const [flow, setFlow] = useState<AssistantFlowState>(initialUi?.flow ?? initialAssistantState);
  const [pending, setPending] = useState<AssistantAnswerValue>(initialUi?.pending ?? '');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssistantIntentDraft | null>(null);
  const [starter, setStarter] = useState<IntentRecipeDraft | null>(null);
  const [applyStage, setApplyStage] = useState<StarterApplyStage>('idle');
  const [undoSnapshot, setUndoSnapshot] = useState<StudioDraftSnapshot | null>(null);
  const [appliedTrace, setAppliedTrace] = useState<StarterAppliedTrace | null>(null);

  const question = currentQuestion(flow);
  // A visibly selected (pending) answer counts toward submit — the same pure
  // commit the submit handler performs (regression: uncommitted final answer).
  const submittable = isIntentComplete(commitPendingAnswer(flow, pending));

  // The preview consumes ONLY the tier-safe display object (physical redaction).
  const display = starter
    ? redactStarterDraftForDisplay(starter, { canViewExactGrams, canApplyStarterToStudio })
    : null;

  const resetApplyUi = () => {
    setApplyStage('idle');
    setUndoSnapshot(null);
    setAppliedTrace(null);
  };

  const start = () => {
    const next = startAssistantFlow();
    setFlow(next);
    setPending(pendingFor(next, ASSISTANT_QUESTIONS[0]!));
    setError(null);
    setDraft(null);
    setStarter(null);
    resetApplyUi();
  };

  const reset = () => {
    setFlow(resetAssistantFlow());
    setPending('');
    setError(null);
    setDraft(null);
    setStarter(null);
    resetApplyUi();
  };

  const next = () => {
    const result = answerCurrentQuestion(flow, pending);
    if (!result.ok) {
      setError(result.reason === 'required' ? 'To pytanie jest wymagane.' : 'Nieprawidłowa odpowiedź.');
      return;
    }
    setError(null);
    setFlow(result.state);
    const nextQuestion = currentQuestion(result.state);
    setPending(nextQuestion ? pendingFor(result.state, nextQuestion) : '');
  };

  const back = () => {
    const previous = goBack(flow);
    setFlow(previous);
    setError(null);
    const q = currentQuestion(previous);
    setPending(q ? pendingFor(previous, q) : '');
  };

  const toggleMulti = (value: string) => {
    setPending((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    });
  };

  const prepare = () => {
    // Commits a valid pending answer first (pure), then builds the draft only
    // when every required answer is honestly present.
    const submission = submitIntentDraft(flow, pending);
    if (!submission.ok) return; // guarded by disabled; the incomplete note stays honest
    setFlow(submission.state);
    const q = currentQuestion(submission.state);
    setPending(q ? pendingFor(submission.state, q) : '');
    setError(null);
    setDraft(submission.draft);
    setStarter(null);
    resetApplyUi();
  };

  const previewStarter = () => {
    if (!draft) return;
    setStarter(buildStarterRecipeDraft(draft));
    resetApplyUi();
  };

  const doApply = () => {
    if (!display || display.applyPayload === null) return;
    // Keep ONE snapshot of the prior local draft (a second apply replaces it).
    setUndoSnapshot(applyStarterRecipeInputToStudio(display.applyPayload));
    setAppliedTrace({ source: 'locked_starter_template', templateId: display.templateId });
    setApplyStage('applied');
  };

  const requestApply = () => {
    if (!display || display.applyPayload === null) return;
    if (studioHoldsUserDraft()) {
      setApplyStage('confirming');
      return;
    }
    doApply();
  };

  const cancelApply = () => {
    // Cancel is a pure UI step-back — the Studio draft is untouched.
    setApplyStage(undoSnapshot ? 'applied' : 'idle');
  };

  const undoApply = () => {
    if (!undoSnapshot) return;
    undoStarterApplyToStudio(undoSnapshot);
    setUndoSnapshot(null);
    setAppliedTrace(null);
    setApplyStage('idle');
  };

  return (
    <div className="space-y-2 rounded-lg border border-ivory/10 bg-black/20 p-3">
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ivory/60">Asystent</p>
        <p className="text-sm font-medium text-ivory/90">{A.introTitle}</p>
        <p className="text-xs leading-relaxed text-ivory/65">{A.introBody}</p>
      </div>

      {!flow.started ? (
        <button type="button" onClick={start} className={buttonCls}>
          {A.startCta}
        </button>
      ) : (
        <>
          {question ? (
            <div className="space-y-2 rounded border border-ivory/10 bg-black/20 p-2.5">
              <p className="text-xs font-medium text-ivory/80">
                {question.prompt}
                {!question.required ? <span className="text-ivory/60"> · opcjonalne</span> : null}
              </p>
              {question.helper ? (
                <p className="text-[10px] leading-relaxed text-ivory/60">{question.helper}</p>
              ) : null}

              {question.kind === 'text' ? (
                <input
                  className="w-full rounded border border-ivory/20 bg-black/30 px-2 py-1.5 text-[11px] text-ivory placeholder:text-ivory/60"
                  value={typeof pending === 'string' ? pending : ''}
                  placeholder="Wpisz odpowiedź…"
                  onChange={(e) => setPending(e.target.value)}
                />
              ) : null}

              {question.kind === 'single_choice' ? (
                <div className="flex flex-wrap gap-1.5">
                  {question.choices?.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className={chipCls(pending === choice.value)}
                      onClick={() => setPending(choice.value)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {question.kind === 'multi_choice' ? (
                <div className="flex flex-wrap gap-1.5">
                  {question.choices?.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className={chipCls(Array.isArray(pending) && pending.includes(choice.value))}
                      onClick={() => toggleMulti(choice.value)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {error ? <p className="text-[11px] text-red-300/90">{error}</p> : null}

              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={back} className={buttonCls} disabled={flow.currentStepIndex === 0}>
                  Wstecz
                </button>
                <button type="button" onClick={next} className={buttonCls}>
                  Dalej
                </button>
                <button type="button" onClick={reset} className={buttonCls}>
                  Reset
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 rounded border border-ivory/10 bg-black/20 p-2.5">
              <p className="text-xs text-ivory/70">Wszystkie pytania przejrzane.</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={back} className={buttonCls}>
                  Wstecz
                </button>
                <button type="button" onClick={reset} className={buttonCls}>
                  Reset
                </button>
              </div>
            </div>
          )}

          {!submittable ? (
            <p className="text-[11px] leading-relaxed text-ivory/60">{A.incomplete}</p>
          ) : null}

          <button type="button" onClick={prepare} className={buttonCls} disabled={!submittable}>
            Przygotuj szkic intencji
          </button>

          {draft ? (
            <div className="space-y-1.5 rounded border border-ivory/10 bg-black/20 p-2.5">
              <p className="text-sm font-medium text-ivory/90">{A.draftReadyTitle}</p>
              <p className="text-[11px] leading-relaxed text-ivory/65">{A.draftReadyBody}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] text-ivory/60">
                <dt className="text-ivory/60">Profil</dt>
                <dd>{draft.intent.productProfile}</dd>
                <dt className="text-ivory/60">Temperatura</dt>
                <dd>{draft.intent.servingTemperatureC}°C</dd>
                <dt className="text-ivory/60">Batch</dt>
                <dd>{draft.batchSizeG !== null ? `${draft.batchSizeG} g` : 'ustawisz w recepturze'}</dd>
                <dt className="text-ivory/60">Smak</dt>
                <dd>{draft.intent.flavorText ?? '—'}</dd>
                <dt className="text-ivory/60">Tekstura</dt>
                <dd>{draft.intent.texturePreference}</dd>
                <dt className="text-ivory/60">Słodycz</dt>
                <dd>{draft.intent.sweetnessPreference}</dd>
                <dt className="text-ivory/60">Ograniczenia</dt>
                <dd>
                  {draft.restrictions.length > 0
                    ? answerLabel(questionById('restrictions'), draft.restrictions)
                    : '—'}
                </dd>
                <dt className="text-ivory/60">Cel</dt>
                <dd>{answerLabel(questionById('goal'), flow.answers.goal)}</dd>
              </dl>
              {!canViewExactGrams ? (
                <p className="text-[11px] leading-relaxed text-ivory/60">{A.demoGramsNote}</p>
              ) : null}
              <div className="border-t border-ivory/10 pt-1.5">
                <p className="text-[10px] leading-relaxed text-ivory/60">{A.noSaveNote}</p>
                <p className="text-[10px] leading-relaxed text-ivory/60">{A.noRecipeChangeNote}</p>
                <p className="text-[10px] leading-relaxed text-ivory/60">{A.deterministicNote}</p>
              </div>

              {/* Intent → deterministic starter recipe draft (local preview only). */}
              <button type="button" onClick={previewStarter} className={buttonCls}>
                {A.starter.previewCta}
              </button>

              {display ? (
                <StarterDraftPreview
                  display={display}
                  applyStage={applyStage}
                  appliedTrace={appliedTrace}
                  canUndo={undoSnapshot !== null}
                  onApplyRequest={requestApply}
                  onApplyConfirm={doApply}
                  onApplyCancel={cancelApply}
                  onUndoApply={undoApply}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
