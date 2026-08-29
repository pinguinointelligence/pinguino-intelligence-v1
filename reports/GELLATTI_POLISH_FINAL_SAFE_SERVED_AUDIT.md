# Gellatti — Polish FINAL_SAFE served language audit

**Date:** 2026-08-29
**Language authority:** `GELLATTI_APPLICATION_COPY_MASTER_MULTILANGUAGE_FINAL_SAFE.xlsx`
(SHA-256 `c2f84ac15598111a2319b9f45338dba1c81c3a1eeb168057351a783dba71f54f`)
**Functional authority:** `origin/staging` @ `625507e5`
**Branch:** `claude/language-pl-final-safe`
**Served build:** local Vite dev server (`http://localhost:5401`) from the worktree
`~/Developer/pinguino-language-pl-final-safe`

---

## 1. Method

Two independent passes, because a manual crawl alone cannot prove a leak count:

1. **Static AST pass (exhaustive).** Every string node in the repository
   (226 231 nodes across 1 794 `.ts`/`.tsx` files) was extracted with the
   TypeScript compiler and classified by *syntactic context* — JSX text, JSX
   attribute name, object-key path, comparison / switch / union-type position,
   call-expression callee. Visible strings were then tested for English.
   This is the gate that produces the leak numbers below.
2. **Served crawl (confirmatory).** The real application was driven in a browser
   at 1440 × 900 and 390 × 844, walking every reachable customer-facing route
   and reading the rendered text.

## 2. Environment limitation (recorded, not faked)

The local worktree has **no `.env`** (only `.env.example`), so Supabase — auth,
catalog reads, saved recipes, production runs, label persistence, billing — is
not configured. The app says so honestly in the UI
(`Logowanie jest chwilowo niedostępne`, `Zapis nie jest dostępny w tej wersji
aplikacji.`).

Every state that requires a real session, a paid plan or backend data is
therefore **BLOCKED (external)**. No role, token or subscription state was
simulated to make a screen render. The `PERSONA (DEV)` switcher visible on
`/start` is a dev-build affordance and was **not** used to claim paid coverage.

Those states are covered instead by the static AST pass and by the jsdom
render tests (`LabelWorkspace.runtime.test.tsx`,
`BranchWorkflowPreviewPanel.test.tsx`, picker/monitor suites), which render the
gated components directly.

## 3. Route / state results

### Desktop — 1440 × 900

| Route / state | Result | Non-Polish tokens seen | Classification |
|---|---|---|---|
| `/` landing (hero, Monitor demo, 3 steps, Home/Pro, plans, FAQ, footer) | PASS | Gellatti, Home, Pro, Ninja CREAMi, Monitor | KEEP_EXACT |
| `/start` (idea capture, quick start) | PASS | Gellatti, `PERSONA (DEV)` | KEEP_EXACT / dev-only affordance |
| `/how-it-works` (5-step flow) | PASS | Gellatti | KEEP_EXACT |
| `/subscription` (plans, billing toggle, gates) | PASS | Home, Pro, Gellatti Pro, € | KEEP_EXACT |
| `/machine` → machine settings | PASS | — | — |
| `/products` (catalog gate) | PASS | Home, Pro | KEEP_EXACT |
| `/products/scan` (scanner intake) | PASS | Gellatti | KEEP_EXACT |
| `/recipes` (library, tabs, collections) | PASS | Community, Top 100, **Lost & Legendary**, **Natural Icons**, Gelato, Sorbet, Protein | KEEP_EXACT (Gellatti collection/product-line names) |
| `/my-recipes` | PASS | Community, Top 100 | KEEP_EXACT |
| `/top100` (ranking, empty state) | PASS | TOP 100 | KEEP_EXACT |
| `/community` (feed, windows, empty state) | PASS | Community | KEEP_EXACT |
| `/creator` (creator profile form) | PASS | — | — |
| `/partner` (tabs, loading state) | PASS | Partner | KEEP_EXACT |
| `/franchise` (concepts) | PASS | Gellatti, Franchise | KEEP_EXACT (programme name) |
| `/work-with-us` (four collaboration tracks) | PASS | Gellatti | KEEP_EXACT |
| `/account` (profile, plan, language, markets, invite, requests, recipe defaults) | PASS | Gelato, Sorbet, OPTIMAL, ECO, SKU, Ninja CREAMi / Moulinex / Sage / Magimix / Cuisinart / KitchenAid | KEEP_EXACT (terms + machine models) |
| `/pro` (Pro gate) | PASS | Gellatti Pro | KEEP_EXACT |
| `/production` (Pro gate) | PASS | Gellatti Pro | KEEP_EXACT |
| `/labels` (account label profile, batch-label empty state) | PASS | Gellatti Pro, `Unia Europejska · PL` | KEEP_EXACT + fixed this pass |
| `/calculator` (redirects to Pro gate) | PASS | Gellatti Pro | KEEP_EXACT |
| Recipe creation from `/start` (idea → Dalej) | BLOCKED (external) | — | needs Supabase |
| Studio / Monitor / Direction / Apply | BLOCKED (external) | — | needs Supabase + Pro |
| Production run, top-up, completion | BLOCKED (external) | — | needs Supabase + Pro |
| Label editor with real batch data | BLOCKED (external) | — | needs a completed run |
| Product picker with catalog rows | BLOCKED (external) | — | needs Supabase catalog |
| Scanner OCR result / duplicate sheet | BLOCKED (external) | — | needs upload + backend |
| Community publish / share / rate | BLOCKED (external) | — | needs auth |
| Partner earnings / payouts / links | BLOCKED (external) | — | needs Partner role |
| Subscription checkout | BLOCKED (external) | — | needs Stripe session |
| `/admin` | BLOCKED (external) | — | admin role |

### Mobile — 390 × 844

| Route / state | Result | Notes |
|---|---|---|
| `/start` | PASS | same copy, mobile shell, drawer trigger `Otwórz menu` |
| `/labels` | PASS | `Unia Europejska · PL` renders localized |
| `/recipes` | PASS | collection names as above |
| `/products/scan` | PASS | capture affordances Polish |
| `/` landing | PASS | identical copy |
| authenticated/paid states | BLOCKED (external) | same reason as desktop |

## 4. English-leak gate

Measured by the exhaustive AST pass over the whole repository, restricted to
strings proven **visible** (JSX text/assembly, visible or ARIA attributes, copy
keys) and excluding tests, `/dev/*`-only surfaces, unrouted galleries, engine/
spine diagnostics and the regulatory renderers.

| | Before | After |
|---|---|---|
| Visible English leak occurrences | **126** | **0** |
| Unique visible English strings | **113** | **0** |

Everything the scanner still reports (17 occurrences / 12 unique) was inspected
in source and is **not** a leak:

| Residual | Classification | Evidence |
|---|---|---|
| `reason: 'cancelled'` ×4 (`ocrEngine.ts`) | contract code | paired with `message: 'OCR anulowano.'` |
| `'account'` ×2 | contract code | argument of `customerErrorMessage(err, 'account')` |
| `'failed'` (`billingCheckout.ts`) | contract code | `{ ok: false, reason: 'failed' }` |
| `'label'`, `'settings'` (`LabelWorkspace`) | view IDs | `['label', 'Etykieta']` id+display tuples |
| `'profile'` (`LabelWorkspace`) | field code | `['profile', …].includes(item.field)` |
| `'list'` | ARIA value | `aria-autocomplete="list"` |
| `'owner-review@pinguino.local'` ×2 | dev identity | DEV persona preview only |
| `'102 × 152 mm · 4 × 6 in'` | units | KEEP_EXACT |
| `'value · provenance · confidence'` | internal | `EvidenceReviewPanel`, imported only by `pages/dev/OcrIntakePage` |
| `'Status kanoniczny'`, `'Status danych produktu: {name}'` | already Polish | scanner false positive on the loanword *status* |

Approved non-Polish that remains by design: `KEEP_EXACT` terms (Gellatti, Home,
Pro, Partner, Community, Gelato, Sorbet, Protein, EAN, SKU, POD, PAC, NPAC, ECO,
OPTIMAL, QR, PDF, GTIN, LOT-as-data), machine brand/model names, the Gellatti
collection names **Lost & Legendary** and **Natural Icons**, regulatory-profile
wording (US `Nutrition Facts` and the market renderers), and user-entered content.

## 5. Fixes applied this pass

37 automated occurrence-level replacements from the workbook + 24 hand-verified
edits. Highlights:

- Owner decisions: `World / Universal` → **Świat / Uniwersalna** (raw `WORLD`
  code untouched); visible `LOT` → **Nr partii** (×3, `lot` data semantics
  untouched); admin request tabs → **W trakcie weryfikacji / Wysłano ponownie /
  Odrzucone / Duplikat / Anulowane**.
- Market profile labels localized (`label` field only, `code` untouched):
  **Unia Europejska, Wielka Brytania, Stany Zjednoczone, Kanada** — joining the
  already-Polish *Australia / Nowa Zelandia* and *Świat / Uniwersalna*.
- Label workspace: `Prepacked` → *Produkt paczkowany*, `Northern Ireland` →
  *Irlandia Północna*, `Great Britain` → *Wielka Brytania*, `Canada FOP` →
  *FOP (Kanada)*, `Packaged retail / interstate commerce`,
  `Canadian NFT format`, `Canadian reference-amount category`,
  `FOP / exemption`, `Pop / bar / cup · 75 mL`, `Retail / konsumencka` →
  *Detaliczna / konsumencka*.
- Branch workflow previews (Pro): every observation option, checkbox label,
  placeholder, disclaimer and status label; `Stock Shortage` → *Brak w
  magazynie*; the half-translated `Verified substitute podgląd requires …`
  sentence completed.
- New **display map** `branchWorkflowLabels.ts` so IF9/IF10 spine codes
  (`rescue_same_target_batch`, `weigh_actual_batch_g`, …) render Polish while the
  raw contract values stay byte-exact.
- OCR engine, optimize worker, mapper search and catalog panel messages;
  `RecipeAxisScale` aria-label; missing Polish diacritics in
  `productWorkingValues.ts`.

## 6. Refused changes (functional contracts — no business-logic diff)

Proven by a repo-wide safety gate before any edit; each would have broken code:

| String | Why refused |
|---|---|
| `'Ingredients English'`, `'Ingredients Original'` | INTIMPORT **CSV column headers** — read as `source['Ingredients English']` (`intimport.ts:321/323`), written by `intimportWorkbook.ts` |
| `'PI Calculated'`, `'PI Generated'`, `'Manual Adjusted'`, `'PI Verified'` | members of the `CustomerStatusLabel` **union type**, switch-matched in `productProfileStatusLabelPl` — the Polish display map already exists and is applied at every render site |
| `'Verified'` (`indicatorSeparation.ts`) | reserved contract label; `dataConfidence()` has no render consumer |
| `'Protein Gelato'` (`productProfiles.ts`) | **lookup key**: `mapProductProfile('Protein Gelato')` |
| `'Fantasy'` (`RecipesHubPage`) | owner-review-only surface + product-line name |

These are corrections to the workbook itself — it had classified them
`TRANSLATE_VISIBLE`. They are listed for the owner in
`docs/OWNER_LOCKED_LANGUAGE_PL.md`.

## 7. Gates

| Gate | Result |
|---|---|
| Placeholder failures | **0** (every replacement placeholder-set compared before applying) |
| Functional source mutation risks | **0** (5 contract strings refused, 8 occurrences) |
| CSS/Tailwind translated | **0** |
| Enum / status / key / id / route translated | **0** |
| Visible English leaks (customer-facing) | **0** |
| Business-logic diff | **0** — only display strings, one new display-map module, one locale registry |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors; 4 pre-existing `react-refresh` warnings in untouched files) |
| Focused suites (master-label, optimization, copy, recipe-score, products) | PASS |
| Full suite | see §8 |

## 8. Test evidence

- `src/features/master-label` — 14 files / 160 tests PASS
- `src/features/optimization` — 13 files / 234 tests PASS
- New: `src/copy/locale.test.ts`, `src/features/optimization/branchWorkflowLabels.test.ts`

No assertion was weakened. Where a display string changed, its assertion was
updated to the **new** display string so the test still proves the same thing
(e.g. `LabelWorkspace.runtime.test.tsx` keeps its negative assertion, now on
`Nr partii · nadawany automatycznie`).
