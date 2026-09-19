/**
 * Produkcja → Partie and Produkcja → Etykiety copy (Production v3, Etap 1 §5–§7).
 *
 * Follows the `CommunityCopy` reference pattern (`src/copy/locale.ts` rule 3):
 * one interface, one complete object per locale, a resolver. Recipe names, LOT
 * codes and dates are DATA and arrive as arguments — they are never translated.
 *
 * The plain „← Wróć” of the label screen is NOT here: it is part of the
 * owner-locked label return route (GEL-P0-033) and stays in the page source.
 */
import { resolveLocaleResource, type AppLocale } from './locale';
import { pluralWersja } from './community';

/** Polish plural of „zakończona partia” (1 / 2–4 / 5+). */
export function completedBatchesPl(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (abs === 1) return `${n} zakończona partia`;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${n} zakończone partie`;
  }
  return `${n} zakończonych partii`;
}

export interface ProductionBatchesLabelsCopy {
  readonly batches: {
    readonly regionLabel: string;
    readonly historyJump: string;
    readonly historyJumpCount: (total: number) => string;
    readonly historyTitle: string;
    readonly historyHelper: string;
    readonly historyLoading: string;
    readonly historyErrorTitle: string;
    readonly historyErrorBody: string;
    readonly historyOlderError: string;
    readonly retry: string;
    readonly historyEmptyTitle: string;
    readonly historyEmptyBody: string;
    readonly rowWhen: (dateTime: string, recipeVersion: number | null) => string;
    readonly rowLot: (lot: string) => string;
    readonly rowLabel: (lot: string, labelVersions: number) => string;
    readonly rowActual: (grams: string) => string;
    readonly rowPlanned: (grams: string) => string;
    readonly openLabel: string;
    readonly showOlder: string;
    readonly loadingOlder: string;
    readonly shownOf: (shown: number, total: number) => string;
    readonly allShown: (total: number) => string;
    readonly inProgress: string;
    readonly inProgressMeta: (
      recipeVersion: number | null,
      grams: string,
      startedAt: string,
    ) => string;
    readonly inProgressUnnamed: string;
    readonly inProgressChecking: string;
    readonly inProgressLocalOnly: string;
    readonly resume: string;
    readonly resuming: string;
    /** „Kontynuuj partię" — the batch itself, with the recipe left where it is. */
    readonly continueBatch: string;
    readonly continuing: string;
    readonly continueBack: string;
    readonly continueFailed: string;
    readonly resumeConfirmTitle: string;
    readonly resumeConfirmBody: string;
    readonly resumeFailed: {
      readonly recipeMissing: string;
      readonly versionMismatch: string;
      readonly runMissing: string;
      readonly planDiffers: string;
      readonly generic: string;
    };
    readonly completedNow: string;
    readonly completedNowMeta: (recipeVersion: number | null, completedAt: string) => string;
    readonly completedNowLabel: string;
    readonly emptyTitle: string;
    readonly emptyBodyPro: string;
    readonly emptyBodyHome: string;
    readonly emptyDockTitle: string;
    readonly emptyDockPro: string;
    readonly emptyDockHome: string;
    readonly pickRecipe: string;
    readonly homeRunMeta: string;
    readonly homeResume: string;
  };
  readonly labels: {
    /** Names of the two label forms in the one unsaved-changes question. */
    readonly unsavedProfile: string;
    readonly unsavedRunSettings: string;
    readonly defaultsTitle: string;
    readonly defaultsBody: string;
    readonly recipeTitle: string;
    readonly recipeBody: string;
    readonly runTitle: string;
    readonly runContext: (
      recipeName: string,
      recipeVersion: number | null,
      lot: string | null,
    ) => string;
    readonly runContextSaved: (labelVersion: number, date: string) => string;
    readonly runContextUnsaved: string;
    readonly runContextVersionMissing: string;
    readonly runChecking: string;
    readonly savedVersions: string;
    readonly versionChip: (date: string, version: number) => string;
    readonly versionChipLabel: (version: number, date: string) => string;
    readonly savedNote: string;
    readonly unsavedNote: string;
    readonly snapshotNotFoundTitle: string;
    readonly snapshotNotFoundBody: string;
    readonly noSavedVersions: string;
    readonly runNotFoundTitle: string;
    readonly runNotFoundBody: string;
    readonly toLabelHistory: string;
    readonly backToProductionHistory: string;
    readonly backToLabelHistory: string;
    readonly backToRun: string;
    readonly historyTitle: string;
    readonly historyHelper: string;
    readonly historySearch: string;
    readonly historySearchEmpty: string;
    readonly historyRowMeta: (lot: string, recipeVersion: number | null) => string;
    readonly historyUnavailable: string;
  };
}

export const productionBatchesLabelsCopyPl: ProductionBatchesLabelsCopy = {
  batches: {
    regionLabel: 'Partie',
    historyJump: 'Historia produkcji',
    historyJumpCount: (total) => completedBatchesPl(total),
    historyTitle: 'Historia produkcji',
    historyHelper: 'Zakończone partie · najnowsze na górze',
    historyLoading: 'Sprawdzamy zakończone partie…',
    historyErrorTitle: 'Nie mamy teraz pełnej historii produkcji',
    historyErrorBody: 'Dane partii są bezpieczne. Spróbuj ponownie.',
    historyOlderError: 'Nie udało się wczytać starszych partii. Dane partii są bezpieczne.',
    retry: 'Spróbuj ponownie',
    historyEmptyTitle: 'Nie masz jeszcze zakończonych partii',
    historyEmptyBody: 'Po zakończeniu produkcji partia pojawi się tutaj.',
    rowWhen: (dateTime, recipeVersion) => `${dateTime} · wersja receptury ${recipeVersion ?? '—'}`,
    rowLot: (lot) => `LOT ${lot}`,
    rowLabel: (lot, labelVersions) =>
      `LOT ${lot} · ${
        labelVersions > 0
          ? `etykieta: ${labelVersions} ${pluralWersja(labelVersions)}`
          : 'bez zapisanej etykiety'
      }`,
    rowActual: (grams) => `${grams} g`,
    rowPlanned: (grams) => `planowano ${grams} g`,
    openLabel: 'Otwórz etykietę',
    showOlder: 'Pokaż starsze partie',
    loadingOlder: 'Wczytujemy starsze partie…',
    shownOf: (shown, total) => `Pokazano ${shown} z ${total}`,
    allShown: (total) => `To wszystkie zakończone partie (${total}).`,
    inProgress: 'W toku',
    inProgressMeta: (recipeVersion, grams, startedAt) =>
      `wersja receptury ${recipeVersion ?? '—'} · ${grams} g · rozpoczęto ${startedAt}`,
    inProgressUnnamed: 'Receptura bez nazwy',
    inProgressChecking: 'Sprawdzamy partie w toku…',
    inProgressLocalOnly:
      'Nie udało się teraz sprawdzić partii na koncie. Pokazujemy partie zapisane na tym urządzeniu.',
    resume: 'Otwórz recepturę partii',
    resuming: 'Otwieramy recepturę…',
    continueBatch: 'Kontynuuj partię',
    continuing: 'Wczytujemy partię…',
    continueBack: '← Wróć do partii',
    continueFailed:
      'Nie udało się otworzyć tej partii. Twoja otwarta receptura pozostała bez zmian.',
    resumeConfirmTitle: 'Otworzyć recepturę tej partii?',
    resumeConfirmBody: 'Niezapisane zmiany w bieżącej recepturze zostaną usunięte.',
    resumeFailed: {
      recipeMissing:
        'Nie znaleźliśmy receptury tej partii na Twoim koncie. Partia jest bezpieczna — nie otworzyliśmy w zamian innej.',
      versionMismatch:
        'Nie udało się otworzyć wersji receptury tej partii. Nie otworzyliśmy w zamian innej wersji ani innej partii.',
      runMissing:
        'Ta partia nie jest już w toku. Odśwież listę — nie otworzyliśmy w zamian innej partii.',
      planDiffers:
        'Tej partii nie da się teraz otworzyć: jej plan różni się od zapisanej wersji receptury. Nie otworzyliśmy w zamian innej partii.',
      generic:
        'Nie udało się otworzyć tej partii. Dane partii są bezpieczne — spróbuj ponownie. Nie otworzyliśmy w zamian innej partii.',
    },
    completedNow: 'Zakończona przed chwilą',
    completedNowMeta: (recipeVersion, completedAt) =>
      `wersja receptury ${recipeVersion ?? '—'} · zakończono ${completedAt}`,
    completedNowLabel: 'Etykieta',
    emptyTitle: 'Nie masz teraz partii w toku.',
    emptyBodyPro:
      'Otwórz recepturę i przejdź do jej zakładki Produkcja, aby rozpocząć nową partię.',
    emptyBodyHome:
      'Wybierz recepturę albo zacznij od własnego pomysłu. Partia powstaje dopiero po „Zaczynamy”.',
    emptyDockTitle: 'Brak partii w toku',
    emptyDockPro: 'Twoje receptury i biblioteka',
    emptyDockHome: 'Receptury i Twój pomysł',
    pickRecipe: 'Wybierz recepturę',
    homeRunMeta: 'Przygotowanie trwa. Wrócisz do tego samego kroku.',
    homeResume: 'Wróć do przygotowania',
  },
  labels: {
    unsavedProfile: 'Etykiety · profil domyślny',
    unsavedRunSettings: 'Etykiety · ustawienia etykiety partii',
    defaultsTitle: 'Ustawienia domyślne etykiet',
    defaultsBody: 'Dla nowych etykiet. Zapisane etykiety partii się nie zmieniają.',
    recipeTitle: 'Etykieta receptury',
    recipeBody: 'Ustawienia tego szkicu nie zmieniają profilu domyślnego.',
    runTitle: 'Etykieta partii',
    runContext: (recipeName, recipeVersion, lot) =>
      [
        recipeName,
        recipeVersion === null ? null : `wersja receptury ${recipeVersion}`,
        lot ? `LOT ${lot}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    runContextSaved: (labelVersion, date) => `wersja etykiety ${labelVersion} z ${date}`,
    runContextUnsaved: 'bez zapisanej etykiety',
    runContextVersionMissing: 'wersja etykiety: nie znaleziono',
    runChecking: 'Sprawdzamy zapis etykiety tej partii…',
    savedVersions: 'Zapisane wersje etykiety tej partii',
    versionChip: (date, version) => `${date} · v${version}`,
    versionChipLabel: (version, date) => `Etykieta wersja ${version} z ${date}`,
    savedNote:
      'Dane zapisane z tą wersją etykiety. Zmiana ustawień domyślnych jej nie zmienia. Druk jest opcjonalny.',
    unsavedNote:
      'Ta partia nie ma jeszcze zapisanej etykiety. Podgląd powstaje z danych tej partii i ustawień domyślnych. Wersja zapisze się dopiero po „Drukuj” albo „Zastosuj ustawienia” — samo otwarcie niczego nie zapisuje. Druk jest opcjonalny.',
    snapshotNotFoundTitle: 'Nie znaleźliśmy tej wersji etykiety.',
    snapshotNotFoundBody:
      'Link wskazuje wersję, której nie ma w tej partii. Nie pokazujemy w zamian innej wersji ani etykiety innej partii.',
    noSavedVersions: 'Ta partia nie ma zapisanych wersji etykiety.',
    runNotFoundTitle: 'Nie znaleźliśmy tej etykiety.',
    runNotFoundBody:
      'Link wskazuje partię, której nie ma na tym koncie. Nie pokazujemy w zamian innej etykiety.',
    toLabelHistory: 'Historia etykiet',
    backToProductionHistory: '← Wróć do historii produkcji',
    backToLabelHistory: '← Wróć do historii etykiet',
    backToRun: '← Wróć do partii',
    historyTitle: 'Historia etykiet',
    historyHelper:
      'Zapisane wersje etykiet zakończonych partii. Partie bez etykiety są w Partiach → Historia produkcji.',
    historySearch: 'Szukaj po nazwie lub numerze LOT',
    historySearchEmpty: 'Nie znaleźliśmy etykiety o tej nazwie ani z tym numerem LOT.',
    historyRowMeta: (lot, recipeVersion) => `LOT ${lot} · wersja receptury ${recipeVersion ?? '—'}`,
    historyUnavailable: 'Historia etykiet jest chwilowo niedostępna. Spróbuj ponownie.',
  },
};

const PRODUCTION_BATCHES_LABELS_COPY: Readonly<
  Partial<Record<AppLocale, ProductionBatchesLabelsCopy>>
> = { pl: productionBatchesLabelsCopyPl };

export function productionBatchesLabelsCopyFor(
  locale: AppLocale = 'pl',
): ProductionBatchesLabelsCopy {
  return resolveLocaleResource(PRODUCTION_BATCHES_LABELS_COPY, locale);
}

/** The shipping copy (Polish, the reference locale). */
export const productionBatchesLabelsCopy = productionBatchesLabelsCopyFor();
