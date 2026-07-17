/**
 * PINGÜINO Machine Onboarding — copy module (Polish, §8 + §7.3 + §8.6).
 *
 * The single copy source for the machine-onboarding surface (own module —
 * `customerShellCopy.ts` belongs to a sibling slice and is not touched).
 * Plain customer language: no technology jargon ("re-spin", "kompresor",
 * "frozen bowl" never appear in visible copy — §8.3), no engine names, no
 * temperatures. The 450/660 g values are ALWAYS framed as
 * „Zalecany wsad PINGÜINO” — never as a manufacturer capacity (owner
 * addendum, 2026-07-17).
 */

export const machineOnboardingCopy = {
  /* ------------------------------------------------------- §8.1 first screen -- */
  intro: {
    title: 'Jakiej maszyny używasz?',
    lead: 'Wybierz urządzenie, a PINGÜINO automatycznie dopasuje sposób przygotowania i właściwą ilość.',
    searchLabel: 'Szukaj maszyny',
    searchPlaceholder: 'np. Ninja, KitchenAid, NC302…',
    searchNoResults: 'Brak maszyn pasujących do wyszukiwania. Wybierz „Nie widzę mojej maszyny”.',
  },

  /* ----------------------------------------------------------- §8.2 tiles ----- */
  tiles: {
    /** Honest short note on families that cannot be selected yet. */
    unavailableNote: 'w trakcie weryfikacji pojemności',
    /** ARIA hint for a disabled tile. */
    unavailableAria: 'Ta maszyna jest w trakcie weryfikacji pojemności i nie można jej jeszcze wybrać.',
    /** Model disambiguation sub-screen (§8.2: only when capacity/technology differs). */
    disambiguation: {
      title: 'Który model?',
      lead: 'Modele różnią się pojemnością, dlatego prosimy o doprecyzowanie.',
      back: 'Wróć',
    },
  },

  /* ------------------------------------------------- §8.3 behavior question --- */
  behavior: {
    title: 'Jak działa Twoja maszyna?',
    lead: 'Nie musisz znać nazwy technologii — wystarczy, że opiszesz, co robi urządzenie.',
    back: 'Wróć do listy maszyn',
  },

  /* ---------------------------------------- honest unsupported (dispenser) ---- */
  unsupported: {
    title: 'Ta maszyna nie jest jeszcze wspierana w Home',
    body:
      'Maszyny, które chłodzą płynną bazę i wydają miękkie lody z dozownika, to urządzenia o innym ' +
      'trybie pracy niż profile domowe PINGÜINO. Nie podstawimy w zamian innego profilu po cichu — ' +
      'wsparcie dla tych maszyn pojawi się osobno.',
    back: 'Wybierz inną maszynę',
  },

  /* -------------------------------------------------- §8.4 custom machine ----- */
  custom: {
    title: 'Opowiedz nam o swojej maszynie',
    lead:
      'Podaj to, co znasz — nic nie zgadujemy. Jeśli dane na to pozwolą, zaproponujemy ostrożny ' +
      'wsad (95% potwierdzonej pojemności) jako wartość szacunkową, którą możesz zmienić.',
    brandLabel: 'Marka (opcjonalnie)',
    modelLabel: 'Model (opcjonalnie)',
    vesselLabel: 'Pojemność pojemnika lub misy',
    vesselHint: 'Przechowujemy wewnętrznie w ml.',
    maxFillLabel: 'Czy pojemnik ma linię MAX FILL?',
    maxFillYes: 'Tak',
    maxFillNo: 'Nie',
    maxFillUnknown: 'Nie wiem',
    maxMixLabel: 'Maksymalna ilość mieszanki według instrukcji',
    maxMixHint: 'Jeśli instrukcja podaje limit płynnej mieszanki, wpisz go tutaj.',
    unitLabel: 'Jednostka',
    unitMl: 'ml',
    unitL: 'l',
    save: 'Zapisz maszynę',
    /**
     * §8.4 conservative FLAGGED fallback — bowl-type machines (misa/kompresor
     * po stronie danych): a total bowl volume is never turned into a batch.
     */
    vesselOnlyBowlNote:
      'Znasz tylko pojemność całkowitą misy, więc przyjmiemy ostrożne ustawienie i oznaczymy je ' +
      'do edycji. Ilość wsadu ustalisz samodzielnie — z całkowitej pojemności misy nie wyliczamy wsadu.',
    /** Re-spin tubs: the declared tub figure yields an ESTIMATED recommendation. */
    vesselOnlyRespinNote:
      'Znasz tylko pojemność pojemnika — zaproponujemy ostrożny wsad szacunkowy (95% tej ' +
      'pojemności). Wartość pozostaje do edycji.',
    invalidVolume: 'Podaj dodatnią liczbę.',
  },

  /* -------------------------------------------------- §8.5 auto-config -------- */
  autoConfig: {
    recognized: 'Rozpoznano urządzenie',
    amountSet: 'Ustawiono właściwą ilość',
    /** Honest variant when no trustworthy amount exists (batch stays user-set). */
    amountUserChoice: 'Przygotowano wybór ilości',
    methodMatched: 'Dopasowano sposób przygotowania',
    studioReady: 'Przygotowano Studio',
    /** Screen-reader announcement label for the transition region. */
    ariaLabel: 'Automatyczna konfiguracja maszyny',
  },

  /* ---------------------------------------- derived grams presentation -------- */
  batch: {
    /**
     * The ONLY allowed framing of the derived grams (owner correction): a
     * PINGÜINO recommendation — never the manufacturer's official figure.
     */
    recommendedLabel: 'Zalecany wsad PINGÜINO',
    recommendedUnit: 'g',
    /** Honest marker for user-declared capacity (rule 4). */
    estimatedNote: 'Wartość szacunkowa na podstawie zadeklarowanej pojemności — możesz ją zmienić.',
    /** No trustworthy amount → the user decides. */
    userChoiceNote: 'Ilość wsadu ustalisz samodzielnie.',
    /** The machine's capacity figure is under an open source conflict (§9.3). */
    conflictNote:
      'Pojemność tej maszyny jest w trakcie weryfikacji źródeł — ilość ustalisz samodzielnie.',

    /* OWNER FINAL DECISION (2026-07-17) — the recommendation is a SOFT starting
       proposal: the field is always editable, never a hard limit, never a block. */
    /** Subtle marker once the user diverges from the recommendation. */
    customInUse: 'Używasz własnej ilości',
    /** Restore action (full form, shown with the custom-in-use marker). */
    restoreRecommended: 'Przywróć zalecany wsad PINGÜINO',
    /** Warning shown when the amount exceeds the recommendation — never a block. */
    aboveWarning: 'Ta ilość przekracza zalecany wsad PINGÜINO dla jednego pojemnika.',
    /** The three non-blocking actions under the warning (owner verbatim). */
    splitAction: 'Podziel na pojemniki',
    keepMine: 'Pozostaw moją ilość',
    restoreShort: 'Przywróć zalecany wsad',
    /** Machine change with an existing recipe: propose, never auto-apply. */
    fitToNewMachine: 'Dopasuj ilość do nowej maszyny',
    /** Header of the new-machine batch proposal (shown after a machine change). */
    newRecommendedLabel: 'Zalecany wsad nowej maszyny',
    /** Preview confirmation actions — applying is always the user's call. */
    applyPreview: 'Zastosuj',
    cancelPreview: 'Anuluj',
  },

  /* --------------------------------------------------- container split -------- */
  split: {
    /**
     * Owner verbatim pattern (2026-07-17):
     * „Ta ilość wymaga 2 pojemników. PINGÜINO podzieli recepturę automatycznie.”
     */
    message: (containers: number): string =>
      `Ta ilość wymaga ${containers} pojemników. PINGÜINO podzieli recepturę automatycznie.`,
    /** Secondary detail, e.g. „2 pojemniki po 450 g” / „3 pojemniki po 333,3 g”. */
    detail: (containers: number, gramsPerContainerText: string): string =>
      `${containers} ${pluralPojemniki(containers)} po ${gramsPerContainerText} g`,
  },

  /* ------------------------------------------------------ §7.3 context bar ---- */
  contextBar: {
    prefix: 'Twoja maszyna:',
    vessel: (ml: number): string => `pojemnik ${ml} ml`,
    change: 'Zmień',
    changeAria: 'Zmień maszynę',
  },

  /* ------------------------------------------------- §8.6 profile section ----- */
  profile: {
    title: 'Moja maszyna',
    noMachine: 'Nie masz jeszcze zapisanej maszyny.',
    setUp: 'Wybierz maszynę',
    change: 'Zmień maszynę',
    editCustom: 'Edytuj dane maszyny',
    savedAt: 'Zapisano',
    customName: 'Twoja maszyna',
    /** The §8.4 vessel-only fallback stays visibly flagged and editable. */
    vesselOnlyFlag: 'Ustawienie ostrożne — znamy tylko pojemność całkowitą. Możesz je edytować.',
  },
} as const;

/**
 * Polish plural for „pojemnik” in the NOMINATIVE/ACCUSATIVE detail phrase
 * („2 pojemniki po 450 g”, „5 pojemników po 300 g”). The owner's main split
 * message uses the genitive („wymaga … pojemników”), which is invariant.
 */
export function pluralPojemniki(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'pojemniki';
  return 'pojemników';
}
