/**
 * The SERVED dairy Main policy, derived — never hand-typed.
 *
 * Staging's `product_behavior_policy_versions` rows are published by one
 * migration. A harness reads that migration (tests own the file access) and this
 * parser returns the published row exactly as it is inserted. It keeps a harness
 * honest: the HOME batch scenarios once gave STRAWBERRIES the WATERMELON fixture
 * fields (`main-fruit-fresh-dairy`, floor 20 %) while staging serves the berry
 * policy (`main-berry-fresh-dairy` v2, floor 25 %), and the 5 % gap is exactly
 * where the served 1340 g banana + kiwi refusal lived.
 */
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';

export interface PublishedDairyMainPolicy {
  policyKey: string;
  version: string;
  familyId: string;
  subfamilyId: string | null;
  formId: string;
  mainClassification: string;
  basis: string;
  ecoFloorPercent: number;
  optimalCeilingPercent: number;
  hardLimitPercent: number;
  equivalentFactor: number;
  requiresLiquidDairyCarrier: boolean;
  liquidDairyCarrierFloorPercent: number | null;
}

const unquote = (token: string): string | null => {
  const value = token.trim();
  if (value === 'null') return null;
  return value.replace(/^'/, '').replace(/'$/, '');
};

/** The published `milk_gelato` row for `policyKey`, exactly as `migrationSql` inserts it. */
export function publishedDairyMainPolicy(
  migrationSql: string,
  policyKey: string,
): PublishedDairyMainPolicy {
  const row = migrationSql
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(`('${policyKey}',`) && line.includes("'milk_gelato'"));
  if (row === undefined) throw new Error(`No published milk_gelato row for ${policyKey}`);
  // The first 16 columns are scalar; only the trailing evidence JSON has commas.
  const columns = row.slice(1).split(',').slice(0, 16).map(unquote);
  const [key, version, , status, profile, family, subfamily, form, eligibility, basis] = columns;
  if (key !== policyKey || status !== 'published' || profile !== 'milk_gelato') {
    throw new Error(`Unexpected policy row for ${policyKey}`);
  }
  const number = (index: number) => Number(columns[index]);
  return {
    policyKey,
    version: version!,
    familyId: family!,
    subfamilyId: subfamily ?? null,
    formId: form!,
    mainClassification: eligibility!,
    basis: basis!,
    ecoFloorPercent: number(10),
    optimalCeilingPercent: number(11),
    hardLimitPercent: number(12),
    equivalentFactor: number(13),
    requiresLiquidDairyCarrier: columns[14] === 'true',
    liquidDairyCarrierFloorPercent: columns[15] === null ? null : number(15),
  };
}

/** `base` bound to the served policy row (the fields a Main snapshot carries). */
export function withPublishedDairyMainPolicy(
  base: ProductBehaviorSnapshot,
  policy: PublishedDairyMainPolicy,
): ProductBehaviorSnapshot {
  return {
    ...base,
    familyId: policy.familyId,
    subfamilyId: policy.subfamilyId,
    formId: policy.formId,
    mainClassification: policy.mainClassification as ProductBehaviorSnapshot['mainClassification'],
    mainPolicyId: policy.policyKey,
    mainPolicyVersion: policy.version,
    ecoFloorPercent: policy.ecoFloorPercent,
    optimalCeilingPercent: policy.optimalCeilingPercent,
    hardLimitPercent: policy.hardLimitPercent,
    mainEquivalentFactor: policy.equivalentFactor,
    mainBasis: policy.basis as ProductBehaviorSnapshot['mainBasis'],
    requiresLiquidDairyCarrier: policy.requiresLiquidDairyCarrier,
    liquidDairyCarrierFloorPercent: policy.liquidDairyCarrierFloorPercent,
  };
}
