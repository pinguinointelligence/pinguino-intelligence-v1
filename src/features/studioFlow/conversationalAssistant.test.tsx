/// <reference types="node" />
/**
 * Conversational Assistant Shell — deterministic flow model + PL copy honesty
 * + purity boundary. No LLM, no persistence, no recipe mutation (all pinned).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/access/useAccess', () => ({ useAccess: () => ({ exactCorrectionGrams: false, saveRecipes: false }) }));

import {
  answerCurrentQuestion,
  ASSISTANT_QUESTIONS,
  buildIntentDraft,
  currentQuestion,
  goBack,
  initialAssistantState,
  isIntentComplete,
  missingRequiredSteps,
  resetAssistantFlow,
  startAssistantFlow,
  validateAnswer,
  type AssistantAnswerValue,
  type AssistantFlowState,
} from './conversationalAssistantFlow';
import { STUDIO_FLOW_COPY } from './studioFlowCopy';
import { StudioAssistantShell } from './StudioAssistantShell';

const A = STUDIO_FLOW_COPY.pl.assistant;

const answer = (state: AssistantFlowState, value: AssistantAnswerValue): AssistantFlowState => {
  const r = answerCurrentQuestion(state, value);
  if (!r.ok) throw new Error(`unexpected reject: ${r.reason}`);
  return r.state;
};

/** A full valid run (goal defaults to recipe_design). */
const fullRun = (over: Partial<Record<string, AssistantAnswerValue>> = {}): AssistantFlowState => {
  let s = startAssistantFlow();
  s = answer(s, (over.opening as string) ?? 'czekoladowe');
  s = answer(s, (over.product_type as string) ?? 'standard_gelato');
  s = answer(s, (over.serving_temperature as string) ?? '-12');
  s = answer(s, (over.batch_size as string) ?? '5000');
  s = answer(s, (over.main_flavor as string) ?? 'pistacja');
  s = answer(s, (over.texture as string) ?? 'soft');
  s = answer(s, (over.sweetness as string) ?? 'balanced');
  s = answer(s, (over.restrictions as string[]) ?? ['lactose_free']);
  s = answer(s, (over.boosters as string) ?? 'no');
  s = answer(s, (over.goal as string) ?? 'recipe_design');
  return s;
};

describe('assistant flow — deterministic state machine', () => {
  it('1. starts at the first PL question', () => {
    const q = currentQuestion(startAssistantFlow());
    expect(q?.id).toBe('opening');
    expect(q?.prompt).toBe('Jakie lody dziś robimy?');
    expect(ASSISTANT_QUESTIONS).toHaveLength(10);
  });

  it('2. advances only after a valid answer', () => {
    const atProduct = answer(startAssistantFlow(), ''); // skip optional opening
    expect(currentQuestion(atProduct)?.id).toBe('product_type');
    // required empty → rejected; invalid choice → rejected
    expect(answerCurrentQuestion(atProduct, '')).toEqual({ ok: false, reason: 'required' });
    expect(answerCurrentQuestion(atProduct, 'nonsense')).toEqual({ ok: false, reason: 'invalid_choice' });
    // a valid choice advances
    const r = answerCurrentQuestion(atProduct, 'sorbet');
    expect(r.ok).toBe(true);
    if (r.ok) expect(currentQuestion(r.state)?.id).toBe('serving_temperature');
  });

  it('3. back and reset work', () => {
    let s = answer(startAssistantFlow(), 'lody');
    s = answer(s, 'standard_gelato');
    expect(currentQuestion(s)?.id).toBe('serving_temperature');
    const backOne = goBack(s);
    expect(currentQuestion(backOne)?.id).toBe('product_type');
    expect(goBack(startAssistantFlow()).currentStepIndex).toBe(0); // never before first
    expect(resetAssistantFlow()).toEqual(initialAssistantState());
    expect(resetAssistantFlow().started).toBe(false);
  });

  it('4. a missing required answer blocks completion', () => {
    const partial = answer(startAssistantFlow(), 'czekoladowe'); // only the optional opener
    expect(isIntentComplete(partial)).toBe(false);
    const missing = missingRequiredSteps(partial);
    expect(missing).toEqual([
      'product_type',
      'serving_temperature',
      'batch_size',
      'texture',
      'sweetness',
      'goal',
    ]);
    const draft = buildIntentDraft(partial);
    expect(draft.complete).toBe(false);
    expect(draft.missingRequired.length).toBeGreaterThan(0);
  });

  it('5–11. collects profile, temperature, batch, flavor, texture, sweetness, restrictions', () => {
    const draft = buildIntentDraft(fullRun());
    expect(draft.intent.productProfile).toBe('standard_gelato'); // 5
    expect(draft.intent.servingTemperatureC).toBe(-12); // 6
    expect(draft.batchSizeG).toBe(5000); // 7
    expect(draft.intent.flavorText).toBe('pistacja'); // 8 (main flavor wins)
    expect(draft.intent.flavorGroup).toBe('nut');
    expect(draft.intent.texturePreference).toBe('soft'); // 9
    expect(draft.intent.sweetnessPreference).toBe('balanced'); // 10
    expect(draft.restrictions).toEqual(['lactose_free']); // 11
    expect(draft.intent.dietary.lactoseFree).toBe(true);
    expect(draft.complete).toBe(true);
  });

  it('main flavor is optional — the opener is the fallback flavor text', () => {
    const draft = buildIntentDraft(fullRun({ opening: 'truskawkowe', main_flavor: '' }));
    expect(draft.intent.flavorText).toBe('truskawkowe');
    expect(draft.intent.flavorGroup).toBe('fruit');
  });

  it('12–14. goal maps to the Integration-Flow branch', () => {
    expect(buildIntentDraft(fullRun({ goal: 'recipe_design' })).branchContext).toBe('recipe_design'); // 12
    const rescue = buildIntentDraft(fullRun({ goal: 'actual_batch_rescue' }));
    expect(rescue.branchContext).toBe('actual_batch_rescue'); // 13
    expect(buildIntentDraft(fullRun({ goal: 'stock_shortage' })).branchContext).toBe('stock_shortage'); // 14
    // optimization stays a design-context request, flagged
    const opt = buildIntentDraft(fullRun({ goal: 'optimization' }));
    expect(opt.branchContext).toBe('recipe_design');
    expect(opt.wantsOptimization).toBe(true);
  });

  it('custom batch is captured as null (set later in the builder), not invented', () => {
    const draft = buildIntentDraft(fullRun({ batch_size: 'custom' }));
    expect(draft.batchSizeG).toBeNull();
    expect(draft.notes).toContain('assistant.batch.custom_set_in_builder');
  });

  it('15. the draft is deterministic', () => {
    const s = fullRun();
    expect(JSON.stringify(buildIntentDraft(s))).toBe(JSON.stringify(buildIntentDraft(s)));
  });

  it('16. building the draft and answering never mutate the input state', () => {
    const s = fullRun({ goal: 'recipe_design' });
    const snapshot = JSON.stringify(s);
    buildIntentDraft(s);
    answerCurrentQuestion(s, 'noop'); // past the end — no_current_question, no mutation
    goBack(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('validateAnswer is pure and covers each kind', () => {
    const [opening, product, , , , , , restrictions] = ASSISTANT_QUESTIONS;
    expect(validateAnswer(opening!, '')).toBeNull(); // optional text
    expect(validateAnswer(product!, '')).toBe('required');
    expect(validateAnswer(product!, 'sorbet')).toBeNull();
    expect(validateAnswer(product!, 'bad')).toBe('invalid_choice');
    expect(validateAnswer(restrictions!, [])).toBeNull(); // optional multi
    expect(validateAnswer(restrictions!, ['vegan'])).toBeNull();
    expect(validateAnswer(restrictions!, ['bad'])).toBe('invalid_choice');
  });
});

describe('assistant PL copy — honesty rules', () => {
  const questionStrings = ASSISTANT_QUESTIONS.flatMap((q) => [
    q.prompt,
    q.helper ?? '',
    ...(q.choices?.map((c) => c.label) ?? []),
  ]);
  const copyStrings = [
    A.introTitle,
    A.introBody,
    A.startCta,
    A.draftReadyTitle,
    A.draftReadyBody,
    A.incomplete,
    A.demoGramsNote,
    A.noSaveNote,
    A.noRecipeChangeNote,
    A.deterministicNote,
  ];
  const all = [...questionStrings, ...copyStrings];

  it('17. never claims "zapisano" (nothing is saved here)', () => {
    for (const s of all) expect(/zapisano/i.test(s), s).toBe(false);
  });

  it('18. never claims "zastosowano" / "nałożono" (nothing is applied)', () => {
    for (const s of all) expect(/zastosowano|nałożono/i.test(s), s).toBe(false);
  });

  it('19. never makes a fake recipe-created claim — it says "szkic"', () => {
    for (const s of all) {
      expect(/utworzono recepturę|receptura została utworzona|recepturę utworzono/i.test(s), s).toBe(false);
    }
    expect(A.draftReadyTitle).toMatch(/szkic/i);
    expect(A.draftReadyBody).toMatch(/nie tworzy i nie zmienia receptury/i);
  });

  it('20. Demo/Free copy points exact grams to Pro and never promises visible grams', () => {
    expect(A.demoGramsNote).toMatch(/dostępne w Pro/);
    expect(/widzisz dokładne/i.test(A.demoGramsNote)).toBe(false);
  });

  it('21. incomplete copy asks the user to complete answers, never guesses', () => {
    expect(A.incomplete).toMatch(/Uzupełnij/);
    for (const s of all) expect(/zgadn|na oko|domyśl(imy|im)/i.test(s), s).toBe(false);
  });

  it('the whole assistant registry is really Polish (diacritics present)', () => {
    expect(copyStrings.join(' ')).toMatch(/[ąćęłńóśźż]/);
  });

  it('deterministic note states there is no language model', () => {
    expect(A.deterministicNote).toMatch(/bez modelu językowego/i);
  });
});

describe('assistant boundary — pure, no LLM / DB / Mapper / persistence', () => {
  const HERE = import.meta.dirname;
  const sources = [
    'conversationalAssistantFlow.ts',
    'StudioAssistantShell.tsx',
    'studioFlowCopy.ts',
  ].map((f) =>
    readFileSync(join(HERE, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, ''),
  );

  it('22–25. no Supabase / Mapper / LLM imports, no DB write path', () => {
    for (const src of sources) {
      expect(/@\/services\/|@\/lib\/|@\/data\/products|mapper_basement|service_role|supabase/i.test(src)).toBe(false);
      expect(/openai|anthropic|\bllm\b|gpt-|langchain/i.test(src)).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
    }
  });

  it('26–29. no recipe-save / inventory / PAC-POD path, no CONFIG_VERSION touch', () => {
    for (const src of sources) {
      expect(/saveRecipe\(|persistRecipe|localStorage|sessionStorage/.test(src)).toBe(false);
      expect(/pi_calculated|pac_value|pod_value|updateStock|writeInventory/.test(src)).toBe(false);
      expect(/CONFIG_VERSION|ENGINE_VERSION/.test(src)).toBe(false);
    }
  });
});

describe('StudioAssistantShell — renders (read-only, no save/apply)', () => {
  const html = renderToStaticMarkup(<StudioAssistantShell />);

  it('30. renders the PL intro and Start affordance, no save/apply controls', () => {
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text).toContain(A.introTitle);
    expect(text).toContain(A.startCta);
    // deterministic shell — no save/apply wording anywhere in the initial render
    expect(/zapisz|zastosuj|apply|save/i.test(text)).toBe(false);
  });
});
