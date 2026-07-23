/**
 * PINGÜINO Constraint Studio — copy module (Polish, SPEC §17–§20).
 *
 * The single copy source for the lock / preview / apply / feasibility /
 * history surface. Honesty rules baked into the strings:
 *  - §18.2 / §18.4 / §18.5 sentences follow the spec wording — the §18.5
 *    fallback is verbatim („…lub zmień batch.”);
 *  - no target-band numbers, no metric readings, no scoring weights — the
 *    only numbers user-visible here are gram amounts and batch sizes (§22.2);
 *  - negative temperatures always use U+2212 (−), never the ASCII hyphen.
 */

/** Deterministic gram formatter (comma decimal, ≤0.1 g, no locale ICU variance). */
export const formatGramsPl = (grams: number): string => {
  const rounded = Math.round(grams * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
  return `${text} g`;
};

/** Signed gram delta with the typographic minus (U+2212). */
export const formatGramsDeltaPl = (delta: number): string => {
  const magnitude = formatGramsPl(Math.abs(delta));
  if (Math.round(delta * 10) === 0) return `±${magnitude}`;
  return delta > 0 ? `+${magnitude}` : `−${magnitude}`;
};

/** Temperature with U+2212 for negatives (task hard rule). */
export const formatTemperaturePl = (celsius: number): string =>
  `${celsius < 0 ? '−' : ''}${Math.abs(celsius)}°C`;

const listPl = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} i ${names[names.length - 1]}`;

export const constraintStudioCopy = {
  /* ---------------------------------------------------------- section ----- */
  section: {
    title: 'Blokady i dopasowanie',
    lead:
      'Zablokowane gramatury nigdy nie są zmieniane przez solver. Każda propozycja pojawia się ' +
      'najpierw jako podgląd — recepturę zmienia dopiero „Zastosuj zmiany”.',
  },

  /* ------------------------------------------------------ §17 lock UI ----- */
  lock: {
    lockAria: (name: string) => `Zablokuj gramaturę: ${name}`,
    unlockAria: (name: string) => `Odblokuj gramaturę: ${name}`,
    lockedBadge: 'Zablokowana',
    rangeBadge: 'Zakres (analiza)',
    lockedTitle: (grams: string) =>
      `Gramatura zablokowana: ${grams}. Dopasowanie nie może jej zmienić.`,
    aiTitle: 'AI może zmienić ten składnik przy dopasowaniu receptury.',
    actualsTitle: 'Odważony składnik jest już niezmienny — blokada nie jest potrzebna.',
    lockedInputTitle: 'Odblokuj kłódkę, aby edytować gramaturę.',
  },

  /* ------------------------------------------------------- actions -------- */
  actions: {
    optimize: 'Dopasuj recepturę',
    optimizeHint: 'Tworzy podgląd zmian — nic nie zapisuje i nie zmienia receptury.',
    rescale: 'Przeskaluj partię',
    rescaleLabel: 'Nowa partia (g)',
    rescaleHint:
      'Zablokowane składniki zachowują dokładną gramaturę — skalowane są tylko pozostałe.',
    feasibility: 'Sprawdź wykonalność blokad',
    feasibilityHint: 'Analiza nie zmienia receptury.',
  },

  /* -------------------------------------------------- §19.1 preview ------- */
  preview: {
    title: 'PINGÜINO proponuje:',
    kindLabels: {
      optimize: 'Dopasowanie receptury',
      batch_rescale: 'Zmiana partii',
      suggested_fix: 'Sugerowana korekta blokady',
    },
    unchangedLocked: 'bez zmian · zablokowane',
    unchanged: 'bez zmian',
    lockChanged: 'nowa wartość blokady',
    added: 'nowy składnik',
    removed: 'usunięty',
    batchLine: (before: string, after: string) => `Partia: ${before} → ${after}`,
    outOfBandDelta: (before: number, after: number) =>
      `Parametry poza optymalnym zakresem: ${before} → ${after}`,
    apply: 'Zastosuj zmiany',
    cancel: 'Anuluj',
    applyNote:
      'Zastosowanie zmienia tylko wersję roboczą. Zapis wersji receptury to osobny, jawny krok.',
    /* Owner P0 Phase 5 — the batch invariant, always visible in the preview. */
    totalsLine: (before: string, after: string, target: string) =>
      `Suma przed: ${before} · Po zastosowaniu: ${after} · Cel partii: ${target}`,
    totalsOk: 'Suma składników zgodna z docelową masą partii.',
    /* Owner QA (Phase 12): the exact proposal source — honest, never inflated. */
    sourceSolver: (rounds: number) =>
      `Źródło propozycji: kanoniczny solver korekt PI (proposeCorrections, ${rounds} ` +
      `${rounds === 1 ? 'runda' : 'rundy'}) + wyrównanie partii (§17.4).`,
    sourceBatchRescale:
      'Źródło propozycji: proporcjonalne wyrównanie partii (§17.4) — parametry receptury były już ' +
      'w zatwierdzonym zakresie.',
    /* Owner P0 (full formulation) — provenance line + honest reference-derived note. */
    sourceFormulation: (templateId: string, rounds: number) =>
      `Źródło formulacji: ${templateId} + kanoniczny solver korekt PI` +
      `${rounds > 0 ? ` (${rounds} ${rounds === 1 ? 'runda' : 'rundy'})` : ''}.`,
    referenceDerivedNote:
      'Wzorzec pochodny z receptur referencyjnych (staging) — nie jest zatwierdzony naukowo.',
    addedLine: (name: string, grams: string) => `PI dodało: ${name} · ${grams}.`,
    residualWarning: (residual: string) =>
      `Suma składników odbiega od docelowej masy partii o ${residual}. Zastosowanie zostanie zablokowane.`,
  },

  /* ----------------------- the ONE owner-mandated blocked-apply notice ---- */
  blocked: {
    title: 'Zmian nie zastosowano',
    constraintsViolated: (names: readonly string[]) =>
      `Kontrola blokad zatrzymała tę operację: propozycja zmieniłaby zablokowane gramatury` +
      `${names.length > 0 ? ` (${listPl(names)})` : ''}. Receptura nie została zmieniona. ` +
      'Odblokuj składnik albo utwórz nowy podgląd.',
    stale:
      'Receptura lub blokady zmieniły się od utworzenia tego podglądu. Podgląd został ' +
      'unieważniony — utwórz go ponownie. Receptura nie została zmieniona.',
    /* Owner P0 Phase 6 — verbatim first sentence. */
    duplicates: (names: readonly string[]) =>
      `Podgląd zawiera zduplikowane składniki i nie może zostać zastosowany.` +
      `${names.length > 0 ? ` (${listPl(names)})` : ''} Receptura nie została zmieniona.`,
    /* Owner P0 Phase 5 — the batch invariant block. */
    batchMismatch: (proposedSum: number, targetBatch: number) =>
      `Suma składników w podglądzie (${formatGramsPl(proposedSum)}) nie zgadza się z docelową ` +
      `masą partii (${formatGramsPl(targetBatch)}). Receptura nie została zmieniona.`,
    /* Owner P0 (definitive fail) — the exact required rejection sentence. */
    unsafeProposal:
      'PI nie utworzyło bezpiecznej receptury. Propozycja została odrzucona. ' +
      'Receptura nie została zmieniona.',
    dismiss: 'Rozumiem',
  },

  /* --------------------------------------- honest preview-failure notes --- */
  previewIssue: {
    /* Owner P0 (Przelicz z PI) — the exact required already-balanced sentence. */
    alreadyClean: 'Receptura znajduje się już w zatwierdzonym zakresie. PI nie proponuje zmian.',
    noProposal:
      'Solver nie znalazł korekty możliwej przy obecnych blokadach. Użyj „Sprawdź wykonalność ' +
      'blokad”, aby zobaczyć konkretną przyczynę.',
    applyFailed:
      'Nie udało się bezpiecznie przygotować propozycji solvera. Receptura nie została zmieniona.',
    /* Owner P0 (definitive fail): a produced-but-rejected candidate (no improvement). */
    unsafeProposal: 'PI nie utworzyło bezpiecznej receptury. Propozycja została odrzucona.',
    /* Owner P0 (full formulation): honest unsupported profile × temperature. */
    unsupportedProfile:
      'Ten profil produktu nie ma jeszcze zatwierdzonej receptury bazowej dla wybranej ' +
      'temperatury serwowania. PI nie układa receptur bez zatwierdzonego wzorca.',
    invalidConstraints: 'Blokady są nieprawidłowe względem bieżącej receptury.',
    lineMissing: 'Ten składnik nie znajduje się już w recepturze.',
    rescaleInvalid: 'Nowa partia musi być liczbą nieujemną.',
    rescaleActuals:
      'Partii nie można przeskalować: część składników ma już odważone rzeczywiste gramatury.',
    rescaleNoScalable: 'Brak składników do przeskalowania — wszystkie linie są zablokowane.',
    rescaleLockedSum: (minimum: string) =>
      `Zablokowane składniki ważą łącznie więcej niż nowa partia. ` +
      `Minimalna partia dla obecnych blokad: ${minimum}.`,
  },

  /* -------------------- structured recalc-failure diagnosis (owner P0) ---- */
  diagnosis: {
    /** Verified: zero active locks — the failure is NEVER blamed on locks. */
    noActiveLocks:
      'Solver nie znalazł możliwej korekty dla tej receptury. Żaden składnik nie jest ' +
      'zablokowany — przyczyną nie są blokady.',
    /** Owner P0 (Przelicz z PI): a PROVEN no-solution failure — the solver really
     * ran and these exact metrics stayed out of the approved bands. */
    optimizerNoSolution: (metricLabels: readonly string[], solverInvocations: number) =>
      `PI przeliczyło recepturę (solver uruchomiony ${solverInvocations} ×), ale nie znalazło ` +
      `bezpiecznej korekty w zatwierdzonych zakresach.` +
      (metricLabels.length > 0 ? ` Parametry poza zakresem: ${listPl(metricLabels)}.` : ''),
    /** PL labels for the engine's target metrics (proof list rendering). */
    metricLabels: {
      pod: 'słodycz (POD)',
      pac: 'PAC',
      npac: 'NPAC',
      fat: 'tłuszcz',
      total_solids: 'sucha masa',
      water: 'woda',
      ice_fraction: 'udział lodu',
      lactose: 'laktoza',
      lactose_sandiness_risk: 'ryzyko piaszczystości (laktoza)',
      aerating_protein: 'białko napowietrzające',
      protein_in_solids: 'białko w suchej masie',
      alcohol: 'alkohol',
      sugars_in_solids: 'cukry w suchej masie',
    } as Record<string, string>,
    /** Verified: every ingredient is non-adjustable (locks / odważone gramatury). */
    allLocked:
      'Wszystkie składniki są zablokowane. Odblokuj przynajmniej jeden składnik, aby PI mogło ' +
      'przeliczyć recepturę.',
    /** Verified: N real active locks constrain the solver — the list is shown below. */
    withLocks: (locked: number, total: number) =>
      `Solver nie znalazł korekty możliwej przy obecnych blokadach — zablokowane składniki: ` +
      `${locked} z ${total} (lista poniżej).`,
    temperatureMismatch:
      'Nie można przeliczyć receptury, ponieważ wybrana temperatura i aktywny profil Engine ' +
      'są niespójne.',
    incomplete: 'Receptura jest niekompletna — dodaj składniki i ustaw partię, aby przeliczyć.',
    notEngineReady: (names: readonly string[]) =>
      `Składniki bez pełnych danych silnika: ${listPl(names)}. Uzupełnij dane, aby przeliczyć.`,
    verificationFailed:
      'Kontrola bezpieczeństwa zatrzymała propozycję solvera.',
    /** ALWAYS appended to every failure message (owner rule). */
    unchanged: 'Receptura nie została zmieniona.',
    /** Poured actuals put the solver in add-only rescue mode (§15) — say it. */
    pouredNote: (count: number) =>
      `${count} skł. ma już odważone rzeczywiste gramatury — obowiązuje tryb ratowania partii ` +
      '(solver może tylko dodawać, nigdy zmniejszać).',
    lockTable: {
      heading: 'Zweryfikowany stan blokad',
      colIngredient: 'Składnik',
      colGrams: 'Gramatura',
      colLock: 'Blokada',
      colSource: 'Źródło',
      state: {
        unlocked: 'AI może zmieniać',
        grams: 'Zablokowana gramatura',
        range: 'Zakres (analiza)',
        main: 'Składnik główny',
        required: 'Wymagany',
        already_added: 'Już dodany',
        poured: 'Odważony (rzeczywisty)',
      },
      source: {
        user_padlock: 'kłódka użytkownika (ta sesja)',
        saved_recipe: 'z zapisanej receptury',
        engine_lock: 'ustawienie receptury',
        poured_actual: 'ratowanie partii / produkcja',
        none: '—',
      },
    },
  },

  /* ------------------------------------------------ §17.4 live conflict --- */
  conflict: {
    title: 'Konflikt blokad',
    lockedSumExceedsBatch: (sum: string, batch: string, minimum: string) =>
      `Zablokowane składniki (${sum}) przekraczają partię (${batch}). ` +
      `Minimalna partia dla obecnych blokad: ${minimum}.`,
    setBatchTo: (grams: string) => `Ustaw partię ${grams}`,
  },

  /* ------------------------------------------------- §18 feasibility ------ */
  feasibility: {
    title: 'Wykonalność przy blokadach',
    analysisBadge: 'ANALIZA',
    feasibleInBand: 'Receptura jest w optymalnym zakresie przy obecnych blokadach.',
    feasibleViaSolver:
      'Optymalny zakres jest osiągalny bez zmiany blokad — użyj „Dopasuj recepturę”.',
    boundIntro: 'Nie można osiągnąć optymalnego balansu przy obecnych blokadach.',
    boundLockedAt: (name: string, grams: string) => `${name} — zablokowane na ${grams}.`,
    boundMax: (grams: string) => `Aby wejść w optymalny zakres, ustaw maksymalnie ${grams}.`,
    boundMin: (grams: string) => `Aby wejść w optymalny zakres, ustaw co najmniej ${grams}.`,
    setAndRecalc: (grams: string) => `Ustaw ${grams} i przelicz`,
    unlock: (name: string) => `Odblokuj ${name}`,
    changeBatch: (minimum: string) => `Zmień partię (min. ${minimum})`,
    keepAsIs: 'Pozostaw bez zmian',
    keepAsIsNote:
      'Receptura pozostanie poza optymalnym zakresem — jej status pozostaje uczciwie widoczny.',
    /** §18.4 group — spec wording. */
    groupLead: 'Zablokowane składniki wspólnie uniemożliwiają osiągnięcie optymalnego zakresu:',
    groupPaths:
      'Możliwe ścieżki: odblokuj jeden z nich, zmień zakres, zwiększ batch albo zaakceptuj wynik ' +
      'poza optimum.',
    evidence: 'Zweryfikowany zestaw zmian solvera (dowód, wymaga odblokowania):',
    evidenceAdd: (name: string, grams: string) => `dodaj ${name}: ${grams}`,
    evidenceReduce: (name: string, grams: string) => `zmniejsz ${name} o ${grams}`,
    /** §18.5 fallback — spec sentence VERBATIM. Never accompanied by numbers. */
    noReliableBound:
      'Przy obecnych blokadach nie znaleziono rozwiązania w optymalnym zakresie. ' +
      'Odblokuj jeden z zaznaczonych składników lub zmień batch.',
    markedIngredients: (names: readonly string[]) => `Zaznaczone składniki: ${listPl(names)}.`,
    invalid: 'Blokady są nieprawidłowe względem bieżącej receptury.',
    violationsIntro: 'Poza optymalnym zakresem:',
  },

  /* ------------------------------------------- §20 history/undo/explain --- */
  history: {
    title: 'Historia zmian',
    empty: 'Brak zastosowanych zmian w tej sesji.',
    undo: 'Cofnij ostatnią zmianę',
    undoUnavailable:
      'Receptura zmieniła się od tej operacji — cofnięcie przywróciłoby nieaktualny stan.',
    explain: 'Dlaczego?',
    contextLine: (temperature: string) => `Temperatura serwowania: ${temperature}`,
    outOfBand: (before: number, after: number) =>
      `Parametry poza optymalnym zakresem: ${before} → ${after}`,
  },

  /* -------------------------------------------- save → pro-core version --- */
  save: {
    title: 'Zapis wersji',
    note: 'Zapis tworzy nową wersję receptury (v1, v2, …). Historia nie jest nadpisywana.',
    signedOut: 'Zaloguj się, aby zapisywać wersje receptury.',
    planBlocked: 'Twój plan nie obejmuje zapisywania receptur.',
    unavailable: 'Zapis wersji nie jest dostępny w tym środowisku.',
    localDev: 'Tryb lokalny (dev) — zapisane wersje nie są trwałe.',
    saveButton: 'Zapisz wersję',
    saving: 'Zapisywanie…',
    savedVersion: (version: number) => `Zapisano wersję v${version}.`,
    error: 'Nie udało się zapisać wersji receptury.',
    defaultTitle: 'Nowa receptura',
  },

  /* --------------------------------------------- §17.3 range (flagged) ---- */
  range: {
    title: 'Zakresy min–max (analiza)',
    note:
      'Zakres nie steruje solverem na żywo — służy analizie wykonalności. Sugerowane wartości ' +
      'pochodzą wyłącznie ze zweryfikowanych obliczeń, nigdy z heurystyki.',
    minLabel: (name: string) => `${name} — minimum (g)`,
    maxLabel: (name: string) => `${name} — maksimum (g)`,
    set: 'Ustaw zakres',
    clear: 'Usuń zakres',
    invalidWindow:
      'Zakres musi obejmować obecną gramaturę i mieć minimum nie większe niż maksimum — ' +
      'nic nie przycinamy automatycznie.',
  },

  listPl,
} as const;
