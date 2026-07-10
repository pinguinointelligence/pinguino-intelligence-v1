/**
 * Studio Flow copy registry — PL-first, LOCKED wording (User-Flow layer).
 *
 * Source of tone: docs/pinguino-spine/User_Flow.md (v1.0 FINAL) — short,
 * clear, human, non-technical, confident; flavor/product language first;
 * Demo/Free never sees exact-gram promises, Pro value stays explicit.
 *
 * HONESTY RULES (test-pinned):
 *  - never "zapisano" / "zastosowano" — nothing here saves or applies;
 *  - a partial improvement is NEVER called a rescue ("uratowane") without
 *    the explicit "nie w pełni" qualifier;
 *  - stock guidance states that inventory is neither read nor written;
 *  - save-correction guidance states the recipe itself stays untouched;
 *  - missing data asks for a MEASUREMENT — the system never guesses.
 *
 * Structure is language-keyed (`pl` now, `en` slot later) so the registry can
 * grow without renaming; the app consumes Polish first per the locked flow.
 * Pure data — no IO, no state, no persistence.
 */

/** The Studio user situations this layer explains (User-Flow scope, v1). */
export type StudioFlowSituation =
  | 'new_recipe'
  | 'recipe_in_range'
  | 'recipe_optimized'
  | 'recipe_tradeoff'
  | 'recipe_impossible'
  | 'recipe_blocked'
  | 'batch_rescue_guidance'
  | 'stock_shortage_guidance'
  | 'verified_substitute_guidance'
  | 'missing_data';

export const STUDIO_FLOW_SITUATIONS: readonly StudioFlowSituation[] = [
  'new_recipe',
  'recipe_in_range',
  'recipe_optimized',
  'recipe_tradeoff',
  'recipe_impossible',
  'recipe_blocked',
  'batch_rescue_guidance',
  'stock_shortage_guidance',
  'verified_substitute_guidance',
  'missing_data',
];

export interface StudioFlowSituationCopy {
  title: string;
  body: string;
  /** The one next step we recommend — an instruction, never an auto-action. */
  nextAction: string;
}

export interface StudioFlowCopy {
  situations: Record<StudioFlowSituation, StudioFlowSituationCopy>;
  tier: {
    /** Demo/Free — locked grams, upgrade-safe wording (User_Flow §8). */
    demoLockedGrams: string;
    /** Pro — action-safe wording; may name exact grams. */
    proExactGrams: string;
  };
  save: {
    signInToSave: string;
    saveAvailable: string;
    /** The "save correction" vs "apply to recipe" distinction, explicit. */
    saveVsApply: string;
  };
  disclaimers: {
    previewOnly: string;
    noInventoryWrite: string;
    noRecipeMutation: string;
  };
}

const PL: StudioFlowCopy = {
  situations: {
    new_recipe: {
      title: 'Zaczynamy nową recepturę',
      body:
        'Ustaw kategorię, temperaturę serwowania i składniki po lewej. Silnik liczy wszystko na bieżąco — nic nie zapisuje się samo.',
      nextAction: 'Gdy receptura będzie gotowa, uruchom podgląd optymalizacji.',
    },
    recipe_in_range: {
      title: 'Receptura w zakresie',
      body:
        'Kluczowe wskaźniki mieszczą się w pasmach dla wybranego profilu i temperatury serwowania. Nie ma nic do poprawiania.',
      nextAction: 'Możesz pracować dalej albo zmienić założenia i przeliczyć ponownie.',
    },
    recipe_optimized: {
      title: 'Korekta zweryfikowana',
      body:
        'Silnik znalazł korektę i potwierdził ją pełnym ponownym przeliczeniem. To nadal podgląd — receptura nie została zmieniona.',
      nextAction: 'Przejrzyj propozycję. Nic nie jest nakładane na recepturę automatycznie.',
    },
    recipe_tradeoff: {
      title: 'Kompromis — poprawa częściowa',
      body:
        'Korekta poprawia recepturę, ale część wskaźników zostaje poza zakresem. Uczciwie: to kompromis, nie pełna naprawa.',
      nextAction: 'Sprawdź, które wskaźniki zostają poza pasmem, zanim zdecydujesz.',
    },
    recipe_impossible: {
      title: 'Brak bezpiecznej korekty',
      body:
        'Przy obecnych ograniczeniach silnik nie znalazł bezpiecznej korekty. Nie zgadujemy i nie wymuszamy liczb.',
      nextAction: 'Zmień założenia — składniki, styl albo temperaturę — i przelicz ponownie.',
    },
    recipe_blocked: {
      title: 'Zatrzymane — brak danych lub profil nieobsługiwany',
      body:
        'Silnik zatrzymał się uczciwie: brakuje danych albo ten profil/temperatura nie są jeszcze obsługiwane. Nic nie liczymy na ślepo.',
      nextAction: 'Uzupełnij brakujące dane albo wybierz obsługiwany profil produktu.',
    },
    batch_rescue_guidance: {
      title: 'Ratowanie realnej partii (IF9)',
      body:
        'Opisz, co zmierzyłeś w gotowej partii. Dokładne gramatury pojawiają się wyłącznie po weryfikacji regulatorem; poprawa częściowa to wciąż partia nie w pełni uratowana.',
      nextAction: 'Zważ partię i podaj obserwację — system nie zgaduje pomiarów.',
    },
    stock_shortage_guidance: {
      title: 'Brak surowca (IF10)',
      body:
        'Podaj, czego brakuje i ile masz. Zamiennik nigdy nie jest podstawiany po cichu, a stany magazynowe nie są ani odczytywane, ani nigdzie zapisywane.',
      nextAction: 'Policz realny stan i wybierz świadomie jedną z opcji decyzji.',
    },
    verified_substitute_guidance: {
      title: 'Zweryfikowany zamiennik',
      body:
        'Dokładne przeliczenie zamiennika wymaga skalibrowanego wpisu z katalogu referencyjnego. Składu zamiennika nie można wpisać ręcznie.',
      nextAction: 'Bez zweryfikowanego składu dostępne są tylko bezpieczne opcje bez liczb.',
    },
    missing_data: {
      title: 'Brakuje danych',
      body: 'System prosi o pomiar zamiast zgadywać. Bez pomiaru nie ma liczb.',
      nextAction: 'Uzupełnij pomiar i uruchom podgląd ponownie.',
    },
  },
  tier: {
    demoLockedGrams:
      'Kierunek korekty i ostrzeżenia widzisz już teraz. Pełna gramatura i Auto Fix są dostępne w Pro.',
    proExactGrams:
      'Pro: widzisz dokładne gramatury korekt oraz porównanie przed/po z weryfikacją regulatora.',
  },
  save: {
    signInToSave: 'Zaloguj się, aby móc zapisywać zaakceptowane korekty.',
    saveAvailable:
      'Możesz zapisać zaakceptowaną korektę jako osobny, niezmienialny wpis audytowy — na wyraźne kliknięcie, nigdy automatycznie.',
    saveVsApply:
      'Zapis korekty to NIE zmiana receptury: powstaje osobny wpis audytowy, a receptura pozostaje nietknięta. Nakładanie korekty na recepturę to osobna, przyszła funkcja.',
  },
  disclaimers: {
    previewOnly: 'Podgląd — nic nie zapisuje się i nic nie jest nakładane automatycznie.',
    noInventoryWrite: 'Stany magazynowe nie są ani odczytywane, ani zapisywane — podajesz je ręcznie.',
    noRecipeMutation: 'Receptura nie jest modyfikowana ani przez podgląd, ani przez zapis korekty.',
  },
};

/** Language-keyed registry — `pl` is the locked primary; `en` arrives later. */
export const STUDIO_FLOW_COPY: { readonly pl: StudioFlowCopy } = { pl: PL };
