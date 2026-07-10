/**
 * StudioAssistantShell — the PL-first Conversational Assistant Shell UI.
 *
 * DETERMINISTIC, LOCAL-ONLY: drives the pure `conversationalAssistantFlow`
 * state machine in component state. No LLM, no DB, no persistence, and NO
 * recipe mutation — there is deliberately no "apply" / "save" / "use as
 * recipe" button. It collects intent and shows a read-only draft summary;
 * turning the draft into a recipe is a future slice.
 */
import { useState } from 'react';
import { useAccess } from '@/access/useAccess';
import { STUDIO_FLOW_COPY } from './studioFlowCopy';
import {
  answerCurrentQuestion,
  answerLabel,
  ASSISTANT_QUESTIONS,
  buildIntentDraft,
  currentQuestion,
  goBack,
  initialAssistantState,
  isIntentComplete,
  resetAssistantFlow,
  startAssistantFlow,
  type AssistantAnswerValue,
  type AssistantFlowState,
  type AssistantIntentDraft,
  type AssistantQuestion,
} from './conversationalAssistantFlow';

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

export function StudioAssistantShell() {
  const { exactCorrectionGrams } = useAccess();
  const [flow, setFlow] = useState<AssistantFlowState>(initialAssistantState);
  const [pending, setPending] = useState<AssistantAnswerValue>('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssistantIntentDraft | null>(null);

  const question = currentQuestion(flow);
  const complete = isIntentComplete(flow);

  const start = () => {
    const next = startAssistantFlow();
    setFlow(next);
    setPending(pendingFor(next, ASSISTANT_QUESTIONS[0]!));
    setError(null);
    setDraft(null);
  };

  const reset = () => {
    setFlow(resetAssistantFlow());
    setPending('');
    setError(null);
    setDraft(null);
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

  const prepare = () => setDraft(buildIntentDraft(flow));

  return (
    <div className="space-y-2 rounded-lg border border-ivory/10 bg-black/20 p-3">
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ivory/40">Asystent</p>
        <p className="text-sm font-medium text-ivory/90">{A.introTitle}</p>
        <p className="text-xs leading-relaxed text-ivory/50">{A.introBody}</p>
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
                {!question.required ? <span className="text-ivory/30"> · opcjonalne</span> : null}
              </p>
              {question.helper ? (
                <p className="text-[10px] leading-relaxed text-ivory/40">{question.helper}</p>
              ) : null}

              {question.kind === 'text' ? (
                <input
                  className="w-full rounded border border-ivory/20 bg-black/30 px-2 py-1.5 text-[11px] text-ivory placeholder:text-ivory/25"
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

          {!complete ? (
            <p className="text-[11px] leading-relaxed text-ivory/40">{A.incomplete}</p>
          ) : null}

          <button type="button" onClick={prepare} className={buttonCls} disabled={!complete}>
            Przygotuj szkic intencji
          </button>

          {draft ? (
            <div className="space-y-1.5 rounded border border-ivory/10 bg-black/20 p-2.5">
              <p className="text-sm font-medium text-ivory/90">{A.draftReadyTitle}</p>
              <p className="text-[11px] leading-relaxed text-ivory/50">{A.draftReadyBody}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] text-ivory/60">
                <dt className="text-ivory/35">Profil</dt>
                <dd>{draft.intent.productProfile}</dd>
                <dt className="text-ivory/35">Temperatura</dt>
                <dd>{draft.intent.servingTemperatureC}°C</dd>
                <dt className="text-ivory/35">Batch</dt>
                <dd>{draft.batchSizeG !== null ? `${draft.batchSizeG} g` : 'ustawisz w recepturze'}</dd>
                <dt className="text-ivory/35">Smak</dt>
                <dd>{draft.intent.flavorText ?? '—'}</dd>
                <dt className="text-ivory/35">Tekstura</dt>
                <dd>{draft.intent.texturePreference}</dd>
                <dt className="text-ivory/35">Słodycz</dt>
                <dd>{draft.intent.sweetnessPreference}</dd>
                <dt className="text-ivory/35">Ograniczenia</dt>
                <dd>
                  {draft.restrictions.length > 0
                    ? answerLabel(questionById('restrictions'), draft.restrictions)
                    : '—'}
                </dd>
                <dt className="text-ivory/35">Cel</dt>
                <dd>{answerLabel(questionById('goal'), flow.answers.goal)}</dd>
              </dl>
              {!exactCorrectionGrams ? (
                <p className="text-[11px] leading-relaxed text-ivory/40">{A.demoGramsNote}</p>
              ) : null}
              <div className="border-t border-ivory/10 pt-1.5">
                <p className="text-[10px] leading-relaxed text-ivory/30">{A.noSaveNote}</p>
                <p className="text-[10px] leading-relaxed text-ivory/30">{A.noRecipeChangeNote}</p>
                <p className="text-[10px] leading-relaxed text-ivory/30">{A.deterministicNote}</p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
