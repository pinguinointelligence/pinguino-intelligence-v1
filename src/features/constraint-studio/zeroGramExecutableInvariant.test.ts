import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeDirectionTarget, RecipeInput, RecipeItem } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import {
  OWNER_MAPPER_INGREDIENTS,
  ownerSameInputRecipe,
} from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import {
  attachPracticalRecipeAudit,
  isOmittableUnusedLine,
  practicalRecipeAuditMatchesInput,
  practicalRecipeInputFingerprint,
  practicalizeRecipeCandidate,
  unusedZeroGramLineIds,
} from '@/features/practical-recipe/practicalRecipe';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import {
  assessProductionRescue,
  practicalizeProductionRescueCandidate,
} from '@/features/production-workspace/productionRescue';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from '@/features/production-workspace/productionSession';
import { productionRecipeLifecycleState } from '@/features/production-workspace/productionReadinessState';
import {
  overSweetStarter,
  starterMilkBase,
} from '@/features/recipe-constraints/constraintFixtures';
import {
  SORBET_MAIN_IDS,
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { evaluateFreezingStabilityStatus } from '@/features/recipe-constraints/freezingStabilityStatus';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildOptimizePreview, commitPreview } from './applyPipeline';
import {
  createOptimizePreviewWithServerAuthority,
  missingProductDosePreviewIssue,
  useConstraintStudioStore,
} from './constraintStudioStore';

/**
 * GLOBAL ZERO-GRAM EXECUTABLE RECIPE INVARIANT (owner authority, 2026-08-22).
 *
 * A 0 g ingredient row is allowed ONLY as the temporary editor placeholder of
 * a manually added ingredient whose amount was not entered yet; "Przelicz" may
 * truthfully demand ≥ 1 g or removal there. Every canonical Engine-generated /
 * executable state (Recalculate, Direction, Rescue, Auto-balance, Preview,
 * Apply, Save, reopen/version, Production executable recipe) must NEVER carry
 * a 0 g ingredient row: an optional ingredient that is not used is OMITTED.
 * Absence allowed ≠ explicit 0 g row allowed.
 *
 * Shared normalization boundary: `practicalizeRecipeCandidate` (the whole-gram
 * executable projection used by every Preview kind, the Apply door recheck,
 * the Save gate, the production rescue practicalizer and the production
 * lifecycle) omits unused optional 0 g rows; the Apply door accepts exactly the
 * omission its own recheck reproduces; saved versions reopen without legacy
 * 0 g optional rows.
 */
const NONE = { byLineId: {} };

const price = (id: string, pricePerKg: number) => ({
  overrideId: `override:${id}`,
  ownerUserId: 'owner-test',
  canonicalIngredientId: id,
  pricePerKg,
  currency: 'EUR',
  createdBy: 'owner-test',
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
});

/** The owner's "Moja cena" overrides observed on staging (water / inulin / tara / strawberries). */
const OWNER_PRICES = {
  'PI-ING-001409': price('PI-ING-001409', 1),
  'PI-ING-000456': price('PI-ING-000456', 9),
  'PI-ING-000492': price('PI-ING-000492', 13),
  'PI-ING-001553': price('PI-ING-001553', 10),
};

/** Served inulin dose policy (2–8 %, optional zero) frozen in the product snapshot. */
const INULIN_DOSE = {
  policyId: 'gellatti-generic-inulin',
  maxPercent: 8,
  minPercent: 2,
  provenance: 'owner-approved Gellatti formulation policy',
  policyVersion: 1,
  sourceVersion: 'owner-gellatti-inulin-v1',
  preferredPercent: 4,
  presenceSemantics: 'optional_zero_or_range',
};

type Temperature = -11 | -12 | -13;
type Main = { key: keyof typeof SORBET_MAIN_IDS; grams: number; weight?: number };
type Direction = { sweetness?: RecipeDirectionTarget; softness?: RecipeDirectionTarget };

/** Served Sorbet: the canonical starter scaffold + Mains, exactly as the Pro workbench stages it. */
const servedSorbet = (
  temperature: Temperature,
  strategy: 'eco' | 'optimal',
  mains: Main[],
  direction: Direction = {},
): RecipeInput => {
  const servingModeId =
    temperature === -11 ? 'temp_minus_11' : temperature === -12 ? 'temp_minus_12' : 'temp_minus_13';
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId,
    formulationStrategy: strategy,
    targetBatchGrams: 1_000,
  });
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: temperature,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [
      ...scaffold.items.map((item) => ({
        ...item,
        ingredient: sorbetMapperIngredient(
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        ),
      })),
      ...mains.map(
        (main, index) =>
          ({
            id: `line-${main.key}`,
            ingredient: {
              ...sorbetMapperIngredient(SORBET_MAIN_IDS[main.key]),
              cost_per_kg: main.key === 'strawberry' ? null : 3.5,
            },
            planned_grams: main.grams,
            actual_grams: null,
            lock_type: 'main',
            ...(main.weight ? { main_ratio_weight: main.weight } : {}),
            user_intent_anchor_grams: main.grams,
            ...(index > 0 ? { user_target_grams: main.grams } : {}),
          }) as RecipeItem,
      ),
    ],
    goals: {
      formulation_strategy: strategy,
      direction_targets_active: Object.keys(direction).length > 0,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0, ...direction },
    },
  };
};

/** Server-shaped authority: structural lines NOT_MAIN / STANDARD_ONLY, Mains on the exact 60 % policy, inulin dose frozen. */
const servedSnapshots = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = sorbetAuthoritySnapshots(input);
  for (const item of input.items) {
    const base = snapshots[item.id]!;
    const facts = base.sharedFacts;
    if (!facts) throw new Error(`fixture snapshot ${item.id} has no sharedFacts`);
    snapshots[item.id] =
      item.lock_type === 'main'
        ? {
            ...base,
            subfamilyId: item.id === 'line-lime' ? 'citrus' : 'berry',
            sharedFacts: { ...facts, profileEligibility: ['milk_gelato', 'sorbet'] },
          }
        : {
            ...base,
            mainClassification: item.id.includes('inulin') ? 'STANDARD_ONLY' : 'NOT_MAIN',
            sharedFacts: {
              ...facts,
              profileEligibility: [],
              recommendedDose: item.id.includes('inulin')
                ? (INULIN_DOSE as unknown as typeof facts.recommendedDose)
                : facts.recommendedDose,
            },
          };
  }
  return snapshots;
};

const loadServed = (input: RecipeInput, prices: Record<string, unknown> = OWNER_PRICES) => {
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  useCustomerPriceStore.setState({
    overridesByCanonicalId: prices as typeof useCustomerPriceStore extends never
      ? never
      : ReturnType<typeof useCustomerPriceStore.getState>['overridesByCanonicalId'],
  });
  useRecipeStore.getState().loadRecipeInput(input);
  const snapshots = servedSnapshots(input);
  for (const item of useRecipeStore.getState().items) {
    useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshots[item.id]!);
  }
  useRecipeProfileStore.getState().markRecalculationRequired();
};

const noZeroGramRows = (input: RecipeInput, label = '') => {
  const zeros = input.items.filter((item) => !(item.planned_grams > 0));
  expect(
    zeros.map((item) => item.id),
    `${label} must not carry 0 g rows`.trim(),
  ).toEqual([]);
  expect(
    input.items.every((item) => Number.isInteger(item.planned_grams)),
    label,
  ).toBe(true);
};

const storeItems = () =>
  useRecipeStore.getState().items.map((item) => [item.id, item.planned_grams] as const);

const stageAndApply = (label: string) => {
  useConstraintStudioStore.getState().createOptimizePreview();
  const staged = useConstraintStudioStore.getState();
  const preview = staged.preview ?? staged.directionBestCandidate;
  expect(preview, `${label}: ${JSON.stringify(staged.previewIssue)}`).not.toBeNull();
  noZeroGramRows(preview!.proposedInput, `${label} Preview`);
  if (!staged.preview) useConstraintStudioStore.getState().acceptBestDirectionCandidate();
  useConstraintStudioStore.getState().applyPreview();
  const after = useConstraintStudioStore.getState();
  expect(after.blocked, `${label}: ${after.blocked?.messagePl}`).toBeNull();
  expect(after.history).toHaveLength(1);
  noZeroGramRows(buildRecipeInput(useRecipeStore.getState()), `${label} Apply`);
  expect(
    useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0),
  ).toBeCloseTo(1_000, 6);
  expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  return preview!;
};

/** The Pro Save gate, byte-for-byte (useCanonicalRecipeSave): audit must match the
 * current draft AND the whole-gram projection must equal the draft as written. */
const saveGate = () => {
  const state = useRecipeStore.getState();
  const input = buildRecipeInput(state);
  if (!practicalRecipeAuditMatchesInput(input, state.practicalRecipeAudit)) {
    return { blocked: true as const, reason: 'audit_mismatch' as const, input };
  }
  const result = practicalizeRecipeCandidate(input, NONE);
  if (!result.ok) return { blocked: true as const, reason: result.code, input };
  const exactAsWritten =
    practicalRecipeInputFingerprint(result.audit.executableInput) ===
    practicalRecipeInputFingerprint(input);
  return exactAsWritten
    ? { blocked: false as const, reason: null, input }
    : { blocked: true as const, reason: 'not_whole_gram_executable' as const, input };
};

describe('Zero-gram executable recipe invariant', () => {
  beforeEach(() => {
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.getState().resetForTests();
    useCustomerPriceStore.setState({ overridesByCanonicalId: {} });
  });

  it('1. a manually added 0 g row remains a valid temporary editor placeholder', () => {
    useRecipeStore.getState().loadRecipeInput(starterMilkBase());
    const before = useRecipeStore.getState().items.length;
    useRecipeStore.getState().addIngredient(findDemoIngredient('raspberry')!, 0);
    const items = useRecipeStore.getState().items;
    expect(items).toHaveLength(before + 1);
    const placeholder = items.find((item) => item.ingredient.id === 'raspberry')!;
    expect(placeholder.planned_grams).toBe(0);
    expect(placeholder.lock_type).toBe('unlocked');
    // The editor keeps it; it is the only state where a 0 g row is legitimate.
    expect(storeItems().some(([id]) => id === placeholder.id)).toBe(true);
  });

  it('2. Recalculate on such an unfinished manual row truthfully asks for ≥ 1 g or removal', async () => {
    useRecipeStore.getState().loadRecipeInput(starterMilkBase());
    useRecipeStore.getState().addIngredient(findDemoIngredient('raspberry')!, 0);
    // The PI authority guard (the runtime "Przelicz" entry) names the unfinished
    // row and asks for at least 1 g — before any candidate is built.
    const guard = missingProductDosePreviewIssue(buildRecipeInput(useRecipeStore.getState()));
    expect(guard?.code).toBe('missing_required_role');
    expect(guard?.messagePl).toContain('1 g');
    await createOptimizePreviewWithServerAuthority();
    const state = useConstraintStudioStore.getState();
    expect(state.preview).toBeNull();
    expect(state.previewIssue?.code).toBe('missing_required_role');
    expect(state.recalculationTerminal?.state).toBe('PRODUCT_GRAMS_REQUIRED');
    // The draft is untouched — the placeholder stays until the user decides.
    expect(storeItems().some(([, grams]) => grams === 0)).toBe(true);
  });

  it('3. an Engine candidate with an optional ingredient resolved to 0 g omits that ingredient', () => {
    const exact = servedSorbet(-12, 'eco', [{ key: 'strawberry', grams: 600 }]);
    const inulin = exact.items.find((item) => item.id.includes('inulin'))!;
    const water = exact.items.find((item) => item.id.includes('water'))!;
    // The Engine resolved inulin to exactly 0 g and moved its mass to water.
    const candidate: RecipeInput = {
      ...exact,
      items: exact.items.map((item) =>
        item.id === inulin.id
          ? { ...item, planned_grams: 0 }
          : item.id === water.id
            ? { ...item, planned_grams: water.planned_grams + inulin.planned_grams }
            : item,
      ),
    };
    expect(
      isOmittableUnusedLine(candidate, NONE, candidate.items.find((i) => i.id === inulin.id)!),
    ).toBe(true);
    expect(unusedZeroGramLineIds(candidate, NONE)).toEqual([inulin.id]);

    const practical = practicalizeRecipeCandidate(candidate, NONE);
    expect(practical.ok, practical.ok ? '' : practical.messagePl).toBe(true);
    if (!practical.ok) return;
    expect(practical.audit.executableInput.items.map((item) => item.id)).not.toContain(inulin.id);
    noZeroGramRows(practical.audit.executableInput, 'executable');
    expect(practical.audit.executableTotalGrams).toBe(1_000);
    // The audit still explains the omitted line (0 g, editable) for provenance.
    expect(practical.audit.lines.find((line) => line.lineId === inulin.id)).toMatchObject({
      exactGrams: 0,
      practicalGrams: 0,
      protection: 'editable',
    });

    // Protected lines are never auto-omitted: a Main/required/locked 0 g row is
    // a contract (an unfinished placeholder the PI guard refuses), not "unused".
    const requiredZero: RecipeInput = {
      ...candidate,
      items: candidate.items.map((item) =>
        item.id === inulin.id ? { ...item, lock_type: 'required' as const } : item,
      ),
    };
    expect(unusedZeroGramLineIds(requiredZero, NONE)).toEqual([]);
    expect(
      unusedZeroGramLineIds(candidate, {
        byLineId: { [inulin.id]: { mode: 'locked', grams: 0 } },
      } as never),
    ).toEqual([]);
  });

  it('4./5./9. ECO regression: the priced cost sweep keeps selected Inulin inside 2–8% and never leaves 0 g (−12 and −13)', () => {
    for (const temperature of [-12, -13] as const) {
      const input = servedSorbet(temperature, 'eco', [{ key: 'strawberry', grams: 600 }]);
      loadServed(input);
      const preview = stageAndApply(`ECO ${temperature}`);
      // Selected canonical Inulin is now governed by the published internal
      // 2–8% authority; ECO may keep or move it inside that range, never leave
      // an executable 0 g row.
      const inulinLine = preview.lines.find((line) => line.lineId.includes('inulin'));
      expect(inulinLine?.kind, `ECO ${temperature} diff`).not.toBe('removed');
      const proposedInulin = preview.proposedInput.items.find(
        (item) => item.id === 'new-recipe-4-inulin',
      );
      expect(proposedInulin?.planned_grams).toBeGreaterThanOrEqual(20);
      expect(proposedInulin?.planned_grams).toBeLessThanOrEqual(80);
      expect(storeItems().find(([id]) => id === 'new-recipe-4-inulin')?.[1]).toBe(
        proposedInulin?.planned_grams,
      );
      expect(Object.keys(useRecipeStore.getState().productBehaviorSnapshots)).toContain(
        'new-recipe-4-inulin',
      );
      expect(useConstraintStudioStore.getState().constraints.byLineId['new-recipe-4-inulin']).toBe(
        undefined,
      );
      // The next Przelicz no longer stalls on a 0 g placeholder the Engine itself left behind.
      useConstraintStudioStore.getState().createOptimizePreview();
      const next = useConstraintStudioStore.getState();
      expect(next.recalculationTerminal?.state).not.toBe('PRODUCT_GRAMS_REQUIRED');
      expect(next.previewIssue?.code ?? 'ok').not.toBe('missing_required_role');
      const applied: RecipeInput = { ...input, items: useRecipeStore.getState().items };
      noZeroGramRows(applied, `ECO ${temperature} applied`);
      const freezing = evaluateFreezingStabilityStatus({
        recipe: applied,
        snapshots: servedSnapshots(applied),
        calculationState: 'CURRENT',
      });
      expect(freezing.status, freezing.reasons.join(', ')).toBe('GOOD');
    }
  });

  it('6. Save/version: a verified executable draft saves byte-exact; a 0 g row can never be saved', () => {
    loadServed(servedSorbet(-12, 'eco', [{ key: 'strawberry', grams: 600 }]));
    stageAndApply('ECO −12 before save');
    const gate = saveGate();
    expect(gate.blocked, gate.reason ?? '').toBe(false);
    noZeroGramRows(gate.input, 'saved payload');
    // A placeholder typed back into the verified draft blocks Save truthfully.
    useRecipeStore.getState().addIngredient(findDemoIngredient('raspberry')!, 0);
    const blocked = saveGate();
    expect(blocked.blocked).toBe(true);
    expect(['audit_mismatch', 'not_whole_gram_executable']).toContain(blocked.reason);
  });

  it('6b. a zero-dose Tara is repaired before Apply and stays positive through Save/reopen', () => {
    const input = ownerSameInputRecipe();
    input.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    )!.planned_grams = 0;

    const built = buildOptimizePreview(input, NONE, '2026-08-24T12:00:00.000Z');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const tara = built.preview.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    );
    expect(tara?.planned_grams).toBe(3);
    noZeroGramRows(built.preview.proposedInput, 'zero Tara Preview');

    const committed = commitPreview(
      input,
      NONE,
      built.preview,
      '2026-08-24T12:00:00.000Z',
      'zero-tara-lifecycle',
    );
    expect(committed.ok, committed.ok ? '' : JSON.stringify(committed)).toBe(true);
    if (!committed.ok || built.preview.practicalization?.status !== 'ready') return;
    useRecipeStore.getState().loadRecipeInput(committed.verified.input);
    const normalizedExecutable = buildRecipeInput(useRecipeStore.getState());
    const saved = attachPracticalRecipeAudit(
      normalizedExecutable,
      built.preview.practicalization.audit.exactInput,
      '2026-08-24T12:00:00.000Z',
    );
    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'zero-tara-recipe',
      savedName: 'Zero Tara repaired',
      versionNumber: 1,
      versionId: 'zero-tara-version-1',
    });
    const reopenedGate = saveGate();
    expect(reopenedGate, JSON.stringify(reopenedGate)).toMatchObject({ blocked: false });
    noZeroGramRows(buildRecipeInput(useRecipeStore.getState()), 'zero Tara reopened');
    expect(
      useRecipeStore
        .getState()
        .items.find(
          (item) =>
            (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
            OWNER_MAPPER_INGREDIENTS.tara_gum.id,
        )?.planned_grams,
    ).toBe(3);
  });

  it('7. reopen: a saved version never reopens with a legacy 0 g optional row; unsaved drafts keep their placeholder', () => {
    const saved = servedSorbet(-12, 'eco', [{ key: 'strawberry', grams: 600 }]);
    const legacy: RecipeInput = {
      ...saved,
      items: saved.items.map((item) =>
        item.id === 'new-recipe-4-inulin'
          ? { ...item, planned_grams: 0 }
          : item.id === 'new-recipe-1-water'
            ? { ...item, planned_grams: item.planned_grams + 55 }
            : item,
      ),
    };
    // Legacy saved version (persisted before the invariant) with an explicit 0 g row.
    useRecipeStore.getState().loadRecipeInput(legacy, {
      savedId: 'legacy-recipe',
      savedName: 'Legacy',
      versionNumber: 3,
      versionId: 'legacy-version-3',
    });
    expect(storeItems().map(([id]) => id)).not.toContain('new-recipe-4-inulin');
    noZeroGramRows(buildRecipeInput(useRecipeStore.getState()), 'reopened version');
    expect(useRecipeStore.getState().savedRecipeId).toBe('legacy-recipe');
    expect(useRecipeStore.getState().currentVersionNumber).toBe(3);
    // The reopened recipe is not silently "current": it must be recalculated.
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);

    // An unsaved draft (no link) keeps the 0 g row: the temporary placeholder semantics.
    useRecipeStore.getState().loadRecipeInput(legacy);
    expect(storeItems()).toContainEqual(['new-recipe-4-inulin', 0]);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('8. Production executable recipe contains no 0 g ingredients (lifecycle + session lines)', () => {
    loadServed(servedSorbet(-12, 'eco', [{ key: 'strawberry', grams: 600 }]));
    stageAndApply('ECO −12 before production');
    const state = useRecipeStore.getState();
    const working = buildRecipeInput(state);
    const session = createProductionSession({
      sessionId: 'run-zero-gram',
      ownerUserId: 'owner',
      source: {
        recipeId: 'recipe',
        recipeVersionId: 'version',
        recipeVersionNumber: 1,
        recipeName: 'Sorbet',
      },
      plannedInput: working,
      startedAt: '2026-08-22T10:00:00.000Z',
    });
    expect(session.lines.length).toBe(working.items.length);
    expect(session.lines.every((line) => line.plannedGrams > 0)).toBe(true);
    noZeroGramRows(session.plannedInput, 'production planned input');

    // A working input with an explicit 0 g optional row is never production-ready.
    const audit = state.practicalRecipeAudit!;
    expect(
      productionRecipeLifecycleState({
        workingInput: working,
        practicalAudit: audit,
        calculationStale: false,
        currentProductionFingerprint: 'fp',
        savedProductionFingerprint: 'fp',
        savedVersionId: 'version',
      }),
    ).not.toBe('TECHNICALLY_STALE');
    const withZero: RecipeInput = {
      ...working,
      items: [
        ...working.items,
        {
          ...working.items[0]!,
          id: 'legacy-zero',
          planned_grams: 0,
          lock_type: 'unlocked',
          actual_grams: null,
        },
      ],
    };
    const zeroAudit = attachPracticalRecipeAudit(withZero, withZero, '2026-08-22T10:00:00.000Z');
    expect(
      productionRecipeLifecycleState({
        workingInput: withZero,
        practicalAudit: {
          modelVersion: audit.modelVersion,
          appliedAt: audit.appliedAt,
          executableFingerprint: practicalRecipeInputFingerprint(withZero),
          exactGramsByLineId: Object.fromEntries(
            withZero.items.map((i) => [i.id, i.planned_grams]),
          ),
          executableGramsByLineId: Object.fromEntries(
            withZero.items.map((i) => [i.id, i.planned_grams]),
          ),
        },
        calculationStale: false,
        currentProductionFingerprint: 'fp',
        savedProductionFingerprint: 'fp',
        savedVersionId: 'version',
      }),
    ).toBe('TECHNICALLY_STALE');
    void zeroAudit;
  });

  it('10. OPTIMAL path: equal Sorbet Crowns and an over-sweet Gelato starter apply without 0 g rows', () => {
    const optimal = servedSorbet(-11, 'optimal', [
      { key: 'strawberry', grams: 300 },
      { key: 'lime', grams: 300 },
    ]);
    loadServed(optimal, {});
    useConstraintStudioStore.getState().createOptimizePreview();
    const clean = useConstraintStudioStore.getState();
    if (clean.preview) {
      const sorbet = stageAndApply('OPTIMAL Sorbet −11');
      expect(
        sorbet.proposedInput.items
          .filter((item) => item.lock_type === 'main')
          .map((item) => item.planned_grams),
      ).toEqual([300, 300]);
    } else {
      // A clean draft is a truthful "already clean" — and it carries no 0 g row.
      expect(clean.previewIssue?.code).toBe('already_clean');
      noZeroGramRows(buildRecipeInput(useRecipeStore.getState()), 'OPTIMAL Sorbet clean draft');
    }

    // OPTIMAL Gelato: an over-sweet milk base needs a real correction → Preview → Apply.
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().loadRecipeInput(overSweetStarter(260));
    useRecipeProfileStore.getState().markRecalculationRequired();
    useConstraintStudioStore.getState().createOptimizePreview();
    const gelato = useConstraintStudioStore.getState();
    console.info(
      'ZERO_GRAM_OPTIMAL_GELATO',
      gelato.preview ? 'preview_applied' : (gelato.previewIssue?.code ?? 'none'),
    );
    if (gelato.preview) {
      noZeroGramRows(gelato.preview.proposedInput, 'OPTIMAL Gelato preview');
      useConstraintStudioStore.getState().applyPreview();
      expect(
        useConstraintStudioStore.getState().blocked,
        useConstraintStudioStore.getState().blocked?.messagePl,
      ).toBeNull();
      noZeroGramRows(buildRecipeInput(useRecipeStore.getState()), 'OPTIMAL Gelato apply');
    } else {
      expect(['already_clean', 'no_proposal', 'best_safe_result', 'unsafe_proposal']).toContain(
        gelato.previewIssue?.code,
      );
      noZeroGramRows(buildRecipeInput(useRecipeStore.getState()), 'OPTIMAL Gelato draft');
    }
  });

  it('11. Direction path: exact five-step candidates that zero optional sugars omit them; held-Main Direction still applies', () => {
    // −11 lime 300 + strawberries 300: the canonical Direction solve previously
    // produced dextrose 0 g / inulin 0 g rows — now both are omitted.
    loadServed(
      servedSorbet(-11, 'eco', [
        { key: 'lime', grams: 300 },
        { key: 'strawberry', grams: 300 },
      ]),
    );
    const multi = stageAndApply('ECO −11 1:1');
    const removed = multi.lines
      .filter((line) => line.kind === 'removed')
      .map((line) => line.lineId);
    for (const lineId of removed) {
      expect(multi.proposedInput.items.map((item) => item.id)).not.toContain(lineId);
    }
    expect(
      multi.proposedInput.items
        .filter((item) => item.lock_type === 'main')
        .map((item) => item.planned_grams),
    ).toEqual([300, 300]);

    // Nearest-achievable softness −1 on the canonical −12 scaffold (served
    // regression fixed in f670e8d) still applies and carries no 0 g row.
    loadServed(servedSorbet(-12, 'eco', [{ key: 'strawberry', grams: 600 }], { softness: -1 }));
    const held = stageAndApply('Direction softness −1');
    expect(held.mainHeldByExactDirection).toBe(true);
    expect(storeItems()).toEqual([
      ['new-recipe-1-water', 156],
      ['new-recipe-2-sucrose', 80],
      ['new-recipe-3-dextrose', 105],
      ['new-recipe-4-inulin', 55],
      ['new-recipe-5-tara_gum', 4],
      ['line-strawberry', 600],
    ]);
  });

  it('12. Rescue path: every rescue candidate is a whole-gram recipe without 0 g rows', () => {
    const input: RecipeInput = {
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      mode: 'classic',
      category: DEFAULT_PRESET.category,
      target_temperature_c: DEFAULT_PRESET.target_temperature_c,
      target_batch_grams: DEFAULT_PRESET.target_batch_grams,
      machine_capacity_grams: null,
    };
    const run = createProductionSession({
      sessionId: 'run-rescue',
      ownerUserId: 'owner',
      source: {
        recipeId: 'recipe',
        recipeVersionId: 'version',
        recipeVersionNumber: 1,
        recipeName: 'Milk base',
      },
      plannedInput: input,
      startedAt: '2026-08-22T10:00:00.000Z',
    });
    const sucrose = run.lines.find((line) => line.name.toLowerCase().includes('sucrose'))!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, sucrose.lineId, sucrose.plannedGrams + 120),
      sucrose.lineId,
      '2026-08-22T10:01:00.000Z',
    );
    const assessment = assessProductionRescue(confirmed);
    expect(['options', 'impossible', 'not_needed']).toContain(assessment.state);
    for (const option of assessment.options) {
      noZeroGramRows(option.candidateInput, `rescue ${option.id}`);
    }
    // Direct practicalization of a rescue candidate that zeroes an optional,
    // not-yet-added line omits that line instead of keeping 0 g.
    const unadded = confirmed.lines.find((line) => line.lineId !== sucrose.lineId)!;
    const zeroed: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === unadded.lineId
          ? { ...item, planned_grams: 0 }
          : item.id === sucrose.lineId
            ? { ...item, planned_grams: item.planned_grams + unadded.plannedGrams }
            : item,
      ),
    };
    const practical = practicalizeProductionRescueCandidate(
      confirmed,
      zeroed,
      input.target_batch_grams,
    );
    if (practical.ok) {
      noZeroGramRows(practical.audit.executableInput, 'rescue candidate');
      expect(practical.audit.executableInput.items.map((item) => item.id)).not.toContain(
        unadded.lineId,
      );
    }
  });

  it('13./14. Sorbet and Gelato regressions: Main lines are never omitted and every applied recipe is positive', () => {
    const sorbet = servedSorbet(-11, 'eco', [
      { key: 'strawberry', grams: 300 },
      { key: 'lime', grams: 300 },
    ]);
    for (const item of sorbet.items.filter((line) => line.lock_type === 'main')) {
      expect(isOmittableUnusedLine({ ...sorbet, items: sorbet.items }, NONE, item)).toBe(false);
    }
    loadServed(sorbet);
    stageAndApply('Sorbet equal Crowns');
    const gelato = starterMilkBase();
    const built = buildOptimizePreview(gelato, NONE, '2026-08-22T10:00:00.000Z');
    if (built.ok) noZeroGramRows(built.preview.proposedInput, 'Gelato preview');
    else expect(['already_clean', 'no_proposal', 'best_safe_result']).toContain(built.code);
  });

  it('15. Vegan regression: formulation fills 0 g placeholders and never emits a 0 g executable row', () => {
    const oat = findVerifiedVeganFormulationCandidate('PI-ING-001565')!;
    const coconut = findVerifiedVeganFormulationCandidate('PI-ING-000163')!;
    const line = (id: string, ingredient: RecipeItem['ingredient'], grams: number): RecipeItem => ({
      id,
      ingredient,
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    const input: RecipeInput = {
      items: [
        line('l-oat', oat, 0),
        line('l-coco', coconut, 0),
        line('l-suc', findDemoIngredient('sucrose')!, 0),
        line('l-dex', findDemoIngredient('dextrose')!, 0),
        line('l-inulin', findDemoIngredient('inulin')!, 0),
      ],
      mode: 'classic',
      category: 'vegan_gelato',
      target_temperature_c: -12,
      target_batch_grams: 1_000,
      machine_capacity_grams: null,
    };
    const built = buildOptimizePreview(input, NONE, '2026-08-22T10:00:00.000Z');
    if (built.ok) {
      noZeroGramRows(built.preview.proposedInput, 'Vegan preview');
      expect(built.preview.practicalization?.status).toBe('ready');
    } else {
      expect([
        'missing_required_role',
        'no_proposal',
        'unsafe_proposal',
        'best_safe_result',
      ]).toContain(built.code);
    }
  });

  it('16. Protein regression: the protein target preview stays a positive whole-gram recipe', () => {
    const proteinDraft: RecipeInput = {
      items: [
        {
          id: 'main-raspberry',
          ingredient: findDemoIngredient('raspberry')!,
          planned_grams: 100,
          actual_grams: null,
          lock_type: 'main',
        },
      ],
      mode: 'signature',
      category: 'protein_gelato',
      target_temperature_c: -12,
      target_batch_grams: 1_000,
      machine_capacity_grams: null,
      goals: {
        flavor_intensity: 'balanced',
        cost_priority: 'balanced',
        target_protein_percent: 20,
      },
    };
    const built = buildOptimizePreview(proteinDraft, NONE, '2026-08-22T10:00:00.000Z');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(built.preview.practicalization?.status).toBe('ready');
    noZeroGramRows(built.preview.proposedInput, 'Protein preview');
  });

  it('17. topping semantics unchanged: toppings are post-process addons outside the BASE projection', () => {
    loadServed(servedSorbet(-12, 'eco', [{ key: 'strawberry', grams: 600 }]));
    const topping = findDemoIngredient('dark_chocolate') ?? findDemoIngredient('sucrose')!;
    useRecipeStore
      .getState()
      .addTopping({ ...topping, kind: 'catalog' } as unknown as Parameters<
        ReturnType<typeof useRecipeStore.getState>['addTopping']
      >[0]);
    const before = useRecipeStore.getState().toppings.map((item) => [item.id, item.planned_grams]);
    expect(before).toHaveLength(1);
    expect(before[0]![1]).toBe(0); // a fresh topping starts as an editor placeholder too
    stageAndApply('ECO −12 with topping');
    // BASE apply never touches toppings; the 0 g topping placeholder stays the user's call.
    expect(useRecipeStore.getState().toppings.map((item) => [item.id, item.planned_grams])).toEqual(
      before,
    );
    useRecipeStore.getState().setToppingGrams(before[0]![0] as string, 20);
    expect(useRecipeStore.getState().toppings[0]!.planned_grams).toBe(20);
    expect(
      useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0),
    ).toBeCloseTo(1_000, 6);
  });
});
