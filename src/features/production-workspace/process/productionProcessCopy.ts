/**
 * The words of THE batch process presentation (DESIGN V3.0 IV D–I, II/III, §13–14) —
 * shared by HOME production and the Produkcja area. Process science is not here: step
 * titles, instructions, the heat step and the machine sequence come from the preparation
 * plan (`education.pl`), and the „Korekta partii” options from `productionDecisionOptions`.
 */
const plPlural = (count: number, one: string, few: string, many: string): string => {
  if (count === 1) return one;
  const units = count % 10;
  const tens = count % 100;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
};

export const productionProcessCopy = {
  eyebrow: (step: number, total: number) => `Produkcja · krok ${step} z ${total}`,
  now: 'Teraz',
  weighNow: 'Teraz · zważ i dodaj',
  later: 'Potem',
  added: 'Dodano',
  addedAmount: (grams: string) => `Dodano · ${grams}`,
  planCorrected: 'Plan skorygowany',
  resultAccepted: 'Wynik zaakceptowany',
  vesselQuestion: 'Ile jest w naczyniu?',
  difference: (delta: string, plan: string) => `${delta} względem planu (${plan})`,
  differenceNext: 'Po potwierdzeniu wybierzesz, jak dostosować partię.',
  correctingRecord: 'Poprawiasz zapis — tylko jeśli wpisana ilość była błędna.',
  topUpWeighed: (grams: string) => `Dodaj jeszcze · zważono ${grams}`,
  confirmAdded: (name: string) => `${name} — potwierdź, że dodano`,
  reopenAdded: (name: string) => `${name} — dodano, popraw zapis`,
  doneSteps: (count: number) => `Zrobione: ${count} ${plPlural(count, 'krok', 'kroki', 'kroków')}`,
  dockNow: (name: string) => `Teraz: ${name}`,
  dockPlan: (grams: string) => `plan ${grams}`,
  dockTopUp: (grams: string) => `dodaj jeszcze ${grams}`,
  dockThen: (count: number) =>
    `potem ${count} ${plPlural(count, 'składnik', 'składniki', 'składników')}`,
  dockLastInStep: 'to ostatni w tym kroku',
  dockStep: (step: number, total: number) => `Krok ${step} z ${total}`,
  dockWeighed: 'zważone',
  next: 'Gotowe',
  finish: 'Zakończ produkcję',
  trouble: 'Coś poszło nie tak?',
  noMix: 'NIE MIKSUJ',
  setAside: (names: string) => `Odłóż: ${names} — dodasz po maszynie.`,
  batchChanged: (now: string, was: string) => `Partia ${now} (było ${was})`,
  degasTitle: 'Najpierw odgazuj',
  degasLead: 'Przed użyciem należy całkowicie odgazować:',
  degasDone: 'Odgazowane',
  troubleTitle: 'Co się stało?',
  troubleLead: 'Partia czeka. Nic się nie zmieni, dopóki czegoś nie wybierzesz.',
  troubleWeighed: 'Zważyłem inną ilość',
  troubleWeighedHint: 'Wpisz, ile jest w naczyniu — plan partii się przeliczy',
  troubleWeighedUnavailable: 'Ilość wpisujesz przy składniku, który teraz ważysz.',
  back: 'Wróć',
  correctionEyebrow: 'Korekta partii',
  correctionTitle: 'Możemy dostosować tę partię',
  correctionLead: 'Zachowamy to, co już jest w naczyniu. Wybierz sposób dalszej pracy.',
  correctionInVessel: 'w naczyniu',
  correctionPlan: 'plan',
  correctionRecommended: 'Rekomendowane',
  correctionSelected: '✓ Wybrano',
  correctionRestoreApply: 'Przywróć proporcje',
  correctionLeaveApply: 'Akceptuję wynik i kontynuuję',
  correctionImpossible: 'Tej partii nie możemy teraz bezpiecznie dostosować',
  doneTitle: 'Partia gotowa',
  errors: {
    confirm: 'Nie udało się potwierdzić ilości.',
    draft: 'Nie udało się zapisać ilości.',
    reopen: 'Nie udało się otworzyć zapisu.',
    topUp: 'Nie udało się potwierdzić korekty.',
    complete: 'Nie udało się zakończyć partii.',
    step: 'Nie udało się przejść dalej.',
    decision: 'Nie udało się zastosować korekty.',
  },
} as const;
