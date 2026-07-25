/**
 * NIGHTLY P0 — AGENT A owner fixtures (2026-07-24). The two OWNER-VERIFIED
 * LIVE FAILURES on served staging (commit 4dfb097) and the owner's required
 * test list (1–20):
 *
 *  FAILURE A — complete Fruit Gelato (Strawberry 350 / Milk 380 / Cream 80 /
 *  SMP 40 / Sucrose 110 / Dextrose 35 / Tara 5, −11 °C, 1000 g) → the local
 *  corrector's one-line hard stop driven ONLY by fallback milk_gelato bands.
 *  Now: local first → template-seeded fallback → best-safe explanatory result.
 *
 *  FAILURE B — fresh draft (Milk 3.5% 0 g + STRAWBERRIES 0 g, no locks) →
 *  „Brakuje składnika w twardej roli technologicznej: sweetener_sucrose,
 *  sugar_freezing_control, stabilizer." Root cause: exclusions leaked from the
 *  PREVIOUS draft's removals (draft-scoped lifecycle was missing). Now: an
 *  emptied draft resets exclusions; never-selected ≠ excluded.
 *
 * Engine science untouched (test 20 pins versions).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, type EngineIngredient, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  buildOptimizePreview,
  plannedSum,
} from '@/features/constraint-studio/applyPipeline';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import { previewIssueMessagePl } from '@/features/constraint-studio/previewIssueMessage';
import { routeFormulationMode } from './formulate';
import { canonicalToolboxIdentity, isToolboxCandidateExcluded } from './toolboxCanonical';
import { classifyViolationBands } from './violationBands';

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const line = (id: string, ingredient: EngineIngredient, grams: number) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: 'unlocked' as const,
});

const input = (
  items: ReturnType<typeof line>[],
  category: RecipeInput['category'],
  temp = -11,
  batch = 1000,
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: temp,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items,
});

const NO = { byLineId: {} };

/** FAILURE A — the owner's exact complete Fruit Gelato (1000 g, −11 °C). */
const FRUIT_COMPLETE = () => [
  line('l-straw', STRAWBERRIES, 350),
  line('l-milk', findDemoIngredient('milk_3_5')!, 380),
  line('l-cream', findDemoIngredient('cream_30')!, 80),
  line('l-smp', findDemoIngredient('smp')!, 40),
  line('l-suc', findDemoIngredient('sucrose')!, 110),
  line('l-dex', findDemoIngredient('dextrose')!, 35),
  line('l-tara', findDemoIngredient('tara_gum')!, 5),
];

/** A complete fruit draft the LOCAL corrector cannot repair but the template
 * fallback CAN (probed deterministic: local fails → seeded preview improves). */
const FRUIT_FALLBACK_OK = () => [
  line('l-straw', STRAWBERRIES, 350),
  line('l-milk', findDemoIngredient('milk_3_5')!, 400),
  line('l-cream', findDemoIngredient('cream_30')!, 60),
  line('l-smp', findDemoIngredient('smp')!, 40),
  line('l-suc', findDemoIngredient('sucrose')!, 110),
  line('l-dex', findDemoIngredient('dextrose')!, 35),
  line('l-tara', findDemoIngredient('tara_gum')!, 5),
];

/** FAILURE B — the minimal fresh draft (both lines 0 g, unlocked). */
// OWNER FINAL INTEGRATION ADDENDUM items 1+2 (2026-07-25): the fruit carries
// a real amount. This dairy fruit draft is canonical `milk_gelato` (fruit_gelato
// has no native seeded bands), whose APPROVED templates carry no `fruit` role
// now that the reference-derived `fruit_gelato_ref_v1` is quarantined — so a
// 0 g fruit is the honest "give me the amount" stop, pinned separately below.
// FAILURE B (a minimal fresh draft must formulate completely, never the trio
// message) is unchanged and re-pinned on this fixture.
const MINIMAL_GELATO = () => [
  line('l-milk', findDemoIngredient('milk_3_5')!, 0),
  line('l-straw', STRAWBERRIES, 350),
];

/** The same draft with NO fruit amount — the honest-stop branch. */
const MINIMAL_GELATO_NO_FRUIT_AMOUNT = () => [
  line('l-milk', findDemoIngredient('milk_3_5')!, 0),
  line('l-straw', STRAWBERRIES, 0),
];

const seedRecipeStore = (
  items: ReturnType<typeof line>[],
  category: RecipeInput['category'],
  visible: 'gelato' | 'sorbet' = 'gelato',
) => {
  useRecipeStore.setState({
    mode: 'classic',
    category,
    visibleProductType: visible,
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items,
    excludedIngredientIds: [],
    servingModeId: null,
    machineKind: null,
    machineId: null,
    machineLabel: null,
  });
  useConstraintStudioStore.getState().resetForTests();
};

beforeEach(() => seedRecipeStore([], 'milk_gelato'));

/* ───────────────────────── toolbox canonical identity (tests 2/3/4/8) ──── */

describe('canonical toolbox identity (owner Phase 2)', () => {
  it('sucrose/dextrose/stabilizer candidates resolve by exact canonical registry identity (tests 2/3/4)', () => {
    expect(canonicalToolboxIdentity('sucrose')).toMatchObject({ mapperId: 'PI-ING-000514' });
    expect(canonicalToolboxIdentity('dextrose')).toMatchObject({ mapperId: 'PI-ING-000494' });
    expect(canonicalToolboxIdentity('tara_gum')).toMatchObject({ mapperId: 'PI-ING-000492' });
    expect(canonicalToolboxIdentity('cream_30')).toMatchObject({ mapperId: 'PI-ING-000180' });
    expect(canonicalToolboxIdentity('milk_3_5')).toMatchObject({ mapperId: 'PI-ING-000236' });
    expect(canonicalToolboxIdentity('smp')).toMatchObject({ mapperId: 'PI-ING-000270' });
    expect(canonicalToolboxIdentity('inulin')).toMatchObject({ mapperId: 'PI-ING-000456' });
    expect(canonicalToolboxIdentity('water')).toMatchObject({ mapperId: 'PI-ING-001409' });
    // never fuzzy — an unknown id resolves to nothing
    expect(canonicalToolboxIdentity('sucrose_x')).toBeNull();
  });

  it('exclusion matches BOTH canonical identities (engine id and Mapper id)', () => {
    expect(isToolboxCandidateExcluded('sucrose', new Set(['sucrose']))).toBe(true);
    expect(isToolboxCandidateExcluded('sucrose', new Set(['PI-ING-000514']))).toBe(true);
    expect(isToolboxCandidateExcluded('sucrose', new Set(['PI-ING-000494']))).toBe(false);
    expect(isToolboxCandidateExcluded('sucrose', new Set())).toBe(false);
  });

  it('added lines carry stable canonical IDs + Polish names + role + grams + reason (test 8)', () => {
    const result = buildOptimizePreview(input(MINIMAL_GELATO(), 'milk_gelato'), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const added = result.preview.formulation!.added;
    expect(added.length).toBeGreaterThanOrEqual(5);
    for (const a of added) {
      expect(a.mapperId).toMatch(/^PI-ING-\d{6}$/); // stable canonical id
      expect(a.namePl).toBeTruthy(); // Polish name
      expect(a.role).toBeTruthy();
      expect(a.grams).toBeGreaterThan(0);
      expect(a.reasonPl).toContain(a.mapperId!); // the reason names the exact id
      expect(a.reasonPl).toContain('w roli');
      expect(a.reasonPl).toContain('zatwierdzona receptura');
    }
    const sucrose = added.find((a) => a.ingredientId === 'sucrose')!;
    expect(sucrose.mapperId).toBe('PI-ING-000514');
    expect(sucrose.reasonPl).toContain('Sacharoza');
  });
});

/* ─────────────── A1 / FAILURE B — minimal Gelato full formulation ───────── */

describe('A1 — minimal Gelato (FAILURE B fixture) formulates completely', () => {
  it('Milk 0 g + Strawberry selects FULL FORMULATION on the APPROVED milk template (test 1)', () => {
    const decision = routeFormulationMode(input(MINIMAL_GELATO(), 'milk_gelato'), NO);
    expect(decision.mode).toBe('full_formulation');
    expect(decision.template?.templateId).toBe('milk_base_v1');
  });

  // OWNER FINAL INTEGRATION ADDENDUM items 1+2 (2026-07-25) — the other half of
  // FAILURE B: a chosen flavour the APPROVED template has no role target for is
  // never silently left at 0 g. PI stops and names the exact ingredient.
  it('a 0 g fruit is an honest named stop, never a silent milk base', () => {
    const result = buildOptimizePreview(
      input(MINIMAL_GELATO_NO_FRUIT_AMOUNT(), 'milk_gelato'),
      NO,
      'now',
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'missing_required_role') return;
    expect(result.role).toBe('fruit');
    expect(result.messagePl).toContain(STRAWBERRIES.name);
    expect(result.messagePl).toContain('Wpisz ilość');
  });

  it('toolbox auto-fill precedes hard-role completeness — no missing-role stop on a fresh draft (test 5)', () => {
    const result = buildOptimizePreview(input(MINIMAL_GELATO(), 'milk_gelato'), NO, 'now');
    expect(result.ok).toBe(true); // NEVER the FAILURE B trio message on a fresh draft
    if (!result.ok) return;
    const trace = result.preview.formulation!.roleTrace;
    // The Phase-1 role table proves the ordering: every hard role resolved.
    for (const row of trace.filter((r) => r.hard)) {
      expect(['user_filled', 'toolbox_added']).toContain(row.outcome);
    }
  });

  it('complete 1000 g Preview: user IDs preserved, trio auto-added, differentiated, no duplicates (tests 6/7)', () => {
    const result = buildOptimizePreview(input(MINIMAL_GELATO(), 'milk_gelato'), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // the USER's stable identities carry real differentiated grams
    const milk = p.proposedInput.items.find((i) => i.id === 'l-milk')!;
    const straw = p.proposedInput.items.find((i) => i.id === 'l-straw')!;
    expect(milk.ingredient.id).toBe('milk_3_5');
    expect(straw.ingredient.id).toBe('PI-ING-001553');
    expect(milk.planned_grams).toBeGreaterThan(100);
    expect(straw.planned_grams).toBeGreaterThan(100);
    // sucrose/dextrose/cream/SMP/stabilizer auto-added (stabilizer template-controlled)
    const addedIds = p.formulation!.added.map((a) => a.ingredientId);
    expect(addedIds).toEqual(
      expect.arrayContaining(['sucrose', 'dextrose', 'cream_30', 'smp', 'tara_gum']),
    );
    const tara = p.proposedInput.items.find((i) => i.ingredient.id === 'tara_gum')!;
    expect(tara.planned_grams).toBeLessThanOrEqual(6); // template-controlled dose
    // differentiated grams, exactly one row per canonical identity
    const grams = p.proposedInput.items.map((i) => Math.round(i.planned_grams));
    expect(new Set(grams).size).toBeGreaterThan(3);
    const ids = p.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('explicit exclusion (either canonical identity) prevents the auto-add (test 9)', () => {
    const byEngineId = buildOptimizePreview(input(MINIMAL_GELATO(), 'milk_gelato'), NO, 'now', {
      excludedIngredientIds: ['sucrose'],
    });
    expect(byEngineId.ok).toBe(false);
    if (!byEngineId.ok) expect(byEngineId.code).toBe('missing_required_role');
    // the SAME exclusion expressed as the removed catalogue product's Mapper id
    const byMapperId = buildOptimizePreview(input(MINIMAL_GELATO(), 'milk_gelato'), NO, 'now', {
      excludedIngredientIds: ['PI-ING-000514'],
    });
    expect(byMapperId.ok).toBe(false);
    if (!byMapperId.ok) expect(byMapperId.code).toBe('missing_required_role');
  });

  it('FAILURE B end-to-end: emptying the previous draft NEVER leaks exclusions into the fresh one (test 10)', () => {
    // The owner's real sequence: a full draft is cleared line by line…
    seedRecipeStore(FRUIT_COMPLETE(), 'milk_gelato');
    for (const item of [...useRecipeStore.getState().items]) {
      useRecipeStore.getState().removeItem(item.id);
    }
    // …the emptied draft ends the exclusion context (never-selected ≠ excluded)
    expect(useRecipeStore.getState().items).toEqual([]);
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]);
    // fresh minimal draft through the real store actions
    useRecipeStore.getState().setVisibleProductType('gelato');
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 350);
    expect(useRecipeStore.getState().category).toBe('milk_gelato');
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    // the owner's FAILURE B message can no longer appear on a fresh draft
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    // Owner addendum item 2: the seed is an APPROVED template, never the
    // quarantined reference-derived one.
    expect(preview?.formulation?.templateId).toBe('milk_base_v1');
    expect(preview?.formulation?.templateStatus).toBe('approved');
    expect(Math.abs(plannedSum(preview!.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });

  // Owner FINAL CLOSURE C2 (2026-07-24) SUPERSEDES the earlier NIGHTLY
  // removal-excludes rule pinned here before: „Remove row" removes the line
  // from the CURRENT recipe ONLY and must NOT silently become a permanent
  // scientific exclusion (it caused the live owner failure: removing Cream/
  // SMP/Dextrose forbade the toolbox refill → missing_required_role, while a
  // refresh cleared the non-persisted exclusions and „fixed" it). Exclusion
  // now has exactly ONE source: the EXPLICIT `markIngredientUnavailable`
  // action. Frozen pins kept: toolbox never reintroduces an EXPLICIT
  // exclusion; an explicit add clears it; Undo restores exclusion state.
  it('same-draft removal does NOT exclude; the EXPLICIT unavailable action DOES (FINAL CLOSURE C2)', () => {
    seedRecipeStore(FRUIT_COMPLETE(), 'milk_gelato');
    // remove sucrose only — draft still has 6 lines (same draft continues)
    const suc = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'sucrose')!;
    useRecipeStore.getState().removeItem(suc.id);
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]);
    // the EXPLICIT action is the only exclusion source
    const dex = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'dextrose')!;
    useRecipeStore.getState().markIngredientUnavailable(dex.id);
    expect(useRecipeStore.getState().items.some((i) => i.ingredient.id === 'dextrose')).toBe(false);
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual(['dextrose']);
  });
});

/* ───────── A2 / FAILURE A — local first, fallback, best-safe result ─────── */

describe('A2 — complete Fruit Gelato (FAILURE A fixture)', () => {
  it('a complete recipe runs the LOCAL corrector first (test 11)', () => {
    const decision = routeFormulationMode(input(FRUIT_COMPLETE(), 'milk_gelato'), NO);
    expect(decision.mode).toBe('local_correction');
    expect(decision.reasons).toContain('substantive_unconstrained_draft');
  });

  it('never the one-line hard failure from fallback bands alone (test 15)', () => {
    const result = buildOptimizePreview(input(FRUIT_COMPLETE(), 'milk_gelato'), NO, 'now');
    // ok (verified improvement) or the explanatory best-safe result —
    // NEVER the bare no_proposal/unsafe_proposal one-liner (FAILURE A).
    if (!result.ok) {
      expect(result.code).toBe('best_safe_result');
      if (result.code !== 'best_safe_result') return;
      expect(result.solverInvocations).toBeGreaterThan(0); // the solver really ran
      expect(result.softViolatedMetrics.length).toBeGreaterThan(0); // proven soft deviations
      expect(result.bandSource).toBe('category_fallback'); // calibration status
      expect(result.templateId).toBe('fruit_gelato_ref_v1');
    }
  });

  // CURRENT-DRAFT OPTIMIZATION P0 (owner, 2026-07-25) — DELIBERATE SUPERSESSION.
  // „Template similarity" is NOT proof of optimality (owner Phase 4): this very
  // fixture returning `best_safe_result` / `template_fixed_point` IS the
  // owner-verified failure this program closes. With the current-draft
  // candidate vector the optimizer works the user's OWN unlocked lines and
  // produces a REAL Preview at exactly the target batch.
  it('resembling the reference template is NEVER a stop: the fixture optimizes (owner Phase 4)', () => {
    const result = buildOptimizePreview(input(FRUIT_COMPLETE(), 'milk_gelato'), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // The optimizer really searched the draft's own lines, not just the ADD set.
    expect(result.preview.iteration!.candidateVector.length).toBeGreaterThan(0);
  });

  it('the live store path stages a real Preview (never the false „best verified result")', () => {
    seedRecipeStore(FRUIT_COMPLETE(), 'milk_gelato');
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    // the recipe itself was NOT touched by building a preview
    expect(Math.abs(plannedSum(buildRecipeInput(useRecipeStore.getState())) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('the explanatory best-safe message still exists for a genuine fixed point (test 16)', () => {
    // The state is no longer produced by THIS fixture, but the copy contract
    // and the message mapping stay pinned (they remain the honest terminal
    // state whenever the local route AND the template seed both stop).
    expect(
      previewIssueMessagePl({
        ok: false,
        code: 'best_safe_result',
        solverInvocations: 3,
        softViolatedMetrics: ['fat'],
        bandSource: 'category_fallback',
        templateId: 'fruit_gelato_ref_v1',
        templateStatus: 'reference_derived',
        stopReason: 'template_fixed_point',
        evidence: {
          solverInvocations: 3,
          draftVectorSearches: 3,
          iterations: 2,
          testedCandidates: [],
          limitingMetrics: ['fat'],
          provisionalProfile: true,
        },
      }),
    ).toBe(
      // OWNER FINAL INTEGRATION ADDENDUM item 3 (2026-07-25) — SUPERSEDES „Obecna
      // receptura jest najlepszym zweryfikowanym wynikiem…": the optimizer is
      // coordinate descent over a fixed gram ladder, which proves a LOCAL fixed
      // point, never a global optimum. The guarantee this test protects — the
      // explanatory terminal state has ONE canonical sentence and the mapping
      // to it is stable — is unchanged, and the message must now ALSO carry the
      // stop reason so the claim is never unqualified.
      'PI nie znalazło dalszej bezpiecznej poprawy. To najlepszy wynik znaleziony przez ' +
        'obecny solver dla aktualnych składników i ograniczeń — inne, lepsze rozwiązanie ' +
        'może istnieć poza jego zasięgiem przeszukiwania.' +
        ' ' +
        constraintStudioCopy.bestSafe.stopReason.template_fixed_point(3),
    );
  });

  it('a complete fruit draft yields a verified Preview at exactly the target batch (test 12)', () => {
    const result = buildOptimizePreview(input(FRUIT_FALLBACK_OK(), 'milk_gelato'), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // When the template-seeded fallback DOES run it is still labelled honestly.
    if (result.preview.formulation?.localFallback === true) {
      expect(result.preview.formulation.templateId).toBe('fruit_gelato_ref_v1');
    }
  });

  it('the fallback reuses the SAME selected identities, batch and temperature (test 13)', () => {
    const rec = input(FRUIT_FALLBACK_OK(), 'milk_gelato');
    const result = buildOptimizePreview(rec, NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview.proposedInput;
    // every user line survives with its stable line id AND ingredient identity
    for (const original of rec.items) {
      const kept = p.items.find((i) => i.id === original.id);
      expect(kept, original.id).toBeDefined();
      expect(kept!.ingredient.id).toBe(original.ingredient.id); // brand/form never replaced
    }
    expect(p.target_batch_grams).toBe(1000);
    expect(p.target_temperature_c).toBe(-11);
    const ids = p.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ───────────────── hard vs soft bands (owner Phase 8, test 14/15) ───────── */

describe('band provenance classification (owner Phase 8)', () => {
  // OWNER ADDENDUM item 1 (2026-07-25): the category stays 'fruit_gelato'
  // HERE ON PURPOSE — this test pins the ENGINE's band-fallback mechanism,
  // which still exists for any cell the science team has not seeded. Runtime
  // can no longer route to it (pinned in canonicalWorkbench.test.tsx).
  it('unseeded-cell violations are SOFT (category fallback); native milk_gelato violations stay HARD (test 14)', () => {
    const fruit = classifyViolationBands(input(FRUIT_COMPLETE(), 'fruit_gelato'));
    expect(fruit.bandSource).toBe('category_fallback');
    expect(fruit.hardMetrics).toEqual([]); // fallback bands never produce hard violations
    // a native milk_gelato draft with real violations classifies them HARD
    const milkDraft = input(
      [
        line('l-milk', findDemoIngredient('milk_3_5')!, 900),
        line('l-suc', findDemoIngredient('sucrose')!, 100),
      ],
      'milk_gelato',
    );
    const milk = classifyViolationBands(milkDraft);
    expect(milk.bandSource).toBe('native');
    expect(milk.hardMetrics.length).toBeGreaterThan(0);
    expect(milk.softMetrics).toEqual([]);
  });

  it('a native-band profile NEVER yields best_safe_result (the hard gate is absolute)', () => {
    // The damaged all-1 g milk draft: full-formulation route; whatever the
    // outcome, the native profile must never be softened into best-safe.
    const items = ['milk_3_5', 'cream_30', 'sucrose', 'dextrose', 'smp', 'tara_gum'].map((ing, i) =>
      line(`l-${i}`, findDemoIngredient(ing)!, 1),
    );
    const result = buildOptimizePreview(input(items, 'milk_gelato'), NO, 'now');
    if (!result.ok) expect(result.code).not.toBe('best_safe_result');
  });
});

/* ─────────────────────── Apply / Undo / save-reopen (A1/A5/A6) ──────────── */

describe('Apply → Undo → save/reopen for the minimal Gelato (tests 17/18/19)', () => {
  const stageMinimalPreview = () => {
    seedRecipeStore([], 'milk_gelato');
    useRecipeStore.getState().setVisibleProductType('gelato');
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    // Owner addendum items 1+2: the fruit carries an amount (PI has no approved
    // fruit dose for a dairy gelato — the 0 g branch is the honest stop, pinned
    // separately). Apply/Undo/save-reopen guarantees are unchanged.
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 350);
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    return preview!;
  };

  it('Preview grams/IDs equal post-Apply state byte-for-byte (test 17)', () => {
    const preview = stageMinimalPreview();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const items = useRecipeStore.getState().items;
    expect(items.map((i) => [i.id, i.ingredient.id, i.planned_grams])).toEqual(
      preview.proposedInput.items.map((i) => [i.id, i.ingredient.id, i.planned_grams]),
    );
    expect(Math.abs(items.reduce((a, i) => a + i.planned_grams, 0) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('the history record carries the A6 snapshot: exclusions, template id, toolbox-added markers', () => {
    stageMinimalPreview();
    useConstraintStudioStore.getState().applyPreview();
    const record = useConstraintStudioStore.getState().history.at(-1)!;
    expect(record.before.excludedIngredientIds).toEqual([]);
    expect(record.after.excludedIngredientIds).toEqual([]);
    expect(record.before.input.category).toBe('milk_gelato');
    expect(record.before.input.target_temperature_c).toBe(-11);
    expect(record.before.input.target_batch_grams).toBe(1000);
    expect(record.mode).toBe('classic'); // tier
    expect(record.formulation?.templateId).toBe('milk_base_v1'); // approved (addendum item 2)
    expect(record.formulation?.added.map((a) => a.ingredientId)).toEqual(
      expect.arrayContaining(['sucrose', 'dextrose', 'cream_30', 'smp', 'tara_gum']),
    );
    expect(record.formulation?.localFallback).toBe(false);
  });

  it('Undo restores EXACTLY the two user lines and removes the PI-added lines (test 18)', () => {
    stageMinimalPreview();
    const before = JSON.stringify(
      buildRecipeInput(useRecipeStore.getState()).items.map((i) => [i.id, i.ingredient.id, i.planned_grams]),
    );
    useConstraintStudioStore.getState().applyPreview();
    useConstraintStudioStore.getState().undoLastApply();
    const restored = useRecipeStore.getState().items;
    expect(
      JSON.stringify(restored.map((i) => [i.id, i.ingredient.id, i.planned_grams])),
    ).toBe(before);
    expect(restored.length).toBe(2); // exactly the two user lines
    // Owner addendum items 1+2: the staged draft is Milk 0 g + Strawberry 350 g
    // (PI has no approved fruit dose to fill a 0 g fruit with). Undo must
    // restore BOTH user grams byte-exact — the guarantee, unchanged.
    expect(restored.map((i) => i.planned_grams)).toEqual([0, 350]);
    expect(restored.some((i) => i.id.startsWith('formulation-'))).toBe(false);
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]);
  });

  it('save/reopen preserves the applied recipe (test 19)', () => {
    stageMinimalPreview();
    useConstraintStudioStore.getState().applyPreview();
    const saved = buildRecipeInput(useRecipeStore.getState());
    useRecipeStore.getState().loadRecipeInput(saved, { savedId: 'r-a1', savedName: 'A1' });
    const items = useRecipeStore.getState().items;
    expect(items.map((i) => [i.id, i.planned_grams])).toEqual(
      saved.items.map((i) => [i.id, i.planned_grams]),
    );
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]); // fresh context on load
  });
});

/* ───────────────────────── science freeze (test 20) ─────────────────────── */

describe('science freeze', () => {
  it('ENGINE 0.4.0 + CONFIG 0.7.0 unchanged (test 20)', () => {
    const result = calculateRecipe(input(FRUIT_COMPLETE(), 'milk_gelato'));
    expect(result.engine_version).toBe('0.4.0');
    expect(result.config_version).toBe('0.7.0');
  });

  it('the best-safe copy key is the exact owner sentence (no repurposed keys)', () => {
    // OWNER ADDENDUM item 3 (2026-07-25) — SUPERSEDES the previous sentence
    // (see the mapping test above). The key itself is still never repurposed.
    expect(constraintStudioCopy.previewIssue.bestSafeResult).toBe(
      'PI nie znalazło dalszej bezpiecznej poprawy. To najlepszy wynik znaleziony przez ' +
        'obecny solver dla aktualnych składników i ograniczeń — inne, lepsze rozwiązanie ' +
        'może istnieć poza jego zasięgiem przeszukiwania.',
    );
    // …and it may never again claim a proven best/optimum.
    expect(constraintStudioCopy.previewIssue.bestSafeResult).not.toContain('zweryfikowanym wynikiem');
    // pre-existing keys stayed intact (never repurposed)
    expect(constraintStudioCopy.previewIssue.alreadyClean).toBe(
      'Receptura znajduje się już w zatwierdzonym zakresie. PI nie proponuje zmian.',
    );
  });
});
