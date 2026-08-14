import type { RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from './contracts';
import {
  mainBehaviorBlockReason,
  productBehaviorRequiredLineIds,
} from './productBehaviorAccess';

const EPSILON = 1e-7;

export type MainEnvelopeViolationCode =
  | 'product_behavior_missing'
  | 'product_behavior_identity_mismatch'
  | 'main_behavior_missing'
  | 'main_behavior_blocked'
  | 'main_policy_inconsistent'
  | 'main_below_floor'
  | 'main_above_optimal_ceiling'
  | 'main_above_hard_limit'
  | 'multi_main_policy_unknown'
  | 'liquid_dairy_carrier_below_floor';

export interface MainEnvelopeViolation {
  code: MainEnvelopeViolationCode;
  lineIds: string[];
  messagePl: string;
}

export type MainEnvelopeVerification =
  | {
      ok: true;
      equivalentPercent: number | null;
      targetPercent: number | null;
      hardLimitPercent: number | null;
      policyId: string | null;
    }
  | { ok: false; violations: MainEnvelopeViolation[] };

const baseSnapshots = (
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): ProductBehaviorSnapshot[] => Object.values(snapshots).filter(
  (snapshot): snapshot is ProductBehaviorSnapshot =>
    snapshot !== undefined && snapshot.processScope === 'BASE_FORMULATION',
);

/** Product-layer Main contract. It consumes immutable resolver snapshots only;
 * it never derives families/forms/policies from ingredient names and never
 * changes Engine science. Product-lineage and accepted built-in Main rows fail
 * closed if authority is absent; only synthetic non-canonical fixtures remain
 * outside this boundary. */
export function verifyMainEnvelope(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  mode: 'optimal' | 'eco';
  enforceFloor?: boolean;
}): MainEnvelopeVerification {
  const mains = input.recipe.items.filter((item) => item.lock_type === 'main');
  if (mains.length === 0) {
    return { ok: true, equivalentPercent: null, targetPercent: null, hardLimitPercent: null, policyId: null };
  }
  const managed = mains.filter((item) => input.snapshots[item.id] !== undefined);
  const requiredLineIds = new Set(productBehaviorRequiredLineIds({ items: input.recipe.items }));
  const missingRequired = mains.filter((item) =>
    input.snapshots[item.id] === undefined && requiredLineIds.has(item.id),
  );
  if (missingRequired.length > 0) {
    return {
      ok: false,
      violations: [{
        code: 'main_behavior_missing',
        lineIds: missingRequired.map((item) => item.id),
        messagePl: 'Składnik Main wymaga ponownej walidacji produktu i polityki Main.',
      }],
    };
  }
  if (managed.length === 0) {
    return { ok: true, equivalentPercent: null, targetPercent: null, hardLimitPercent: null, policyId: null };
  }
  const violations: MainEnvelopeViolation[] = [];
  if (managed.length !== mains.length) {
    violations.push({
      code: 'main_behavior_missing',
      lineIds: mains.filter((item) => input.snapshots[item.id] === undefined).map((item) => item.id),
      messagePl: 'Nie wszystkie składniki Main mają ten sam zweryfikowany snapshot zachowania.',
    });
  }
  const resolved = managed.map((item) => ({ item, snapshot: input.snapshots[item.id]! }));
  for (const { item, snapshot } of resolved) {
    const reason = mainBehaviorBlockReason(snapshot);
    if (reason) {
      violations.push({ code: 'main_behavior_blocked', lineIds: [item.id], messagePl: reason });
    }
  }
  if (violations.length > 0) return { ok: false, violations };

  const first = resolved[0]!.snapshot;
  const multi = resolved.length > 1;
  const inconsistent = resolved.some(({ snapshot }) =>
    snapshot.mainPolicyId !== first.mainPolicyId ||
    snapshot.mainPolicyVersion !== first.mainPolicyVersion ||
    snapshot.mainBasis !== first.mainBasis ||
    (multi
      ? snapshot.multiMainHardLimitPercent !== first.multiMainHardLimitPercent
      : snapshot.ecoFloorPercent !== first.ecoFloorPercent ||
        snapshot.optimalCeilingPercent !== first.optimalCeilingPercent ||
        snapshot.hardLimitPercent !== first.hardLimitPercent),
  );
  if (inconsistent) {
    return {
      ok: false,
      violations: [{
        code: 'main_policy_inconsistent',
        lineIds: managed.map((item) => item.id),
        messagePl: 'Grupa Main nie ma jednego zgodnego zakresu technologicznego.',
      }],
    };
  }

  const families = [...new Set(resolved.map(({ snapshot }) => snapshot.familyId).filter(Boolean))] as string[];
  if (families.length > 1) {
    const approved = families.every((family) =>
      resolved.every(({ snapshot }) =>
        snapshot.familyId === family || snapshot.approvedMixedFamilyIds.includes(family),
      ),
    );
    if (!approved) {
      return {
        ok: false,
        violations: [{
          code: 'multi_main_policy_unknown',
          lineIds: managed.map((item) => item.id),
          messagePl: 'Brak zatwierdzonej polityki dla tej mieszanej grupy Main.',
        }],
      };
    }
  }

  const equivalentGrams = resolved.reduce(
    (sum, { item, snapshot }) => sum + item.planned_grams * (snapshot.mainEquivalentFactor ?? 0),
    0,
  );
  const equivalentPercent = input.recipe.target_batch_grams > 0
    ? (equivalentGrams / input.recipe.target_batch_grams) * 100
    : 0;
  const floor = multi
    ? Math.max(...resolved.map(({ snapshot }) => snapshot.ecoFloorPercent ?? Number.POSITIVE_INFINITY))
    : first.ecoFloorPercent!;
  const multiLimit = multi ? first.multiMainHardLimitPercent ?? null : null;
  if (multi && multiLimit === null) {
    return {
      ok: false,
      violations: [{
        code: 'multi_main_policy_unknown',
        lineIds: managed.map((item) => item.id),
        messagePl: 'Brak zatwierdzonego wspólnego limitu dla tej grupy Main.',
      }],
    };
  }
  const ceiling = multi ? multiLimit! : first.optimalCeilingPercent!;
  const hard = multi ? multiLimit! : first.hardLimitPercent!;
  if (input.enforceFloor !== false && equivalentPercent < floor - EPSILON) {
    violations.push({
      code: 'main_below_floor',
      lineIds: managed.map((item) => item.id),
      messagePl: `Grupa Main ma ${equivalentPercent.toFixed(1)}%; wymagane minimum to ${floor.toFixed(1)}%.`,
    });
  }
  if (input.mode === 'optimal' && equivalentPercent > ceiling + EPSILON) {
    violations.push({
      code: 'main_above_optimal_ceiling',
      lineIds: managed.map((item) => item.id),
      messagePl: `Grupa Main przekracza zatwierdzony poziom OPTIMAL ${ceiling.toFixed(1)}%.`,
    });
  }
  if (equivalentPercent > hard + EPSILON) {
    violations.push({
      code: 'main_above_hard_limit',
      lineIds: managed.map((item) => item.id),
      messagePl: `Grupa Main przekracza twardy limit ${hard.toFixed(1)}%.`,
    });
  }

  if (first.requiresLiquidDairyCarrier && first.liquidDairyCarrierFloorPercent !== null) {
    const carrierIds = new Set(
      baseSnapshots(input.snapshots)
        .filter((snapshot) => snapshot.approvedLiquidDairyCarrier)
        .map((snapshot) => snapshot.lineId),
    );
    const carrierGrams = input.recipe.items.reduce(
      (sum, item) => sum + (carrierIds.has(item.id) ? item.planned_grams : 0),
      0,
    );
    const carrierPercent = input.recipe.target_batch_grams > 0
      ? (carrierGrams / input.recipe.target_batch_grams) * 100
      : 0;
    if (carrierPercent < first.liquidDairyCarrierFloorPercent - EPSILON) {
      violations.push({
        code: 'liquid_dairy_carrier_below_floor',
        lineIds: managed.map((item) => item.id),
        messagePl:
          `Zatwierdzony płynny nośnik mleczny ma ${carrierPercent.toFixed(1)}%; ` +
          `wymagane minimum to ${first.liquidDairyCarrierFloorPercent.toFixed(1)}%.`,
      });
    }
  }

  return violations.length > 0
    ? { ok: false, violations }
    : {
        ok: true,
        equivalentPercent,
        targetPercent: input.mode === 'optimal' ? ceiling : floor,
        hardLimitPercent: hard,
        policyId: first.mainPolicyId,
      };
}

export function mainEnvelopeSearchCeilingGrams(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}): number | null {
  const mains = input.recipe.items.filter((item) => item.lock_type === 'main');
  if (mains.length === 0 || mains.some((item) => !input.snapshots[item.id])) return null;
  const snapshots = mains.map((item) => input.snapshots[item.id]!);
  const first = snapshots[0]!;
  const multi = snapshots.length > 1;
  const ceilingPercent = multi
    ? first.multiMainHardLimitPercent
    : first.optimalCeilingPercent;
  if (
    ceilingPercent == null ||
    first.mainEquivalentFactor === null ||
    snapshots.some((snapshot) =>
      snapshot.mainPolicyId !== first.mainPolicyId ||
      snapshot.mainPolicyVersion !== first.mainPolicyVersion ||
      snapshot.mainEquivalentFactor !== first.mainEquivalentFactor ||
      (multi && snapshot.multiMainHardLimitPercent !== ceilingPercent),
    )
  ) return null;
  const equivalentFactor = first.mainEquivalentFactor;
  return (input.recipe.target_batch_grams * ceilingPercent / 100) / equivalentFactor;
}
