/**
 * PINGÜINO — derived ProteinBehavior (Protein Engine v2).
 *
 * MAPPER BASE IS IMMUTABLE. Nothing here writes to, extends or requires a new
 * column in the 2088-row `mapper_basement` source of truth. Every field below
 * is DERIVED at runtime from facts the canonical product already carries:
 * its display name, its engine category and its verified composition.
 *
 * The layer answers one question the Base Engine cannot: at equal protein
 * grams, WHAT KIND of protein is this? JFS 2026 measured mix viscosity
 * spanning 123 -> 466 mPa*s and mean ice-crystal size 32.5 -> 41.9 um from the
 * protein source alone, at an identical 6 % protein / 12 % fat formulation.
 *
 * EVIDENCE DISCIPLINE
 *   EXPLICIT                  — the product names its own protein class.
 *   DETERMINISTICALLY_INFERRED — the class follows from category + composition
 *                                by a rule that is the same for every product.
 *   UNKNOWN                   — not enough evidence. NEVER a penalty: an
 *                                UNKNOWN class falls back to baseline Protein
 *                                behaviour and the ingredient stays fully
 *                                usable (owner rule, §22).
 */
import type { EngineIngredient } from '@/engine';
import { NATIVE_MILK_CASEIN_SHARE_PERCENT } from './proteinScienceAuthority';

/**
 * Minimal deterministic taxonomy. Deliberately small: one class per protein
 * chemistry that the cited studies actually separate, plus honest fallbacks.
 */
export type ProteinSourceClass =
  | 'whey_protein_isolate'
  | 'whey_protein_concentrate'
  | 'milk_protein_concentrate'
  | 'micellar_casein'
  | 'caseinate'
  | 'skim_milk_powder'
  | 'milk_powder'
  | 'fluid_dairy'
  | 'fermented_dairy'
  | 'plant_protein'
  | 'egg_protein'
  | 'mixed_dairy_protein'
  | 'unknown';

/** Functional split that the whey:casein literature actually distinguishes. */
export type WheyCaseinClass = 'whey_dominant' | 'casein_dominant' | 'mixed_milk_protein' | 'unknown';

export type ProteinEvidenceLevel = 'EXPLICIT' | 'DETERMINISTICALLY_INFERRED' | 'UNKNOWN';

/** Concentration form, only where the evidence genuinely separates it. */
export type ProteinForm = 'isolate' | 'concentrate' | 'whole_matrix' | 'unknown';

export interface ProteinBehavior {
  sourceClass: ProteinSourceClass;
  sourceEvidence: ProteinEvidenceLevel;
  wheyCaseinClass: WheyCaseinClass;
  wheyCaseinEvidence: ProteinEvidenceLevel;
  /** Approximate casein share of THIS source's protein, or null when unknown.
   *  Class-level only — never a fake per-product ratio (owner rule, §16). */
  caseinSharePercent: number | null;
  form: ProteinForm;
  /** Protein per 100 g of the ingredient, straight from verified composition. */
  proteinPercent: number;
  /** Grams of lactose carried per gram of protein delivered. The single
   *  clearest "equal protein is not equal chemistry" number. Null when the
   *  ingredient supplies no protein. */
  lactosePerProteinGram: number | null;
  /** Grams of fat carried per gram of protein delivered. */
  fatPerProteinGram: number | null;
  /** True when the product contributes meaningful protein to a Protein recipe. */
  isProteinContributor: boolean;
  /** Human-readable provenance of the classification decision. */
  rationale: string;
}

/** Protein density below which a line is a flavour/base ingredient, not a protein source. */
const PROTEIN_SOURCE_MIN_PERCENT = 10;
/** Isolate-grade protein density (WPI/MPI conventionally sit at or above this). */
const ISOLATE_MIN_PROTEIN_PERCENT = 88;
/** Above this lactose density a "milk protein" powder is really a milk powder. */
const MILK_POWDER_MIN_LACTOSE_PERCENT = 30;
/** At or below this moisture the product is a powder, whatever its name says. */
const POWDER_MAX_WATER_PERCENT = 15;
/** Protein density that only a concentrated protein fraction reaches. */
const CONCENTRATED_PROTEIN_MIN_PERCENT = 50;
/** Skim/whole milk powders sit in this protein window. */
const MILK_POWDER_MIN_PROTEIN_PERCENT = 20;
/** Fat share separating whole milk powder from skimmed. */
const WHOLE_MILK_POWDER_MIN_FAT_PERCENT = 15;
/** Fluid dairy is a protein-relevant base from roughly milk strength upward. */
const FLUID_DAIRY_MIN_PROTEIN_PERCENT = 2.5;

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[·•]/g, ' ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Short acronyms ("wpc", "smp", "mpi") must match a WHOLE WORD — a substring
 * test would classify unrelated products by accident. Multi-word phrases are
 * matched as substrings of the normalised name.
 */
const hasAny = (haystack: string, needles: readonly string[]): boolean => {
  const words = new Set(haystack.split(' '));
  return needles.some((needle) =>
    needle.includes(' ') ? haystack.includes(needle) : words.has(needle),
  );
};

/** Name tokens per class. Order of evaluation is fixed and total. */
const TOKENS = {
  wpi: ['whey protein isolate', 'wpi', 'izolat bialka serwatkowego', 'izolat serwatki'],
  wpc: ['whey protein concentrate', 'wpc', 'koncentrat bialka serwatkowego'],
  mpc: ['milk protein concentrate', 'mpc', 'milk protein isolate', 'mpi'],
  micellarCasein: ['micellar casein', 'kazeina micelarna', 'micellar milk protein'],
  caseinate: ['caseinate', 'kazeinian', 'sodium casein', 'calcium casein', 'casein'],
  skimMilkPowder: ['skimmed milk powder', 'skim milk powder', 'smp', 'mleko w proszku odtluszczone'],
  milkPowder: ['milk powder', 'whole milk powder', 'mleko w proszku'],
  fermented: ['skyr', 'yoghurt', 'yogurt', 'jogurt', 'quark', 'twarog', 'kefir', 'fromage frais'],
  plant: [
    'pea protein',
    'rice protein',
    'soy protein',
    'soya protein',
    'hemp protein',
    'bialko grochu',
    'bialko ryzu',
    'bialko sojowe',
  ],
  egg: ['egg white', 'egg albumen', 'bialko jaja', 'dried egg'],
  fluidDairy: ['milk 3', 'milk 1', 'cream', 'mleko', 'smietana', 'fluid milk'],
} as const;

interface ClassDecision {
  sourceClass: ProteinSourceClass;
  sourceEvidence: ProteinEvidenceLevel;
  rationale: string;
}

/**
 * Deterministic classification. Explicit name evidence wins; where two protein
 * classes are named at once the product contradicts itself and is honestly
 * demoted to `mixed_dairy_protein` rather than guessed at.
 */
function classifySource(ingredient: EngineIngredient): ClassDecision {
  const name = normalize(ingredient.name);
  const composition = ingredient.composition;
  const protein = composition.protein_percent;
  const lactose = composition.lactose_percent;
  const dairy = ingredient.flags?.is_dairy === true || ingredient.category === 'dairy';

  const namedWhey = hasAny(name, TOKENS.wpi) || hasAny(name, TOKENS.wpc);
  const namedMilkProtein = hasAny(name, TOKENS.mpc);
  const namedCasein = hasAny(name, TOKENS.micellarCasein) || hasAny(name, TOKENS.caseinate);

  // Self-contradicting names ("MILK PROTEIN CONCENTRATE WPC 75%") exist in the
  // catalog. Refuse to pick a winner — that would be invented precision.
  const namedClasses = [namedWhey, namedMilkProtein, namedCasein].filter(Boolean).length;
  if (namedClasses > 1) {
    return {
      sourceClass: 'mixed_dairy_protein',
      sourceEvidence: 'DETERMINISTICALLY_INFERRED',
      rationale:
        'product name asserts more than one dairy protein class; no single class is inferable without invention',
    };
  }

  if (hasAny(name, TOKENS.wpi)) {
    return {
      sourceClass: 'whey_protein_isolate',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states whey protein isolate',
    };
  }
  if (hasAny(name, TOKENS.wpc)) {
    return {
      sourceClass: 'whey_protein_concentrate',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states whey protein concentrate',
    };
  }
  if (hasAny(name, TOKENS.micellarCasein)) {
    return {
      sourceClass: 'micellar_casein',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states micellar casein',
    };
  }
  if (hasAny(name, TOKENS.caseinate)) {
    return {
      sourceClass: 'caseinate',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states a caseinate',
    };
  }
  if (namedMilkProtein) {
    // A "milk protein" powder dragging milk-powder levels of lactose is a milk
    // powder in every way the Engine can measure.
    if (lactose >= MILK_POWDER_MIN_LACTOSE_PERCENT) {
      return {
        sourceClass: 'skim_milk_powder',
        sourceEvidence: 'DETERMINISTICALLY_INFERRED',
        rationale: `named as milk protein but carries ${lactose.toFixed(1)} % lactose, which is milk-powder composition`,
      };
    }
    return {
      sourceClass: 'milk_protein_concentrate',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states milk protein concentrate/isolate',
    };
  }
  if (hasAny(name, TOKENS.plant)) {
    return {
      sourceClass: 'plant_protein',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states a named plant protein',
    };
  }
  if (hasAny(name, TOKENS.egg)) {
    return {
      sourceClass: 'egg_protein',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states an egg protein',
    };
  }
  if (hasAny(name, TOKENS.skimMilkPowder)) {
    return {
      sourceClass: 'skim_milk_powder',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states skimmed milk powder',
    };
  }
  if (hasAny(name, TOKENS.milkPowder)) {
    return {
      sourceClass: 'milk_powder',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states a milk powder',
    };
  }
  if (hasAny(name, TOKENS.fermented) && dairy) {
    return {
      sourceClass: 'fermented_dairy',
      sourceEvidence: 'EXPLICIT',
      rationale: 'product name states a fermented dairy product',
    };
  }
  if (ingredient.category === 'egg' && protein >= PROTEIN_SOURCE_MIN_PERCENT) {
    return {
      sourceClass: 'egg_protein',
      sourceEvidence: 'DETERMINISTICALLY_INFERRED',
      rationale: 'egg category with protein-source density',
    };
  }

  // COMPOSITION TIER.
  //
  // The runtime only sees the DISPLAY name, and the canonical base strips the
  // physical form from it — `skimmed_milk_powder` is displayed as
  // "SKIMMED MILK · Milk". Name evidence alone would therefore mistake a 3 %
  // moisture powder for fluid milk. Verified composition cannot be stripped, so
  // it is the honest fallback: water tells us powder vs. fluid, and the
  // lactose:protein balance tells us milk matrix vs. protein fraction.
  if (dairy) {
    const powder = composition.water_percent <= POWDER_MAX_WATER_PERCENT;
    if (powder && protein >= CONCENTRATED_PROTEIN_MIN_PERCENT && lactose <= 10) {
      return {
        sourceClass: 'mixed_dairy_protein',
        sourceEvidence: 'DETERMINISTICALLY_INFERRED',
        rationale: `dry dairy protein fraction (${protein.toFixed(1)} % protein, ${lactose.toFixed(1)} % lactose) whose whey/casein fraction is not derivable from the available evidence`,
      };
    }
    if (powder && protein >= MILK_POWDER_MIN_PROTEIN_PERCENT && lactose >= MILK_POWDER_MIN_LACTOSE_PERCENT) {
      return composition.fat_percent >= WHOLE_MILK_POWDER_MIN_FAT_PERCENT
        ? {
            sourceClass: 'milk_powder',
            sourceEvidence: 'DETERMINISTICALLY_INFERRED',
            rationale: `dry milk matrix with ${composition.fat_percent.toFixed(1)} % fat — whole milk powder composition`,
          }
        : {
            sourceClass: 'skim_milk_powder',
            sourceEvidence: 'DETERMINISTICALLY_INFERRED',
            rationale: `dry milk matrix with ${lactose.toFixed(1)} % lactose and ${composition.fat_percent.toFixed(1)} % fat — skimmed milk powder composition`,
          };
    }
    if (powder && protein >= PROTEIN_SOURCE_MIN_PERCENT) {
      return {
        sourceClass: 'mixed_dairy_protein',
        sourceEvidence: 'DETERMINISTICALLY_INFERRED',
        rationale: 'dry dairy protein source without a derivable protein fraction',
      };
    }
    if (!powder && protein >= FLUID_DAIRY_MIN_PROTEIN_PERCENT) {
      return {
        sourceClass: 'fluid_dairy',
        sourceEvidence: 'DETERMINISTICALLY_INFERRED',
        rationale: `fluid dairy base (${composition.water_percent.toFixed(1)} % water) carrying the native milk protein matrix`,
      };
    }
    if (protein >= PROTEIN_SOURCE_MIN_PERCENT) {
      return {
        sourceClass: 'mixed_dairy_protein',
        sourceEvidence: 'DETERMINISTICALLY_INFERRED',
        rationale: 'verified dairy protein source without an explicit fraction in its name',
      };
    }
  }
  if (protein >= PROTEIN_SOURCE_MIN_PERCENT) {
    return {
      sourceClass: 'unknown',
      sourceEvidence: 'UNKNOWN',
      rationale: 'protein-dense product with no derivable protein class — baseline behaviour applies',
    };
  }
  return {
    sourceClass: 'unknown',
    sourceEvidence: 'UNKNOWN',
    rationale: 'not a protein source',
  };
}

interface WheyCaseinDecision {
  wheyCaseinClass: WheyCaseinClass;
  wheyCaseinEvidence: ProteinEvidenceLevel;
  caseinSharePercent: number | null;
}

/**
 * Class-level whey:casein only. Bovine milk protein is approximately
 * 80 % casein / 20 % whey, so every product that retains the intact milk
 * protein matrix (MPC, milk powders, fluid and fermented dairy) inherits that
 * split by definition. Whey fractions are whey-only, caseinates and micellar
 * casein are casein-only. Anything else returns UNKNOWN rather than a number.
 */
function classifyWheyCasein(sourceClass: ProteinSourceClass): WheyCaseinDecision {
  switch (sourceClass) {
    case 'whey_protein_isolate':
    case 'whey_protein_concentrate':
      return {
        wheyCaseinClass: 'whey_dominant',
        wheyCaseinEvidence: 'DETERMINISTICALLY_INFERRED',
        caseinSharePercent: 0,
      };
    case 'micellar_casein':
    case 'caseinate':
      return {
        wheyCaseinClass: 'casein_dominant',
        wheyCaseinEvidence: 'DETERMINISTICALLY_INFERRED',
        caseinSharePercent: 100,
      };
    case 'milk_protein_concentrate':
    case 'skim_milk_powder':
    case 'milk_powder':
    case 'fluid_dairy':
    case 'fermented_dairy':
      return {
        wheyCaseinClass: 'mixed_milk_protein',
        wheyCaseinEvidence: 'DETERMINISTICALLY_INFERRED',
        caseinSharePercent: NATIVE_MILK_CASEIN_SHARE_PERCENT,
      };
    case 'plant_protein':
    case 'egg_protein':
    case 'mixed_dairy_protein':
    case 'unknown':
    default:
      return {
        wheyCaseinClass: 'unknown',
        wheyCaseinEvidence: 'UNKNOWN',
        caseinSharePercent: null,
      };
  }
}

function classifyForm(sourceClass: ProteinSourceClass, proteinPercent: number): ProteinForm {
  switch (sourceClass) {
    case 'whey_protein_isolate':
      return 'isolate';
    case 'whey_protein_concentrate':
      return proteinPercent >= ISOLATE_MIN_PROTEIN_PERCENT ? 'isolate' : 'concentrate';
    case 'milk_protein_concentrate':
    case 'micellar_casein':
    case 'caseinate':
      return proteinPercent >= ISOLATE_MIN_PROTEIN_PERCENT ? 'isolate' : 'concentrate';
    case 'skim_milk_powder':
    case 'milk_powder':
    case 'fluid_dairy':
    case 'fermented_dairy':
      return 'whole_matrix';
    case 'plant_protein':
    case 'egg_protein':
      return proteinPercent >= ISOLATE_MIN_PROTEIN_PERCENT ? 'isolate' : 'concentrate';
    default:
      return 'unknown';
  }
}

/** Pure, deterministic, non-mutating. Same ingredient in, same behaviour out. */
export function deriveProteinBehavior(ingredient: EngineIngredient): ProteinBehavior {
  const composition = ingredient.composition;
  const proteinPercent = composition.protein_percent;
  const decision = classifySource(ingredient);
  const wheyCasein = classifyWheyCasein(decision.sourceClass);
  return {
    sourceClass: decision.sourceClass,
    sourceEvidence: decision.sourceEvidence,
    wheyCaseinClass: wheyCasein.wheyCaseinClass,
    wheyCaseinEvidence: wheyCasein.wheyCaseinEvidence,
    caseinSharePercent: wheyCasein.caseinSharePercent,
    form: classifyForm(decision.sourceClass, proteinPercent),
    proteinPercent,
    lactosePerProteinGram: proteinPercent > 0 ? composition.lactose_percent / proteinPercent : null,
    fatPerProteinGram: proteinPercent > 0 ? composition.fat_percent / proteinPercent : null,
    isProteinContributor: proteinPercent > 0,
    rationale: decision.rationale,
  };
}

export interface RecipeProteinSourceProfile {
  /** Total protein grams contributed by lines the taxonomy could classify. */
  classifiedProteinG: number;
  /** Total protein grams from lines with no derivable class (baseline fallback). */
  unknownProteinG: number;
  totalProteinG: number;
  /** The class supplying the most protein grams, or null when nothing does. */
  dominantClass: ProteinSourceClass | null;
  dominantShare: number;
  /** Protein-weighted casein share across classified lines, or null. */
  caseinSharePercent: number | null;
  wheyCaseinClass: WheyCaseinClass;
  /** True when every protein gram came from a classified source. */
  fullyClassified: boolean;
  byClass: ReadonlyMap<ProteinSourceClass, number>;
}

/**
 * Aggregate the derived behaviour of an executable recipe. Weighting is by
 * PROTEIN GRAMS DELIVERED, not by line mass — a 2 g line of isolate and a
 * 400 g line of milk are compared on what they actually contribute.
 */
export function recipeProteinSourceProfile(
  items: readonly { ingredient: EngineIngredient; grams: number }[],
): RecipeProteinSourceProfile {
  const byClass = new Map<ProteinSourceClass, number>();
  let totalProteinG = 0;
  let unknownProteinG = 0;
  let caseinWeightedG = 0;
  let caseinKnownProteinG = 0;

  for (const item of items) {
    if (item.grams <= 0) continue;
    const behavior = deriveProteinBehavior(item.ingredient);
    const proteinG = (item.grams * behavior.proteinPercent) / 100;
    if (proteinG <= 0) continue;
    totalProteinG += proteinG;
    byClass.set(behavior.sourceClass, (byClass.get(behavior.sourceClass) ?? 0) + proteinG);
    if (behavior.sourceClass === 'unknown') unknownProteinG += proteinG;
    if (behavior.caseinSharePercent !== null) {
      caseinWeightedG += (proteinG * behavior.caseinSharePercent) / 100;
      caseinKnownProteinG += proteinG;
    }
  }

  let dominantClass: ProteinSourceClass | null = null;
  let dominantGrams = 0;
  // Deterministic tie-break by class name so the same recipe always reports the
  // same dominant class.
  for (const key of [...byClass.keys()].sort()) {
    const grams = byClass.get(key)!;
    if (grams > dominantGrams + 1e-9) {
      dominantGrams = grams;
      dominantClass = key;
    }
  }

  const caseinSharePercent =
    caseinKnownProteinG > 0 ? (caseinWeightedG / caseinKnownProteinG) * 100 : null;
  const wheyCaseinClass: WheyCaseinClass =
    caseinSharePercent === null
      ? 'unknown'
      : caseinSharePercent >= 65
        ? 'casein_dominant'
        : caseinSharePercent <= 35
          ? 'whey_dominant'
          : 'mixed_milk_protein';

  return {
    classifiedProteinG: totalProteinG - unknownProteinG,
    unknownProteinG,
    totalProteinG,
    dominantClass,
    dominantShare: totalProteinG > 0 ? (dominantGrams / totalProteinG) * 100 : 0,
    caseinSharePercent,
    wheyCaseinClass,
    fullyClassified: totalProteinG > 0 && unknownProteinG <= 1e-9,
    byClass,
  };
}
