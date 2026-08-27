/**
 * PINGÜINO — Protein structural quality (Protein Engine v2, QUALITY authority).
 *
 * NOTHING IN THIS FILE CAN INVALIDATE A RECIPE. It produces a 1-10 structural
 * quality score, a set of Polish warnings and a deterministic tie-break signal.
 * Hard safety stays entirely with the unchanged Base Engine bands, and the only
 * Protein-specific hard rule stays in proteinQualification.ts.
 *
 * THE CENTRAL FINDING THIS LAYER ENCODES
 * --------------------------------------
 * Every controlled dataset points the same way: in a frozen dessert, protein
 * above what the product needs is structurally EXPENSIVE, never free.
 *
 *   AFR 2022, Table 1 (10 % fat, 15 % sugar, WPI, constant dasher speed):
 *     4 % protein -> overrun 94.9 %   hardness 13.60 N   melting 0.26 g/min
 *     6 % protein -> overrun 60.5 %                      melting 0.24 g/min
 *     8 % protein -> overrun 44.3 %                      melting 0.54 g/min
 *    10 % protein -> overrun 33.9 %   hardness 47.66 N   melting 0.74 g/min
 *
 *   The authors' own statistics: 6 % was NOT significantly different from the
 *   4 % control for hardness, body-and-texture or meltdown. 8 % and 10 % were
 *   significantly worse on all of them and also lost flavour score.
 *
 * There is no protein level in any of the cited work at which MORE protein made
 * a better frozen dessert. So the quality model never rewards protein. It
 * measures protein bought BEYOND the claim requirement and charges for it,
 * which is exactly the owner's product philosophy: the Engine should find the
 * best legal Protein recipe, not the highest possible protein number.
 */
import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import {
  PROTEIN_CONCENTRATION_EVIDENCE,
  PROTEIN_EVIDENCE_WINDOW,
  PROTEIN_FAT_EVIDENCE_ENVELOPE,
  PROTEIN_LACTOSE_QUALITY,
} from './proteinScienceAuthority';
import {
  assessProteinQualification,
  type ProteinQualificationAssessment,
} from './proteinQualification';
import {
  recipeProteinSourceProfile,
  type RecipeProteinSourceProfile,
} from './proteinBehavior';

export type ProteinStructureWarningCode =
  | 'protein_excess_over_claim'
  | 'protein_beyond_controlled_evidence'
  | 'lactose_load_over_approved_sanding_band'
  | 'fat_outside_evidence_envelope'
  | 'protein_to_fat_outside_evidence_envelope'
  | 'whey_dominant_aeration_risk'
  | 'casein_dominant_ice_coarsening_risk'
  | 'protein_source_class_unknown';

export interface ProteinStructureWarning {
  code: ProteinStructureWarningCode;
  messagePl: string;
  /** Which authority class raised it — ADVISORY warnings never cost a point. */
  scored: boolean;
}

export interface ProteinStructureAssessment {
  applicable: boolean;
  /** 1-10 structural quality. 10 = no measured structural cost. */
  score: number | null;
  /** Overrun the AFR 2022 series measured at this protein level, % (proxy only). */
  overrunProxyPercent: number | null;
  /** Points deducted, itemised so the report and UI can explain the score. */
  penalties: {
    proteinExcess: number;
    beyondEvidence: number;
    lactoseLoad: number;
  };
  /** True when protein exceeds every controlled dataset (> 10 %). */
  beyondControlledEvidence: boolean;
  sourceProfile: RecipeProteinSourceProfile | null;
  warnings: readonly ProteinStructureWarning[];
}

const NOT_APPLICABLE: ProteinStructureAssessment = {
  applicable: false,
  score: null,
  overrunProxyPercent: null,
  penalties: { proteinExcess: 0, beyondEvidence: 0, lactoseLoad: 0 },
  beyondControlledEvidence: false,
  sourceProfile: null,
  warnings: [],
};

/**
 * One quality point per this many percentage points of protein bought above the
 * claim requirement.
 *
 * PROVENANCE, not a preference: AFR 2022 measured its series in exactly 2 pp
 * steps (4 -> 6 -> 8 -> 10 %) and every step from 6 % upward produced a further
 * statistically significant loss of overrun and of sensory body-and-texture.
 * 2 pp is therefore the smallest protein increment the literature demonstrates
 * a real structural cost for.
 */
export const PROTEIN_EXCESS_PENALTY_STEP_PP = 2;
/** Ceiling on the excess penalty so a single dimension can never zero a score. */
const MAX_EXCESS_PENALTY = 6;
/** Flat charge for leaving the controlled-evidence window entirely. */
const BEYOND_EVIDENCE_PENALTY = 1;
/** Lactose above the approved sanding band, per this many pp, capped. */
const LACTOSE_PENALTY_STEP_PP = 3;
const MAX_LACTOSE_PENALTY = 2;

/**
 * Overrun the AFR 2022 series measured at `proteinPercent`, by piecewise-linear
 * interpolation between the four measured points. Outside the measured range it
 * holds the end value rather than extrapolating a number nobody measured.
 *
 * PRESENTATION AND RANKING ONLY. This is one buffalo-milk WPI system on one
 * batch freezer; it is not a prediction of a Gellatti batch's overrun and is
 * never compared against a band.
 */
export function overrunProxyAtProteinPercent(proteinPercent: number): number {
  const series = PROTEIN_CONCENTRATION_EVIDENCE.series;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (proteinPercent <= first.proteinPercent) return first.overrunPercent;
  if (proteinPercent >= last.proteinPercent) return last.overrunPercent;
  for (let index = 1; index < series.length; index += 1) {
    const low = series[index - 1]!;
    const high = series[index]!;
    if (proteinPercent <= high.proteinPercent) {
      const span = high.proteinPercent - low.proteinPercent;
      const ratio = span === 0 ? 0 : (proteinPercent - low.proteinPercent) / span;
      return low.overrunPercent + ratio * (high.overrunPercent - low.overrunPercent);
    }
  }
  return last.overrunPercent;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function assessProteinStructure(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
  qualification: ProteinQualificationAssessment = assessProteinQualification(input, result),
): ProteinStructureAssessment {
  if (!qualification.applicable) return NOT_APPLICABLE;

  const warnings: ProteinStructureWarning[] = [];
  const proteinPercent = result.percentages.protein_percent;
  const fatPercent = result.percentages.fat_percent;
  const lactosePercent = result.percentages.lactose_percent;

  const sourceProfile = recipeProteinSourceProfile(
    result.items.map((item) => ({ ingredient: item.ingredient, grams: item.effective_grams })),
  );

  /* ── Scored: protein bought beyond the claim ───────────────────────────── */
  const excessPp = qualification.excessPp ?? 0;
  const proteinExcess = clamp(
    Math.floor(Math.max(0, excessPp) / PROTEIN_EXCESS_PENALTY_STEP_PP),
    0,
    MAX_EXCESS_PENALTY,
  );
  if (proteinExcess > 0) {
    warnings.push({
      code: 'protein_excess_over_claim',
      scored: true,
      messagePl:
        `Receptura ma ${proteinPercent.toFixed(1)}% białka, a do deklaracji „wysoka zawartość białka” ` +
        `wystarcza ${(qualification.requiredPercent ?? 0).toFixed(1)}%. Nadmiar ${excessPp.toFixed(1)} pp ` +
        `nie poprawia produktu — w badaniach obniża napowietrzenie i zwiększa twardość.`,
    });
  }

  /* ── Scored: outside every controlled dataset ──────────────────────────── */
  const beyondControlledEvidence =
    proteinPercent > PROTEIN_EVIDENCE_WINDOW.evidenceCeilingPercent + 1e-9;
  const beyondEvidence = beyondControlledEvidence ? BEYOND_EVIDENCE_PENALTY : 0;
  if (beyondControlledEvidence) {
    warnings.push({
      code: 'protein_beyond_controlled_evidence',
      scored: true,
      messagePl:
        `${proteinPercent.toFixed(1)}% białka wykracza poza wszystkie kontrolowane badania ` +
        `mrożonych deserów (maksimum ${PROTEIN_EVIDENCE_WINDOW.evidenceCeilingPercent}%). ` +
        `Zachowanie struktury w tym zakresie nie jest zweryfikowane.`,
    });
  }

  /* ── Scored: lactose load (reuses the already-approved sanding band) ───── */
  const lactoseOver = Math.max(
    0,
    lactosePercent - PROTEIN_LACTOSE_QUALITY.approvedSandingRiskMaxPercent,
  );
  const lactoseLoad =
    lactoseOver > 1e-9
      ? clamp(1 + Math.floor(lactoseOver / LACTOSE_PENALTY_STEP_PP), 1, MAX_LACTOSE_PENALTY)
      : 0;
  if (lactoseLoad > 0) {
    warnings.push({
      code: 'lactose_load_over_approved_sanding_band',
      scored: true,
      messagePl:
        `Laktoza ${lactosePercent.toFixed(1)}% przekracza zatwierdzony zakres ryzyka piaszczystości ` +
        `(maks. ${PROTEIN_LACTOSE_QUALITY.approvedSandingRiskMaxPercent}%). Źródło białka wnosi dużo laktozy — ` +
        `źródło o wyższej czystości dostarczy to samo białko przy mniejszym ryzyku.`,
    });
  }

  /* ── Advisory only: never scored ───────────────────────────────────────── */
  if (
    fatPercent < PROTEIN_FAT_EVIDENCE_ENVELOPE.fatFloorPercent ||
    fatPercent > PROTEIN_FAT_EVIDENCE_ENVELOPE.fatCeilingPercent
  ) {
    warnings.push({
      code: 'fat_outside_evidence_envelope',
      scored: false,
      messagePl:
        `Tłuszcz ${fatPercent.toFixed(1)}% leży poza oknem ${PROTEIN_FAT_EVIDENCE_ENVELOPE.fatFloorPercent}-` +
        `${PROTEIN_FAT_EVIDENCE_ENVELOPE.fatCeilingPercent}%, w którym badano receptury wysokobiałkowe. ` +
        `Twarde granice bezpieczeństwa obliczeń pozostają nadrzędne.`,
    });
  }
  const proteinToFat = fatPercent > 0 ? proteinPercent / fatPercent : null;
  if (
    proteinToFat !== null &&
    (proteinToFat < PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatFloor ||
      proteinToFat > PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatCeiling)
  ) {
    warnings.push({
      code: 'protein_to_fat_outside_evidence_envelope',
      scored: false,
      messagePl:
        `Stosunek białko:tłuszcz ${proteinToFat.toFixed(2)} leży poza zakresem badanych receptur ` +
        `(${PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatFloor}-${PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatCeiling}). ` +
        `Brak kontrolowanej serii białko:tłuszcz, więc jest to wyłącznie informacja.`,
    });
  }
  // Whey/casein is DIRECTIONALLY CONTESTED between IJFP 2025 (casein-dominant
  // aerates better and melts later) and JFS 2026 (sodium caseinate gives the
  // coarsest ice and fastest drip-through). It is therefore surfaced and used
  // as a tie-break, never scored.
  if (sourceProfile.wheyCaseinClass === 'whey_dominant' && proteinPercent > 6) {
    warnings.push({
      code: 'whey_dominant_aeration_risk',
      scored: false,
      messagePl:
        'Białko pochodzi głównie z serwatki. Przy tym poziomie białka badania notują niższe ' +
        'napowietrzenie i twardszą strukturę niż dla białka kazeinowego.',
    });
  }
  if (sourceProfile.wheyCaseinClass === 'casein_dominant' && proteinPercent > 6) {
    warnings.push({
      code: 'casein_dominant_ice_coarsening_risk',
      scored: false,
      messagePl:
        'Białko pochodzi głównie z kazeiny. Badania notują lepsze napowietrzenie, ale grubsze ' +
        'kryształy lodu niż dla izolatu serwatkowego.',
    });
  }
  if (!sourceProfile.fullyClassified && sourceProfile.totalProteinG > 0) {
    warnings.push({
      code: 'protein_source_class_unknown',
      scored: false,
      messagePl:
        'Część białka pochodzi ze źródła bez rozpoznanej klasy. Receptura pozostaje w pełni ważna — ' +
        'ocena strukturalna korzysta wtedy z zachowania bazowego.',
    });
  }

  const score = clamp(10 - (proteinExcess + beyondEvidence + lactoseLoad), 1, 10);

  return {
    applicable: true,
    score,
    overrunProxyPercent: overrunProxyAtProteinPercent(proteinPercent),
    penalties: { proteinExcess, beyondEvidence, lactoseLoad },
    beyondControlledEvidence,
    sourceProfile,
    warnings,
  };
}
