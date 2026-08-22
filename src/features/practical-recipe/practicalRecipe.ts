import { calculateRecipe, detectViolations, type RecipeInput, type RecipeResult } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import {
  verifyConstraintsPreserved,
  type ConstraintSet,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import {
  verifyMainIngredientIdentity,
  type MainIdentityViolation,
} from '@/features/formulation/mainIngredientContract';
import {
  approvedStabilizerDosage,
  assessStabilizerDosage,
  isTemplateControlledStabilizer,
} from '@/features/formulation/stabilizerDosage';
import { classifyViolationBands } from '@/features/formulation/violationBands';

export const PRACTICAL_RECIPE_MODEL_VERSION = 'pro-whole-gram-v1';
export const PRACTICAL_RECIPE_METADATA_KEY = 'pinguino_practical_v1' as const;
const INTEGER_EPSILON = 1e-9;
const MAX_MAIN_COMBINATIONS = 4096;
const MAX_HARD_GATE_REPAIR_ROUNDS = 12;

export type PracticalRecipeBlockCode =
  | 'target_batch_not_whole_gram'
  | 'physical_mass_not_whole_gram'
  | 'exact_gram_lock_not_whole_gram'
  | 'percent_lock_not_whole_gram'
  | 'main_ratio_not_whole_gram_representable'
  | 'batch_residual_unresolved'
  | 'constraint_changed'
  | 'stabilizer_contract_changed'
  | 'stabilizer_outside_approved_window'
  | 'post_rounding_hard_gate';

export interface PracticalRecipeLineTrace {
  lineId: string;
  ingredientName: string;
  exactGrams: number;
  practicalGrams: number;
  deltaGrams: number;
  residualAdjusted: boolean;
  protection:
    | 'physical'
    | 'grams_lock'
    | 'percent_lock'
    | 'main'
    | 'stabilizer'
    | 'unavailable'
    | 'required'
    | 'range'
    | 'editable';
}

export interface PracticalRecipeAudit {
  modelVersion: typeof PRACTICAL_RECIPE_MODEL_VERSION;
  exactInput: RecipeInput;
  exactResult: RecipeResult;
  executableInput: RecipeInput;
  executableResult: RecipeResult;
  lines: PracticalRecipeLineTrace[];
  targetBatchGrams: number;
  exactTotalGrams: number;
  executableTotalGrams: number;
  residualBeforeReconciliationGrams: number;
  residualAfterReconciliationGrams: number;
  exactHardMetrics: string[];
  executableHardMetrics: string[];
  hardGatePassed: boolean;
}

export type PracticalRecipeResult =
  | { ok: true; audit: PracticalRecipeAudit }
  | {
      ok: false;
      code: PracticalRecipeBlockCode;
      lineIds: string[];
      messagePl: string;
      exactInput: RecipeInput;
      exactResult: RecipeResult;
      attemptedInput?: RecipeInput;
      exactHardMetrics: string[];
      executableHardMetrics: string[];
    };

export interface PracticalRecipeSavedAudit {
  modelVersion: typeof PRACTICAL_RECIPE_MODEL_VERSION;
  appliedAt: string;
  executableFingerprint: string;
  exactGramsByLineId: Readonly<Record<string, number>>;
  executableGramsByLineId: Readonly<Record<string, number>>;
}

type PracticalPersistedInput = RecipeInput & {
  [PRACTICAL_RECIPE_METADATA_KEY]?: PracticalRecipeSavedAudit;
};

const canonicalFingerprintValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalFingerprintValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalFingerprintValue(child)]),
    );
  }
  return value;
};

const canonicalFingerprintJson = (value: unknown): string =>
  JSON.stringify(canonicalFingerprintValue(value));

export function practicalRecipeInputFingerprint(input: RecipeInput): string {
  return canonicalFingerprintJson({
    mode: input.mode,
    category: input.category,
    temperature: input.target_temperature_c,
    targetBatch: input.target_batch_grams,
    machineCapacity: input.machine_capacity_grams,
    goals: input.goals ?? null,
    items: input.items.map((item) => ({
      lineId: item.id,
      canonicalId: canonicalIngredientId(item.ingredient),
      ingredientId: item.ingredient.id,
      name: item.ingredient.name,
      category: item.ingredient.category,
      composition: item.ingredient.composition,
      pod: item.ingredient.pod_value,
      pac: item.ingredient.pac_value,
      de: item.ingredient.de_value,
      grams: item.planned_grams,
      actual: item.actual_grams,
      lock: item.lock_type,
      percent: item.percent_constraint ?? null,
      gramsConstraint: item.grams_constraint ?? null,
      range: item.range_constraint ?? null,
    })),
  });
}

export const practicalRecipeAuditMatchesInput = (
  input: RecipeInput,
  audit: PracticalRecipeSavedAudit | null | undefined,
): boolean => {
  if (audit?.modelVersion !== PRACTICAL_RECIPE_MODEL_VERSION) return false;
  const currentFingerprint = practicalRecipeInputFingerprint(input);
  if (audit.executableFingerprint === currentFingerprint) return true;
  try {
    // Fingerprints saved before canonical key ordering may have passed through
    // PostgreSQL jsonb, which reorders nested object keys without changing any
    // technical value. Canonicalize that historical JSON once on comparison;
    // every value still has to match exactly, so this never converts stale
    // evidence into current evidence.
    return canonicalFingerprintJson(JSON.parse(audit.executableFingerprint)) === currentFingerprint;
  } catch {
    return false;
  }
};

export function attachSavedPracticalRecipeAudit(
  input: RecipeInput,
  audit: PracticalRecipeSavedAudit,
): RecipeInput {
  return {
    ...input,
    [PRACTICAL_RECIPE_METADATA_KEY]: structuredClone(audit),
  } as PracticalPersistedInput;
}

export function attachPracticalRecipeAudit(
  input: RecipeInput,
  exactInput: RecipeInput,
  appliedAt: string,
): RecipeInput {
  return {
    ...input,
    [PRACTICAL_RECIPE_METADATA_KEY]: {
      modelVersion: PRACTICAL_RECIPE_MODEL_VERSION,
      appliedAt,
      executableFingerprint: practicalRecipeInputFingerprint(input),
      exactGramsByLineId: Object.fromEntries(
        exactInput.items.map((item) => [item.id, item.planned_grams]),
      ),
      executableGramsByLineId: Object.fromEntries(
        input.items.map((item) => [item.id, item.planned_grams]),
      ),
    },
  } as PracticalPersistedInput;
}

export function readPracticalRecipeAudit(input: RecipeInput): PracticalRecipeSavedAudit | null {
  const value = (input as PracticalPersistedInput)[PRACTICAL_RECIPE_METADATA_KEY];
  if (
    !value ||
    value.modelVersion !== PRACTICAL_RECIPE_MODEL_VERSION ||
    typeof value.appliedAt !== 'string' ||
    typeof value.executableFingerprint !== 'string' ||
    !value.exactGramsByLineId ||
    !value.executableGramsByLineId
  )
    return null;
  return structuredClone(value);
}

const cloneInput = (input: RecipeInput): RecipeInput => ({
  ...input,
  goals: input.goals === undefined ? undefined : structuredClone(input.goals),
  items: input.items.map((item) => ({
    ...item,
    ingredient: item.ingredient,
    percent_constraint:
      item.percent_constraint === undefined ? undefined : { ...item.percent_constraint },
    grams_constraint:
      item.grams_constraint === undefined ? undefined : { ...item.grams_constraint },
  })),
});

const totalPlanned = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);

const isWholeGram = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value - Math.round(value)) <= INTEGER_EPSILON;

const block = (
  exactInput: RecipeInput,
  exactResult: RecipeResult,
  exactHardMetrics: string[],
  code: PracticalRecipeBlockCode,
  lineIds: string[],
  messagePl: string,
  attemptedInput?: RecipeInput,
  executableHardMetrics: string[] = [],
): PracticalRecipeResult => ({
  ok: false,
  code,
  lineIds,
  messagePl,
  exactInput,
  exactResult,
  attemptedInput,
  exactHardMetrics,
  executableHardMetrics,
});

const constraintFor = (set: ConstraintSet, lineId: string): IngredientConstraint | undefined =>
  set.byLineId[lineId];

const percentFor = (
  input: RecipeInput,
  set: ConstraintSet,
  item: RecipeInput['items'][number],
): number | null => {
  const constraint = constraintFor(set, item.id);
  if (constraint?.mode === 'percent') return constraint.percent;
  if (item.percent_constraint !== undefined) return item.percent_constraint.percent;
  if (constraint === undefined && item.lock_type === 'percent' && input.target_batch_grams > 0) {
    return (item.planned_grams / input.target_batch_grams) * 100;
  }
  return null;
};

const exactGramsLockFor = (
  set: ConstraintSet,
  item: RecipeInput['items'][number],
): number | null => {
  const constraint = set.byLineId[item.id];
  if (constraint?.mode === 'locked') return constraint.grams;
  if (item.grams_constraint !== undefined) return item.grams_constraint.grams;
  if (constraint === undefined && item.lock_type === 'grams') return item.planned_grams;
  // Required is an accepted stronger contract in the current Apply door: the
  // line identity and its established amount are byte-exact. Practicalization
  // may never weaken that guarantee merely because the UI calls it a role.
  if (item.lock_type === 'required') return item.planned_grams;
  return null;
};

const rangeFor = (
  set: ConstraintSet,
  item: RecipeInput['items'][number],
): { minGrams: number; maxGrams: number } | null => {
  const constraint = set.byLineId[item.id];
  if (constraint?.mode === 'range') {
    return { minGrams: constraint.minGrams, maxGrams: constraint.maxGrams };
  }
  if (item.range_constraint !== undefined) {
    return {
      minGrams: item.range_constraint.min_grams,
      maxGrams: item.range_constraint.max_grams,
    };
  }
  return null;
};

const unavailableCanonicalIds = (input: RecipeInput): ReadonlySet<string> =>
  new Set([
    ...(input.goals?.excluded_ingredient_ids ?? []),
    ...(input.goals?.unavailable_main_ingredient_ids ?? []),
  ]);

function protectionFor(
  input: RecipeInput,
  set: ConstraintSet,
  item: RecipeInput['items'][number],
): PracticalRecipeLineTrace['protection'] {
  if (item.actual_grams !== null || item.lock_type === 'already_added') return 'physical';
  if (exactGramsLockFor(set, item) !== null) return 'grams_lock';
  if (percentFor(input, set, item) !== null) return 'percent_lock';
  if (item.lock_type === 'main') return 'main';
  if (isTemplateControlledStabilizer(item.ingredient)) return 'stabilizer';
  if (unavailableCanonicalIds(input).has(canonicalIngredientId(item.ingredient))) {
    return 'unavailable';
  }
  if (item.lock_type === 'required') return 'required';
  if (set.byLineId[item.id]?.mode === 'range') return 'range';
  return 'editable';
}

/**
 * Owner zero-gram executable invariant (2026-08-22). A recipe line is
 * "optional" when it is an unlocked Standard line with no physical mass, no
 * gram/percent/range contract, no Main/required role and no template-controlled
 * stabilizer contract (an unavailable/excluded Standard line counts as optional:
 * driven to 0 g it is simply not used, and its exclusion record lives in the
 * recipe goals, not in the row). When the Engine resolves such a line to exactly
 * 0 g, the executable recipe OMITS the row: "not used" is the absence of the
 * ingredient, never an explicit 0 g ingredient row. Every protected line keeps
 * its contract (a 0 g contract line is an unfinished editor placeholder that
 * the PI guard refuses before any candidate exists).
 */
export const isOmittableUnusedLine = (
  input: RecipeInput,
  set: ConstraintSet,
  item: RecipeInput['items'][number],
): boolean =>
  item.actual_grams === null &&
  item.lock_type === 'unlocked' &&
  exactGramsLockFor(set, item) === null &&
  percentFor(input, set, item) === null &&
  rangeFor(set, item) === null &&
  !isTemplateControlledStabilizer(item.ingredient);

/** Line ids of optional lines that currently weigh exactly 0 g. */
export const unusedZeroGramLineIds = (input: RecipeInput, set: ConstraintSet): string[] =>
  input.items
    .filter((item) => item.planned_grams === 0 && isOmittableUnusedLine(input, set, item))
    .map((item) => item.id);

function mainIntegerCandidates(
  exactInput: RecipeInput,
  rounded: RecipeInput,
  set: ConstraintSet,
): RecipeInput | null {
  const mainIndexes = exactInput.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.lock_type === 'main' && item.planned_grams > 0);
  if (mainIndexes.length <= 1) return rounded;

  const candidateValues = mainIndexes.map(({ item, index }) => {
    const alreadyFixed = rounded.items[index]!.planned_grams;
    if (
      item.actual_grams !== null ||
      item.grams_constraint !== undefined ||
      item.percent_constraint !== undefined
    ) {
      return [alreadyFixed];
    }
    return [
      ...new Set([
        Math.round(item.planned_grams),
        Math.floor(item.planned_grams),
        Math.ceil(item.planned_grams),
      ]),
    ].filter((value) => value > 0);
  });

  let explored = 0;
  let bestInput: RecipeInput | null = null;
  let bestError = Number.POSITIVE_INFINITY;
  let bestOrder = '';
  const chosen: number[] = [];

  const visit = (depth: number): void => {
    if (explored >= MAX_MAIN_COMBINATIONS) return;
    if (depth < candidateValues.length) {
      for (const value of candidateValues[depth]!) {
        chosen.push(value);
        visit(depth + 1);
        chosen.pop();
      }
      return;
    }
    explored += 1;
    const candidate = cloneInput(rounded);
    mainIndexes.forEach(({ index }, position) => {
      candidate.items[index] = { ...candidate.items[index]!, planned_grams: chosen[position]! };
    });
    if (!verifyMainIngredientIdentity(exactInput, candidate, set.byLineId).ok) return;
    const error = mainIndexes.reduce(
      (sum, { item }, position) => sum + Math.abs(chosen[position]! - item.planned_grams),
      0,
    );
    const order = chosen.join('|');
    if (
      bestInput === null ||
      error < bestError - INTEGER_EPSILON ||
      (Math.abs(error - bestError) <= INTEGER_EPSILON && order < bestOrder)
    ) {
      bestInput = candidate;
      bestError = error;
      bestOrder = order;
    }
  };
  visit(0);
  return bestInput;
}

function reconcileResidual(
  exactInput: RecipeInput,
  roundedInput: RecipeInput,
  set: ConstraintSet,
): { input: RecipeInput; adjustedLineIds: Set<string>; residualBefore: number } | null {
  const target = Math.round(exactInput.target_batch_grams);
  const residualBefore = target - totalPlanned(roundedInput);
  if (Math.abs(residualBefore) <= INTEGER_EPSILON) {
    return { input: roundedInput, adjustedLineIds: new Set(), residualBefore: 0 };
  }

  const direction = residualBefore > 0 ? 1 : -1;
  const unavailable = unavailableCanonicalIds(exactInput);
  const candidates = exactInput.items
    .map((item, index) => ({ item, index, practical: roundedInput.items[index]! }))
    .filter(({ item, practical }) => {
      if (item.actual_grams !== null || item.lock_type !== 'unlocked') return false;
      if (set.byLineId[item.id] !== undefined) return false;
      if (item.percent_constraint !== undefined || item.grams_constraint !== undefined)
        return false;
      if (isTemplateControlledStabilizer(item.ingredient)) return false;
      if (unavailable.has(canonicalIngredientId(item.ingredient))) return false;
      if (direction < 0 && practical.planned_grams <= 0) return false;
      return true;
    })
    .map(({ item, index, practical }) => ({
      item,
      index,
      practical,
      errorCost:
        Math.abs(practical.planned_grams + direction - item.planned_grams) -
        Math.abs(practical.planned_grams - item.planned_grams),
    }))
    .sort((a, b) => a.errorCost - b.errorCost || a.index - b.index);

  const requiredAdjustments = Math.abs(Math.round(residualBefore));
  if (requiredAdjustments > candidates.length) return null;

  const input = cloneInput(roundedInput);
  const adjustedLineIds = new Set<string>();
  for (let index = 0; index < requiredAdjustments; index += 1) {
    const candidate = candidates[index]!;
    const current = input.items[candidate.index]!;
    input.items[candidate.index] = {
      ...current,
      planned_grams: current.planned_grams + direction,
    };
    adjustedLineIds.add(candidate.item.id);
  }
  return { input, adjustedLineIds, residualBefore };
}

const wholeGramTransferEligible = (
  input: RecipeInput,
  set: ConstraintSet,
  item: RecipeInput['items'][number],
): boolean => protectionFor(input, set, item) === 'editable';

const hardGateMeasure = (
  input: RecipeInput,
): { metrics: string[]; count: number; severity: number } => {
  const metrics = classifyViolationBands(input).hardMetrics;
  const metricSet = new Set(metrics);
  const severity = detectViolations(calculateRecipe(input))
    .filter((violation) => metricSet.has(violation.metric))
    .reduce((sum, violation) => sum + violation.severity_points, 0);
  return { metrics, count: metrics.length, severity };
};

const measureIsBetter = (
  candidate: ReturnType<typeof hardGateMeasure>,
  current: ReturnType<typeof hardGateMeasure>,
): boolean =>
  candidate.count < current.count ||
  (candidate.count === current.count && candidate.severity < current.severity - INTEGER_EPSILON);

/**
 * Nearest integer rounding can place a value a fraction beyond a native band.
 * Search only paired 1 g transfers between ordinary editable lines, preserving
 * the exact batch and every stronger contract. Every candidate is evaluated by
 * the frozen Engine; there are no replicated formulas or inferred gradients.
 */
function repairIntroducedHardGate(
  exactInput: RecipeInput,
  initial: RecipeInput,
  set: ConstraintSet,
  exactHardMetrics: readonly string[],
): RecipeInput | null {
  let working = cloneInput(initial);
  let measure = hardGateMeasure(working);
  const introduced = (): string[] =>
    measure.metrics.filter((metric) => !exactHardMetrics.includes(metric));
  if (introduced().length === 0) return working;

  const eligibleIndexes = exactInput.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => wholeGramTransferEligible(exactInput, set, item))
    .map(({ index }) => index);
  const visited = new Set<string>();

  for (let round = 0; round < MAX_HARD_GATE_REPAIR_ROUNDS; round += 1) {
    const key = working.items.map((item) => item.planned_grams).join('|');
    visited.add(key);
    let best: {
      input: RecipeInput;
      measure: ReturnType<typeof hardGateMeasure>;
      cost: number;
      order: string;
    } | null = null;

    for (const donorIndex of eligibleIndexes) {
      if (working.items[donorIndex]!.planned_grams < 1) continue;
      for (const receiverIndex of eligibleIndexes) {
        if (receiverIndex === donorIndex) continue;
        const candidate = cloneInput(working);
        candidate.items[donorIndex] = {
          ...candidate.items[donorIndex]!,
          planned_grams: candidate.items[donorIndex]!.planned_grams - 1,
        };
        candidate.items[receiverIndex] = {
          ...candidate.items[receiverIndex]!,
          planned_grams: candidate.items[receiverIndex]!.planned_grams + 1,
        };
        const candidateKey = candidate.items.map((item) => item.planned_grams).join('|');
        if (visited.has(candidateKey)) continue;
        const candidateMeasure = hardGateMeasure(candidate);
        if (!measureIsBetter(candidateMeasure, measure)) continue;
        const cost = candidate.items.reduce(
          (sum, item, index) =>
            sum + Math.abs(item.planned_grams - exactInput.items[index]!.planned_grams),
          0,
        );
        const order = `${donorIndex}|${receiverIndex}`;
        if (
          best === null ||
          candidateMeasure.count < best.measure.count ||
          (candidateMeasure.count === best.measure.count &&
            (candidateMeasure.severity < best.measure.severity - INTEGER_EPSILON ||
              (Math.abs(candidateMeasure.severity - best.measure.severity) <= INTEGER_EPSILON &&
                (cost < best.cost - INTEGER_EPSILON ||
                  (Math.abs(cost - best.cost) <= INTEGER_EPSILON && order < best.order)))))
        ) {
          best = { input: candidate, measure: candidateMeasure, cost, order };
        }
      }
    }

    if (best === null) return null;
    working = best.input;
    measure = best.measure;
    if (introduced().length === 0) return working;
  }
  return null;
}

/**
 * Convert one already-computed exact Pro candidate into the physical whole-gram
 * recipe that will actually be weighed. This is product orchestration only:
 * the frozen Engine is called before and after, and remains the sole source of
 * every scientific metric and hard-band verdict.
 */
export function practicalizeRecipeCandidate(
  exactInput: RecipeInput,
  set: ConstraintSet,
): PracticalRecipeResult {
  const exact = cloneInput(exactInput);
  const exactResult = calculateRecipe(exact);
  const exactHardMetrics = classifyViolationBands(exact).hardMetrics;
  if (!isWholeGram(exact.target_batch_grams)) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'target_batch_not_whole_gram',
      [],
      'Docelowa partia nie jest pełną liczbą gramów. Ustaw pełne gramy partii przed przygotowaniem receptury wykonawczej.',
    );
  }

  const rounded = cloneInput(exact);
  const unavailable = unavailableCanonicalIds(exact);
  for (let index = 0; index < exact.items.length; index += 1) {
    const item = exact.items[index]!;
    const physical = item.actual_grams !== null || item.lock_type === 'already_added';
    if (physical && !isWholeGram(item.planned_grams)) {
      return block(
        exact,
        exactResult,
        exactHardMetrics,
        'physical_mass_not_whole_gram',
        [item.id],
        `${item.ingredient.name}: materiał fizycznie dodany nie może zostać zaokrąglony ani przepisany.`,
      );
    }

    const gramsLock = exactGramsLockFor(set, item);
    if (gramsLock !== null) {
      if (!isWholeGram(gramsLock)) {
        return block(
          exact,
          exactResult,
          exactHardMetrics,
          'exact_gram_lock_not_whole_gram',
          [item.id],
          `${item.ingredient.name}: dokładna blokada gramów (${gramsLock} g) nie daje receptury w pełnych gramach.`,
        );
      }
      rounded.items[index] = { ...rounded.items[index]!, planned_grams: Math.round(gramsLock) };
      continue;
    }

    const percent = percentFor(exact, set, item);
    if (percent !== null) {
      const lockedGrams = (exact.target_batch_grams * percent) / 100;
      if (!isWholeGram(lockedGrams)) {
        return block(
          exact,
          exactResult,
          exactHardMetrics,
          'percent_lock_not_whole_gram',
          [item.id],
          `${item.ingredient.name}: blokada ${percent}% daje ${lockedGrams} g, czego nie można wykonać w pełnych gramach bez złamania udziału.`,
        );
      }
      rounded.items[index] = { ...rounded.items[index]!, planned_grams: Math.round(lockedGrams) };
      continue;
    }

    const range = rangeFor(set, item);
    if (range !== null) {
      const minimumWholeGram = Math.ceil(range.minGrams - INTEGER_EPSILON);
      const maximumWholeGram = Math.floor(range.maxGrams + INTEGER_EPSILON);
      if (minimumWholeGram > maximumWholeGram) {
        return block(
          exact,
          exactResult,
          exactHardMetrics,
          'constraint_changed',
          [item.id],
          `${item.ingredient.name}: zakres ${range.minGrams}–${range.maxGrams} g nie zawiera żadnej wykonalnej pełnej liczby gramów.`,
          rounded,
        );
      }
      rounded.items[index] = {
        ...rounded.items[index]!,
        planned_grams: Math.min(
          maximumWholeGram,
          Math.max(minimumWholeGram, Math.round(item.planned_grams)),
        ),
      };
      continue;
    }

    if (
      unavailable.has(canonicalIngredientId(item.ingredient)) &&
      item.planned_grams > INTEGER_EPSILON
    ) {
      rounded.items[index] = {
        ...rounded.items[index]!,
        planned_grams: Math.round(item.planned_grams),
      };
      continue;
    }
    rounded.items[index] = {
      ...rounded.items[index]!,
      planned_grams: Math.round(item.planned_grams),
    };
  }

  const withMain = mainIntegerCandidates(exact, rounded, set);
  if (withMain === null) {
    const mainIds = exact.items.filter((item) => item.lock_type === 'main').map((item) => item.id);
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'main_ratio_not_whole_gram_representable',
      mainIds,
      'Proporcji składników Głównych nie da się zachować w pełnych gramach dla tej partii.',
      rounded,
    );
  }

  const reconciled = reconcileResidual(exact, withMain, set);
  if (reconciled === null) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'batch_residual_unresolved',
      [],
      'Po zaokrągleniu pozostaje różnica partii, której nie można przypisać bez naruszenia blokad, Main, stabilizatora lub dostępności.',
      withMain,
    );
  }
  let executable = reconciled.input;

  const constraints = verifyConstraintsPreserved(set, executable);
  if (!constraints.ok) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'constraint_changed',
      [...new Set(constraints.violations.map((violation) => violation.lineId))],
      'Pełne gramy naruszyły blokadę receptury. PI nie zastosowało zaokrąglenia.',
      executable,
    );
  }

  const main = verifyMainIngredientIdentity(exact, executable, set.byLineId);
  if (!main.ok) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'main_ratio_not_whole_gram_representable',
      [
        ...new Set(
          main.violations.flatMap((violation: MainIdentityViolation) => violation.lineIds),
        ),
      ],
      'Pełne gramy zmieniłyby tożsamość lub proporcję składników Głównych.',
      executable,
    );
  }

  const stabilizerChanged = exact.items.filter((item, index) => {
    if (!isTemplateControlledStabilizer(item.ingredient)) return false;
    return executable.items[index]!.planned_grams !== Math.round(item.planned_grams);
  });
  if (stabilizerChanged.length > 0) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'stabilizer_contract_changed',
      stabilizerChanged.map((item) => item.id),
      'Stabilizator nie może przejmować różnicy po zaokrągleniu.',
      executable,
    );
  }

  const unapprovedRoundedStabilizers = exact.items.filter((item, index) => {
    if (!isTemplateControlledStabilizer(item.ingredient)) return false;
    if (Object.is(executable.items[index]!.planned_grams, item.planned_grams)) return false;
    return (
      approvedStabilizerDosage(canonicalIngredientId(item.ingredient)) === null &&
      approvedStabilizerDosage(item.ingredient.id) === null
    );
  });
  if (unapprovedRoundedStabilizers.length > 0) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'stabilizer_contract_changed',
      unapprovedRoundedStabilizers.map((item) => item.id),
      'Ten stabilizator nie ma zatwierdzonego kontraktu dawki do praktycznego zaokrąglenia. PI zachowało dokładną wartość i zablokowało wersję wykonawczą.',
      executable,
    );
  }

  const exactStabilizers = new Map(
    assessStabilizerDosage(exact).map((assessment) => [assessment.lineId, assessment]),
  );
  const stabilizerOutside = assessStabilizerDosage(executable).filter((assessment) => {
    if (assessment.window === null || assessment.status === 'within_window') return false;
    const before = exactStabilizers.get(assessment.lineId);
    // Practicalization is not a second stabilizer-science gate. It rejects a
    // dosage violation only when the whole-gram transform introduces it or
    // pushes an established frozen dose farther outside its approved window.
    if (before && before.window !== null && before.status !== 'within_window') {
      return (
        assessment.status !== before.status ||
        (assessment.status === 'below_window' && assessment.grams < before.grams) ||
        (assessment.status === 'above_window' && assessment.grams > before.grams)
      );
    }
    return true;
  });
  if (stabilizerOutside.length > 0) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'stabilizer_outside_approved_window',
      stabilizerOutside.map((assessment) => assessment.lineId),
      'Zaokrąglona dawka stabilizatora wychodzi poza zatwierdzone okno dozowania.',
      executable,
    );
  }

  let executableResult = calculateRecipe(executable);
  let executableHardMetrics = classifyViolationBands(executable).hardMetrics;
  let newHardMetrics = executableHardMetrics.filter((metric) => !exactHardMetrics.includes(metric));
  if (newHardMetrics.length > 0) {
    const repaired = repairIntroducedHardGate(exact, executable, set, exactHardMetrics);
    if (repaired !== null) {
      executable = repaired;
      executableResult = calculateRecipe(executable);
      executableHardMetrics = classifyViolationBands(executable).hardMetrics;
      newHardMetrics = executableHardMetrics.filter((metric) => !exactHardMetrics.includes(metric));
    }
  }
  if (newHardMetrics.length > 0) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'post_rounding_hard_gate',
      [],
      `Pełne gramy wprowadzają problem technologiczny: ${newHardMetrics.join(', ')}. PI nie zastosowało tej wersji.`,
      executable,
      executableHardMetrics,
    );
  }

  const executableTotalGrams = totalPlanned(executable);
  if (Math.abs(executableTotalGrams - exact.target_batch_grams) > INTEGER_EPSILON) {
    return block(
      exact,
      exactResult,
      exactHardMetrics,
      'batch_residual_unresolved',
      [],
      'Suma pełnych gramów nie zgadza się z docelową partią.',
      executable,
      executableHardMetrics,
    );
  }

  // Owner zero-gram executable invariant: optional lines the Engine resolved
  // to exactly 0 g are OMITTED from the executable recipe. Every verdict above
  // was computed with those rows weighing 0 g, so metrics, hard bands, locks,
  // Main identity, stabilizer contracts and the batch total are unchanged —
  // only the explicit 0 g rows disappear (absence ≠ explicit 0 g row).
  const omittedLineIds = new Set(unusedZeroGramLineIds(executable, set));
  const executableInput: RecipeInput =
    omittedLineIds.size === 0
      ? executable
      : { ...executable, items: executable.items.filter((item) => !omittedLineIds.has(item.id)) };
  const executableById = new Map(executable.items.map((item) => [item.id, item] as const));
  const reconciledById = new Map(reconciled.input.items.map((item) => [item.id, item] as const));

  return {
    ok: true,
    audit: {
      modelVersion: PRACTICAL_RECIPE_MODEL_VERSION,
      exactInput: exact,
      exactResult,
      executableInput,
      executableResult:
        omittedLineIds.size === 0 ? executableResult : calculateRecipe(executableInput),
      lines: exact.items.map((item) => {
        const practical = executableById.get(item.id)?.planned_grams ?? 0;
        return {
          lineId: item.id,
          ingredientName: item.ingredient.name,
          exactGrams: item.planned_grams,
          practicalGrams: practical,
          deltaGrams: practical - item.planned_grams,
          residualAdjusted:
            reconciled.adjustedLineIds.has(item.id) ||
            practical !== (reconciledById.get(item.id)?.planned_grams ?? 0),
          protection: protectionFor(exact, set, item),
        };
      }),
      targetBatchGrams: exact.target_batch_grams,
      exactTotalGrams: totalPlanned(exact),
      executableTotalGrams,
      residualBeforeReconciliationGrams: reconciled.residualBefore,
      residualAfterReconciliationGrams: exact.target_batch_grams - executableTotalGrams,
      exactHardMetrics,
      executableHardMetrics,
      hardGatePassed: executableHardMetrics.length === 0,
    },
  };
}
