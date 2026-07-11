/**
 * Conversational Assistant Shell — the PURE, DETERMINISTIC flow model
 * (User-Flow layer). PL-first question script that collects recipe INTENT and
 * builds a draft via the locked spine normalizer.
 *
 * HARD SCOPE (test-pinned):
 *  - NO LLM / AI call — this is a fixed question state machine, not a chatbot;
 *  - NO persistence, NO DB, NO recipe mutation, NO grams generation;
 *  - it only COLLECTS answers and maps them, through `normalizeRecipeIntent`
 *    (the locked spine parser — no duplicated flavor/profile logic here), into
 *    an in-memory `AssistantIntentDraft`. Nothing downstream is called.
 *
 * Pure and deterministic: no IO, no env, no DOM, no clock, no randomness. All
 * operations return NEW state; inputs are never mutated.
 */
import {
  normalizeRecipeIntent,
  type IntegrationFlowContext,
  type NormalizedRecipeIntent,
  type RawRecipeIntentInput,
} from '@/spine';

export type AssistantStepId =
  | 'opening'
  | 'product_type'
  | 'serving_temperature'
  | 'batch_size'
  | 'main_flavor'
  | 'texture'
  | 'sweetness'
  | 'restrictions'
  | 'boosters'
  | 'goal';

export type AssistantQuestionKind = 'text' | 'single_choice' | 'multi_choice';

export interface AssistantChoice {
  value: string;
  label: string;
}

export interface AssistantQuestion {
  id: AssistantStepId;
  index: number;
  prompt: string;
  helper?: string;
  kind: AssistantQuestionKind;
  required: boolean;
  choices?: readonly AssistantChoice[];
}

/** A stored answer — string for text/single, string[] for multi. */
export type AssistantAnswerValue = string | readonly string[];
export type AssistantAnswers = Partial<Record<AssistantStepId, AssistantAnswerValue>>;

export interface AssistantFlowState {
  started: boolean;
  currentStepIndex: number;
  answers: AssistantAnswers;
}

/** The locked PL question script (User_Flow.md §3–§7 order + branch routing). */
export const ASSISTANT_QUESTIONS: readonly AssistantQuestion[] = [
  {
    id: 'opening',
    index: 0,
    prompt: 'Jakie lody dziś robimy?',
    helper: 'Napisz krótko, co chcesz zrobić — np. „czekoladowe”, „mango sorbet”.',
    kind: 'text',
    required: false,
  },
  {
    id: 'product_type',
    index: 1,
    prompt: 'Jaki typ produktu?',
    kind: 'single_choice',
    required: true,
    choices: [
      { value: 'standard_gelato', label: 'Gelato' },
      { value: 'sorbet', label: 'Sorbet' },
      { value: 'vegan_gelato', label: 'Vegan Gelato' },
      { value: 'chocolate_gelato', label: 'Chocolate Gelato' },
    ],
  },
  {
    id: 'serving_temperature',
    index: 2,
    prompt: 'Jaka temperatura podania?',
    helper: 'Jeśli nie wiesz, standardowo −12°C.',
    kind: 'single_choice',
    required: true,
    choices: [
      { value: '-11', label: '−11°C' },
      { value: '-12', label: '−12°C' },
      { value: '-13', label: '−13°C' },
    ],
  },
  {
    id: 'batch_size',
    index: 3,
    prompt: 'Na ile porcji / jaka wielkość batcha?',
    kind: 'single_choice',
    required: true,
    choices: [
      { value: '1000', label: '1 kg' },
      { value: '5000', label: '5 kg' },
      { value: '10000', label: '10 kg' },
      { value: '25000', label: '25 kg' },
      { value: '50000', label: '50 kg' },
      { value: 'custom', label: 'Własna gramatura (ustawisz w recepturze)' },
    ],
  },
  {
    id: 'main_flavor',
    index: 4,
    prompt: 'Jaki główny smak / składnik?',
    helper: 'Np. pistacja, truskawka, wanilia. Możesz pominąć.',
    kind: 'text',
    required: false,
  },
  {
    id: 'texture',
    index: 5,
    prompt: 'Jaka tekstura?',
    kind: 'single_choice',
    required: true,
    choices: [
      { value: 'firm', label: 'Bardziej twarde' },
      { value: 'medium', label: 'Średnie / lżejsze' },
      { value: 'soft', label: 'Bardziej kremowe / miękkie' },
    ],
  },
  {
    id: 'sweetness',
    index: 6,
    prompt: 'Jaka słodycz?',
    kind: 'single_choice',
    required: true,
    choices: [
      { value: 'low', label: 'Mniej słodkie' },
      { value: 'balanced', label: 'Standard' },
      { value: 'high', label: 'Bardziej słodkie' },
    ],
  },
  {
    id: 'restrictions',
    index: 7,
    prompt: 'Czy są ograniczenia?',
    helper: 'Możesz zaznaczyć kilka albo pominąć.',
    kind: 'multi_choice',
    required: false,
    choices: [
      { value: 'lactose_free', label: 'Bez laktozy' },
      { value: 'vegan', label: 'Vegan' },
      { value: 'no_alcohol', label: 'Bez alkoholu' },
      { value: 'no_nuts', label: 'Bez orzechów' },
      { value: 'other', label: 'Inne' },
    ],
  },
  {
    id: 'boosters',
    index: 8,
    prompt: 'Czy używamy boosterów / dodatków?',
    kind: 'single_choice',
    required: false,
    choices: [
      { value: 'no', label: 'Nie' },
      { value: 'yes', label: 'Tak' },
    ],
  },
  {
    id: 'goal',
    index: 9,
    prompt: 'Co chcesz teraz zrobić?',
    kind: 'single_choice',
    required: true,
    choices: [
      { value: 'recipe_design', label: 'Zaprojektować recepturę' },
      { value: 'optimization', label: 'Zoptymalizować recepturę' },
      { value: 'actual_batch_rescue', label: 'Uratować realną partię' },
      { value: 'stock_shortage', label: 'Rozwiązać brak surowca' },
    ],
  },
];

const REQUIRED_STEPS: readonly AssistantStepId[] = ASSISTANT_QUESTIONS.filter(
  (q) => q.required,
).map((q) => q.id);

/** Fresh, not-yet-started state (the "Start" affordance shows Q1). */
export const initialAssistantState = (): AssistantFlowState => ({
  started: false,
  currentStepIndex: 0,
  answers: {},
});

/** Start (or restart) the flow — empty answers, at Q1. */
export const startAssistantFlow = (): AssistantFlowState => ({
  started: true,
  currentStepIndex: 0,
  answers: {},
});

export const resetAssistantFlow = (): AssistantFlowState => initialAssistantState();

/** The question at the cursor, or null when the flow ran past the last step. */
export function currentQuestion(state: AssistantFlowState): AssistantQuestion | null {
  return ASSISTANT_QUESTIONS[state.currentStepIndex] ?? null;
}

export type AnswerRejection = 'no_current_question' | 'required' | 'invalid_choice' | 'invalid_shape';

export type AnswerResult =
  | { ok: true; state: AssistantFlowState }
  | { ok: false; reason: AnswerRejection };

const isEmpty = (value: AssistantAnswerValue | undefined): boolean =>
  value === undefined ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

const validChoiceValues = (question: AssistantQuestion): ReadonlySet<string> =>
  new Set((question.choices ?? []).map((c) => c.value));

/** Validate `value` against `question` (pure) — null = valid, else the reason. */
export function validateAnswer(
  question: AssistantQuestion,
  value: AssistantAnswerValue,
): AnswerRejection | null {
  if (question.kind === 'text') {
    if (typeof value !== 'string') return 'invalid_shape';
    if (question.required && value.trim() === '') return 'required';
    return null;
  }
  if (question.kind === 'single_choice') {
    if (typeof value !== 'string') return 'invalid_shape';
    if (value.trim() === '') return question.required ? 'required' : null;
    return validChoiceValues(question).has(value) ? null : 'invalid_choice';
  }
  // multi_choice
  if (!Array.isArray(value)) return 'invalid_shape';
  if (value.length === 0) return question.required ? 'required' : null;
  const allowed = validChoiceValues(question);
  return value.every((v) => allowed.has(v)) ? null : 'invalid_choice';
}

/**
 * Answer the CURRENT question and advance. Returns a NEW state on success, or
 * a rejection reason. An optional question may be skipped with '' / [].
 */
export function answerCurrentQuestion(
  state: AssistantFlowState,
  value: AssistantAnswerValue,
): AnswerResult {
  const question = currentQuestion(state);
  if (!question) return { ok: false, reason: 'no_current_question' };

  const rejection = validateAnswer(question, value);
  if (rejection) return { ok: false, reason: rejection };

  const answers: AssistantAnswers = { ...state.answers };
  if (isEmpty(value)) {
    delete answers[question.id]; // skipped optional — record nothing
  } else {
    answers[question.id] = typeof value === 'string' ? value.trim() : [...value];
  }

  return {
    ok: true,
    state: { ...state, answers, currentStepIndex: state.currentStepIndex + 1 },
  };
}

/** Step the cursor back one question (never before the first). */
export function goBack(state: AssistantFlowState): AssistantFlowState {
  return { ...state, currentStepIndex: Math.max(0, state.currentStepIndex - 1) };
}

/**
 * Commit a VALID pending (visibly selected but not yet "Dalej"-confirmed)
 * answer for the current question; an invalid/rejected pending value leaves
 * the state unchanged. Pure — returns a NEW state on commit.
 */
export function commitPendingAnswer(
  state: AssistantFlowState,
  pending: AssistantAnswerValue,
): AssistantFlowState {
  if (!currentQuestion(state)) return state;
  const result = answerCurrentQuestion(state, pending);
  return result.ok ? result.state : state;
}

export type IntentSubmission =
  | { ok: true; state: AssistantFlowState; draft: AssistantIntentDraft }
  | { ok: false; state: AssistantFlowState; missingRequired: AssistantStepId[] };

/**
 * Submit the flow for an intent draft. A visibly selected answer on the
 * current question counts: a valid pending value is committed FIRST (the
 * submit-blocked-by-uncommitted-final-answer fix), then required completeness
 * is checked honestly. An invalid/empty pending on a required question is
 * never guessed — it stays missing and submission is rejected.
 */
export function submitIntentDraft(
  state: AssistantFlowState,
  pending: AssistantAnswerValue,
): IntentSubmission {
  const committed = commitPendingAnswer(state, pending);
  if (!isIntentComplete(committed)) {
    return { ok: false, state: committed, missingRequired: missingRequiredSteps(committed) };
  }
  return { ok: true, state: committed, draft: buildIntentDraft(committed) };
}

/** Required steps that still have no valid answer. */
export function missingRequiredSteps(state: AssistantFlowState): AssistantStepId[] {
  return REQUIRED_STEPS.filter((id) => {
    const question = ASSISTANT_QUESTIONS.find((q) => q.id === id)!;
    const value = state.answers[id];
    return value === undefined || validateAnswer(question, value) !== null;
  });
}

export const isIntentComplete = (state: AssistantFlowState): boolean =>
  missingRequiredSteps(state).length === 0;

/* ------------------------------------------------------------------------ *
 * Intent draft                                                              *
 * ------------------------------------------------------------------------ */

export interface AssistantIntentDraft {
  /** The normalized intent from the LOCKED spine parser (never grams). */
  intent: NormalizedRecipeIntent;
  /** Which Integration-Flow branch the user chose. */
  branchContext: IntegrationFlowContext;
  /** The user picked "optimize" (still recipe_design context). */
  wantsOptimization: boolean;
  /** Captured batch preference in grams, or null for "custom / set later". */
  batchSizeG: number | null;
  /** Restriction choice values echoed back (not silently applied). */
  restrictions: string[];
  complete: boolean;
  missingRequired: AssistantStepId[];
  /** Assistant-level notes (structured messageKeys / codes only). */
  notes: string[];
}

const asString = (value: AssistantAnswerValue | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const asArray = (value: AssistantAnswerValue | undefined): string[] =>
  Array.isArray(value) ? [...value] : [];

/**
 * Build the deterministic intent draft from collected answers (pure). Feeds a
 * `RawRecipeIntentInput` into `normalizeRecipeIntent` — the assistant NEVER
 * re-implements profile/flavor logic. `goal` picks the branch and whether the
 * user asked to optimize; nothing is generated, saved, or applied.
 */
export function buildIntentDraft(state: AssistantFlowState): AssistantIntentDraft {
  const a = state.answers;
  const notes: string[] = [];

  const restrictions = asArray(a.restrictions);
  const dietary: NonNullable<RawRecipeIntentInput['dietary']> = {};
  if (restrictions.includes('lactose_free')) dietary.lactoseFree = true;
  if (restrictions.includes('vegan')) dietary.vegan = true;
  if (restrictions.includes('no_nuts')) dietary.allergenAware = true;
  if (restrictions.includes('other')) dietary.allergenAware = true;
  // "no_alcohol" is the default (no alcohol added) — captured, never a no-op flag flip.
  if (restrictions.includes('no_alcohol')) notes.push('assistant.restriction.no_alcohol_captured');

  const temperatureRaw = asString(a.serving_temperature);
  const servingTemperatureC = temperatureRaw ? Number(temperatureRaw) : undefined;

  const batchRaw = asString(a.batch_size);
  const batchSizeG = batchRaw && batchRaw !== 'custom' ? Number(batchRaw) : null;
  if (batchRaw === 'custom') notes.push('assistant.batch.custom_set_in_builder');

  const boostersRaw = asString(a.boosters);
  const allowBoosters = boostersRaw === undefined ? undefined : boostersRaw === 'yes';

  const input: RawRecipeIntentInput = {
    ...(asString(a.product_type) !== undefined ? { productProfile: asString(a.product_type) } : {}),
    ...(servingTemperatureC !== undefined ? { servingTemperatureC } : {}),
    ...(asString(a.texture) !== undefined ? { texturePreference: asString(a.texture) } : {}),
    ...(asString(a.sweetness) !== undefined ? { sweetnessPreference: asString(a.sweetness) } : {}),
    // main flavor wins; the free opener is the fallback flavor text.
    ...(asString(a.main_flavor) ?? asString(a.opening)) !== undefined
      ? { flavorText: asString(a.main_flavor) ?? asString(a.opening) }
      : {},
    ...(allowBoosters !== undefined ? { allowBoosters } : {}),
    ...(Object.keys(dietary).length > 0 ? { dietary } : {}),
    ...(batchSizeG !== null ? { batchSizeG } : {}),
  };

  const intent = normalizeRecipeIntent({ input });

  const goal = asString(a.goal);
  const wantsOptimization = goal === 'optimization';
  const branchContext: IntegrationFlowContext =
    goal === 'actual_batch_rescue'
      ? 'actual_batch_rescue'
      : goal === 'stock_shortage'
        ? 'stock_shortage'
        : 'recipe_design'; // recipe_design + optimization both design-context

  const missingRequired = missingRequiredSteps(state);

  return {
    intent,
    branchContext,
    wantsOptimization,
    batchSizeG,
    restrictions,
    complete: missingRequired.length === 0,
    missingRequired,
    notes,
  };
}

/** The label for a stored answer value, for read-only summaries (pure). */
export function answerLabel(
  question: AssistantQuestion,
  value: AssistantAnswerValue | undefined,
): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') {
    return question.choices?.find((c) => c.value === value)?.label ?? value;
  }
  const labels = value.map((v) => question.choices?.find((c) => c.value === v)?.label ?? v);
  return labels.length > 0 ? labels.join(', ') : '—';
}
