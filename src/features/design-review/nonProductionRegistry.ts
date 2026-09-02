/**
 * Non-production data registry — Agent 4 fixture/hardcode sweep (2026-07-24).
 *
 * ONE typed source of truth for every runtime-REACHABLE surface that currently
 * serves non-production data (fixtures, samples, demo presets, reference-derived
 * templates, decorative placeholders). Each entry names:
 *  - the SOURCE FILE + exported identifier of the non-production data,
 *  - WHY it is non-production (honest Polish one-liner),
 *  - WHAT replaces it (the replacement plan).
 *
 * The `NonProductionMarker` component renders these entries as the pink
 * `TESTOWE / NIEPRODUKCYJNE` badge + tooltip on the affected surfaces. The full
 * sweep classification (including dev-only and test-only items that need NO
 * marker) lives in docs/product-completion/AGENT4_FIXTURE_SWEEP_LEDGER.md.
 *
 * Pure data — no React, no store imports, fully unit-testable.
 */

/** Stable ids — one per marked surface. */
export type NonProductionItemId =
  | 'start-ready-catalogue'
  | 'start-ready-draft'
  | 'pro-demo-library'
  | 'preview-reference-template'
  | 'recipes-hub-tiles'
  | 'landing-monitor-example';

export interface NonProductionItem {
  readonly id: NonProductionItemId;
  /** Repo-relative source file(s) of the non-production data. */
  readonly file: string;
  /** Exported identifier / dataset name inside that file. */
  readonly identifier: string;
  /** Why this is non-production (honest, customer-readable Polish). */
  readonly reason: string;
  /** What replaces it — the replacement plan. */
  readonly replacement: string;
}

export const NON_PRODUCTION_ITEMS: readonly NonProductionItem[] = [
  {
    id: 'start-ready-catalogue',
    file: 'src/features/customer-flow/__fixtures__/catalogueFixtures.ts',
    identifier: 'CATALOGUE_FIXTURES',
    reason:
      'Karty „gotowych receptur” to dane testowe (same metadane, bez składu i bez zdjęć) — to nie jest prawdziwy katalog receptur Gellatti.',
    replacement:
      'Zatwierdzony przez właściciela katalog gotowych receptur, z realnym składem i zdjęciami.',
  },
  {
    id: 'start-ready-draft',
    file: 'src/features/customer-flow/readyRecipeMatching.ts',
    identifier: 'selectReadyRecipe / buildRecipeStructure (na kartach CATALOGUE_FIXTURES)',
    reason:
      'Szkic roboczy zbudowany na karcie testowej — struktura poglądowa bez wyliczonych przez silnik ilości.',
    replacement:
      'Szkic z prawdziwej receptury katalogowej (pełny skład + wyliczenia silnika) po podłączeniu katalogu.',
  },
  {
    id: 'pro-demo-library',
    file: 'src/data/demoIngredients.ts + src/data/demoPresets.ts',
    identifier: 'DEMO_INGREDIENTS / DEFAULT_PRESET (milk-base)',
    reason:
      'Receptura startowa to preset demo, a biblioteka składników (Demo/non-Pro oraz cichy fallback Pro przy błędzie lub pustej bazie) używa wartości literaturowych i szacunkowych kosztów EUR/kg (confidence 85, niezweryfikowane).',
    replacement:
      'Zweryfikowana biblioteka składników Gellatti bez danych demonstracyjnych; start z pustej lub ostatniej receptury użytkownika.',
  },
  {
    id: 'preview-reference-template',
    file: 'src/features/formulation/templateRegistry.ts',
    identifier: 'fruit_gelato_ref_v1 (status: reference_derived)',
    reason:
      'Wzorzec formulacji wyprowadzony z receptury referencyjnej repo — status reference_derived, NIE zatwierdzony naukowo dla tego profilu.',
    replacement:
      'Wzorzec o statusie approved po kalibracji i naukowym zatwierdzeniu dawek dla profilu owocowego.',
  },
  {
    id: 'recipes-hub-tiles',
    file: 'src/data/recipes/curatedCollections.ts + src/data/recipes/flavorCatalogue.generated.ts',
    identifier: 'CURATED_RECIPE_CANDIDATES / FLAVOR_CATALOGUE_SOURCE',
    reason:
      'Widoczne w trybie deweloperskim kierunki są danymi inspiracyjnymi lub kandydatami przed testem kuchennym — nie są gotowymi recepturami produkcyjnymi.',
    replacement:
      'Publiczne karty pojawią się dopiero po Mapperze, formulacji, weryfikacji Engine, teście kuchennym, ocenie sensorycznej i publikacji.',
  },
  {
    id: 'landing-monitor-example',
    file: 'src/pages/landing/landingMonitorDemo.ts',
    identifier: 'buildLandingMonitorDemo',
    reason:
      'Podgląd Monitora liczony PRAWDZIWYM silnikiem, ale na stałym waniliowym przykładzie — to demonstracja, nie dane użytkownika.',
    replacement:
      'Pozostaje jako uczciwie oznaczony przykład (decyzja właściciela, Slice F); docelowo interaktywne demo Monitora.',
  },
];

/** Lookup by id — throws on an unknown id so a typo fails fast in tests. */
export function nonProductionItem(id: NonProductionItemId): NonProductionItem {
  const item = NON_PRODUCTION_ITEMS.find((entry) => entry.id === id);
  if (item === undefined) throw new Error(`Unknown non-production item id: ${id}`);
  return item;
}

/** The full tooltip text: source file + identifier + why + what replaces it. */
export function nonProductionTooltip(item: NonProductionItem): string {
  return [
    `Źródło: ${item.file} · ${item.identifier}`,
    `Dlaczego nieprodukcyjne: ${item.reason}`,
    `Docelowo: ${item.replacement}`,
  ].join('\n');
}
