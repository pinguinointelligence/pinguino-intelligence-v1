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
  /** Conversational Assistant Shell — deterministic, no LLM, no persistence. */
  assistant: {
    introTitle: string;
    introBody: string;
    startCta: string;
    /** Shown when the intent draft is prepared — a SKETCH, never a created recipe. */
    draftReadyTitle: string;
    draftReadyBody: string;
    /** Shown while required answers are missing. */
    incomplete: string;
    /** Demo/Free: exact grams stay behind the PAID plans (Home i Pro) — never
     * claimed as Pro-only, because any active subscription unlocks them. */
    demoGramsNote: string;
    /** Standing honesty notes. */
    noSaveNote: string;
    noRecipeChangeNote: string;
    deterministicNote: string;
    /** Intent → deterministic starter recipe draft (local preview only). */
    starter: {
      previewCta: string;
      readyTitle: string;
      readyBody: string;
      needsInfo: string;
      notSupported: string;
      flavorManual: string;
      optimizationRecommended: string;
      inBand: string;
      /** Repeats the no-save / no-apply promise on the recipe preview. */
      notSavedNote: string;
      /** Local "Apply to Studio" (paid tier only) — LOCAL draft replacement,
       * never a save, never an optimization run. */
      apply: {
        cta: string;
        /** Shown next to the action: apply sets ingredients + profile + temperature. */
        setsNote: string;
        replaceWarningTitle: string;
        replaceWarningBody: string;
        confirmCta: string;
        cancelCta: string;
        /** Honest post-apply feedback — moved locally, nothing saved. */
        appliedNote: string;
        /** Trace label for the honest source note (locked starter template). */
        appliedSourceLabel: string;
        undoCta: string;
      };
    };
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
  assistant: {
    introTitle: 'Asystent receptury (szkic intencji)',
    introBody:
      'Zadam kilka krótkich pytań po polsku i przygotuję szkic intencji. To nie tworzy i nie zmienia receptury — nic nie jest zapisywane.',
    startCta: 'Zacznij',
    draftReadyTitle: 'Przygotowano szkic intencji',
    draftReadyBody:
      'To tylko szkic — nie tworzy i nie zmienia receptury, nic nie zapisuje. Możesz teraz na jego podstawie przejść do projektu w Studio.',
    incomplete: 'Uzupełnij wymagane odpowiedzi, aby przygotować szkic intencji.',
    demoGramsNote:
      'Szkic zbiera tylko intencję. Dokładne gramatury są dostępne w planach płatnych (Home i Pro).',
    noSaveNote: 'Nic nie jest zapisywane.',
    noRecipeChangeNote: 'Receptura nie jest zmieniana.',
    deterministicNote: 'Asystent działa deterministycznie — bez modelu językowego.',
    starter: {
      previewCta: 'Pokaż szkic receptury',
      readyTitle: 'Szkic receptury (podgląd)',
      readyBody:
        'To lokalny, deterministyczny szkic bazy z gotowego szablonu — nie jest zapisywany ani nakładany na recepturę. Smak i dostrojenie dodasz w Studio.',
      needsInfo: 'Podaj wielkość batcha, aby przygotować szkic bazy.',
      notSupported:
        'Dla tego profilu nie mam jeszcze bezpiecznego szablonu bazy. Zacznij recepturę ręcznie w Studio — nie zgadujemy składu.',
      flavorManual: 'Dodaj składnik smakowy ręcznie — nie zgadujemy jego składu.',
      optimizationRecommended:
        'Baza jest poza zakresem w części wskaźników — możesz uruchomić podgląd optymalizacji.',
      inBand: 'Baza mieści się w zakresach dla wybranego profilu i temperatury.',
      notSavedNote: 'Podgląd bazy — nic nie jest zapisywane ani nakładane na recepturę.',
      apply: {
        cta: 'Zastosuj w Studio',
        setsNote:
          'Zastosowanie ustawia w Studio składniki, profil produktu i temperaturę serwowania ze szkicu — lokalnie, bez zapisu.',
        replaceWarningTitle: 'W Studio jest już szkic receptury',
        replaceWarningBody:
          'Zastosowanie zastąpi obecny szkic w Studio. Poprzedni stan zachowamy do jednego cofnięcia — nic nie jest zapisywane.',
        confirmCta: 'Zastąp szkic w Studio',
        cancelCta: 'Anuluj',
        appliedNote: 'Szkic przeniesiony do Studio — nic nie zostało zapisane.',
        appliedSourceLabel: 'Źródło szkicu',
        undoCta: 'Cofnij zastosowanie',
      },
    },
  },
};

/** Language-keyed registry — `pl` is the locked primary; `en` arrives later. */
export const STUDIO_FLOW_COPY: { readonly pl: StudioFlowCopy } = { pl: PL };
