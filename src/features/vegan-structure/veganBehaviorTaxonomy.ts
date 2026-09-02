/**
 * VEGAN ENGINE v2 — derived structural taxonomy (ADDITIVE ONLY).
 *
 * Authority: `reports/VEGAN_SCIENCE_AUTHORITY_V2.md` — verdict
 * "C. VEGAN V2 MUST REMAIN ADDITIVE ONLY".
 *
 * These types describe DERIVED behaviour, never stored truth. Nothing here is
 * written back into the Mapper base, nothing here creates a second ingredient
 * database, and nothing here is a hard gate: the whole taxonomy lives in the
 * QUALITY / STRUCTURE layer above the unchanged HARD physics and PREFERRED
 * formulation targets.
 *
 * The taxonomy is deliberately MINIMAL. The audit refuted quantitative
 * per-class coefficients on evidence: the partial-coalescence effect of a fat
 * swap REVERSES sign with protein composition (§3.1, DOI 10.1111/ijfs.16493)
 * and the protein response is non-monotonic (§3.3,
 * DOI 10.1016/j.foohum.2025.100557). Only qualitative functional families are
 * defensible, so only qualitative functional families exist here.
 */

/**
 * Version of the derived model. Bump on ANY change to the classifier rules or
 * the taxonomy so a memoised `VeganBehavior` can never outlive its rules.
 */
export const VEGAN_BEHAVIOR_MODEL_VERSION = '2.0.0';

/**
 * How well the canonical facts support a derived class.
 *
 *  - `EXPLICIT`                   — the canonical identity names the functional
 *                                   material itself ("pea protein isolate",
 *                                   "refined coconut oil", "cocoa butter").
 *  - `DETERMINISTICALLY_INFERRED` — the class follows from a named source token
 *                                   PLUS a corroborating composition fact
 *                                   ("soy drink" carrying real protein).
 *  - `UNKNOWN`                    — no rule fires. Baseline behaviour applies.
 *
 * `UNKNOWN` is NOT a defect and NEVER a penalty: missing knowledge is not a bad
 * recipe. No LLM guess, no web lookup and no heuristic may ever raise a level.
 */
export type VeganEvidenceLevel = 'EXPLICIT' | 'DETERMINISTICALLY_INFERRED' | 'UNKNOWN';

/* ── fat ──────────────────────────────────────────────────────────────────── */

/** Botanical/technological origin of the fat phase. Diagnostic detail. */
export type VeganFatSource =
  | 'coconut'
  | 'palm_kernel'
  | 'cocoa_butter'
  | 'sunflower'
  | 'soybean'
  | 'rapeseed'
  | 'olive'
  | 'nut_or_seed'
  | 'mixed'
  | 'unknown';

/**
 * Minimal fat functional families (audit §3.1 / §3.5 / §6).
 *
 *  - `lauric_solid_fat`     — coconut / palm-kernel systems: high crystallinity
 *                             and solid fat content well above serving
 *                             temperature.
 *  - `cocoa_butter_fat`     — sharp-melting cocoa-butter system.
 *  - `liquid_vegetable_oil` — sunflower / soybean / rapeseed / olive: low
 *                             crystallinity, low solid content.
 *  - `nut_fat_matrix`       — fat held inside a nut/seed cell + protein matrix
 *                             (pastes, butters); not a free fat phase.
 *  - `mixed_plant_fat`      — more than one family with no dominant one.
 *  - `unknown`              — baseline fallback.
 *
 * NO solid-fat-content curve is attached to any family: audit §3.5 supplies no
 * SFC data for coconut, sunflower or cocoa butter, so none is invented.
 */
export type VeganFatFunctionalClass =
  | 'lauric_solid_fat'
  | 'cocoa_butter_fat'
  | 'liquid_vegetable_oil'
  | 'nut_fat_matrix'
  | 'mixed_plant_fat'
  | 'unknown';

/* ── protein ──────────────────────────────────────────────────────────────── */

export type VeganProteinSource =
  | 'soy'
  | 'pea'
  | 'rice'
  | 'chickpea'
  | 'oat'
  | 'nut_or_seed'
  | 'mixed'
  | 'unknown';

/** Physical form, only where the canonical identity states it safely. */
export type VeganProteinForm = 'isolate' | 'concentrate' | 'whole_food_matrix' | 'unknown';

/**
 * Minimal protein functional families.
 *
 * Deliberately COARSE. Audit §3.2 proves the source matters at constant protein
 * %, but §3.3 proves the response is non-monotonic, so no per-source ideal,
 * minimum or maximum may exist. Source and form stay available as diagnostic
 * detail; only these families carry structural meaning.
 */
export type VeganProteinFunctionalClass =
  | 'functional_plant_protein_isolate'
  | 'whole_food_plant_protein_matrix'
  | 'mixed_plant_protein'
  | 'unknown';

/* ── structural carbohydrates ─────────────────────────────────────────────── */

/**
 * Functionally DISTINCT structural carbohydrate classes. Audit §3.4 proves
 * inulin and a hydrocolloid stabiliser act in OPPOSITE directions on overrun,
 * so `inulin` is never a member of the hydrocolloid taxonomy below.
 *
 * `beta_glucan_explicit` exists only for a canonical fact that actually states a
 * β-glucan quantity. Mapper coverage is 0 % (audit §5.2), so it is never
 * inferred from an oat identity and no β-glucan term is ever invented.
 */
export type VeganStructuralCarbClass =
  | 'inulin'
  | 'starch'
  | 'oat_matrix'
  | 'soluble_fibre'
  | 'beta_glucan_explicit'
  | 'unknown_structural_solids';

/* ── hydrocolloids / emulsifiers ──────────────────────────────────────────── */

export type VeganHydrocolloidClass =
  | 'tara'
  | 'guar'
  | 'locust_bean'
  | 'xanthan'
  | 'carrageenan'
  | 'pectin'
  | 'agar'
  | 'cellulose_gum'
  | 'other_unknown';

export type VeganEmulsifierClass =
  | 'lecithin'
  | 'mono_diglycerides'
  | 'polysorbate'
  | 'other_unknown';

/* ── derived behaviour ────────────────────────────────────────────────────── */

export interface VeganFatBehavior {
  /** Per 100 g of the product; `null` when the canonical facts do not state it. */
  amountPercent: number | null;
  amountEvidence: VeganEvidenceLevel;
  source: VeganFatSource;
  functionalClass: VeganFatFunctionalClass;
  /** Evidence level of `source` / `functionalClass` — independent of the amount. */
  evidence: VeganEvidenceLevel;
}

export interface VeganProteinBehavior {
  amountPercent: number | null;
  amountEvidence: VeganEvidenceLevel;
  source: VeganProteinSource;
  form: VeganProteinForm;
  functionalClass: VeganProteinFunctionalClass;
  evidence: VeganEvidenceLevel;
}

export interface VeganStructuralCarbEvidence {
  structuralClass: VeganStructuralCarbClass;
  evidence: VeganEvidenceLevel;
  /** Only ever a value the canonical facts actually state. Never invented. */
  amountPercent: number | null;
}

export interface VeganHydrocolloidEvidence {
  hydrocolloidClass: VeganHydrocolloidClass;
  evidence: VeganEvidenceLevel;
}

export interface VeganEmulsifierEvidence {
  emulsifierClass: VeganEmulsifierClass;
  evidence: VeganEvidenceLevel;
}

/**
 * The complete derived structural behaviour of ONE product.
 *
 * Reproducible from canonical facts alone: same facts in → identical value out.
 * It is NOT a replacement for `ProductBehavior`, dosage authority, production
 * authority or technical safety, and it never participates in eligibility.
 */
export interface VeganBehavior {
  modelVersion: string;
  /** Stable canonical identity this behaviour was derived for. */
  identityKey: string;
  fat: VeganFatBehavior;
  protein: VeganProteinBehavior;
  structuralCarbohydrates: readonly VeganStructuralCarbEvidence[];
  hydrocolloids: readonly VeganHydrocolloidEvidence[];
  emulsifiers: readonly VeganEmulsifierEvidence[];
  /** Deterministic machine-readable trace of which rules fired. */
  reasons: readonly string[];
}

/** Enhancement depth actually achieved for one product (audit §5.3 reporting). */
export type VeganEnhancementLevel =
  | 'FULL_ENHANCEMENT'
  | 'PARTIAL_ENHANCEMENT'
  | 'BASELINE_FALLBACK';
