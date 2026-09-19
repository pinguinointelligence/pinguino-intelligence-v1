/**
 * Plany → the comparison table's TRUTH, derived from the capability matrix.
 *
 * DESIGN V3.0 §P1: „Porównanie mówi prawdę. Wiersze to rzeczy, które produkt
 * realnie bramkuje … Zapis nie jest zwykłym ptaszkiem: Home zapisuje jedną
 * recepturę, Pro bez limitu — tak mówi proCoreCapabilities."
 *
 * Two rules hold this file honest:
 *
 * 1. NO SECOND MATRIX. Every cell is read from `PRO_CORE_CAPABILITIES`
 *    (`src/features/pro-core/proCoreCapabilities.ts`), the persona authority
 *    that actually gates the app. This module selects and labels; it never
 *    decides. If the matrix changes, the table changes with it, and the test
 *    that walks both fails if it does not.
 *
 * 2. ONLY WHAT A CUSTOMER CAN REACH. A capability that no shipped screen
 *    reads is not a reason to pay. Several keys in the matrix have no consumer
 *    at all (version comparison, costs, CSV export, gram locking and ranges,
 *    scaling, repair, the professional flow and monitor, the serving-mode
 *    choice), and `/pro/costs`, `/pro/exports`, `/pro/production` and
 *    `/pro/history` still render „…pojawią się w kolejnym etapie". None of
 *    them appears here, and `UNADVERTISED` records why, so a future edit has
 *    to argue with the reason instead of quietly re-adding the row.
 *
 * Prices are deliberately ABSENT. The catalog holds them in cents and the
 * promotional flags can swap which offer is public, so the cards compute the
 * prices and the table stays about capability.
 */
import {
  PRO_CORE_CAPABILITIES,
  type ProCoreCapabilities,
  type ProCorePersona,
} from '@/features/pro-core/proCoreCapabilities';

/** What one plan column says for one row. */
export type ComparisonCell =
  /** Reachable and unlimited. */
  | { kind: 'yes' }
  /** Reachable, but bounded — the bound is the point (Home's single recipe). */
  | { kind: 'limited'; note: string }
  /** Not available on this plan. */
  | { kind: 'no' };

export interface ComparisonRow {
  id: string;
  /** Customer-facing row name. */
  label: string;
  /** One short clarification, shown under the label where the row needs it. */
  hint?: string;
  demo: ComparisonCell;
  home: ComparisonCell;
  pro: ComparisonCell;
}

const yes: ComparisonCell = { kind: 'yes' };
const no: ComparisonCell = { kind: 'no' };
const limited = (note: string): ComparisonCell => ({ kind: 'limited', note });

const caps = (persona: ProCorePersona): ProCoreCapabilities => PRO_CORE_CAPABILITIES[persona];

/** A boolean capability, read straight from the matrix. */
const flag = (persona: ProCorePersona, key: keyof ProCoreCapabilities): ComparisonCell =>
  caps(persona)[key] === true ? yes : no;

/**
 * The saved-recipe cell. `maxSavedRecipes` is `0` for Demo, `1` for Home and
 * `null` for Pro, so the wording follows the number rather than repeating it.
 */
function savedRecipesCell(persona: ProCorePersona): ComparisonCell {
  const max = caps(persona).maxSavedRecipes;
  if (!caps(persona).canSaveRecipe || max === 0) return no;
  if (max === null) return { kind: 'yes' };
  return limited(max === 1 ? 'Jedna receptura' : `Do ${max} receptur`);
}

/**
 * Produkcja is not a plain yes/no. Demo meets an upgrade notice, Home reaches
 * the area but only to resume a run it started, and Pro gets the full batch
 * tooling. `canUseProductionMode` is what the app branches on.
 */
function productionCell(persona: ProCorePersona): ComparisonCell {
  if (caps(persona).canUseProductionMode) return yes;
  if (persona === 'home') return limited('Wznowienie partii');
  return no;
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    id: 'exact-grams',
    label: 'Dokładne gramatury',
    hint: 'Podgląd pokazuje wynik i Monitor, ale bez ilości.',
    demo: flag('demo', 'canViewExactGrams'),
    home: flag('home', 'canViewExactGrams'),
    pro: flag('pro', 'canViewExactGrams'),
  },
  {
    id: 'saved-recipes',
    label: 'Zapisane receptury',
    hint: 'Kolejne wersje tej samej receptury nie liczą się jako nowa.',
    demo: savedRecipesCell('demo'),
    home: savedRecipesCell('home'),
    pro: savedRecipesCell('pro'),
  },
  {
    id: 'recipe-versions',
    label: 'Wersje receptury',
    hint: 'Zapis tworzy nową wersję; starsza zostaje nienaruszona.',
    demo: flag('demo', 'canViewRecipeVersions'),
    home: flag('home', 'canViewRecipeVersions'),
    pro: flag('pro', 'canViewRecipeVersions'),
  },
  {
    id: 'production',
    label: 'Produkcja',
    hint: 'Ważenie, odchylenia i zakończenie partii.',
    demo: productionCell('demo'),
    home: productionCell('home'),
    pro: productionCell('pro'),
  },
  {
    id: 'production-history',
    label: 'Historia produkcji',
    demo: no,
    home: no,
    pro: flag('pro', 'canUseProductionMode'),
  },
  {
    id: 'labels',
    label: 'Etykiety',
    hint: 'Skład, numer LOT i druk — do sprzedaży.',
    demo: no,
    home: no,
    pro: flag('pro', 'canUseProductionMode'),
  },
  {
    id: 'pro-space',
    label: 'Przestrzeń Pro',
    hint: 'Receptura, Monitor i wersje w jednym miejscu pracowni.',
    demo: no,
    home: no,
    pro: flag('pro', 'canUseProductionMode'),
  },
];

/**
 * Deliberately NOT sold, with the reason. Each key either has no consumer in
 * shipped code or its screen is still an announcement; advertising it would be
 * selling something the product does not do.
 */
export const UNADVERTISED: Readonly<Record<string, string>> = {
  canChooseProfessionalServingMode:
    'Brak czytelnika w kodzie — Home też wybiera temperaturę/urządzenie.',
  canUseCosts: '/pro/costs renderuje zapowiedź „pojawią się w kolejnym etapie".',
  canExport: 'Jedyny czytelnik to strona deweloperska; klient nie ma tej ścieżki.',
  canCompareRecipeVersions: 'Porównanie wersji nie ma żadnego ekranu.',
  canViewProductionHistory: 'Historia wchodzi przez Produkcję, nie przez ten klucz.',
  canEditIngredientGrams: 'Brak czytelnika w kodzie.',
  canLockIngredientGrams: 'Brak czytelnika w kodzie.',
  canSetIngredientRange: 'Brak czytelnika w kodzie.',
  canScaleRecipe: 'Brak czytelnika w kodzie.',
  canRepairRecipe: 'Brak czytelnika w kodzie.',
  canRepairProductionBatch: 'Brak czytelnika w kodzie.',
  canUseProfessionalFlow: 'Brak czytelnika w kodzie.',
  canUseProfessionalMonitor: 'Brak czytelnika w kodzie.',
};

/** Column headings, in the design's order. */
export const COMPARISON_COLUMNS = [
  { id: 'demo', label: 'Podgląd' },
  { id: 'home', label: 'Home' },
  { id: 'pro', label: 'Pro' },
] as const;
