import { describe, expect, it } from 'vitest';
import {
  availableActions,
  beginIntake,
  cancelIntake,
  closeSheet,
  completeIntakeReturn,
  createResolutionState,
  createResolutionWorkingCopy,
  ingredientResolutionSummary,
  openSheet,
  pickProduct,
  recordSubstitutionAction,
  resolutionForLine,
  searchCatalogue,
  selectForm,
  showAttachedCandidates,
  type CreateResolutionInput,
} from './ingredientResolution';
import { requiresFormSelection, NOT_ENGINE_READY_MESSAGE } from './contracts';
import {
  CATALOGUE_FIXTURES,
  RESOLUTION_LINE_SEEDS,
  candidatesFromCatalogue,
  pickableProduct,
} from './__fixtures__/resolutionFixtures';

const seed = (): CreateResolutionInput => ({
  workingRecipeId: 'wc-1',
  lines: RESOLUTION_LINE_SEEDS,
});

describe('createResolutionState — requirement lines start unresolved', () => {
  it('every line begins unresolved; the summary lists all of them', () => {
    const s = createResolutionState(seed());
    const summary = ingredientResolutionSummary(s);
    expect(summary.allResolved).toBe(false);
    expect(summary.unresolvedCount).toBe(RESOLUTION_LINE_SEEDS.length);
    expect(summary.unresolvedNames).toContain('Czekolada');
    expect(summary.unresolvedNames).toContain('Bazylia');
    expect(s.engineRerunToken).toBe(0);
  });

  it('auto-detects the fresh/herb form requirement (Bazylia yes, Czekolada no)', () => {
    expect(requiresFormSelection('Bazylia')).toBe(true);
    expect(requiresFormSelection('Mięta')).toBe(true);
    expect(requiresFormSelection('Czekolada')).toBe(false);
    const s = createResolutionState(seed());
    expect(resolutionForLine(s, 'flavor:basil')?.line.requiresForm).toBe(true);
    expect(resolutionForLine(s, 'flavor:chocolate')?.line.requiresForm).toBe(false);
  });
});

describe('sheet open/close + fresh-herb form step', () => {
  it('opening a herb line enters the FORM step first', () => {
    const s = openSheet(createResolutionState(seed()), 'flavor:basil');
    expect(s.activeLineId).toBe('flavor:basil');
    expect(resolutionForLine(s, 'flavor:basil')?.state).toBe('choosing_form');
    // no product actions while the form is unset
    expect(availableActions(resolutionForLine(s, 'flavor:basil')!)).toEqual([]);
  });

  it('a non-herb line opens straight to the action list', () => {
    const s = openSheet(createResolutionState(seed()), 'flavor:chocolate');
    expect(resolutionForLine(s, 'flavor:chocolate')?.state).toBe('unresolved');
  });

  it('selecting a form moves to the action list and records the form (no dose invented)', () => {
    let s = openSheet(createResolutionState(seed()), 'flavor:basil');
    s = selectForm(s, 'flavor:basil', 'suszona');
    const l = resolutionForLine(s, 'flavor:basil')!;
    expect(l.state).toBe('unresolved');
    expect(l.form).toBe('suszona');
    expect(l.engineValues).toBeNull();
    expect(availableActions(l)).toContain('search_catalogue');
  });

  it('closeSheet clears the active line but keeps per-line state', () => {
    const s = closeSheet(openSheet(createResolutionState(seed()), 'flavor:chocolate'));
    expect(s.activeLineId).toBeNull();
  });
});

describe('action availability', () => {
  it('offers `choose_candidate` only when the line has attached candidates', () => {
    const s = createResolutionState(seed());
    expect(availableActions(resolutionForLine(s, 'flavor:chocolate')!)).toContain('choose_candidate');
    expect(availableActions(resolutionForLine(s, 'flavor:whisky')!)).not.toContain('choose_candidate');
  });
});

describe('candidate + catalogue search', () => {
  it('showAttachedCandidates surfaces the line\'s attached candidates', () => {
    let s = createResolutionState(seed());
    const candidates = candidatesFromCatalogue(['PR-FIX-CHOC-DARK', 'PR-FIX-CHOC-MILK']);
    s = showAttachedCandidates(s, 'flavor:chocolate', candidates);
    const l = resolutionForLine(s, 'flavor:chocolate')!;
    expect(l.state).toBe('searching');
    expect(l.searchResults?.map((c) => c.productId)).toEqual(['PR-FIX-CHOC-DARK', 'PR-FIX-CHOC-MILK']);
  });

  it('searchCatalogue reuses the honest name search', () => {
    let s = createResolutionState(seed());
    s = searchCatalogue(s, 'flavor:chocolate', 'czekolada', CATALOGUE_FIXTURES);
    const l = resolutionForLine(s, 'flavor:chocolate')!;
    expect(l.state).toBe('searching');
    expect(l.searchResults?.map((c) => c.productId).sort()).toEqual(['PR-FIX-CHOC-DARK', 'PR-FIX-CHOC-MILK']);
  });
});

describe('delegated intake (scan / manual add)', () => {
  it('beginIntake parks the line awaiting the save return with an honest handoff', () => {
    const s = beginIntake(createResolutionState(seed()), 'flavor:whisky', 'scan');
    const l = resolutionForLine(s, 'flavor:whisky')!;
    expect(l.state).toBe('awaiting_intake');
    expect(l.intakeHandoff?.mode).toBe('scan');
    expect(l.intakeHandoff?.note).toContain('OCR');
  });

  it('cancelIntake returns the line to the action list', () => {
    let s = beginIntake(createResolutionState(seed()), 'flavor:whisky', 'manual');
    s = cancelIntake(s, 'flavor:whisky');
    expect(resolutionForLine(s, 'flavor:whisky')?.state).toBe('unresolved');
  });

  it('a successful intake return runs the SAME gate, preserving other lines', () => {
    let s = createResolutionState(seed());
    // resolve chocolate first, then intake-return whisky
    s = pickProduct(s, 'flavor:chocolate', pickableProduct('PR-FIX-CHOC-DARK'));
    s = beginIntake(s, 'flavor:whisky', 'scan');
    s = completeIntakeReturn(s, 'flavor:whisky', pickableProduct('PR-FIX-CHOC-MILK'));
    expect(resolutionForLine(s, 'flavor:chocolate')?.state).toBe('resolved'); // preserved
    expect(resolutionForLine(s, 'flavor:whisky')?.state).toBe('resolved');
    expect(resolutionForLine(s, 'flavor:whisky')?.attachedProductId).toBe('PR-FIX-CHOC-MILK');
  });
});

describe('substitution-style actions (reuses customer-flow buildSubstitutionIntent)', () => {
  it("`Nie mam tego składnika` records an i_dont_have_this intent, line stays unresolved", () => {
    const s = recordSubstitutionAction(createResolutionState(seed()), 'flavor:whisky', 'dont_have');
    const l = resolutionForLine(s, 'flavor:whisky')!;
    expect(l.substitutionIntent?.reason).toBe('i_dont_have_this');
    expect(l.state).toBe('unresolved');
    expect(ingredientResolutionSummary(s).unresolvedNames).toContain('Whisky');
  });

  it('`Zastąp składnik` without a name parks in substituting; with a name records the target', () => {
    let s = recordSubstitutionAction(createResolutionState(seed()), 'flavor:whisky', 'substitute');
    expect(resolutionForLine(s, 'flavor:whisky')?.state).toBe('substituting');
    s = recordSubstitutionAction(s, 'flavor:whisky', 'substitute', 'Rum');
    const l = resolutionForLine(s, 'flavor:whisky')!;
    expect(l.substitutionIntent?.reason).toBe('replace_with');
    expect(l.substitutionIntent?.requestedSubstituteName).toBe('Rum');
  });

  it('`Po co jest ten składnik?` records a why_is_this_here explanation ask', () => {
    const s = recordSubstitutionAction(createResolutionState(seed()), 'flavor:chocolate', 'why');
    expect(resolutionForLine(s, 'flavor:chocolate')?.substitutionIntent?.reason).toBe('why_is_this_here');
  });
});

describe('pickProduct — the Engine-readiness gate + rerun signal', () => {
  it('an engine-ready product RESOLVES the line, attaches engine values, and bumps the token', () => {
    const s0 = createResolutionState(seed());
    const s = pickProduct(s0, 'flavor:chocolate', pickableProduct('PR-FIX-CHOC-DARK'));
    const l = resolutionForLine(s, 'flavor:chocolate')!;
    expect(l.state).toBe('resolved');
    expect(l.attachedProductId).toBe('PR-FIX-CHOC-DARK');
    expect(l.engineValues).toEqual({ pac_value: 30, pod_value: 20, provenance: 'reference_linked', not_independently_measured: true });
    expect(s.engineRerunToken).toBe(1);
  });

  it('a not-ready product (reference lacks pac/pod) stays UNRESOLVED with the honest message', () => {
    const s = pickProduct(createResolutionState(seed()), 'flavor:whisky', pickableProduct('PR-FIX-WHISKY'));
    const l = resolutionForLine(s, 'flavor:whisky')!;
    expect(l.state).toBe('needs_data');
    expect(l.attachedProductId).toBe('PR-FIX-WHISKY');
    expect(l.engineValues).toBeNull();
    expect(l.message).toBe(NOT_ENGINE_READY_MESSAGE);
    expect(ingredientResolutionSummary(s).unresolvedNames).toContain('Whisky');
    expect(s.engineRerunToken).toBe(0);
  });

  it('a red-flagged product stays UNRESOLVED (needs review)', () => {
    const s = pickProduct(createResolutionState(seed()), 'flavor:raspberry-puree', pickableProduct('PR-FIX-SYRUP-0'));
    const l = resolutionForLine(s, 'flavor:raspberry-puree')!;
    expect(l.state).toBe('needs_data');
    expect(l.message).toBe(NOT_ENGINE_READY_MESSAGE);
  });

  it('the token bumps only on a FRESH resolve, not on re-picking an already-resolved line', () => {
    let s = pickProduct(createResolutionState(seed()), 'flavor:chocolate', pickableProduct('PR-FIX-CHOC-DARK'));
    expect(s.engineRerunToken).toBe(1);
    s = pickProduct(s, 'flavor:chocolate', pickableProduct('PR-FIX-CHOC-MILK'));
    expect(s.engineRerunToken).toBe(1);
  });

  it('resolving every line clears the gate (allResolved true)', () => {
    let s = createResolutionState(seed());
    s = pickProduct(s, 'flavor:chocolate', pickableProduct('PR-FIX-CHOC-DARK'));
    s = pickProduct(s, 'flavor:whisky', pickableProduct('PR-FIX-CHOC-MILK'));
    s = pickProduct(s, 'flavor:raspberry-puree', pickableProduct('PR-FIX-RASPBERRY'));
    s = selectForm(openSheet(s, 'flavor:basil'), 'flavor:basil', 'swieza');
    s = pickProduct(s, 'flavor:basil', pickableProduct('PR-FIX-BASIL'));
    const summary = ingredientResolutionSummary(s);
    expect(summary.allResolved).toBe(true);
    expect(summary.unresolvedCount).toBe(0);
    expect(s.engineRerunToken).toBe(4);
  });
});

describe('working copy never mutates the source seeds', () => {
  it('cloning + resolving does not touch the shared seed array', () => {
    const before = JSON.stringify(RESOLUTION_LINE_SEEDS);
    const s = createResolutionWorkingCopy({
      sourceRecipeId: 'catalogue-1',
      workingRecipeId: 'wc-2',
      lines: RESOLUTION_LINE_SEEDS,
    });
    pickProduct(s, 'flavor:chocolate', pickableProduct('PR-FIX-CHOC-DARK'));
    expect(JSON.stringify(RESOLUTION_LINE_SEEDS)).toBe(before);
    expect(s.sourceRecipeId).toBe('catalogue-1');
    expect(s.workingRecipeId).toBe('wc-2');
  });
});
