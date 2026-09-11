/**
 * §29 — the first-run tutorial, as a list of REAL places on the screen.
 *
 * The owner's rule is that this teaches at the component, not in a wall of text
 * before it: spotlight one element, dim the rest, say one short thing, move on.
 * So a step is an ANCHOR plus a sentence — never a slide.
 *
 * The most important property of this list is what it does with a step whose
 * anchor is not on screen: it drops it. A tutorial that spotlights an empty
 * rectangle, or narrates a screen that does not exist yet, teaches nothing and
 * is worse than no tutorial. Steps for surfaces that are still deferred
 * (matching, production, label) are therefore simply absent — this file grows
 * when those screens do, and never before.
 *
 * Text is short on purpose (§29) and never repeats what „Jak to działa?"
 * already says at length; a step may point there instead.
 */

export interface TutorialStep {
  readonly id: string;
  /** `data-testid` of the element to spotlight. */
  readonly anchor: string;
  readonly title: string;
  readonly body: string;
  /**
   * True when the step is worth showing on its own — used by the HOME/PRO
   * opener, which explains a choice rather than pointing at one control.
   */
  readonly anchorOptional?: boolean;
}

/**
 * A — HOME vs PRO. B — the composer. C — „Twój pomysł". D — the profile.
 * E — the machine. F — the recipe. G — one ingredient's settings.
 * H — „Robimy".
 *
 * Everything below points at an element that exists on HOME today.
 */
export const HOME_TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'home-pro',
    anchor: 'home-pro-switch',
    title: 'HOME i PRO',
    body: 'HOME robi większość pracy za Ciebie. PRO daje pełną kontrolę nad każdym szczegółem.',
    anchorOptional: true,
  },
  {
    id: 'composer',
    anchor: 'home-composer',
    title: 'Zacznij tutaj',
    body: 'Możesz pisać, mówić, zeskanować produkt albo rozpoznać owoc ze zdjęcia.',
  },
  {
    id: 'idea',
    anchor: 'home-intent-chips',
    title: 'Twój pomysł',
    body: 'Tu widzisz, co zrozumieliśmy. Każdy element możesz usunąć.',
  },
  {
    id: 'profile',
    anchor: 'home-section-profile',
    title: 'Rodzaj lodów',
    body: 'Gelato, Sorbet, Vegan, Protein — wybierasz, w jakiej technologii pracujemy. Więcej w „Jak to działa?”.',
  },
  {
    id: 'machine',
    anchor: 'home-section-machine',
    title: 'Twoja maszyna',
    body: 'Receptura dopasowuje się do niej. Możesz ją zmienić w Menu → Maszyny.',
  },
  {
    id: 'recipe',
    anchor: 'home-section-recipe',
    title: 'Receptura',
    // Package 2A closure (2026-09-11): 2A's HOME auto-recalc never reached staging;
    // the accepted HOME recalculation is the „Przelicz i popraw" preview (#287).
    body: 'Tu jest Twoja receptura. „Przelicz i popraw” dopasuje gramy i pokaże każdą zmianę, zanim ją zastosujesz.',
  },
  {
    id: 'ingredient-settings',
    // Package 2A closed (2026-09-11): the crown now means exactly what this
    // step says, so it points at the first real recipe line — its crown and its
    // settings menu live on that row.
    anchor: 'home-recipe-line',
    title: 'Ustawienia składnika',
    body: 'Korona = priorytet. Gdy sam wybierzesz koronę, priorytet mają tylko składniki oznaczone przez Ciebie. Możesz też zmienić produkt lub ilość.',
  },
  {
    id: 'lets-make-it',
    anchor: 'home-lets-make-it',
    title: 'Robimy',
    body: 'Stąd Gellatti prowadzi Cię krok po kroku przez wykonanie.',
  },
];

/** Steps whose anchor is actually on screen right now, in order. */
export function availableSteps(
  steps: readonly TutorialStep[],
  present: (anchor: string) => boolean,
): TutorialStep[] {
  return steps.filter((step) => step.anchorOptional === true || present(step.anchor));
}
