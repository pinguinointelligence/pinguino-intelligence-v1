/**
 * ONE PREPARATION PLAN (owner brief, 2026-09-17).
 *
 * A deterministic projection of data the recipe already carries: the recipe
 * line order, the role of each line (Base or topping), the line's OWN frozen
 * ProductBehaviorSnapshot process evidence and the selected machine guide. It
 * adds no process knowledge, no temperature and no time, persists nothing,
 * gates nothing and never changes a gram. Unknown stays unknown.
 *
 * Order rule. Base lines keep the recipe order. Only when a line carries
 * verified heat evidence does the plan add one heat step, after the last such
 * line, and only two kinds of verified-cold line move behind it: fresh fruit
 * (owner, 2026-09-17: fresh ingredients that need no heat are blended cold) and
 * heat-sensitive lines (their verified guidance: heating is not assumed).
 * Capability is not a plan: a verified-cold line that is neither stays where
 * the recipe puts it, heated part included. An unknown line is neither heated
 * nor skipped because of its status (owner addendum 2026-09-17): it keeps its
 * recipe position, and where that position falls after cooling the missing
 * instruction is stated on the line.
 */
import { educationCopy } from '@/copy/education.pl';
import type { RecipeInput } from '@/engine';
import type { MachineEducationGuide } from '@/features/education/machineEducation';
import { isVerifiedProcessEvidence } from '@/features/education/processClassification';
import type { PreparationIllustration } from '@/features/education/preparationIllustrations';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { ProductionSession } from './productionSession';

const copy = educationCopy.preparation;

/**
 * Conditions of use carried by the evidence source itself. A generic ingredient
 * approved for cold use only under a stated condition shows that condition on
 * its line; it is never shown as a confirmed property of a concrete product.
 * Keyed by the exact source reference, never by a name.
 */
export const OWNER_CONDITION_BY_SOURCE_REFERENCE: Readonly<Record<string, string>> = {
  'OWNER_ADDENDUM_2026-09-17_MILK_PASTEURIZED_UHT':
    educationCopy.preparation.conditions.pasteurizedOrUhtMilk,
};

/** Owner decision 2026-09-17 — fresh strawberries used as a topping in pieces.
 * Keyed by the exact Mapper concept and form, never by a name or an EAN. */
export const OWNER_FRESH_STRAWBERRY_TOPPING_RULE = {
  id: 'owner-2026-09-17-fresh-strawberry-topping',
  mapperIngredientId: 'PI-ING-001553',
  formId: 'fresh',
} as const;

export type PreparationLineProcess = 'cold' | 'heat' | 'conflict' | 'unknown';

export interface PreparationLineFacts {
  process: PreparationLineProcess;
  /** A verified evidence entry carries late-addition guidance (heat-sensitive product). */
  heatSensitive: boolean;
  /** The frozen product is fresh fruit (family `fruit`, form `fresh`). */
  fresh: boolean;
  /** Condition of use stated by the verified evidence source (e.g. pasteurised/UHT milk). */
  condition: string | null;
  sourceIds: readonly string[];
}

export interface PreparationPlanLine {
  lineId: string;
  name: string;
  /** Current target shown to the user (after any accepted Rescue). */
  grams: number;
  /** Immutable planned quantity. Decides whether the line takes part in the heat
   * step, so a later Rescue cannot create or move that step under confirmed lines. */
  plannedGrams: number;
  /** The physical addition is confirmed in the existing Production record. */
  done: boolean;
}

export interface PreparationPlanInput {
  /** Planned Base lines in recipe order (the Production session order). */
  baseLines: readonly PreparationPlanLine[];
  /** Lines a verified Rescue appended after the batch started. */
  appendedBaseLines?: readonly PreparationPlanLine[];
  /** Topping lines in topping order. */
  addonLines: readonly PreparationPlanLine[];
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  machineGuide: MachineEducationGuide | null;
}

export type PreparationStep =
  | {
      kind: 'machine_before';
      id: 'machine:before';
      title: string;
      details: readonly string[];
      timing: string;
      sourceIds: readonly string[];
    }
  | {
      kind: 'line';
      id: string;
      scope: 'base' | 'addon';
      lineId: string;
      name: string;
      grams: number;
      done: boolean;
      process: PreparationLineProcess;
      instruction: string;
      note: string | null;
      /** The line left its recipe position for a documented reason. */
      moved: boolean;
      /** Added after the heat step and its cooling (not a Rescue addition). */
      afterCooling: boolean;
      sourceIds: readonly string[];
    }
  | {
      kind: 'heat';
      id: 'heat';
      title: string;
      productNames: readonly string[];
      heatLineIds: readonly string[];
      /** Base lines placed before this step. */
      precedingLineIds: readonly string[];
      details: readonly string[];
      sourceIds: readonly string[];
    }
  | {
      kind: 'machine';
      id: 'machine:run';
      title: string;
      details: readonly string[];
      timing: string | null;
      sourceMachineId: string | null;
      /** The registered owner illustration of this machine's step, if any. */
      illustration: PreparationIllustration | null;
      sourceIds: readonly string[];
    };

export interface PreparationPlan {
  steps: readonly PreparationStep[];
  /** Base line ids in the order the plan asks for them. */
  baseLineOrder: readonly string[];
}

export function preparationLineFacts(
  lineId: string,
  snapshot: ProductBehaviorSnapshot | undefined,
): PreparationLineFacts {
  const usable = snapshot?.lineId === lineId ? snapshot : null;
  const verified = (usable?.sharedFacts?.processEvidence ?? []).filter(isVerifiedProcessEvidence);
  const heat = verified.some(
    (entry) =>
      entry.decision === 'heat_required_for_function' ||
      entry.decision === 'heat_required_for_safety',
  );
  const cold = verified.some((entry) => entry.decision === 'cold_process_approved');
  const condition =
    verified
      .filter((entry) => entry.decision === 'cold_process_approved')
      .map((entry) => OWNER_CONDITION_BY_SOURCE_REFERENCE[entry.source.reference.trim()])
      .find((text): text is string => Boolean(text)) ?? null;
  return {
    process: heat && cold ? 'conflict' : heat ? 'heat' : cold ? 'cold' : 'unknown',
    heatSensitive: verified.some((entry) => Boolean(entry.lateAdditionGuidance?.trim())),
    // Fresh FRUIT only: the Mapper form `fresh` also covers fresh milk and cream.
    fresh: usable?.familyId === 'fruit' && usable.formId === 'fresh',
    condition: heat ? null : condition,
    sourceIds: [...new Set(verified.map((entry) => entry.source.id))],
  };
}

/** Verified cold AND (fresh fruit OR heat-sensitive): added after the heat step and its cooling. */
const addsAfterCooling = (facts: PreparationLineFacts): boolean =>
  facts.process === 'cold' && (facts.fresh || facts.heatSensitive);

interface BaseSplit<T> {
  heatLineIds: readonly string[];
  /** Null when no Base line needs heat: the recipe order stands unchanged. */
  heated: readonly T[] | null;
  afterCooling: readonly T[];
  /** Recipe position of the last counted line with heat evidence (heat or conflict). */
  boundaryIndex: number;
}

/**
 * The heat step follows the last counted line with verified heat evidence (a
 * conflicting line included).
 * Lines before it form the heated part, except verified-cold fresh fruit and
 * verified-cold heat-sensitive lines, which move behind the step.
 */
function splitBase<T extends { lineId: string }>(
  lines: readonly T[],
  facts: (lineId: string) => PreparationLineFacts,
  grams: (line: T) => number,
): BaseSplit<T> {
  // A 0 g placeholder is not added, so it neither needs heat nor places the step
  // (the server's process readiness skips it the same way).
  const counts = (line: T) => grams(line) > 0;
  const heatLineIds = lines
    .filter((line) => counts(line) && facts(line.lineId).process === 'heat')
    .map((line) => line.lineId);
  if (heatLineIds.length === 0) {
    return { heatLineIds, heated: null, afterCooling: lines, boundaryIndex: -1 };
  }
  // A conflicting line still carries a heat (possibly safety) requirement: it bounds the
  // heated part so its requirement is never cancelled by position, but it is not named.
  const boundaryIndex = lines.reduce(
    (last, line, index) =>
      counts(line) && ['heat', 'conflict'].includes(facts(line.lineId).process) ? index : last,
    -1,
  );
  const inHeatedPart = (line: T, index: number) =>
    index <= boundaryIndex && !addsAfterCooling(facts(line.lineId));
  return {
    heatLineIds,
    heated: lines.filter(inHeatedPart),
    afterCooling: lines.filter((line, index) => !inHeatedPart(line, index)),
    boundaryIndex,
  };
}

/**
 * Base lines in plan order. Shared by the plan, the PRO active row and the HOME
 * card. Only the ORIGINAL planned lines take part in the split; lines a Rescue
 * appended afterwards follow the plan and can never move the heat step.
 */
export function preparationOrderedBaseLines<
  T extends { lineId: string; plannedGrams: number },
>(session: {
  lines: readonly T[];
  plannedInput?: Pick<RecipeInput, 'items'>;
  plannedComposition?: Pick<RecipeCompositionMetadata, 'behaviorSnapshots'>;
}): T[] {
  const { planned, appended } = partitionPlannedLines(session.lines, session.plannedInput);
  const snapshots = session.plannedComposition?.behaviorSnapshots ?? {};
  const split = splitBase(
    planned,
    (lineId) => preparationLineFacts(lineId, snapshots[lineId]),
    (line) => line.plannedGrams,
  );
  return split.heated === null
    ? [...planned, ...appended]
    : [...split.heated, ...split.afterCooling, ...appended];
}

function partitionPlannedLines<T extends { lineId: string }>(
  lines: readonly T[],
  plannedInput: Pick<RecipeInput, 'items'> | undefined,
): { planned: T[]; appended: T[] } {
  if (!plannedInput) return { planned: [...lines], appended: [] };
  const plannedIds = new Set(plannedInput.items.map((item) => item.id));
  return {
    planned: lines.filter((line) => plannedIds.has(line.lineId)),
    appended: lines.filter((line) => !plannedIds.has(line.lineId)),
  };
}

/**
 * Line notes speak about what the data positively says. An unknown process gets
 * a note only where it matters for the sequence — after cooling — so the plan
 * never implies it was approved for cold use.
 */
const processMarker = (process: PreparationLineProcess): string | null =>
  process === 'heat' ? copy.markers.heat : process === 'conflict' ? copy.markers.conflict : null;

function baseLineStep(
  line: PreparationPlanLine,
  facts: PreparationLineFacts,
  context: { heatStep: boolean; afterHeatStep: boolean; moved: boolean },
): PreparationStep {
  const freshCold = facts.process === 'cold' && facts.fresh;
  const heatSensitiveCold = context.heatStep && facts.process === 'cold' && facts.heatSensitive;
  // Blending is named only where the cooled base already exists to blend into.
  const instruction = freshCold
    ? context.afterHeatStep
      ? copy.actions.washAddColdAndBlend
      : copy.actions.washAndAddCold
    : heatSensitiveCold
      ? copy.actions.addAfterCooling
      : copy.actions.add;
  // Nothing is added by a line with no planned and no current grams (a Rescue can
  // raise a planned 0 g line; that addition gets its note).
  const note =
    line.plannedGrams <= 0 && line.grams <= 0
      ? null
      : facts.condition !== null
        ? // The stated condition of use is the line's only cold/heat-neutral fact.
          facts.condition
        : facts.process === 'unknown'
          ? context.afterHeatStep
            ? copy.markers.unknown
            : null
          : facts.process !== 'cold'
            ? processMarker(facts.process)
            : heatSensitiveCold
              ? copy.markers.heatSensitive
              : freshCold || (context.heatStep && !context.afterHeatStep)
                ? null
                : copy.markers.cold;
  return {
    kind: 'line',
    id: `line:${line.lineId}`,
    scope: 'base',
    lineId: line.lineId,
    name: line.name,
    grams: line.grams,
    done: line.done,
    process: facts.process,
    instruction,
    note,
    moved: context.moved,
    afterCooling: context.afterHeatStep,
    sourceIds: facts.sourceIds,
  };
}

function addonLineStep(
  line: PreparationPlanLine,
  snapshot: ProductBehaviorSnapshot | undefined,
  facts: PreparationLineFacts,
): PreparationStep {
  const usable = snapshot?.lineId === line.lineId ? snapshot : null;
  const ownerStrawberry =
    usable?.processScope === 'POST_PROCESS_ADDON' &&
    usable.mapperIngredientId === OWNER_FRESH_STRAWBERRY_TOPPING_RULE.mapperIngredientId &&
    usable.formId === OWNER_FRESH_STRAWBERRY_TOPPING_RULE.formId;
  return {
    kind: 'line',
    id: `line:${line.lineId}`,
    scope: 'addon',
    lineId: line.lineId,
    name: line.name,
    grams: line.grams,
    done: line.done,
    process: facts.process,
    // Topping timing beyond the existing "after processing" needs an owner rule.
    instruction: ownerStrawberry
      ? copy.actions.cutFreshStrawberriesAtServing
      : copy.actions.addAfterMachine,
    // A topping is added after the machine: a Base heat fact is not a topping
    // instruction and no step heats it. A real source conflict is still stated.
    note: facts.process === 'conflict' && line.grams > 0 ? copy.markers.conflict : null,
    moved: false,
    afterCooling: false,
    sourceIds: ownerStrawberry
      ? [OWNER_FRESH_STRAWBERRY_TOPPING_RULE.id, ...facts.sourceIds]
      : facts.sourceIds,
  };
}

export function buildPreparationPlan(input: PreparationPlanInput): PreparationPlan {
  const factsByLine = new Map<string, PreparationLineFacts>();
  const facts = (lineId: string): PreparationLineFacts => {
    const cached = factsByLine.get(lineId);
    if (cached) return cached;
    const next = preparationLineFacts(lineId, input.snapshots[lineId]);
    factsByLine.set(lineId, next);
    return next;
  };
  const guide = input.machineGuide;
  const machineSourceIds = guide
    ? [guide.sourceMachineId ?? `machine-category:${guide.category}`]
    : [];
  const steps: PreparationStep[] = [];

  if (guide && guide.beforeStartSteps.length > 0) {
    steps.push({
      kind: 'machine_before',
      id: 'machine:before',
      title: copy.beforeStartTitle,
      details: guide.beforeStartSteps,
      timing: guide.timing.text,
      sourceIds: machineSourceIds,
    });
  }

  const split = splitBase(input.baseLines, facts, (line) => line.plannedGrams);
  const originalIndex = new Map(input.baseLines.map((line, index) => [line.lineId, index]));
  if (split.heated === null) {
    for (const line of input.baseLines) {
      steps.push(
        baseLineStep(line, facts(line.lineId), {
          heatStep: false,
          afterHeatStep: false,
          moved: false,
        }),
      );
    }
  } else {
    for (const line of split.heated) {
      steps.push(
        baseLineStep(line, facts(line.lineId), {
          heatStep: true,
          afterHeatStep: false,
          moved: false,
        }),
      );
    }
    const heatLines = input.baseLines.filter((line) => split.heatLineIds.includes(line.lineId));
    steps.push({
      kind: 'heat',
      id: 'heat',
      title: copy.heat.title,
      productNames: [...new Set(heatLines.map((line) => line.name))],
      heatLineIds: split.heatLineIds,
      precedingLineIds: split.heated.map((line) => line.lineId),
      details: [copy.heat.method, copy.heat.cool],
      sourceIds: [...new Set(heatLines.flatMap((line) => facts(line.lineId).sourceIds))],
    });
    for (const line of split.afterCooling) {
      steps.push(
        baseLineStep(line, facts(line.lineId), {
          heatStep: true,
          afterHeatStep: true,
          moved:
            line.plannedGrams > 0 && (originalIndex.get(line.lineId) ?? 0) < split.boundaryIndex,
        }),
      );
    }
  }

  // Lines a Rescue appended after the batch started: after the plan, never moving it,
  // with the same per-line rules as a planned line at that position (condition,
  // washing, heat-sensitive, stated missing instruction). Nothing is re-heated.
  for (const line of input.appendedBaseLines ?? []) {
    const step = baseLineStep(line, facts(line.lineId), {
      heatStep: split.heated !== null,
      afterHeatStep: split.heated !== null,
      moved: false,
    });
    steps.push(step.kind === 'line' ? { ...step, afterCooling: false } : step);
  }

  if (guide) {
    steps.push({
      kind: 'machine',
      id: 'machine:run',
      title: guide.title,
      details: guide.steps,
      // Pre-freeze timing belongs to the moment it applies: the bowl before start
      // (shown above) or the prepared mix in a frozen container.
      timing: guide.category === 'frozen_container' ? guide.timing.text : null,
      sourceMachineId: guide.sourceMachineId,
      illustration: guide.illustration,
      sourceIds: machineSourceIds,
    });
  }

  for (const line of input.addonLines) {
    steps.push(addonLineStep(line, input.snapshots[line.lineId], facts(line.lineId)));
  }

  const baseOrder =
    split.heated === null ? input.baseLines : [...split.heated, ...split.afterCooling];
  return {
    steps,
    baseLineOrder: [...baseOrder, ...(input.appendedBaseLines ?? [])].map((line) => line.lineId),
  };
}

const planLine = (line: ProductionSession['lines'][number]): PreparationPlanLine => ({
  lineId: line.lineId,
  name: line.name,
  grams: line.targetGrams,
  plannedGrams: line.plannedGrams,
  done: line.confirmed,
});

/** The plan of a running batch: its frozen snapshots, current targets and confirmations. */
export function preparationPlanForSession(
  session: Pick<ProductionSession, 'lines' | 'addonLines' | 'plannedInput' | 'plannedComposition'>,
  machineGuide: MachineEducationGuide | null,
): PreparationPlan {
  const { planned, appended } = partitionPlannedLines(session.lines, session.plannedInput);
  return buildPreparationPlan({
    baseLines: planned.map(planLine),
    appendedBaseLines: appended.map(planLine),
    addonLines: session.addonLines.map(planLine),
    snapshots: session.plannedComposition.behaviorSnapshots ?? {},
    machineGuide,
  });
}

/** The plan before a batch starts, from the same recipe Production would start. */
export function preparationPlanForRecipe(
  plannedInput: Pick<RecipeInput, 'items'>,
  plannedComposition: Pick<
    RecipeCompositionMetadata,
    'baseOrder' | 'toppings' | 'behaviorSnapshots'
  > | null,
  machineGuide: MachineEducationGuide | null,
): PreparationPlan {
  const toLine = (item: { id: string; ingredient: { name: string }; planned_grams: number }) => ({
    lineId: item.id,
    name: item.ingredient.name,
    grams: item.planned_grams,
    plannedGrams: item.planned_grams,
    done: false,
  });
  // Same order createProductionSession gives the session lines: persisted baseOrder,
  // unnamed lines at their source position.
  const position = new Map(
    (plannedComposition?.baseOrder ?? []).map((lineId, index) => [lineId, index] as const),
  );
  const ordered = plannedInput.items
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort(
      (a, b) =>
        (position.get(a.item.id) ?? a.sourceIndex) - (position.get(b.item.id) ?? b.sourceIndex),
    )
    .map(({ item }) => item);
  return buildPreparationPlan({
    baseLines: ordered.map(toLine),
    addonLines: (plannedComposition?.toppings ?? []).map(toLine),
    snapshots: plannedComposition?.behaviorSnapshots ?? {},
    machineGuide,
  });
}
