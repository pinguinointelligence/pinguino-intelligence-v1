/**
 * In-memory Production-Mode adapter — the deterministic reference implementation of Track B.
 * Composes the pure `recipeScaling` + `productionMode` domains over an in-memory store with an
 * injected clock + id generator. No IO, no live DB.
 *
 * Production Mode is Pro-only: `createRun` refuses unless `canUseProductionMode`. Reads are
 * owner-scoped. The planned snapshot is frozen at creation; actuals never replace the plan; and
 * post-completion changes are append-only amendment events. Authorization is by internal user id.
 */
import type { RecipeVersion } from '@/features/pro-core/recipeContracts';
import {
  scaleRecipeVersion,
  type ScaleOptions,
  type ScaleResult,
  type ScaleTarget,
} from '@/features/pro-core/recipeScaling';
import type { ProductionCapabilities } from '@/features/pro-core/productionContracts';
import {
  acknowledgeHeatInformation,
  acknowledgeDegassing,
  amendRun,
  buildProductionRun,
  computeDeviation,
  queryProductionRuns,
  recordActual,
  transitionRun,
  updateMeta,
  type AmendInput,
  type ProductionMeta,
  type RecordActualInput,
} from '@/features/pro-core/productionMode';
import type {
  ProductionDeviation,
  ProductionEvent,
  ProductionHistoryPage,
  ProductionHistoryQuery,
  ProductionRun,
  ProductionStatus,
} from '@/features/pro-core/productionContracts';
import type { RecipeInput } from '@/engine';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { carbonatedProductsForRecipe } from '@/features/production-workspace/productionDegassing';

export interface CreateRunInput {
  ownerUserId: string;
  version: RecipeVersion;
  target: ScaleTarget;
  capabilities: ProductionCapabilities;
  meta?: Partial<ProductionMeta>;
  by: string;
  scaleOptions?: ScaleOptions;
}

let seq = 0;

export class InMemoryProduction {
  private readonly runs = new Map<string, ProductionRun>();

  constructor(
    private readonly now: () => string,
    private readonly nextId: () => string = () => `id-${(seq += 1)}`,
  ) {}

  private require(runId: string): ProductionRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown production run ${runId}`);
    return run;
  }

  /** Pure preview passthrough — lets a caller branch on `needs_more_information` before creating. */
  scale(version: RecipeVersion, target: ScaleTarget, options?: ScaleOptions): ScaleResult {
    return scaleRecipeVersion(version, target, options);
  }

  /** Create a run from an EXACT recipe version. Pro-only; refuses on a non-scalable target. */
  createRun(input: CreateRunInput): ProductionRun {
    if (!input.capabilities.canUseProductionMode) {
      throw new Error('This plan does not include Production Mode.');
    }
    const scaled = scaleRecipeVersion(input.version, input.target, input.scaleOptions);
    if (!scaled.ok) throw new Error(scaled.message);
    const baseRun = buildProductionRun({
      ownerUserId: input.ownerUserId,
      scaled,
      meta: input.meta,
      by: input.by,
      createdAt: this.now(),
      runId: this.nextId(),
      eventId: this.nextId(),
    });
    const carbonatedProducts = carbonatedProductsForRecipe(
      input.version.recipeInput,
      input.version.productComposition ?? { toppings: [] },
    );
    const run: ProductionRun = {
      ...baseRun,
      degassingRequired: carbonatedProducts.length > 0,
      degassingAcknowledged: false,
      degassingAcknowledgedAt: null,
      carbonatedProductIds: carbonatedProducts.map((product) => product.productId),
    };
    this.runs.set(run.runId, run);
    return run;
  }

  transition(runId: string, to: ProductionStatus, by: string): ProductionRun {
    const next = transitionRun(this.require(runId), to, by, this.now(), this.nextId());
    this.runs.set(runId, next);
    return next;
  }

  updateMeta(runId: string, patch: Partial<ProductionMeta>): ProductionRun {
    const next = updateMeta(this.require(runId), patch, this.now());
    this.runs.set(runId, next);
    return next;
  }

  acknowledgeHeatInformation(runId: string): ProductionRun {
    const next = acknowledgeHeatInformation(this.require(runId), this.now());
    this.runs.set(runId, next);
    return next;
  }

  acknowledgeDegassing(runId: string): ProductionRun {
    const next = acknowledgeDegassing(this.require(runId), this.now());
    this.runs.set(runId, next);
    return next;
  }

  recordActual(runId: string, input: Omit<RecordActualInput, 'at' | 'eventId'>): ProductionRun {
    const next = recordActual(this.require(runId), {
      ...input,
      at: this.now(),
      eventId: this.nextId(),
    });
    this.runs.set(runId, next);
    return next;
  }

  applyRescue(
    runId: string,
    recipeInput: RecipeInput,
    productComposition: RecipeCompositionMetadata,
  ): ProductionRun {
    const run = this.require(runId);
    if (run.status !== 'in_progress') {
      throw new Error('Production rescue requires an in-progress run.');
    }
    const at = this.now();
    const revision = (run.rescue?.revision ?? 0) + 1;
    const next: ProductionRun = {
      ...run,
      updatedAt: at,
      rescue: {
        recipeInput,
        productComposition,
        acceptedBy: run.ownerUserId,
        acceptedAt: at,
        revision,
      },
      events: [
        ...run.events,
        {
          eventId: this.nextId(),
          type: 'rescue_applied',
          at,
          by: run.ownerUserId,
          detail: 'In-memory BATCH_RESCUE candidate accepted',
          amendment: { recipeInput, productComposition, acceptedAt: at, revision },
        },
      ],
    };
    this.runs.set(runId, next);
    return next;
  }

  amend(runId: string, input: Omit<AmendInput, 'at' | 'eventId'>): ProductionRun {
    const next = amendRun(this.require(runId), {
      ...input,
      at: this.now(),
      eventId: this.nextId(),
    });
    this.runs.set(runId, next);
    return next;
  }

  /* ── reads (owner-scoped) ── */
  getRun(runId: string, ownerUserId?: string): ProductionRun | null {
    const run = this.runs.get(runId) ?? null;
    if (!run) return null;
    if (ownerUserId !== undefined && run.ownerUserId !== ownerUserId) return null;
    return run;
  }

  listRuns(ownerUserId: string, query: ProductionHistoryQuery = {}): ProductionHistoryPage {
    return queryProductionRuns([...this.runs.values()], ownerUserId, query);
  }

  getDeviation(runId: string, ownerUserId?: string): ProductionDeviation | null {
    const run = this.getRun(runId, ownerUserId);
    return run ? computeDeviation(run) : null;
  }

  getEvents(runId: string, ownerUserId?: string): readonly ProductionEvent[] {
    return this.getRun(runId, ownerUserId)?.events ?? [];
  }
}
