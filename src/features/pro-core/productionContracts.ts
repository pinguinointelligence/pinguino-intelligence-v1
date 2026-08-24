/**
 * PINGÜINO PRO CORE — Production Mode contracts (types only, no IO/SDK).
 *
 * A production run is created from an EXACT immutable recipe-version id (never from the recipe's
 * mutable "latest" state). Its planned scaled snapshot is frozen at creation and never changes.
 * Actuals are recorded separately and never silently replace the planned values; once the run is
 * completed, every further change is an append-only amendment event. Authorization is by the
 * internal user id — never a plan price id, never email. Production Mode itself is Pro-only.
 */

/** Production Mode capability (Pro-only — see proCoreCapabilities). */
import type { RecipeInput } from '@/engine';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import type {
  ProductProcessReadinessDetail,
  ProductionProcessReadinessStatus,
  ProductionThermalMode,
} from '@/features/product-intelligence';

export interface ProductionCapabilities {
  canUseProductionMode: boolean;
  canViewExactGrams: boolean;
}

/** Lifecycle states of a production run. */
export type ProductionStatus = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';

/** One line of the frozen planned snapshot (the exact scaled recipe at plan time). */
export interface PlannedIngredient {
  id: string;
  name: string;
  canonicalIngredientId: string | null;
  processScope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
  /** Position inside its own scope. Base and topping order never cross. */
  scopePosition: number;
  /** Canonical scaled grams (calculation precision). */
  plannedGrams: number;
  /** Display / export grams (totals the batch exactly on the display grid). */
  displayGrams: number;
}

/** A manual substitution the operator actually made on the floor (recorded, with a reason). */
export interface SubstitutionRecord {
  originalIngredientId: string;
  originalName: string;
  substituteName: string;
  grams: number | null;
  reason: string;
}

/** One line of recorded actuals (what was really weighed). Never overwrites the planned line. */
export interface ActualIngredient {
  id: string;
  name: string;
  actualGrams: number | null;
  /** Exact operator chronology when this line was physically confirmed. */
  confirmedAt?: string | null;
  confirmationOrder?: number | null;
}

/** The recorded actual production — explicit, separate from the immutable plan. */
export interface ProductionActual {
  items: ActualIngredient[];
  actualTotalMixG: number | null;
  actualYieldG: number | null;
  wasteG: number | null;
  substitutions: SubstitutionRecord[];
  operatorNotes: string | null;
  deviationReason: string | null;
  recordedBy: string;
  recordedAt: string;
  /** Monotonic durable revision incremented by each server actual write. */
  revision: number;
}

/** Server-validated candidate accepted while a physical batch is already in progress. */
export interface ProductionRescueSnapshot {
  recipeInput: RecipeInput;
  productComposition: RecipeCompositionMetadata;
  acceptedBy: string;
  acceptedAt: string;
  /** Monotonic durable revision; unlike timestamps it cannot alias two accepted Rescues. */
  revision: number;
}

/** Stable public option ids accepted by the trusted Rescue authorization endpoint. */
export type ProductionRescueStableOptionId =
  | 'keep_original_batch'
  | 'enlarge_batch'
  | 'leave_as_is';

export type ProductionEventType =
  | 'created'
  | 'planned'
  | 'started'
  | 'actual_recorded'
  | 'rescue_applied'
  | 'completed'
  | 'cancelled'
  | 'amended'
  | 'note_added'
  | 'production_started'
  | 'heat_information_acknowledged'
  | 'degassing_acknowledged'
  | 'ingredient_actual_confirmed'
  | 'actual_entry_corrected'
  | 'variance_detected'
  | 'rescue_previewed'
  | 'rescue_accepted'
  | 'batch_target_changed'
  | 'additional_ingredient_requested'
  | 'ingredient_completed'
  | 'production_completed'
  | 'production_cancelled';

/** An append-only history entry. Amendments after completion are ONLY events — never rewrites. */
export interface ProductionEvent {
  eventId: string;
  type: ProductionEventType;
  at: string;
  by: string;
  detail: string | null;
  /** Optional structured amendment payload (append-only; the plan/actual stay frozen). */
  amendment: Record<string, unknown> | null;
}

/** A production run: immutable planned snapshot + mutable-until-complete metadata + actuals. */
export interface ProductionRun {
  runId: string;
  ownerUserId: string;
  recipeId: string;
  /** The EXACT immutable recipe-version this run was planned from. */
  recipeVersionId: string;
  recipeVersionNumber: number;
  status: ProductionStatus;
  /** Frozen at creation — the planned batch weight. */
  plannedBatchG: number;
  /** Frozen at creation — the exact scaled ingredient snapshot. Never mutated. */
  plannedItems: PlannedIngredient[];
  productProfile: string | null;
  temperatureC: number | null;
  engineVersion: string;
  configVersion: string;
  mapperDatasetVersion: string | null;
  /** Durable operator route and server-frozen authority. Null is legacy
   * history, never implicit permission to start. */
  thermalMode?: ProductionThermalMode | null;
  processReadiness?: Exclude<ProductionProcessReadinessStatus, 'BLOCKED'> | null;
  processAdvisories?: ProductProcessReadinessDetail[];
  /**
   * OWNER RULE §2 — when the operator has confirmed they read this run's heat
   * reminder. It is a receipt, never a permission: production runs with or
   * without it.
   */
  heatInformationAcknowledgedAt?: string | null;
  /** Frozen from the exact recipe version when this run starts. */
  degassingRequired?: boolean;
  degassingAcknowledged?: boolean;
  degassingAcknowledgedAt?: string | null;
  carbonatedProductIds?: string[];
  plannedDate: string | null;
  machine: string | null;
  location: string | null;
  batchReference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Recorded actuals (null until recorded); never replaces `plannedItems`. */
  actual: ProductionActual | null;
  /** Latest server-authoritative rescue candidate; every acceptance also has an event. */
  rescue: ProductionRescueSnapshot | null;
  completedAt: string | null;
  cancelledAt: string | null;
  /** Append-only history (lifecycle transitions + post-completion amendments). */
  events: ProductionEvent[];
}

/* ── planned-vs-actual deviation (derived, read-only) ─────────────────────────── */

export interface IngredientDeviation {
  id: string;
  name: string;
  plannedGrams: number;
  actualGrams: number | null;
  /** actual − planned (null when no actual was recorded for the line). */
  deltaGrams: number | null;
  /** delta / planned × 100 (null when no actual, or planned is 0). */
  deltaPercent: number | null;
}

export interface ProductionDeviation {
  lines: IngredientDeviation[];
  plannedTotalG: number;
  actualTotalMixG: number | null;
  totalDeltaG: number | null;
  actualYieldG: number | null;
  wasteG: number | null;
}

/* ── owner-scoped history query ───────────────────────────────────────────────── */

export interface ProductionHistoryQuery {
  recipeId?: string;
  recipeVersionId?: string;
  status?: ProductionStatus;
  /** ISO inclusive lower bound on createdAt. */
  from?: string;
  /** ISO inclusive upper bound on createdAt. */
  to?: string;
  sort?: 'newest' | 'oldest';
  offset?: number;
  limit?: number;
}

export interface ProductionHistoryPage {
  total: number;
  offset: number;
  limit: number | null;
  items: ProductionRun[];
}
