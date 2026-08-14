# P0 Search + OCR + PI served-staging root cause

Date: 2026-08-14

Branch: `codex/p0-search-ocr-pi-recovery`

Baseline: `origin/staging@310bbea6ef28c8b2106a5c70131226c6e3d2c2f1`

Environment: `https://staging.pinguinoai.com` / Supabase project `tunabqqrwabacxjcxxkz`

Account: authenticated Owner QA; user ID recorded for RLS proof without storing the login identifier.

Credentials and access tokens are intentionally absent from this report and from all screenshots.

## Executive verdict

`NOT READY — SERVED P0 DEFECTS REMAIN`

The defects are not caused by an empty Mapper dataset, an accidentally enabled Favorites filter,
an absent primary market, a wrong staging project, or a browser cache. They are caused by several
independent contract breaks in the served code:

1. Search filters the Title Case Mapper status domain with the nonexistent lowercase literal
   `verified`, then merges that failing raw-table query with a second catalog RPC that excludes all
   canonical Mapper references.
2. OCR exposes the internal 28-field evidence debugger as the customer workflow and runs nutrition
   matchers over non-nutrition text, while using an unsafe first-line heuristic for product name.
3. Legacy saved recipes are marked `LEGACY_RECONSTRUCTED` even after every line resolves, so Colina
   never becomes a modern editable working copy. PI also has no mutually exclusive terminal state
   and maps a clean/no-proposal result to the prohibited `solver uruchomiony 0 ×` message.

## Reproduction protocol

No source file was edited before this reproduction.

The following evidence was collected from the served authenticated Owner session:

- visible browser DOM and screenshots;
- browser console warnings/errors;
- exact account market controls;
- authenticated JWT calls made with the public staging anon key;
- direct authenticated RPC and RLS-safe read-model results;
- static trace from the served baseline to the SQL/RLS implementation.

The browser console contained no warning or error for Search, Colina, or OCR. The failures are
successful-but-wrong responses and state transitions, not surfaced JavaScript exceptions.

## Search reproduction

### Visible filters

- Primary market: not set.
- Additional markets: none.
- Preferred retailers: none.
- Default search scope: `my_markets_and_global` / “Moje rynki + katalog globalny”.
- Favorites count: 0.
- Favorites filter: off.
- “Cały świat” was not enabled for the first run; enabling it cannot repair the Mapper status filter.

### Served picker results

Base picker:

| Query        | Served result |
| ------------ | ------------: |
| `kiwi`       |             0 |
| `truskawka`  |             0 |
| `truskawaka` |             0 |
| `strawberry` |             0 |
| `fresa`      |             0 |
| `Erdbeere`   |             0 |
| `milk`       |             0 |
| `sucrose`    |             0 |

Topping picker:

| Query  | Served result |
| ------ | ------------: |
| `oreo` |             0 |

The visible result in every case was `Brak wyników. Zmień wyszukiwanie.`

### Authenticated JWT proof

The exact canonical catalog request used for proof was:

```json
{
  "rpc": "search_global_catalog",
  "args": {
    "p_query": "<query>",
    "p_market": [],
    "p_favorites_only": false,
    "p_limit": 200
  }
}
```

The normal Owner JWT received HTTP-successful responses containing zero rows for all nine queries.

The direct Mapper request used by the client has these decisive filters:

```json
{
  "table": "mapper_basement",
  "filters": {
    "is_active": true,
    "approved_for_base": true,
    "approved_for_engines": true,
    "verification_status": "verified"
  }
}
```

For `ingredient_name_display ILIKE %kiwi%` the authenticated result count is 0. The sanctioned
authenticated view `mapper_basement_search` returns seven Kiwi rows in the same account session,
including `PI-ING-000366 · KIWI · Fresh Fruit`.

### Physical staging facts

- Active Mapper rows: 2,088.
- Active + Base-approved: 2,075.
- Active + Base + Engine-approved: 2,074.
- Exact `Verified`: 1,592.
- Exact lowercase `verified`: 0.
- Active canonical Mapper-reference products: 2,088.
- Current Mapper science bindings: 2,088.
- Current product bindings carrying a Mapper ID: 2,088.
- Active commercial products: 0.
- Canonical aliases for Mapper references: 0.

### Search root cause

1. `src/services/ingredients.ts` uses `.eq('verification_status', 'verified')` for search, selection
   and by-ID loading. The dataset's accepted status domain is Title Case and contains no lowercase
   `verified` row.
2. `ProductPickerPopover` independently runs `useIngredientSearch` and
   `useGlobalCatalogPicker`, then concatenates their results on the client. There is no one search
   authority.
3. `search_global_catalog` excludes every `mapper_reference` because canonical Mapper products are
   internal while the RPC admits only shared/owned/contributed products.
4. The canonical Mapper backfill and mapping projection repeat the lowercase comparison, producing
   2,088 `manual_unverified` canonical references and zero verified references.
5. Mapper Favorites/Recent RLS repeats the same lowercase comparison, so a visible repaired row
   would still fail private star/recent operations.
6. The raw Mapper table is subscription-policy gated. The existing
   `mapper_basement_search` view is the approved authenticated read model, but the picker bypasses it.
7. Market mode `my_markets_and_global` is implemented as strict filtering in both SQL and the client
   ranker instead of a union/ranking mode. Missing markets can therefore erase commercial results.
8. Server search has no canonical multilingual/typo alias authority or trigram path for Mapper
   references. `Erdbeere` is absent; `fresa` is over-stemmed to `fres` and can collide with `fresh`.

## OCR reproduction

Fixture: `Zrzut ekranu 2026-08-14 o 10.05.38.png`.

The photograph visibly supports:

- net quantity `220 g`;
- German and French ingredients;
- German `KANN MILCH ENTHALTEN` and French `PEUT CONTENIR LAIT`;
- Mondelez manufacturer/address evidence;
- five small packs.

It does not visibly support a final front-of-pack commercial name, front brand, EAN, nutrition table
or explicit Vegan/gluten-free/lactose-free claims.

### Served result

- Generated product name: `we b U y”`.
- Package size: not found.
- Package unit: not found.
- Ingredients: captured as one very long OCR block, including legal/manufacturer text and `220 g`.
- Allergens/contains: not found.
- May contain: not found.
- Nutrition basis: not found.
- `of which sugars`: populated with the German ingredients line beginning
  `KAKAOKEKSE ... Zutaten: WEIZENMEHL, Zucker ...`.
- Visible customer controls: 28 `Confirm` buttons and 28 `Mark unknown` buttons.
- Visible default language: mixed Polish page chrome and English internal evidence vocabulary.
- Visible provenance: source UUID, source line, raw OCR text, read confidence, normalization confidence
  and technical status for ordinary customers.

The flow did not reach `catalog-submit`; it was trapped at the mandatory 28-field review. No shared
product was written during reproduction.

### OCR root cause

1. `ProductScanPage` mounts `EvidenceReviewPanel` directly. The component is an internal evidence
   debugger, not a four-step customer projection.
2. `labelTextParser` runs every nutrient spec over every OCR line. A line containing the keyword
   `sugar` plus a later gram/percentage token can become nutrition evidence even outside a recognised
   nutrition table.
3. Product name is guessed from the first plausible line among the first eight OCR lines. The first
   uploaded image defaults to `front`, and the bulk action can confirm the heuristic name.
4. OCR requests Polish/English/Spanish/German/Italian but not French. Its `languageHints` represent
   requested languages rather than detected languages; persistence selects the first hint.
5. German may-contain parsing recognises `kann spuren`, not `kann <allergen> enthalten`.
6. There is no manufacturer-evidence field distinct from brand/private supplier.
7. The v2-to-canonical adapter reads nonexistent top-level extracted fields and defaults missing
   nutrition basis to `per_100g`, dropping reviewed ingredients, may-contain and real language facts.
8. Duplicate assessment occurs only at save time against current-account products. Global EAN,
   pHash, fact-fingerprint and semantic comparison are not presented immediately after analysis.
9. The pre-save gate treats absent optional claims as confirmations instead of valid `unknown` values.

## Colina / PI reproduction

Colina loaded six ordinary lines matching the expected Milk, Cream, SMP, Sucrose, Dextrose and Tara
shape. The working page nevertheless displayed:

- `PodglÄ…d historyczny` in the visible score header;
- `Podgląd historyczny. Przed edycją, zapisem lub produkcją utwórz zweryfikowaną wersję.`;
- `—/10`;
- disabled `Zapisz nową wersję` with missing SAVE authority for all six lines.

After confirming settings, OPTIMAL produced:

```text
PI przeliczyło recepturę (solver uruchomiony 0 ×),
ale nie znalazło bezpiecznej korekty w zatwierdzonych zakresach.
Receptura nie została zmieniona.
```

Changing OPTIMAL → ECO correctly created `Zmiany niepotwierdzone`. After `Potwierdź ustawienia`, ECO
produced the identical prohibited `solver uruchomiony 0 ×` result. No browser-console exception was
emitted.

### Colina / PI root cause

1. `useLegacyRecipeBehaviorRevalidation` marks every resolved line of a saved recipe as
   `LEGACY_RECONSTRUCTED`; it never atomically promotes the editable working copy to `RESOLVED`.
2. The hook synchronises behavior snapshots but, for historical rows, does not replace the stale
   ingredient payload with exact current frozen shared facts.
3. `recipeBehaviorAuthority` treats any reconstructed line as a recipe-wide legacy state.
4. Monitor/Profile hide live Preview and corrections in that state; non-read-only modules and SAVE
   remain blocked, producing a circular “create a new version” instruction.
5. PI stores independent `preview`, `previewIssue`, `blocked`, best-candidate and history fields. A
   run has no single terminal discriminant and does not atomically clear old Apply/Undo/error state.
6. `already_clean` is treated as a preview issue instead of `NO_CHANGE_NEEDED`, so recalculation
   remains pending and the score stays `—/10`.
7. ECO returns undifferentiated `null` for both missing price and no cheaper safe move; the pipeline
   maps it to `no_proposal`, then customer copy exposes solver invocation count.

## Required repair boundaries

- Keep `mapper_basement` facts byte-identical.
- Use one authenticated server search authority for Mapper references and catalog products.
- Treat markets as ranking/optional explicit strict filtering; never hide global Mapper references.
- Keep Favorites and prices private and account-scoped.
- Preserve the accepted 499 × 480 desktop picker geometry and the 64/64 pixel contract.
- Keep the full OCR evidence model behind staging Owner diagnostics; replace only the normal customer
  projection.
- Do not fabricate GREEN. Complete reviewed facts may become BLUE; incomplete facts remain RED with
  exact blockers.
- Do not mutate the historical Colina version. Resolve and hydrate only the editable working copy;
  persistence requires an explicit new version.
- Introduce exactly one PI terminal per run: `PREVIEW_READY`, `NO_CHANGE_NEEDED`,
  `BEST_ACHIEVABLE` or `BLOCKED`.

## Evidence artifacts

Captured outside the repository before implementation:

1. `01-ocr-before.png`
2. `02-search-kiwi-zero.png`
3. `03-search-oreo-zero.png`
4. `04-colina-historical.png`
5. `05-colina-optimal-zero-solver.png`
6. `06-colina-eco-zero-solver.png`
7. `07-ocr-owner-28-field-result.png`
   They will be copied into the final staging QA artifact directory together with post-repair served
   screenshots. No screenshot contains a credential or token.
