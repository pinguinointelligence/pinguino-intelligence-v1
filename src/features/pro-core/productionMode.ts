/**
 * PINGÜINO PRO CORE — Production Mode domain (PURE, deterministic, no IO/SDK).
 *
 * Builds a production run from an EXACT immutable recipe-version scale result, enforces one
 * canonical lifecycle-transition policy, records actuals WITHOUT ever replacing the frozen plan,
 * and treats every post-completion change as an append-only amendment event. All functions are
 * pure: they return new run objects and never mutate their inputs.
 */
import type { ExactScaleResult } from './recipeScaling';
import type {
  ActualIngredient,
  IngredientDeviation,
  PlannedIngredient,
  ProductionActual,
  ProductionDeviation,
  ProductionEvent,
  ProductionHistoryPage,
  ProductionHistoryQuery,
  ProductionRun,
  ProductionStatus,
  SubstitutionRecord,
} from './productionContracts';

/** The canonical transition policy. An empty list = terminal state. */
export const PRODUCTION_TRANSITIONS: Readonly<Record<ProductionStatus, readonly ProductionStatus[]>> =
  Object.freeze({
    draft: ['planned', 'cancelled'],
    planned: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  });

/** Metadata that may be edited before a run is completed/cancelled (never the planned snapshot). */
export interface ProductionMeta {
  plannedDate: string | null;
  machine: string | null;
  location: string | null;
  batchReference: string | null;
  notes: string | null;
}

export interface BuildRunInput {
  ownerUserId: string;
  scaled: ExactScaleResult;
  meta?: Partial<ProductionMeta>;
  by: string;
  createdAt: string;
  runId: string;
  eventId: string;
}

function plannedFromScale(scaled: ExactScaleResult): PlannedIngredient[] {
  return scaled.lines.map((l) => ({
    id: l.id,
    name: l.name,
    plannedGrams: l.grams,
    displayGrams: l.displayGrams,
  }));
}

/** Build a fresh production run (status `draft`) from an exact recipe-version scale result. */
export function buildProductionRun(input: BuildRunInput): ProductionRun {
  const { scaled, meta } = input;
  const created: ProductionEvent = {
    eventId: input.eventId,
    type: 'created',
    at: input.createdAt,
    by: input.by,
    detail: `Planned from recipe version ${scaled.recipeVersionNumber} at ${scaled.canonicalTotalG} g`,
    amendment: null,
  };
  return {
    runId: input.runId,
    ownerUserId: input.ownerUserId,
    recipeId: scaled.recipeId,
    recipeVersionId: scaled.recipeVersionId,
    recipeVersionNumber: scaled.recipeVersionNumber,
    status: 'draft',
    plannedBatchG: scaled.canonicalTotalG,
    plannedItems: plannedFromScale(scaled),
    productProfile: scaled.productProfile,
    temperatureC: scaled.temperatureC,
    engineVersion: scaled.engineVersion,
    configVersion: scaled.configVersion,
    mapperDatasetVersion: scaled.mapperDatasetVersion,
    plannedDate: meta?.plannedDate ?? null,
    machine: meta?.machine ?? null,
    location: meta?.location ?? null,
    batchReference: meta?.batchReference ?? null,
    notes: meta?.notes ?? null,
    createdBy: input.by,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    actual: null,
    completedAt: null,
    cancelledAt: null,
    events: [created],
  };
}

/* ── lifecycle ─────────────────────────────────────────────────────────────── */

export function canTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  return PRODUCTION_TRANSITIONS[from].includes(to);
}

const TRANSITION_EVENT: Record<Exclude<ProductionStatus, 'draft'>, ProductionEvent['type']> = {
  planned: 'planned',
  in_progress: 'started',
  completed: 'completed',
  cancelled: 'cancelled',
};

/**
 * Move a run to a new status, rejecting illegal transitions deterministically. Sets
 * completedAt / cancelledAt at the terminal states and appends a lifecycle event. Pure.
 */
export function transitionRun(
  run: ProductionRun,
  to: ProductionStatus,
  by: string,
  at: string,
  eventId: string,
): ProductionRun {
  if (!canTransition(run.status, to)) {
    throw new Error(`Illegal production transition: ${run.status} → ${to}.`);
  }
  const event: ProductionEvent = {
    eventId,
    type: TRANSITION_EVENT[to as Exclude<ProductionStatus, 'draft'>],
    at,
    by,
    detail: `${run.status} → ${to}`,
    amendment: null,
  };
  return {
    ...run,
    status: to,
    completedAt: to === 'completed' ? at : run.completedAt,
    cancelledAt: to === 'cancelled' ? at : run.cancelledAt,
    updatedAt: at,
    events: [...run.events, event],
  };
}

/* ── metadata (editable only before terminal) ────────────────────────────────── */

export function updateMeta(
  run: ProductionRun,
  patch: Partial<ProductionMeta>,
  at: string,
): ProductionRun {
  if (run.status === 'completed' || run.status === 'cancelled') {
    throw new Error('Production metadata is frozen once the run is completed or cancelled.');
  }
  return {
    ...run,
    plannedDate: patch.plannedDate !== undefined ? patch.plannedDate : run.plannedDate,
    machine: patch.machine !== undefined ? patch.machine : run.machine,
    location: patch.location !== undefined ? patch.location : run.location,
    batchReference: patch.batchReference !== undefined ? patch.batchReference : run.batchReference,
    notes: patch.notes !== undefined ? patch.notes : run.notes,
    updatedAt: at,
  };
}

/* ── actuals (recorded, never replacing the plan) ─────────────────────────────── */

export interface RecordActualInput {
  items?: ActualIngredient[];
  actualTotalMixG?: number | null;
  actualYieldG?: number | null;
  wasteG?: number | null;
  substitutions?: SubstitutionRecord[];
  operatorNotes?: string | null;
  deviationReason?: string | null;
  by: string;
  at: string;
  eventId: string;
}

/**
 * Record actual production values while the run is `in_progress`. Builds a fresh
 * `ProductionActual` (the plan is untouched) and appends an `actual_recorded` event. Recording
 * again while in progress replaces the working actual, never the planned snapshot.
 */
export function recordActual(run: ProductionRun, input: RecordActualInput): ProductionRun {
  if (run.status !== 'in_progress') {
    throw new Error('Actuals can only be recorded while the run is in progress.');
  }
  const actual: ProductionActual = {
    items: input.items ?? [],
    actualTotalMixG: input.actualTotalMixG ?? null,
    actualYieldG: input.actualYieldG ?? null,
    wasteG: input.wasteG ?? null,
    substitutions: input.substitutions ?? [],
    operatorNotes: input.operatorNotes ?? null,
    deviationReason: input.deviationReason ?? null,
    recordedBy: input.by,
    recordedAt: input.at,
  };
  const event: ProductionEvent = {
    eventId: input.eventId,
    type: 'actual_recorded',
    at: input.at,
    by: input.by,
    detail: 'Actual production values recorded',
    amendment: null,
  };
  return { ...run, actual, updatedAt: input.at, events: [...run.events, event] };
}

/* ── post-completion amendments (append-only) ─────────────────────────────────── */

export interface AmendInput {
  detail: string;
  amendment?: Record<string, string | number | boolean | null> | null;
  by: string;
  at: string;
  eventId: string;
}

/**
 * Append a post-completion amendment. The planned snapshot and the recorded actual are NEVER
 * rewritten — an amendment is only a new event on the immutable history.
 */
export function amendRun(run: ProductionRun, input: AmendInput): ProductionRun {
  if (run.status !== 'completed') {
    throw new Error('Amendments are only for completed runs; edit an active run in place instead.');
  }
  const event: ProductionEvent = {
    eventId: input.eventId,
    type: 'amended',
    at: input.at,
    by: input.by,
    detail: input.detail,
    amendment: input.amendment ?? null,
  };
  return { ...run, updatedAt: input.at, events: [...run.events, event] };
}

/* ── deviation (derived, read-only) ───────────────────────────────────────────── */

export function computeDeviation(run: ProductionRun): ProductionDeviation {
  const actualById = new Map<string, number | null>(
    (run.actual?.items ?? []).map((a) => [a.id, a.actualGrams]),
  );
  const lines: IngredientDeviation[] = run.plannedItems.map((p) => {
    const actualGrams = actualById.has(p.id) ? actualById.get(p.id)! : null;
    const deltaGrams = actualGrams === null ? null : actualGrams - p.plannedGrams;
    const deltaPercent =
      deltaGrams === null || p.plannedGrams === 0 ? null : (deltaGrams / p.plannedGrams) * 100;
    return {
      id: p.id,
      name: p.name,
      plannedGrams: p.plannedGrams,
      actualGrams,
      deltaGrams,
      deltaPercent,
    };
  });
  const plannedTotalG = run.plannedItems.reduce((sum, p) => sum + p.plannedGrams, 0);
  const actualTotalMixG = run.actual?.actualTotalMixG ?? null;
  return {
    lines,
    plannedTotalG,
    actualTotalMixG,
    totalDeltaG: actualTotalMixG === null ? null : actualTotalMixG - plannedTotalG,
    actualYieldG: run.actual?.actualYieldG ?? null,
    wasteG: run.actual?.wasteG ?? null,
  };
}

/* ── owner-scoped history query ───────────────────────────────────────────────── */

/**
 * Deterministic, owner-scoped history: filter by recipe / version / status / date range, sort
 * newest or oldest (stable tie-break by runId), then paginate. Pure — the input is not mutated.
 */
export function queryProductionRuns(
  runs: readonly ProductionRun[],
  ownerUserId: string,
  query: ProductionHistoryQuery = {},
): ProductionHistoryPage {
  const filtered = runs.filter((r) => {
    if (r.ownerUserId !== ownerUserId) return false;
    if (query.recipeId && r.recipeId !== query.recipeId) return false;
    if (query.recipeVersionId && r.recipeVersionId !== query.recipeVersionId) return false;
    if (query.status && r.status !== query.status) return false;
    if (query.from && r.createdAt < query.from) return false;
    if (query.to && r.createdAt > query.to) return false;
    return true;
  });

  const sort = query.sort ?? 'newest';
  filtered.sort((a, b) => {
    const cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
    return sort === 'newest' ? -cmp : cmp;
  });

  const total = filtered.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? null;
  const items = limit === null ? filtered.slice(offset) : filtered.slice(offset, offset + limit);
  return { total, offset, limit, items };
}
