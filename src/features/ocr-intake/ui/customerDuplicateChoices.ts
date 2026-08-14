import type { DuplicateCandidate } from '@/features/global-catalog/contracts';

/** An exact canonical match always owns the customer decision. Likely rows are
 * useful only when no exact match exists; exposing both would offer an invalid
 * "different product" path beside an authoritative exact match. */
export function customerDuplicateChoices(
  candidates: readonly DuplicateCandidate[],
): DuplicateCandidate[] {
  const exact = candidates.filter((candidate) => candidate.strength === 'exact');
  return exact.length > 0 ? exact : [...candidates];
}

export function customerDuplicateDecisionCopy(exact: boolean): {
  title: string;
  confirm: string;
  reject: string;
} {
  return exact
    ? {
        title: 'Ten produkt już istnieje',
        confirm: 'Użyj tego produktu',
        reject: 'Nie, to inny produkt',
      }
    : {
        title: 'Czy to ten sam produkt?',
        confirm: 'Tak',
        reject: 'Nie, to inny produkt',
      };
}
