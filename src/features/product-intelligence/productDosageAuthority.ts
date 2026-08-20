import type { RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot, SharedProductRecommendedDose } from './contracts';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import { gelatoStabilizerSystemApplies } from '@/features/recipe-constraints/gelatoStabilizerSystemAuthority';

const DOSAGE_EPSILON_G = 0.1000001;

export interface ProductDosageAuthority {
  minPercent: number | null;
  preferredPercent: number | null;
  maxPercent: number | null;
  minGrams: number | null;
  maxGrams: number | null;
  sourceVersion: string;
  presenceSemantics: 'optional_zero_or_range' | null;
  provenance: string | null;
  policyId: string | null;
  policyVersion: number | null;
}

export type ProductDosageAuthorityResult =
  | { status: 'not_defined' }
  | { status: 'invalid_evidence'; reason: string }
  | { status: 'defined'; authority: ProductDosageAuthority };

export type ProductDosageViolationCode = 'below_minimum' | 'above_maximum' | 'invalid_evidence';

export interface ProductDosageViolation {
  code: ProductDosageViolationCode;
  lineId: string;
  ingredientName: string;
  enteredGrams: number;
  enteredPercent: number | null;
  minPercent: number | null;
  maxPercent: number | null;
  minGrams: number | null;
  maxGrams: number | null;
  sourceVersion: string | null;
  messagePl: string;
}

const validPercent = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0 && value <= 100;

const invalidDoseReason = (
  dose: SharedProductRecommendedDose,
  targetBatchGrams: number,
): string | null => {
  if (!Number.isFinite(targetBatchGrams) || targetBatchGrams <= 0) return 'invalid_target_batch';
  if (!dose.sourceVersion?.trim()) return 'missing_source_version';
  if (dose.minPercent !== null && !validPercent(dose.minPercent)) return 'invalid_minimum';
  if (dose.maxPercent !== null && !validPercent(dose.maxPercent)) return 'invalid_maximum';
  if (
    dose.preferredPercent !== undefined &&
    dose.preferredPercent !== null &&
    !validPercent(dose.preferredPercent)
  ) {
    return 'invalid_preferred';
  }
  if (dose.minPercent !== null && dose.maxPercent !== null && dose.minPercent > dose.maxPercent) {
    return 'minimum_above_maximum';
  }
  if (
    dose.preferredPercent !== undefined &&
    dose.preferredPercent !== null &&
    ((dose.minPercent !== null && dose.preferredPercent < dose.minPercent) ||
      (dose.maxPercent !== null && dose.preferredPercent > dose.maxPercent))
  ) {
    return 'preferred_outside_range';
  }
  if (dose.presenceSemantics !== undefined && dose.presenceSemantics !== 'optional_zero_or_range') {
    return 'invalid_presence_semantics';
  }
  return null;
};

/**
 * Resolves only the exact server-frozen ProductBehavior dosage. There is no
 * family, role or ingredient-name fallback: absent Mapper evidence stays
 * absent, while malformed evidence fails closed.
 */
export function productDosageAuthority(
  snapshot: ProductBehaviorSnapshot | null | undefined,
  targetBatchGrams: number,
): ProductDosageAuthorityResult {
  const dose = snapshot?.sharedFacts?.recommendedDose;
  if (
    !snapshot ||
    snapshot.resolutionState !== 'RESOLVED' ||
    snapshot.processScope !== 'BASE_FORMULATION' ||
    snapshot.moduleEligibility.BASE_RECIPE !== 'eligible' ||
    !dose ||
    (dose.minPercent === null && dose.maxPercent === null)
  ) {
    return { status: 'not_defined' };
  }
  const invalid = invalidDoseReason(dose, targetBatchGrams);
  if (invalid) return { status: 'invalid_evidence', reason: invalid };
  return {
    status: 'defined',
    authority: {
      minPercent: dose.minPercent,
      preferredPercent: dose.preferredPercent ?? null,
      maxPercent: dose.maxPercent,
      minGrams: dose.minPercent === null ? null : (targetBatchGrams * dose.minPercent) / 100,
      maxGrams: dose.maxPercent === null ? null : (targetBatchGrams * dose.maxPercent) / 100,
      sourceVersion: dose.sourceVersion,
      presenceSemantics: dose.presenceSemantics ?? null,
      provenance: dose.provenance?.trim() || null,
      policyId: dose.policyId?.trim() || null,
      policyVersion:
        typeof dose.policyVersion === 'number' && Number.isInteger(dose.policyVersion)
          ? dose.policyVersion
          : null,
    },
  };
}

const amount = (value: number, unit: 'g' | '%'): string =>
  `${Math.round(value * 10) / 10}${unit === '%' ? '%' : ' g'}`;

const rangePl = (authority: ProductDosageAuthority): string => {
  if (authority.minPercent !== null && authority.maxPercent !== null) {
    return (
      `${amount(authority.minPercent, '%')}–${amount(authority.maxPercent, '%')} ` +
      `(${amount(authority.minGrams!, 'g')}–${amount(authority.maxGrams!, 'g')})`
    );
  }
  if (authority.maxPercent !== null) {
    return `maks. ${amount(authority.maxPercent, '%')} (${amount(authority.maxGrams!, 'g')})`;
  }
  return `min. ${amount(authority.minPercent!, '%')} (${amount(authority.minGrams!, 'g')})`;
};

export function productDosageViolationMessagePl(
  ingredientName: string,
  enteredGrams: number,
  authority: ProductDosageAuthority,
): string {
  return (
    `${ingredientName}: wpisano ${amount(enteredGrams, 'g')}, zatwierdzony zakres to ` +
    `${rangePl(authority)}. Nie znaleziono bezpiecznej korekty, która zachowuje tę granicę; ` +
    'propozycja pozostaje zablokowana.'
  );
}

export function productDosageClampMessagePl(
  ingredientName: string,
  authority: ProductDosageAuthority,
  boundary: 'minimum' | 'maximum',
): string {
  const grams = boundary === 'maximum' ? authority.maxGrams : authority.minGrams;
  return grams === null
    ? `${ingredientName}: brak zatwierdzonej granicy dawki.`
    : `${ingredientName}: ${boundary === 'maximum' ? 'maksymalna' : 'minimalna'} ilość dla tej partii to ${amount(grams, 'g')}.`;
}

/** Hard product-dose assessment shared by Preview, Apply and guarded writes. */
export function assessProductDosages(
  input: RecipeInput,
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): ProductDosageViolation[] {
  const violations: ProductDosageViolation[] = [];
  for (const item of input.items) {
    const result = productDosageAuthority(snapshots[item.id], input.target_batch_grams);
    if (result.status === 'not_defined') continue;
    const enteredPercent =
      input.target_batch_grams > 0 ? (item.planned_grams / input.target_batch_grams) * 100 : null;
    if (result.status === 'invalid_evidence') {
      violations.push({
        code: 'invalid_evidence',
        lineId: item.id,
        ingredientName: item.ingredient.name,
        enteredGrams: item.planned_grams,
        enteredPercent,
        minPercent: null,
        maxPercent: null,
        minGrams: null,
        maxGrams: null,
        sourceVersion:
          item.id === snapshots[item.id]?.lineId
            ? (snapshots[item.id]?.sharedFacts?.recommendedDose?.sourceVersion ?? null)
            : null,
        messagePl:
          `${item.ingredient.name}: zatwierdzone dane dawki są niespójne ` +
          `(${result.reason}). Receptura pozostaje zablokowana do ponownej walidacji produktu.`,
      });
      continue;
    }
    const { authority } = result;
    // Zero means the optional line is absent. Required-role/presence gates are
    // enforced separately and must not be fabricated from dosage metadata.
    if (item.planned_grams <= 0) continue;
    const aggregateGelatoStabilizer =
      gelatoStabilizerSystemApplies(input.category) &&
      resolveFunctionalRole(item.ingredient) === 'stabilizer';
    const below =
      !aggregateGelatoStabilizer &&
      authority.minGrams !== null &&
      item.planned_grams < authority.minGrams - DOSAGE_EPSILON_G;
    const above =
      authority.maxGrams !== null && item.planned_grams > authority.maxGrams + DOSAGE_EPSILON_G;
    if (!below && !above) continue;
    violations.push({
      code: below ? 'below_minimum' : 'above_maximum',
      lineId: item.id,
      ingredientName: item.ingredient.name,
      enteredGrams: item.planned_grams,
      enteredPercent,
      minPercent: authority.minPercent,
      maxPercent: authority.maxPercent,
      minGrams: authority.minGrams,
      maxGrams: authority.maxGrams,
      sourceVersion: authority.sourceVersion,
      messagePl: productDosageViolationMessagePl(
        item.ingredient.name,
        item.planned_grams,
        authority,
      ),
    });
  }
  return violations;
}

export type ClampProductDosageResult =
  | {
      ok: true;
      grams: number;
      clamped: boolean;
      authority: ProductDosageAuthority | null;
    }
  | { ok: false; code: 'invalid_evidence'; reason: string };

/** Nearest-boundary clamp for explicit manual edits. */
export function clampProductDosageGrams(
  requestedGrams: number,
  targetBatchGrams: number,
  snapshot: ProductBehaviorSnapshot | null | undefined,
  options: { ignoreMinimum?: boolean } = {},
): ClampProductDosageResult {
  const result = productDosageAuthority(snapshot, targetBatchGrams);
  if (result.status === 'invalid_evidence') {
    return { ok: false, code: 'invalid_evidence', reason: result.reason };
  }
  if (result.status === 'not_defined' || requestedGrams <= 0) {
    return { ok: true, grams: requestedGrams, clamped: false, authority: null };
  }
  const { authority } = result;
  const grams = Math.min(
    authority.maxGrams ?? Number.POSITIVE_INFINITY,
    Math.max(options.ignoreMinimum ? 0 : (authority.minGrams ?? 0), requestedGrams),
  );
  return { ok: true, grams, clamped: !Object.is(grams, requestedGrams), authority };
}
