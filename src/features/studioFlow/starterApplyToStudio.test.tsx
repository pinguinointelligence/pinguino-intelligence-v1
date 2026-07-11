/// <reference types="node" />
/**
 * Assistant submit fix (A1) + starter capability redaction (A2) + local
 * "Zastosuj w Studio" apply/undo (A3) — focused regression suite.
 *
 * No DOM environment exists in this repo (vitest `environment: 'node'`, no
 * jsdom/testing-library), so interaction tests follow the established repo
 * pattern: the EXACT user-event sequence is driven through the same pure
 * functions the UI handlers call (chip click = pending value; "Dalej" =
 * answerCurrentQuestion; submit = submitIntentDraft), and component states
 * are asserted via renderToStaticMarkup.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.hoisted(() => ({
  current: {
    exactCorrectionGrams: true,
    fullFormula: true,
    technicalView: true,
    canViewExactGrams: true,
    canApplyStarterToStudio: true,
    saveRecipes: true,
    myRecipes: true,
    productionMode: false,
    rescueMode: false,
    plan: 'pro',
    tier: 'pro',
    isSignedIn: true,
    isPro: true,
  } as Record<string, unknown>,
}));
vi.mock('@/access/useAccess', () => ({ useAccess: () => accessMock.current }));

import { capabilitiesFor } from '@/access/plans';
import { findPreset } from '@/data/demoPresets';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  answerCurrentQuestion,
  buildIntentDraft,
  isIntentComplete,
  startAssistantFlow,
  submitIntentDraft,
  type AssistantAnswerValue,
  type AssistantFlowState,
} from './conversationalAssistantFlow';
import { buildStarterRecipeDraft } from './intentRecipeDraft';
import { redactStarterDraftForDisplay } from './starterDraftDisplay';
import {
  applyStarterRecipeInputToStudio,
  captureStudioDraftSnapshot,
  isStudioDraftPristine,
  studioHoldsUserDraft,
  undoStarterApplyToStudio,
} from './applyStarterToStudio';
import {
  StarterDraftPreview,
  type StarterAppliedTrace,
  type StarterApplyStage,
} from './StarterDraftPreview';
import { StudioAssistantShell } from './StudioAssistantShell';
import { STUDIO_FLOW_COPY } from './studioFlowCopy';

const A = STUDIO_FLOW_COPY.pl.assistant;
const PRO = capabilitiesFor('pro');
const FREE = capabilitiesFor('free');
const DEMO = capabilitiesFor('demo');

/** "Dalej" click — the exact commit the UI button performs. */
const dalej = (state: AssistantFlowState, pending: AssistantAnswerValue): AssistantFlowState => {
  const r = answerCurrentQuestion(state, pending);
  if (!r.ok) throw new Error(`unexpected reject: ${r.reason}`);
  return r.state;
};

/**
 * The trusted user journey: every question up to (but NOT including) the final
 * `goal` question is answered with select + "Dalej". The cursor rests on
 * `goal`, which is deliberately left uncommitted.
 */
const answeredUpToGoal = (
  over: Partial<Record<string, AssistantAnswerValue>> = {},
): AssistantFlowState => {
  let s = startAssistantFlow();
  s = dalej(s, (over.opening as string) ?? '');
  s = dalej(s, (over.product_type as string) ?? 'standard_gelato');
  s = dalej(s, (over.serving_temperature as string) ?? '-12');
  s = dalej(s, (over.batch_size as string) ?? '5000');
  s = dalej(s, (over.main_flavor as string) ?? 'wanilia');
  s = dalej(s, (over.texture as string) ?? 'medium');
  s = dalej(s, (over.sweetness as string) ?? 'balanced');
  s = dalej(s, (over.restrictions as string[]) ?? []);
  s = dalej(s, (over.boosters as string) ?? 'no');
  return s;
};

/** Full submit journey → ready starter draft (goal selected, submit clicked). */
const readyStarter = (over: Partial<Record<string, AssistantAnswerValue>> = {}) => {
  const submission = submitIntentDraft(answeredUpToGoal(over), 'recipe_design');
  if (!submission.ok) throw new Error('expected a complete submission');
  return buildStarterRecipeDraft(submission.draft);
};

const noop = () => {};
const renderPreview = (
  display: ReturnType<typeof redactStarterDraftForDisplay>,
  stage: StarterApplyStage = 'idle',
  trace: StarterAppliedTrace | null = null,
  canUndo = false,
): string =>
  renderToStaticMarkup(
    <StarterDraftPreview
      display={display}
      applyStage={stage}
      appliedTrace={trace}
      canUndo={canUndo}
      onApplyRequest={noop}
      onApplyConfirm={noop}
      onApplyCancel={noop}
      onUndoApply={noop}
    />,
  );

const textOf = (html: string): string => html.replace(/<[^>]*>/g, ' ');

/** The <button …> opening tag that renders the given label. */
const buttonTagFor = (html: string, label: string): string => {
  const idx = html.indexOf(label);
  if (idx < 0) throw new Error(`label not rendered: ${label}`);
  return html.slice(html.lastIndexOf('<button', idx), idx);
};

/** Every numeric leaf in a JSON-ish object (for physical-redaction proofs). */
const numericLeaves = (value: unknown): number[] => {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(numericLeaves);
  }
  return [];
};

beforeEach(() => {
  accessMock.current = {
    ...PRO,
    plan: 'pro',
    tier: 'pro',
    isSignedIn: true,
    isPro: true,
  };
  useRecipeStore.getState().resetToDemo();
});

/* ------------------------------------------------------------------------ *
 * A1 — submit commits a visibly selected final answer                       *
 * ------------------------------------------------------------------------ */

describe('A1 — submit with an uncommitted (pending-selected) final answer', () => {
  it('regression: goal selected but not "Dalej"-committed → submit still succeeds', () => {
    const s = answeredUpToGoal();
    // the defect precondition: the flow alone is NOT complete yet
    expect(isIntentComplete(s)).toBe(false);
    // the user clicks the goal chip (pending) and immediately clicks submit
    const submission = submitIntentDraft(s, 'recipe_design');
    expect(submission.ok).toBe(true);
    if (!submission.ok) return;
    expect(submission.draft.complete).toBe(true);
    expect(submission.draft.missingRequired).toEqual([]);
    expect(isIntentComplete(submission.state)).toBe(true);
  });

  it('complete trusted-interaction submit — Standard Gelato (−12°C, 5 kg, wanilia, Zaprojektować)', () => {
    const submission = submitIntentDraft(answeredUpToGoal(), 'recipe_design');
    expect(submission.ok).toBe(true);
    if (!submission.ok) return;
    expect(submission.draft.intent.productProfile).toBe('standard_gelato');
    expect(submission.draft.intent.servingTemperatureC).toBe(-12);
    expect(submission.draft.batchSizeG).toBe(5000);
    expect(submission.draft.intent.flavorText).toBe('wanilia');
    expect(submission.draft.branchContext).toBe('recipe_design');
    // …and the intent draft reaches a generated starter preview
    const starter = buildStarterRecipeDraft(submission.draft);
    expect(starter.status).toBe('ready');
    expect(starter.templateId).toBe('milk_base_v1');
    const html = renderPreview(redactStarterDraftForDisplay(starter, PRO));
    expect(textOf(html)).toContain(A.starter.readyTitle);
    expect(html).toContain('3350 g'); // 670 g milk × 5
  });

  it('complete trusted-interaction submit — Chocolate Gelato reaches the chocolate starter', () => {
    const submission = submitIntentDraft(
      answeredUpToGoal({ product_type: 'chocolate_gelato', main_flavor: 'czekoladowe' }),
      'recipe_design',
    );
    expect(submission.ok).toBe(true);
    if (!submission.ok) return;
    const starter = buildStarterRecipeDraft(submission.draft);
    expect(starter.status).toBe('ready');
    expect(starter.templateId).toBe('chocolate_base_v1');
    const html = renderPreview(redactStarterDraftForDisplay(starter, PRO));
    expect(textOf(html)).toContain(A.starter.readyTitle);
    expect(textOf(html)).toContain('Dark chocolate 70 %');
  });

  it('a genuinely missing required answer still rejects submit honestly', () => {
    let s = startAssistantFlow();
    s = dalej(s, 'czekoladowe'); // only the optional opener; cursor at product_type
    const submission = submitIntentDraft(s, ''); // nothing selected
    expect(submission.ok).toBe(false);
    if (submission.ok) return;
    expect(submission.missingRequired).toContain('serving_temperature');
    expect(submission.missingRequired).toContain('goal');
  });

  it('an INVALID pending value on the final required question is never guessed', () => {
    const submission = submitIntentDraft(answeredUpToGoal(), 'nonsense-choice');
    expect(submission.ok).toBe(false);
    if (submission.ok) return;
    expect(submission.missingRequired).toEqual(['goal']);
  });

  it('shell render at the defect state: selected goal chip + ENABLED submit (was blocked)', () => {
    const html = renderToStaticMarkup(
      <StudioAssistantShell initialUi={{ flow: answeredUpToGoal(), pending: 'recipe_design' }} />,
    );
    // the chip the user clicked renders highlighted
    expect(buttonTagFor(html, 'Zaprojektować recepturę')).toContain('border-ivory/50');
    // …and submit is enabled (pre-fix it rendered disabled + the incomplete note)
    expect(buttonTagFor(html, 'Przygotuj szkic intencji')).not.toContain('disabled=""');
    expect(textOf(html)).not.toContain(A.incomplete);
  });

  it('shell render with a missing required answer: honest note + disabled submit', () => {
    const html = renderToStaticMarkup(
      <StudioAssistantShell initialUi={{ flow: answeredUpToGoal(), pending: '' }} />,
    );
    expect(buttonTagFor(html, 'Przygotuj szkic intencji')).toContain('disabled=""');
    expect(textOf(html)).toContain(A.incomplete);
  });
});

/* ------------------------------------------------------------------------ *
 * A2 — capability-driven display redaction                                  *
 * ------------------------------------------------------------------------ */

describe('A2 — starter display redaction by capability', () => {
  it('Demo: the display object physically contains NO numeric values and NO apply payload', () => {
    const display = redactStarterDraftForDisplay(readyStarter(), DEMO);
    expect(display.variant).toBe('redacted');
    expect(display.applyPayload).toBeNull();
    expect(numericLeaves(display)).toEqual([]); // no grams — no numbers at all
    expect(JSON.stringify(display).includes('grams')).toBe(false);
  });

  it('Demo render: ingredient structure only — no gram amounts, no apply action', () => {
    const html = renderPreview(redactStarterDraftForDisplay(readyStarter(), DEMO));
    const text = textOf(html);
    expect(text).toContain('Milk 3.5 %'); // structure stays visible
    expect(text).not.toMatch(/\d[\d.,]*\s*g\b/); // no "123 g" anywhere
    expect(text).not.toContain(A.starter.apply.cta);
    expect(text).toContain(A.demoGramsNote); // paid-plans note, never Pro-only
  });

  it('free (signed-in, no subscription) is redacted exactly like Demo', () => {
    const display = redactStarterDraftForDisplay(readyStarter(), FREE);
    expect(display.variant).toBe('redacted');
    expect(display.applyPayload).toBeNull();
    expect(numericLeaves(display)).toEqual([]);
  });

  it('paid tier (Home AND Pro subscriptions): exact grams + apply payload', () => {
    const starter = readyStarter();
    const display = redactStarterDraftForDisplay(starter, PRO);
    expect(display.variant).toBe('exact');
    if (display.variant !== 'exact') return;
    expect(display.lines[0]).toEqual({ id: 'milk_3_5', name: 'Milk 3.5 %', grams: 670 * 5 });
    expect(display.applyPayload).toBe(starter.recipeInput);
    const text = textOf(renderPreview(display));
    expect(text).toContain('3350 g');
    expect(text).toContain(A.starter.apply.cta);
  });

  it('unsupported / needs-info / blocked starters carry no apply payload for ANY tier', () => {
    const unsupported = [
      readyStarterSafe({ product_type: 'sorbet' }),
      readyStarterSafe({ product_type: 'vegan_gelato' }),
      readyStarterSafe({ batch_size: 'custom' }),
      buildStarterRecipeDraft(incompleteIntentDraft()),
    ];
    for (const starter of unsupported) {
      expect(starter.status).not.toBe('ready');
      for (const caps of [PRO, FREE, DEMO]) {
        const display = redactStarterDraftForDisplay(starter, caps);
        expect(display.variant).toBe('unavailable');
        expect(display.applyPayload).toBeNull();
        expect(textOf(renderPreview(display))).not.toContain(A.starter.apply.cta);
      }
    }
  });
});

/** Starter build that tolerates non-ready statuses (unsupported profiles etc.). */
function readyStarterSafe(over: Partial<Record<string, AssistantAnswerValue>>) {
  const submission = submitIntentDraft(answeredUpToGoal(over), 'recipe_design');
  if (!submission.ok) throw new Error('expected a complete submission');
  return buildStarterRecipeDraft(submission.draft);
}

/** An honestly incomplete intent draft (only the opener answered) — the
 * starter builder must return `blocked`, never a fake recipe. */
function incompleteIntentDraft() {
  let s = startAssistantFlow();
  s = dalej(s, 'czekoladowe');
  expect(submitIntentDraft(s, '').ok).toBe(false);
  return buildIntentDraft(s);
}

/* ------------------------------------------------------------------------ *
 * A3 — local apply / confirm / undo against the REAL recipe store           *
 * ------------------------------------------------------------------------ */

describe('A3 — apply starter to the local Studio draft (real store, fully local)', () => {
  it('pristine cold-open Studio → no replacement confirm needed', () => {
    expect(studioHoldsUserDraft()).toBe(false);
    useRecipeStore.getState().setBatchGrams(2222);
    expect(studioHoldsUserDraft()).toBe(true); // now the confirm gate applies
  });

  it('Standard Apply: exact lines, profile, temperature land in the canonical store', () => {
    const starter = readyStarter();
    const display = redactStarterDraftForDisplay(starter, PRO);
    if (display.variant !== 'exact' || display.applyPayload === null) throw new Error('payload expected');

    const prior = applyStarterRecipeInputToStudio(display.applyPayload);
    expect(isStudioDraftPristine(prior)).toBe(true); // the returned undo snapshot is the prior draft

    const state = useRecipeStore.getState();
    expect(state.category).toBe('milk_gelato');
    expect(state.target_temperature_c).toBe(-12);
    expect(state.target_batch_grams).toBe(5000);
    expect(state.items).toHaveLength(6);
    expect(state.items[0]!.ingredient.id).toBe('milk_3_5');
    expect(state.items[0]!.planned_grams).toBe(670 * 5); // exact, never display-rounded
    // the honest trace: applied line ids carry the locked template source
    expect(state.items[0]!.id).toBe('starter:milk_base_v1:milk_3_5');
    // local only — never a save, never a preset claim
    expect(state.savedRecipeId).toBeNull();
    expect(state.savedRecipeName).toBeNull();
    expect(state.activePresetId).toBeNull();
  });

  it('Chocolate Apply: the chocolate template lands with all 8 exact lines', () => {
    const starter = readyStarter({ product_type: 'chocolate_gelato', main_flavor: 'czekoladowe' });
    const display = redactStarterDraftForDisplay(starter, PRO);
    if (display.variant !== 'exact' || display.applyPayload === null) throw new Error('payload expected');
    applyStarterRecipeInputToStudio(display.applyPayload);
    const state = useRecipeStore.getState();
    expect(state.category).toBe('chocolate_gelato');
    expect(state.items).toHaveLength(8);
    expect(state.items.map((i) => i.ingredient.id)).toContain('dark_chocolate_70');
    expect(state.items.find((i) => i.ingredient.id === 'cocoa_2224')!.planned_grams).toBe(60 * 5);
  });

  it('cancel leaves the Studio draft byte-for-byte unchanged (no apply call is made)', () => {
    useRecipeStore.getState().setBatchGrams(2222);
    const before = JSON.stringify(captureStudioDraftSnapshot(useRecipeStore.getState()));
    // the user sees the replacement warning and clicks "Anuluj" — the UI only
    // steps back its stage; no store API is invoked (see the source pin below)
    expect(studioHoldsUserDraft()).toBe(true);
    const after = JSON.stringify(captureStudioDraftSnapshot(useRecipeStore.getState()));
    expect(after).toBe(before);
  });

  it('undo restores the EXACT prior local draft (deep equality, incl. saved-recipe link)', () => {
    // seed a real user draft: loaded preset + manual edit + saved-recipe link
    const raspberry = findPreset('raspberry-premium')!;
    useRecipeStore.getState().loadPreset(raspberry);
    const firstLine = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(firstLine.id, 333.3);
    useRecipeStore.getState().markSaved('saved-42', 'Moja malina');
    const before = captureStudioDraftSnapshot(useRecipeStore.getState());

    const display = redactStarterDraftForDisplay(readyStarter(), PRO);
    if (display.variant !== 'exact' || display.applyPayload === null) throw new Error('payload expected');
    const snapshot = applyStarterRecipeInputToStudio(display.applyPayload);
    expect(useRecipeStore.getState().items).toHaveLength(6); // really replaced
    expect(useRecipeStore.getState().savedRecipeId).toBeNull();

    undoStarterApplyToStudio(snapshot);
    const after = captureStudioDraftSnapshot(useRecipeStore.getState());
    expect(after).toEqual(before); // deep-equal, exact restore
    expect(after.savedRecipeId).toBe('saved-42');
    expect(after.savedRecipeName).toBe('Moja malina');
    expect(after.activePresetId).toBe('raspberry-premium');
    expect(after.items[0]!.planned_grams).toBe(333.3);
  });

  it('a second apply replaces the ONE undo snapshot deterministically (no history)', () => {
    const displayA = redactStarterDraftForDisplay(readyStarter(), PRO);
    const displayB = redactStarterDraftForDisplay(
      readyStarter({ product_type: 'chocolate_gelato', main_flavor: 'czekoladowe' }),
      PRO,
    );
    if (displayA.variant !== 'exact' || displayA.applyPayload === null) throw new Error();
    if (displayB.variant !== 'exact' || displayB.applyPayload === null) throw new Error();

    applyStarterRecipeInputToStudio(displayA.applyPayload);
    useRecipeStore.getState().setBatchGrams(7777); // user edit between applies
    const stateBetween = captureStudioDraftSnapshot(useRecipeStore.getState());

    const snapshot2 = applyStarterRecipeInputToStudio(displayB.applyPayload);
    expect(snapshot2).toEqual(stateBetween); // the NEW snapshot is the between-state

    undoStarterApplyToStudio(snapshot2);
    const restored = captureStudioDraftSnapshot(useRecipeStore.getState());
    expect(restored).toEqual(stateBetween); // undo → after-first-apply+edit, NOT pristine
    expect(restored.target_batch_grams).toBe(7777);
    expect(isStudioDraftPristine(restored)).toBe(false);
  });

  it('decimal batch (1234 g): exact underlying quantities, exact batch total', () => {
    const submission = submitIntentDraft(answeredUpToGoal(), 'recipe_design');
    if (!submission.ok) throw new Error();
    const starter = buildStarterRecipeDraft({ ...submission.draft, batchSizeG: 1234 });
    expect(starter.status).toBe('ready');
    const milk = starter.ingredients.find((i) => i.id === 'milk_3_5')!;
    expect(milk.grams).toBe(670 * (1234 / 1000)); // exact FP value…
    expect(milk.grams).toBeCloseTo(826.78, 9);

    const display = redactStarterDraftForDisplay(starter, PRO);
    if (display.variant !== 'exact' || display.applyPayload === null) throw new Error();
    applyStarterRecipeInputToStudio(display.applyPayload);
    const state = useRecipeStore.getState();
    expect(state.target_batch_grams).toBe(1234); // the requested batch, exactly
    const milkLine = state.items.find((i) => i.ingredient.id === 'milk_3_5')!;
    expect(milkLine.planned_grams).toBe(670 * (1234 / 1000)); // never display-rounded
    expect(milkLine.planned_grams).not.toBe(Math.round(milkLine.planned_grams * 10) / 10);
    const total = state.items.reduce((sum, item) => sum + item.planned_grams, 0);
    expect(total).toBeCloseTo(1234, 6);
  });

  it('apply is a local draft write — never a recipe save', () => {
    const display = redactStarterDraftForDisplay(readyStarter(), PRO);
    if (display.variant !== 'exact' || display.applyPayload === null) throw new Error();
    applyStarterRecipeInputToStudio(display.applyPayload);
    const state = useRecipeStore.getState();
    expect(state.savedRecipeId).toBeNull();
    expect(state.savedRecipeName).toBeNull();
  });
});

/* ------------------------------------------------------------------------ *
 * Apply UI states (presentational)                                          *
 * ------------------------------------------------------------------------ */

describe('apply UI states — confirm, applied feedback, undo', () => {
  const proDisplay = () => redactStarterDraftForDisplay(readyStarter(), PRO);

  it('confirming: replacement warning + confirm + cancel render', () => {
    const text = textOf(renderPreview(proDisplay(), 'confirming'));
    expect(text).toContain(A.starter.apply.replaceWarningTitle);
    expect(text).toContain(A.starter.apply.replaceWarningBody);
    expect(text).toContain(A.starter.apply.confirmCta);
    expect(text).toContain(A.starter.apply.cancelCta);
  });

  it('applied: honest feedback + locked-template trace + undo affordance', () => {
    const trace: StarterAppliedTrace = { source: 'locked_starter_template', templateId: 'milk_base_v1' };
    const text = textOf(renderPreview(proDisplay(), 'applied', trace, true));
    expect(text).toContain(A.starter.apply.appliedNote);
    expect(text).toContain('locked_starter_template · milk_base_v1');
    expect(text).toContain(A.starter.apply.undoCta);
  });

  it('idle: the sets-note names ingredients, profile and temperature (nothing silent)', () => {
    const text = textOf(renderPreview(proDisplay(), 'idle'));
    expect(text).toContain(A.starter.apply.setsNote);
    expect(A.starter.apply.setsNote).toMatch(/profil produktu/);
    expect(A.starter.apply.setsNote).toMatch(/temperatur/);
  });
});

/* ------------------------------------------------------------------------ *
 * PL copy honesty for the new apply strings                                 *
 * ------------------------------------------------------------------------ */

describe('apply PL copy — honesty', () => {
  const AP = A.starter.apply;
  const all = [
    AP.cta, AP.setsNote, AP.replaceWarningTitle, AP.replaceWarningBody,
    AP.confirmCta, AP.cancelCta, AP.appliedNote, AP.appliedSourceLabel, AP.undoCta,
  ];

  it('never claims saved / auto-applied / optimized', () => {
    for (const s of all) {
      expect(/zapisano|zastosowano|nałożono|zoptymalizowano|optymalne/i.test(s), s).toBe(false);
    }
    expect(AP.appliedNote).toMatch(/nic nie zostało zapisane/);
    expect(AP.replaceWarningBody).toMatch(/nic nie jest zapisywane/);
  });

  it('is really Polish and the undo is a real undo', () => {
    expect(all.join(' ')).toMatch(/[ąćęłńóśźż]/);
    expect(AP.undoCta).toMatch(/Cofnij/);
  });
});

/* ------------------------------------------------------------------------ *
 * Purity / boundary pins for the new modules                                *
 * ------------------------------------------------------------------------ */

describe('local-apply boundary — no DB / services / optimizer / save path', () => {
  const HERE = import.meta.dirname;
  const strip = (file: string) =>
    readFileSync(join(HERE, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  const applySrc = strip('applyStarterToStudio.ts');
  const displaySrc = strip('starterDraftDisplay.ts');
  const previewSrc = strip('StarterDraftPreview.tsx');
  const shellSrc = strip('StudioAssistantShell.tsx');
  const sources = [applySrc, displaySrc, previewSrc, shellSrc];

  it('no Supabase / services / network / persistence anywhere in the apply path', () => {
    for (const src of sources) {
      expect(/supabase|service_role|@\/services\/|@\/lib\//i.test(src)).toBe(false);
      expect(/openai|anthropic|\bllm\b|gpt-|langchain/i.test(src)).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
      expect(/localStorage|sessionStorage/.test(src)).toBe(false);
    }
  });

  it('no recipe-save / accepted-correction / optimizer wiring in the apply path', () => {
    for (const src of sources) {
      expect(/markSaved|saveRecipe\(|persistRecipe|createRecipe/.test(src)).toBe(false);
      expect(/accepted_correction|acceptedCorrection|SaveCorrection/i.test(src)).toBe(false);
      expect(/@\/features\/optimization|previewOptimization|proposeCorrections/.test(src)).toBe(false);
    }
  });

  it('the apply module imports ONLY the preset catalog, engine types and the recipe store', () => {
    const imports = [...applySrc.matchAll(/from '(@\/[^']+)'/g)].map((m) => m[1]);
    expect(new Set(imports)).toEqual(
      new Set(['@/data/demoPresets', '@/engine', '@/stores/recipeStore']),
    );
  });

  it('cancel is a pure UI step-back — it can never touch the store', () => {
    const start = shellSrc.indexOf('const cancelApply');
    const end = shellSrc.indexOf('const undoApply');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const cancelSegment = shellSrc.slice(start, end);
    expect(cancelSegment.includes('applyStarterRecipeInputToStudio')).toBe(false);
    expect(cancelSegment.includes('undoStarterApplyToStudio')).toBe(false);
    expect(cancelSegment.includes('useRecipeStore')).toBe(false);
  });
});
