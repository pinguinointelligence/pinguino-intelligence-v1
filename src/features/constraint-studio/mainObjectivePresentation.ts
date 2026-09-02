import type { ConstraintPreview } from './applyPipeline';
import { formatGramsPl } from './constraintStudioCopy';
import { captureMainIngredientIntent } from '@/features/formulation/mainIngredientContract';

const compactMainName = (name: string): string => name.split(' · ')[0]?.trim() || name;

const formatRatioWeight = (weight: number): string =>
  Number(weight.toFixed(3)).toLocaleString('pl-PL', { maximumFractionDigits: 3 });

/** Concise Preview evidence for the already-verified Main contract. Preview
 * builders and the final Apply door remain the trust authority; this function
 * only presents their retained ratio metadata. */
export function multiMainPreservationSummaryPl(preview: ConstraintPreview): string | null {
  const mains = captureMainIngredientIntent(preview.proposedInput);
  if (mains.length < 2) return null;
  return `Multi-Main: ${mains.map((main) => compactMainName(main.ingredientName)).join(' : ')} = ${mains
    .map((main) => formatRatioWeight(main.ratioWeight))
    .join(' : ')} — zachowane`;
}

const lockedMainRatioDistortionPl = (preview: ConstraintPreview): string | null => {
  const main = preview.proposedInput.items.filter(
    (item) => item.lock_type === 'main' && item.planned_grams > 0,
  );
  if (main.length < 2) return null;
  const locked = main.filter(
    (item) => preview.nextConstraints.byLineId[item.id]?.mode === 'locked',
  );
  if (locked.length === 0 || locked.length === main.length) return null;
  const totalWeight = main.reduce((sum, item) => sum + (item.main_ratio_weight ?? 1), 0);
  const totalGrams = main.reduce((sum, item) => sum + item.planned_grams, 0);
  const distorted = main.some((item) => {
    const expected = totalGrams * ((item.main_ratio_weight ?? 1) / totalWeight);
    return Math.abs(item.planned_grams - expected) > 1;
  });
  if (!distorted) return null;
  const ratio = main
    .map((item) => Number((item.main_ratio_weight ?? 1).toFixed(3)).toLocaleString('pl-PL'))
    .join(':');
  const grams = main.map((item) => formatGramsPl(item.planned_grams)).join(' / ');
  const names = locked.map((item) => item.ingredient.name).join(', ');
  return `Blokada Main zmienia proporcję grupy: ${names} pozostaje bez zmian, dlatego finalny podział ${grams} różni się od potwierdzonej proporcji ${ratio}. Blokada ma pierwszeństwo przed automatycznym wyrównaniem.`;
};

/** Customer-facing truth for the Main frontier. Exact maxima and bounded
 * BEST results are deliberately different claims. */
export function mainObjectiveSummaryPl(preview: ConstraintPreview): string | null {
  const proof = preview.mainObjective;
  if (!proof) return null;
  const before = formatGramsPl(proof.startingMainGrams);
  const after = formatGramsPl(proof.executableMainGrams);
  if (proof.status === 'best_achievable' && proof.provenMaximum !== true) {
    const bound = Number.isInteger(proof.certifiedUpperBoundGrams)
      ? `Certyfikowana górna granica: ${formatGramsPl(proof.certifiedUpperBoundGrams!)}.`
      : Number.isInteger(proof.searchUpperBoundGrams)
        ? `Sprawdzany górny pułap: ${formatGramsPl(proof.searchUpperBoundGrams!)}.`
        : 'Górna granica nie została potwierdzona.';
    const summary = `Najlepszy osiągalny wynik: Gellatti zmienia grupę główną z ${before} na ${after} i ponownie bilansuje całą recepturę. To nie jest udowodnione maksimum. ${bound}`;
    const distortion = lockedMainRatioDistortionPl(preview);
    return distortion ? `${summary} ${distortion}` : summary;
  }
  if (proof.status !== 'maximized' || proof.provenMaximum !== true) return null;
  if (proof.executableMainGrams < proof.startingMainGrams) {
    const summary = `Automatyczna korekta składnika głównego: Gellatti zmienia grupę główną z ${before} na ${after}, czyli najwyższą wykonalną ilość, i ponownie bilansuje całą recepturę.`;
    const distortion = lockedMainRatioDistortionPl(preview);
    return distortion ? `${summary} ${distortion}` : summary;
  }
  const summary = `Maksymalizacja składnika głównego: Gellatti zmienia grupę główną z ${before} na ${after} i ponownie bilansuje całą recepturę.`;
  const distortion = lockedMainRatioDistortionPl(preview);
  return distortion ? `${summary} ${distortion}` : summary;
}
