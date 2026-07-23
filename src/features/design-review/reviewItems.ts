/**
 * PINGÜINO design-review REGISTRY — the single source of truth for red `DO PRZEGLĄDU` items
 * (Masterpiece UX/UI Phase 3). Mirrors docs/design/PINGUINO_UI_INVENTORY.md and
 * docs/design/PINGUINO_REVIEW_ITEMS.md (same stable RV-ids).
 *
 * Owner-binding rules encoded here:
 *  - NOTHING is removed or hidden — every item stays fully accessible; the marker only flags it.
 *  - `ownerDecision` is ALWAYS 'pending' until the owner decides item by item (never automated).
 */

export type ReviewSuggestion =
  | 'keep'
  | 'rename'
  | 'merge'
  | 'relocate'
  | 'hide-by-capability'
  | 'remove-later';

export interface ReviewItem {
  /** Stable id (RV-…) shared with the inventory + review docs. */
  id: string;
  /** The route (pathname) where the item lives; matched by exact path or prefix. */
  route: string;
  /** Match nested paths too (e.g. /pro matches /pro/recipe). */
  matchPrefix?: boolean;
  /** What the item is, in owner vocabulary. */
  label: string;
  /** What it does today (function). */
  functionNote: string;
  /** Why it is questionable — shown on the marker (hover/click) and in the overlay. */
  reason: string;
  /** Suggested action for the owner checklist. */
  suggestion: ReviewSuggestion;
  /** Owner decision — always 'pending' in code; the owner decides in the checklist doc. */
  ownerDecision: 'pending';
}

export const REVIEW_ITEMS: readonly ReviewItem[] = [
  {
    id: 'RV-01',
    route: '/recipes',
    label: 'Gotowe receptury — angielskie treści + dekoracyjne kafelki',
    functionNote: 'Hub „Gotowe receptury”: link do Moich receptur + kafelki-zapowiedzi.',
    reason:
      'Angielskie copy (copy.nav.recipes) na ścieżce klienta; dekoracyjne kafelki wyglądają jak klikalne.',
    suggestion: 'keep',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-02',
    route: '/label',
    label: 'Etykiety i produkty — angielskie treści',
    functionNote: 'Przykładowa deklaracja wartości odżywczej + skład QUID + CSV/druk.',
    reason: 'Angielskie copy na ścieżce klienta (docelowo polska wersja).',
    suggestion: 'keep',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-03',
    route: '/api',
    label: 'API — strona zapowiedzi (angielska)',
    functionNote: 'Destynacja API: wyłącznie wiersze „Coming soon”.',
    reason: 'Angielskie copy; siedem zapowiedzi bez akcji — do przeglądu prezentacji.',
    suggestion: 'keep',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-04',
    route: '/work-with-us',
    label: 'Work With Us — angielskie treści',
    functionNote: 'Cztery oferty współpracy + kontakt mailowy.',
    reason: 'Angielskie copy na ścieżce klienta.',
    suggestion: 'keep',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-05',
    route: '/create-ingredient',
    label: 'Create Ingredient — strona zapowiedzi (angielska)',
    functionNote: 'Destynacja „własny składnik”: wiersze „Coming soon”.',
    reason: 'Angielskie copy; zapowiedzi bez akcji.',
    suggestion: 'keep',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-06',
    route: '/products/import',
    label: 'Import katalogu produktów — techniczna strona na publicznej ścieżce',
    functionNote: 'Wewnętrzny import CSV do warstwy produktów (generic/Mercadona/Colin).',
    reason:
      'Narzędzie wewnętrzne w języku technicznym/angielskim na routowalnej ścieżce — kandydat do sekcji „Diagnostyka właściciela”.',
    suggestion: 'hide-by-capability',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-07',
    route: '*',
    label: 'Strona 404 — mieszany język',
    functionNote: 'NotFoundPage: nagłówek EN + polski link powrotu.',
    reason: 'Jedna strona, dwa języki — do ujednolicenia.',
    suggestion: 'keep',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-08',
    route: '/start',
    label: 'Drugie menu (CustomerMenu) obok kanonicznej szuflady',
    functionNote:
      'Osobna implementacja hamburgera na stronach klienta (/, /start, /subscription, /profile/machine).',
    reason:
      'Zdublowana nawigacja: dwie szuflady, dwa źródła pozycji — ryzyko rozjazdu. Propozycja: jedna implementacja na bazie appNav (po merge P0; seam Agenta D).',
    suggestion: 'merge',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-09',
    route: '/',
    label: 'Pozostałości Studio: TopNav / MegaMenu / navConfig (nieroutowane)',
    functionNote: 'Czarny top-nav z mega-menu z Fazy 6C — nieosiągalny z żadnej trasy.',
    reason:
      'Legacy komponenty w drzewie; ImagePlaceholder z MegaMenuItem wciąż importowany przez /recipes.',
    suggestion: 'remove-later',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-10',
    route: '/',
    label: 'AppMenu — stara lewa szuflada (nieroutowana)',
    functionNote: 'Legacy lewe menu; zastąpione przez AppNavDrawer.',
    reason: 'Nieużywany duplikat nawigacji w drzewie komponentów.',
    suggestion: 'remove-later',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-11',
    route: '/',
    label: 'ShellLayout + HomePage — stary czarny „AI Home” (nieroutowany)',
    functionNote: 'Legacy shell AI-first; HomePage odłączony od tras decyzją właściciela.',
    reason: 'Utrzymywany kod bez trasy — decyzja właściciela o dalszym losie.',
    suggestion: 'remove-later',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-12',
    route: '/pro/monitor',
    label: 'Zakładka Monitor — tylko notatka',
    functionNote: 'Sekcja /pro/monitor wyświetla notatkę odsyłającą do zakładki Receptura.',
    reason:
      'Nawigacja do wyjaśnienia zamiast funkcji. Propozycja: zakładka otwiera bezpośrednio szufladę Monitora na żywym wyniku.',
    suggestion: 'relocate',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-13',
    route: '/pro/machine',
    label: 'Maszyna (per-receptura) a Moja maszyna (domyślna)',
    functionNote: 'Dwa miejsca wyboru maszyny: /pro/machine (bieżąca receptura) i /profile/machine (domyślna).',
    reason:
      'Potencjalny duplikat w odczuciu użytkownika — role są różne; brakuje jednego zdania rozróżniającego na każdej ze stron.',
    suggestion: 'keep',
    ownerDecision: 'pending',
  },
  {
    id: 'RV-14',
    route: '/pro/recipe',
    label: 'Podwójna linia kontekstu (workbar + nagłówek laboratorium)',
    functionNote: 'Workbar pokazuje kontekst receptury; nagłówek StudioEngineSurface pokazuje trasę silnika + podsumowanie.',
    reason: 'Dwie linie kontekstu w jednym widoku — do przeglądu prezentacji (tylko wygląd).',
    suggestion: 'merge',
    ownerDecision: 'pending',
  },
] as const;

/** Items whose marker belongs to the CURRENT route (exact or prefix match; '*' = 404 only). */
export function reviewItemsForPath(pathname: string): ReviewItem[] {
  return REVIEW_ITEMS.filter((item) => {
    if (item.route === '*') return false; // 404 marker is placed by the overlay's global list only
    if (item.matchPrefix) return pathname === item.route || pathname.startsWith(`${item.route}/`);
    return pathname === item.route;
  });
}
