/**
 * „Korekta partii” — the four decisions a confirmed deviation offers, written ONCE for
 * PRO Production (`ProductionCockpit`, `useProductionWorkspace`) and HOME production
 * (`HomePreparation`, DESIGN V3.0 IV D–I): the same order, the same words and the same
 * recommendation rule. Pure and presentational — which options exist, their target
 * masses and their Scores always come from the Rescue authority, never from here.
 */
import type { ProductionRescueStableOptionId } from '@/features/pro-core/productionContracts';

export const PRODUCTION_DECISION_ORDER = [
  'keep_original_batch',
  'enlarge_batch',
  'restore_original_recipe',
  'leave_as_is',
] as const satisfies readonly ProductionRescueStableOptionId[];

export type ProductionDecisionId = (typeof PRODUCTION_DECISION_ORDER)[number];

export interface ProductionDecisionOptionCopy {
  id: ProductionDecisionId;
  title: string;
  explanation: string;
}

const formatPhysicalMassG = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');

/** The four options in their fixed order, before any Rescue preview is known. */
export function productionDecisionOptions(input: {
  currentPlanMassG: number;
  plannedScore: number | null | undefined;
  forecastScore: number | null | undefined;
}): readonly ProductionDecisionOptionCopy[] {
  return [
    {
      id: 'keep_original_batch',
      title: `Zachowaj ${formatPhysicalMassG(input.currentPlanMassG)} g`,
      explanation:
        'Dostosujemy ilości, których jeszcze nie dodano. Potwierdzonych ilości nie odejmiemy.',
    },
    {
      id: 'enlarge_batch',
      title: 'Zwiększ partię',
      explanation: 'Znajdziemy najmniejszą większą partię i przeliczymy pozostałe ilości.',
    },
    {
      id: 'restore_original_recipe',
      title: 'Przywróć oryginalną recepturę',
      explanation:
        'Dodamy odpowiednie ilości wszystkich potrzebnych produktów, aby wrócić do wyjściowych proporcji.',
    },
    {
      id: 'leave_as_is',
      title: 'Kontynuuj bez korekty',
      explanation: `Nie zmienimy dalszego planu${input.plannedScore && input.forecastScore ? `. Przewidywany wynik: ${input.plannedScore} → ${input.forecastScore}.` : '.'}`,
    },
  ];
}

/** The title once the authority has previewed the option (its final batch mass). */
export function productionDecisionTitle(
  option: ProductionDecisionOptionCopy,
  previewFinalMassG: number | null,
): string {
  if (previewFinalMassG !== null && option.id === 'enlarge_batch') {
    return `Zwiększ partię do ${formatPhysicalMassG(previewFinalMassG)} g`;
  }
  if (previewFinalMassG !== null && option.id === 'restore_original_recipe') {
    return `Przywróć oryginalną recepturę · ${formatPhysicalMassG(previewFinalMassG)} g`;
  }
  return option.title;
}

/** „Kontynuuj bez korekty” names the Score it accepts once the preview knows it. */
export function productionDecisionExplanation(
  option: ProductionDecisionOptionCopy,
  plannedScore: number | null | undefined,
  previewScore: number | null | undefined,
): string {
  return option.id === 'leave_as_is' && plannedScore && previewScore
    ? `Nie zmienimy dalszego planu. Przewidywany wynik: ${plannedScore} → ${previewScore}.`
    : option.explanation;
}

/**
 * The recommended decision: continuing unchanged only when it stays a safe 10/10,
 * otherwise the first available option in the fixed order. `null` = not available.
 */
export function recommendedProductionDecision(
  available: Partial<Record<ProductionDecisionId, { scoreDisplay: string } | null>>,
): ProductionDecisionId | undefined {
  if (available.leave_as_is?.scoreDisplay === '10/10') return 'leave_as_is';
  return PRODUCTION_DECISION_ORDER.find((optionId) => Boolean(available[optionId]));
}
