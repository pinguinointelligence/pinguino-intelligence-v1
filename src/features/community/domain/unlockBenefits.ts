/**
 * What „Odblokuj tę recepturę" may honestly promise (§18) — PURE.
 *
 * The rule is not „write nice marketing copy". It is: read the REAL
 * entitlement matrix and list only capabilities that (a) the paid tier
 * actually has and (b) the viewer actually lacks right now. A benefit that is
 * already available is not a reason to pay, and a benefit that does not exist
 * is a lie a CTA must not tell.
 *
 * Because the list is DERIVED from `CAPABILITIES`, a capability that is later
 * turned off in the matrix disappears from the CTA automatically. There is no
 * second, hand-maintained list to fall out of sync.
 */
import { CAPABILITIES, type AccessTier, type Capabilities } from '@/access/plans';

/** Human labels for the capability flags a customer can actually perceive. */
const BENEFIT_LABELS: Partial<Record<keyof Capabilities, string>> = {
  canViewExactGrams: 'Dokładne gramatury każdego składnika',
  fullFormula: 'Pełna receptura z możliwością przeliczenia',
  exactCorrectionGrams: 'Dokładne korekty w gramach',
  technicalView: 'Pełny widok techniczny Gellatti',
  canApplyStarterToStudio: 'Wczytanie receptury do edytora',
  saveRecipes: 'Zapisywanie receptur',
  myRecipes: 'Biblioteka Moje receptury',
  productionMode: 'Tryb produkcji',
  rescueMode: 'Tryb ratunkowy',
};

/**
 * Capabilities the paid tier grants that `viewerTier` does not have yet.
 * Deterministic order (matrix declaration order) so the CTA does not reshuffle
 * between renders.
 */
export function unlockBenefits(viewerTier: AccessTier): readonly string[] {
  const paid = CAPABILITIES.pro;
  const current = CAPABILITIES[viewerTier];
  return (Object.keys(BENEFIT_LABELS) as Array<keyof Capabilities>)
    .filter((capability) => paid[capability] === true && current[capability] !== true)
    .map((capability) => BENEFIT_LABELS[capability])
    .filter((label): label is string => typeof label === 'string');
}
