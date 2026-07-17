/**
 * Polish renderer for the §20.4 Explain contract — the UI-track wiring step
 * the recipe-constraints module header announces („moving these strings into
 * the copy layer is the UI track's wiring step”).
 *
 * REUSES `ConstraintExplanationEntry` from src/features/recipe-constraints
 * (built by buildProposalExplanation / buildFeasibilityExplanation) and only
 * renders it. Honesty rules inherited from the domain (§22):
 *  - causality comes from what the engine emitted — never invented here;
 *  - NO target-band numbers, band centers, metric readings or scoring
 *    weights ever appear; the only numbers rendered are gram amounts;
 *  - sentences follow the spec §20.4 example shape („Zmniejszono sacharozę
 *    o 8 g, ponieważ receptura była zbyt słodka.”).
 */
import type { TargetMetric } from '@/engine';
import type { ConstraintExplanationEntry } from '@/features/recipe-constraints';
import { constraintStudioCopy, formatGramsPl } from './constraintStudioCopy';

/** Sensory-consequence phrases for the engine's violation reasons — Polish
 * mirror of the domain's English reference renderer. No metric readings, no
 * band values, no internal names beyond what Pro already sees. */
const REASON_PHRASES_PL: Readonly<Record<TargetMetric, { low: string; high: string }>> = {
  pod: { low: 'receptura była za mało słodka', high: 'receptura była zbyt słodka' },
  npac: {
    low: 'receptura zamarzałaby zbyt twardo',
    high: 'receptura pozostałaby zbyt miękka po zamrożeniu',
  },
  ice_fraction: {
    low: 'receptura byłaby zbyt miękka w temperaturze serwowania',
    high: 'receptura byłaby zbyt lodowata w temperaturze serwowania',
  },
  water: { low: 'w mieszance było za mało wody', high: 'w mieszance było za dużo wolnej wody' },
  total_solids: { low: 'konsystencja była zbyt rzadka', high: 'konsystencja była zbyt gęsta' },
  fat: { low: 'kremowość wymagała więcej tłuszczu', high: 'poziom tłuszczu był zbyt wysoki' },
  aerating_protein: {
    low: 'struktura groziła opadnięciem bez większej ilości białka',
    high: 'poziom białka był zbyt wysoki dla gładkiej tekstury',
  },
  protein_in_solids: {
    low: 'ciała stałe zawierały za mało białka',
    high: 'ciała stałe zawierały za dużo białka',
  },
  lactose: {
    low: 'cukry mleczne były zbyt niskie',
    high: 'cukry mleczne groziły krystalizacją',
  },
  lactose_sandiness_risk: {
    low: 'balans laktozy był poniżej strefy gładkiej tekstury',
    high: 'istniało ryzyko piaszczystej tekstury od laktozy',
  },
  alcohol: {
    low: 'poziom alkoholu był poniżej zamierzonego charakteru',
    high: 'poziom alkoholu uniemożliwiłby stabilne zamrożenie',
  },
};

const { listPl } = constraintStudioCopy;

/** One plain Polish sentence per entry; the only numbers are gram amounts. */
export function renderConstraintExplanationPl(entry: ConstraintExplanationEntry): string {
  switch (entry.kind) {
    case 'action': {
      const reason =
        entry.reasonMetric && entry.reasonDirection
          ? `, ponieważ ${REASON_PHRASES_PL[entry.reasonMetric][entry.reasonDirection]}`
          : '';
      return entry.verb === 'add'
        ? `Dodano ${entry.ingredientName}: ${formatGramsPl(entry.grams)}${reason}.`
        : `Zmniejszono ${entry.ingredientName} o ${formatGramsPl(entry.grams)}${reason}.`;
    }
    case 'locked_unchanged':
      return entry.ingredientNames.length === 1
        ? `Nie zmieniono składnika ${entry.ingredientNames[0]}, ponieważ jego gramatura jest zablokowana.`
        : `Nie zmieniono składników ${listPl(entry.ingredientNames)}, ponieważ ich gramatury są zablokowane.`;
    case 'in_band':
      return 'Receptura jest w optymalnym zakresie przy obecnych blokadach.';
    case 'bound': {
      const direction = entry.boundType === 'max' ? 'maksymalnie' : 'co najmniej';
      return (
        `${entry.ingredientName} — zablokowane na ${formatGramsPl(entry.lockedGrams)}. ` +
        `Aby wejść w optymalny zakres, ustaw ${direction} ${formatGramsPl(entry.boundGrams)}.`
      );
    }
    case 'conflict_group':
      return (
        `Zablokowane składniki ${listPl(entry.ingredientNames)} wspólnie uniemożliwiają ` +
        'osiągnięcie optymalnego zakresu. Odblokuj jeden z nich, zmień zakres, zwiększ batch ' +
        'albo pozostaw recepturę bez zmian.'
      );
    case 'no_reliable_bound':
      // §18.5 honest fallback — spec sentence, no fabricated numbers.
      return constraintStudioCopy.feasibility.noReliableBound;
  }
}
