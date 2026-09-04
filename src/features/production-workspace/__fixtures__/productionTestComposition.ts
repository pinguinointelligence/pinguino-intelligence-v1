/**
 * A Production `plannedComposition` that models what Production actually runs
 * under, rather than the minimum that used to make tests pass.
 *
 * Two gaps made the old fixtures unable to satisfy the canonical terminal
 * authority, so any test using them could never exercise it:
 *
 * 1. Many sessions supplied NO `plannedComposition` at all, so
 *    `behaviorSnapshots` was `{}` and every line came back
 *    `product_behavior_invalid`.
 * 2. `productBehaviorTestSnapshots` cannot know Main policies — they are
 *    resolved server-side — so it leaves `hardLimitPercent: null`, which the
 *    Main envelope reads as an UNCALIBRATED Main and blocks
 *    (`main_behavior_blocked`); and it marks no line as an approved liquid
 *    dairy carrier, so a Main that requires one is refused with
 *    `liquid_dairy_carrier_below_floor`.
 *
 * The published values overlaid here are copied from a REAL persisted
 * Production session — the owner specimen in
 * `reports/production-rescue/OWNER_REPRO_2fc85403.md`, whose durable run
 * carries all seven snapshots: BANANA calibrated by `main-banana-fresh-dairy`
 * v2 and requiring a carrier, MILK 3.5 % the one approved carrier, every other
 * line `MAIN_TECHNICAL_BLOCKED` with no policy.
 */
import type { RecipeInput } from '@/engine';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { OWNER_BANANA_MAIN_POLICY } from './ownerRescueRun2fc85403';

const isBanana = (item: RecipeInput['items'][number]): boolean =>
  /banana/i.test(`${item.ingredient.name ?? ''} ${item.id}`);

/** MILK 3.5 % is the single approved liquid dairy carrier on the real run. */
const isApprovedDairyCarrier = (item: RecipeInput['items'][number]): boolean =>
  /milk\s*3\.5|^milk$/i.test(`${item.ingredient.name ?? ''}`.trim()) || item.id === 'milk';

export const withPublishedProductAuthority = (
  planned: RecipeInput,
  snapshots: ReturnType<typeof productBehaviorTestSnapshots>,
): ReturnType<typeof productBehaviorTestSnapshots> => {
  const patched = { ...snapshots } as Record<string, unknown>;
  for (const item of planned.items) {
    const current = patched[item.id];
    if (!current) continue;
    if (isBanana(item)) {
      patched[item.id] = { ...(current as object), ...OWNER_BANANA_MAIN_POLICY };
      continue;
    }
    if (isApprovedDairyCarrier(item)) {
      patched[item.id] = { ...(current as object), approvedLiquidDairyCarrier: true };
      continue;
    }
    // A line the RECIPE declares as Main must have a Main-capable, calibrated
    // snapshot: production cannot produce the reverse, because a product whose
    // behaviour blocks Main can never be selected as one. The generic fixture
    // leaves these lines technically blocked and uncalibrated, so the envelope
    // refuses every candidate containing them.
    if (item.lock_type === 'main') {
      // No policy is invented here. A Main with no published calibration is a
      // real, supported product state (MAIN_CAPABLE_UNCALIBRATED, user-held):
      // selectable, with no fabricated floor or ceiling. Only BANANA above
      // carries a real published policy, because we have its persisted record.
      patched[item.id] = {
        ...(current as object),
        mainCapability: 'MAIN_CAPABLE',
        behaviorRole: 'MAIN_PROFILE_SPECIFIC',
        mainClassification: 'MAIN_PROFILE_SPECIFIC',
      };
    }
  }
  return patched as ReturnType<typeof productBehaviorTestSnapshots>;
};

/** Snapshots alone, for fixtures that persist them outside a composition. */
export const productionTestBehaviorSnapshots = (planned: RecipeInput) =>
  withPublishedProductAuthority(planned, productBehaviorTestSnapshots(planned));

export const productionTestComposition = (planned: RecipeInput) => ({
  schemaVersion: 1 as const,
  baseScope: 'BASE_FORMULATION' as const,
  baseOrder: planned.items.map((item) => item.id),
  toppings: [],
  behaviorSnapshots: productionTestBehaviorSnapshots(planned),
  migrationAmbiguities: [],
});
