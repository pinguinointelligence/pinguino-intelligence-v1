/**
 * VEGAN ENGINE v2 — recipe-level structural assessment (QUALITY layer).
 *
 * THREE DISTINCT LAYERS, unchanged by this module:
 *   HARD      — validated profile / safety / physics constraints.
 *   PREFERRED — current formulation targets and preferred regions.
 *   QUALITY   — this module.
 *
 * Everything here is quality/structure intelligence. It can never make a recipe
 * invalid, never moves a band, never modifies ice or NPAC (audit §3.6 proves
 * structural factors do NOT drive ice-crystal size), never changes Main grams
 * or Multi-Main ratios, and never participates in VEGAN_VERIFIED eligibility.
 *
 * `UNKNOWN` is the honest answer when the canonical facts do not support a
 * class, and it is NEVER a penalty — the baseline Vegan Engine simply applies.
 */
import type { RecipeInput } from '@/engine';
import { MATERIAL_COMPONENT_PERCENT } from './veganBehaviorFacts';
import {
  hasDerivedStructuralEvidence,
  veganBehaviorForIngredient,
  veganEnhancementLevel,
} from './veganBehaviorRuntime';
import {
  VEGAN_BEHAVIOR_MODEL_VERSION,
  type VeganBehavior,
  type VeganEnhancementLevel,
  type VeganFatFunctionalClass,
  type VeganFatSource,
  type VeganHydrocolloidClass,
  type VeganProteinFunctionalClass,
  type VeganProteinSource,
  type VeganStructuralCarbClass,
} from './veganBehaviorTaxonomy';

export type VeganStructuralQuality = 'STRONG' | 'GOOD' | 'MODERATE' | 'WEAK' | 'UNKNOWN';

export type VeganStructureReasonCode =
  | 'solid_fat_system'
  | 'cocoa_butter_fat_system'
  | 'liquid_fat_dominant_system'
  | 'nut_fat_matrix_system'
  | 'mixed_fat_system'
  | 'functional_plant_protein_present'
  | 'whole_food_plant_protein_present'
  | 'hydrocolloid_structure_present'
  | 'inulin_is_not_a_hydrocolloid_system'
  | 'oat_matrix_detected'
  | 'starch_structure_present'
  | 'emulsifier_evidence_present'
  | 'structural_evidence_incomplete'
  | 'no_structural_evidence';

export interface VeganStructureReason {
  code: VeganStructureReasonCode;
  /** Short, truthful, non-technical Polish text. Internal class codes stay internal. */
  messagePl: string;
}

export interface VeganFatSystemSummary {
  functionalClass: VeganFatFunctionalClass;
  source: VeganFatSource;
  classifiedGrams: number;
  unclassifiedGrams: number;
  known: boolean;
}

export interface VeganProteinSystemSummary {
  functionalClass: VeganProteinFunctionalClass;
  source: VeganProteinSource;
  classifiedGrams: number;
  unclassifiedGrams: number;
  known: boolean;
}

export interface VeganStructureAssessment {
  /** False for every non-Vegan profile — the assessment is Vegan-only. */
  applicable: boolean;
  modelVersion: string;
  quality: VeganStructuralQuality;
  /**
   * ORDINAL evidence count, quality-only. It is NOT a physical quantity, NOT a
   * band, NOT a Score input and carries no unit. It exists so the qualitative
   * levels above are reproducible and testable.
   */
  structuralEvidencePoints: number;
  fat: VeganFatSystemSummary;
  protein: VeganProteinSystemSummary;
  hydrocolloidClasses: readonly VeganHydrocolloidClass[];
  structuralCarbClasses: readonly VeganStructuralCarbClass[];
  /** Recipe-level roll-up of how much enhanced evidence was available. */
  enhancement: VeganEnhancementLevel;
  reasons: readonly VeganStructureReason[];
}

const EMPTY: VeganStructureAssessment = {
  applicable: false,
  modelVersion: VEGAN_BEHAVIOR_MODEL_VERSION,
  quality: 'UNKNOWN',
  structuralEvidencePoints: 0,
  fat: {
    functionalClass: 'unknown',
    source: 'unknown',
    classifiedGrams: 0,
    unclassifiedGrams: 0,
    known: false,
  },
  protein: {
    functionalClass: 'unknown',
    source: 'unknown',
    classifiedGrams: 0,
    unclassifiedGrams: 0,
    known: false,
  },
  hydrocolloidClasses: [],
  structuralCarbClasses: [],
  enhancement: 'BASELINE_FALLBACK',
  reasons: [{ code: 'no_structural_evidence', messagePl: 'Brak danych strukturalnych.' }],
};

/** A single known class must hold this share of the classified mass to dominate. */
const DOMINANCE_SHARE = 0.8;

const effectiveGrams = (item: RecipeInput['items'][number]): number =>
  item.actual_grams ?? item.planned_grams;

const dominant = <T extends string>(
  byClass: ReadonlyMap<T, number>,
  mixedValue: T,
): { value: T; total: number } | null => {
  let total = 0;
  let best: { value: T; grams: number } | null = null;
  // Deterministic: iterate a sorted key list, never Map insertion order.
  for (const key of [...byClass.keys()].sort()) {
    const grams = byClass.get(key)!;
    total += grams;
    if (best === null || grams > best.grams + 1e-9) best = { value: key, grams };
  }
  if (best === null || total <= 0) return null;
  return {
    value: best.grams >= total * DOMINANCE_SHARE ? best.value : mixedValue,
    total,
  };
};

/**
 * Derive the structural assessment of a Vegan recipe. Pure and deterministic:
 * the same `RecipeInput` always yields the identical assessment.
 */
export function assessVeganRecipeStructure(input: RecipeInput): VeganStructureAssessment {
  if (input.category !== 'vegan_gelato') return EMPTY;

  const lines = input.items
    .map((item) => ({ item, grams: effectiveGrams(item) }))
    .filter((line) => line.grams > 0)
    .map((line) => ({ ...line, behavior: veganBehaviorForIngredient(line.item.ingredient) }));

  const fatByClass = new Map<VeganFatFunctionalClass, number>();
  const fatSources = new Set<VeganFatSource>();
  const proteinByClass = new Map<VeganProteinFunctionalClass, number>();
  const proteinSources = new Set<VeganProteinSource>();
  const hydrocolloids = new Set<VeganHydrocolloidClass>();
  const structuralCarbs = new Set<VeganStructuralCarbClass>();
  let emulsifierKnown = false;
  let unclassifiedFatGrams = 0;
  let unclassifiedProteinGrams = 0;
  let anyEvidence = false;
  let allFull = lines.length > 0;

  const componentGrams = (grams: number, percent: number | null): number =>
    percent === null ? 0 : (grams * percent) / 100;

  for (const { grams, behavior } of lines) {
    if (hasDerivedStructuralEvidence(behavior)) anyEvidence = true;
    if (veganEnhancementLevel(behavior) !== 'FULL_ENHANCEMENT') allFull = false;

    const fatGrams = componentGrams(grams, behavior.fat.amountPercent);
    if (fatGrams > 0) {
      if (behavior.fat.evidence === 'UNKNOWN') {
        if ((behavior.fat.amountPercent ?? 0) > MATERIAL_COMPONENT_PERCENT) {
          unclassifiedFatGrams += fatGrams;
        }
      } else {
        fatByClass.set(
          behavior.fat.functionalClass,
          (fatByClass.get(behavior.fat.functionalClass) ?? 0) + fatGrams,
        );
        fatSources.add(behavior.fat.source);
      }
    }

    const proteinGrams = componentGrams(grams, behavior.protein.amountPercent);
    if (proteinGrams > 0) {
      if (behavior.protein.evidence === 'UNKNOWN') {
        if ((behavior.protein.amountPercent ?? 0) > MATERIAL_COMPONENT_PERCENT) {
          unclassifiedProteinGrams += proteinGrams;
        }
      } else {
        proteinByClass.set(
          behavior.protein.functionalClass,
          (proteinByClass.get(behavior.protein.functionalClass) ?? 0) + proteinGrams,
        );
        proteinSources.add(behavior.protein.source);
      }
    }

    for (const entry of behavior.hydrocolloids) {
      if (entry.evidence !== 'UNKNOWN') hydrocolloids.add(entry.hydrocolloidClass);
    }
    for (const entry of behavior.structuralCarbohydrates) {
      if (entry.evidence !== 'UNKNOWN') structuralCarbs.add(entry.structuralClass);
    }
    if (behavior.emulsifiers.some((entry) => entry.evidence !== 'UNKNOWN')) emulsifierKnown = true;
  }

  const fatDominant = dominant(fatByClass, 'mixed_plant_fat');
  const proteinDominant = dominant(proteinByClass, 'mixed_plant_protein');
  // A class is only usable when the classified phase is at least as large as
  // the unclassified one; otherwise the honest answer stays UNKNOWN.
  const fatKnown = fatDominant !== null && fatDominant.total >= unclassifiedFatGrams - 1e-9;
  const proteinKnown =
    proteinDominant !== null && proteinDominant.total >= unclassifiedProteinGrams - 1e-9;
  const sortedFatSources = [...fatSources].sort();
  const sortedProteinSources = [...proteinSources].sort();

  const fat: VeganFatSystemSummary = {
    functionalClass: fatKnown ? fatDominant!.value : 'unknown',
    source: !fatKnown ? 'unknown' : sortedFatSources.length === 1 ? sortedFatSources[0]! : 'mixed',
    classifiedGrams: fatDominant?.total ?? 0,
    unclassifiedGrams: unclassifiedFatGrams,
    known: fatKnown,
  };
  const protein: VeganProteinSystemSummary = {
    functionalClass: proteinKnown ? proteinDominant!.value : 'unknown',
    source: !proteinKnown
      ? 'unknown'
      : sortedProteinSources.length === 1
        ? sortedProteinSources[0]!
        : 'mixed',
    classifiedGrams: proteinDominant?.total ?? 0,
    unclassifiedGrams: unclassifiedProteinGrams,
    known: proteinKnown,
  };

  const knownHydrocolloids = [...hydrocolloids].filter((entry) => entry !== 'other_unknown').sort();
  const sortedStructuralCarbs = [...structuralCarbs].sort();

  /* ── ordinal evidence, quality-only ────────────────────────────────────── */
  const reasons: VeganStructureReason[] = [];
  let points = 0;

  if (knownHydrocolloids.length > 0) {
    // Audit §3.4/§3.6: the hydrocolloid system is the melting / coalescence
    // control. Inulin does NOT substitute for it.
    points += 2;
    reasons.push({
      code: 'hydrocolloid_structure_present',
      messagePl: 'Obecny jest zweryfikowany system stabilizujący (hydrokoloid).',
    });
  } else if (sortedStructuralCarbs.includes('inulin')) {
    reasons.push({
      code: 'inulin_is_not_a_hydrocolloid_system',
      messagePl:
        'Inulina buduje suchą masę, ale nie zastępuje systemu stabilizującego (hydrokoloidu).',
    });
  }

  if (protein.known) {
    if (protein.functionalClass === 'functional_plant_protein_isolate') {
      points += 2;
      reasons.push({
        code: 'functional_plant_protein_present',
        messagePl: 'Obecne jest funkcjonalne białko roślinne budujące strukturę.',
      });
    } else {
      points += 1;
      reasons.push({
        code: 'whole_food_plant_protein_present',
        messagePl: 'Białko roślinne pochodzi z matrycy surowca, nie z preparatu białkowego.',
      });
    }
  }

  if (fat.known) {
    switch (fat.functionalClass) {
      case 'lauric_solid_fat':
        points += 2;
        reasons.push({
          code: 'solid_fat_system',
          messagePl: 'Układ tłuszczu stałego — sprzyja napowietrzeniu i budowie ciała lodu.',
        });
        break;
      case 'cocoa_butter_fat':
        points += 2;
        reasons.push({
          code: 'cocoa_butter_fat_system',
          messagePl: 'Układ na maśle kakaowym — tłuszcz o ostrym profilu topnienia.',
        });
        break;
      case 'nut_fat_matrix':
        points += 2;
        reasons.push({
          code: 'nut_fat_matrix_system',
          messagePl: 'Tłuszcz pochodzi z matrycy orzechowej/nasiennej razem z jej białkiem.',
        });
        break;
      case 'liquid_vegetable_oil':
        points += 1;
        reasons.push({
          code: 'liquid_fat_dominant_system',
          messagePl:
            'Dominuje olej ciekły — układ legalny, ale strukturalnie słabszy niż tłuszcz stały.',
        });
        break;
      default:
        points += 1;
        reasons.push({
          code: 'mixed_fat_system',
          messagePl: 'Mieszany układ tłuszczów roślinnych.',
        });
        break;
    }
  }

  if (sortedStructuralCarbs.includes('oat_matrix')) {
    points += 1;
    reasons.push({
      code: 'oat_matrix_detected',
      messagePl: 'Wykryto matrycę owsianą (ocena wyłącznie jakościowa).',
    });
  }
  if (sortedStructuralCarbs.includes('starch')) {
    points += 1;
    reasons.push({
      code: 'starch_structure_present',
      messagePl: 'Obecna jest skrobia budująca strukturę.',
    });
  }
  if (emulsifierKnown) {
    reasons.push({
      code: 'emulsifier_evidence_present',
      messagePl: 'Potwierdzono obecność emulgatora.',
    });
  }

  const structuralEvidenceKnown =
    fat.known || protein.known || knownHydrocolloids.length > 0 || sortedStructuralCarbs.length > 0;

  if (unclassifiedFatGrams > 0 || unclassifiedProteinGrams > 0 || !allFull) {
    reasons.push({
      code: 'structural_evidence_incomplete',
      messagePl: 'Część danych strukturalnych jest nieznana — PI korzysta z zachowania bazowego.',
    });
  }

  const quality: VeganStructuralQuality = !structuralEvidenceKnown
    ? 'UNKNOWN'
    : points >= 6
      ? 'STRONG'
      : points >= 4
        ? 'GOOD'
        : points >= 2
          ? 'MODERATE'
          : 'WEAK';

  if (!structuralEvidenceKnown) {
    reasons.push({
      code: 'no_structural_evidence',
      messagePl: 'Brak danych strukturalnych — obowiązuje bazowe zachowanie Wegańskie.',
    });
  }

  const enhancement: VeganEnhancementLevel = !anyEvidence
    ? 'BASELINE_FALLBACK'
    : allFull
      ? 'FULL_ENHANCEMENT'
      : 'PARTIAL_ENHANCEMENT';

  return {
    applicable: true,
    modelVersion: VEGAN_BEHAVIOR_MODEL_VERSION,
    quality,
    structuralEvidencePoints: points,
    fat,
    protein,
    hydrocolloidClasses: knownHydrocolloids,
    structuralCarbClasses: sortedStructuralCarbs,
    enhancement,
    reasons,
  };
}

const QUALITY_RANK: Record<VeganStructuralQuality, number> = {
  UNKNOWN: 0,
  WEAK: 1,
  MODERATE: 2,
  GOOD: 3,
  STRONG: 4,
};

/**
 * TIE-BREAK ONLY. Returns a negative number when `left` is the structurally
 * preferable candidate, positive when `right` is, and 0 when there is no
 * evidence-backed preference.
 *
 * Two hard rules, both from the owner authority:
 *  1. an `UNKNOWN` side NEVER loses — missing knowledge is not a worse recipe,
 *     so no preference is expressed when either side is unknown;
 *  2. this can only ever ORDER candidates that already satisfy every hard
 *     constraint equally. It never rejects, never filters and never changes a
 *     legal recipe into an illegal one.
 */
export function compareVeganStructuralPreference(
  left: VeganStructureAssessment,
  right: VeganStructureAssessment,
): number {
  if (!left.applicable || !right.applicable) return 0;
  if (left.quality === 'UNKNOWN' || right.quality === 'UNKNOWN') return 0;
  const byQuality = QUALITY_RANK[right.quality] - QUALITY_RANK[left.quality];
  if (byQuality !== 0) return byQuality;
  return right.structuralEvidencePoints - left.structuralEvidencePoints;
}

/** Convenience: compare two Vegan recipe candidates directly. */
export function compareVeganStructuralCandidates(left: RecipeInput, right: RecipeInput): number {
  if (left.category !== 'vegan_gelato' || right.category !== 'vegan_gelato') return 0;
  return compareVeganStructuralPreference(
    assessVeganRecipeStructure(left),
    assessVeganRecipeStructure(right),
  );
}

export type { VeganBehavior };
