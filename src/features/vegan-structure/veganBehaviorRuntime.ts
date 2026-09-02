/**
 * VEGAN ENGINE v2 — memoised runtime access to the derived behaviour.
 *
 * Performance rule (owner §27): classification must be cheap. The derived value
 * is a pure function of the canonical facts, so it is memoised on a fingerprint
 * of those exact facts plus the model version. No recipe calculation re-parses
 * the same identity twice, and a model-version bump can never serve a stale
 * class.
 */
import type { EngineIngredient } from '@/engine';
import { deriveVeganBehavior } from './deriveVeganBehavior';
import {
  MATERIAL_COMPONENT_PERCENT,
  veganBehaviorFactsFromEngineIngredient,
  type VeganBehaviorFacts,
} from './veganBehaviorFacts';
import {
  VEGAN_BEHAVIOR_MODEL_VERSION,
  type VeganBehavior,
  type VeganEnhancementLevel,
} from './veganBehaviorTaxonomy';

/** Bounded memo — the Mapper universe is 2089 rows, private products add few. */
const MAX_CACHE_ENTRIES = 8192;
const cache = new Map<string, VeganBehavior>();

const fingerprint = (facts: VeganBehaviorFacts): string =>
  [
    VEGAN_BEHAVIOR_MODEL_VERSION,
    facts.identityKey,
    facts.identityText,
    facts.engineCategory ?? '',
    facts.fatPercent ?? '',
    facts.proteinPercent ?? '',
    facts.fiberPercent ?? '',
    facts.betaGlucanPercent ?? '',
    facts.stabilizerActivity ?? '',
  ].join('|');

/** Derive-with-memo. Same facts in → the identical (frozen-by-purity) value. */
export function veganBehaviorForFacts(facts: VeganBehaviorFacts): VeganBehavior {
  const key = fingerprint(facts);
  const cached = cache.get(key);
  if (cached) return cached;
  const behavior = deriveVeganBehavior(facts);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, behavior);
  return behavior;
}

/** Runtime entry point for an Engine ingredient. */
export function veganBehaviorForIngredient(ingredient: EngineIngredient): VeganBehavior {
  return veganBehaviorForFacts(veganBehaviorFactsFromEngineIngredient(ingredient));
}

/** Test/QA seam — the memo must never change an answer, only its cost. */
export function clearVeganBehaviorCache(): void {
  cache.clear();
}

const materiallyPresent = (value: number | null): boolean =>
  value !== null && value > MATERIAL_COMPONENT_PERCENT;

/** True when the derived model learned ANYTHING beyond today's baseline. */
export function hasDerivedStructuralEvidence(behavior: VeganBehavior): boolean {
  return (
    behavior.fat.evidence !== 'UNKNOWN' ||
    behavior.protein.evidence !== 'UNKNOWN' ||
    behavior.structuralCarbohydrates.some((entry) => entry.evidence !== 'UNKNOWN') ||
    behavior.hydrocolloids.some((entry) => entry.evidence !== 'UNKNOWN') ||
    behavior.emulsifiers.some((entry) => entry.evidence !== 'UNKNOWN')
  );
}

/**
 * Enhancement depth for ONE product (owner §21 reporting).
 *
 *  - `FULL_ENHANCEMENT`   — every materially present axis is resolved and at
 *                           least one derived class exists.
 *  - `PARTIAL_ENHANCEMENT`— some derived class exists, some axis is still
 *                           unknown.
 *  - `BASELINE_FALLBACK`  — nothing derived; today's Vegan behaviour, unchanged.
 *
 * NONE of these levels can block, penalise or downgrade a product. They only
 * describe how much extra structural truth was available.
 */
export function veganEnhancementLevel(behavior: VeganBehavior): VeganEnhancementLevel {
  if (!hasDerivedStructuralEvidence(behavior)) return 'BASELINE_FALLBACK';
  const fatResolved =
    !materiallyPresent(behavior.fat.amountPercent) || behavior.fat.evidence !== 'UNKNOWN';
  const proteinResolved =
    !materiallyPresent(behavior.protein.amountPercent) || behavior.protein.evidence !== 'UNKNOWN';
  const structuralResolved =
    behavior.structuralCarbohydrates.every((entry) => entry.evidence !== 'UNKNOWN') &&
    behavior.hydrocolloids.every((entry) => entry.evidence !== 'UNKNOWN');
  return fatResolved && proteinResolved && structuralResolved
    ? 'FULL_ENHANCEMENT'
    : 'PARTIAL_ENHANCEMENT';
}
