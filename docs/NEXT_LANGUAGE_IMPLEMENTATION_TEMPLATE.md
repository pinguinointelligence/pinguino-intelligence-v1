# Gellatti — next-language implementation template

The workflow for adding ANY new locale after the owner-locked Polish baseline
(see `OWNER_LOCKED_LANGUAGE_PL.md`). Follow it in order; every gate is a hard
gate, not a preference.

**Language authority:** `GELLATTI_APPLICATION_COPY_MASTER_MULTILANGUAGE_FINAL_SAFE.xlsx`
(occurrence-level, audited against the TypeScript AST).
**Functional authority:** the latest `origin/staging`.
**Visual authority:** the current owner-approved design.

Never use the V1 workbook, the V2 workbook, the old 983-row manifest, or any
`OWNER_STATUS` column as translation authority.

---

## 0. Prepare

```bash
git fetch origin staging
git worktree add -b claude/language-<locale> ~/Developer/pinguino-language-<locale> origin/staging
cd ~/Developer/pinguino-language-<locale> && npm ci
```

A clean worktree at the CURRENT staging SHA. Never an old worktree, never a
feature branch as the implementation base.

## 1. Choose the target locale

Add it to the presentation-layer registry only:

- `src/copy/locale.ts` → extend `AppLocale` and `SUPPORTED_LOCALES`.
- `REFERENCE_LOCALE` / `FALLBACK_LOCALE` stay `'pl'`. A missing resource must
  degrade to correct Polish, never to a blank screen or a raw contract code.

Nothing outside `src/copy/locale.ts` and the locale resources may change.

## 2. Translate only the SAFE VISIBLE rows

From the workbook, filter `FINAL_ACTION` to:

| FINAL_ACTION | What to do |
|---|---|
| `TRANSLATE_VISIBLE` | translate normally |
| `TRANSLATE_VISIBLE_PROTECTED` | translate wording, preserve exact technical/regulatory meaning and every token in `preserve_tokens` |

Fill `TARGET_LANGUAGE` and `TARGET_TRANSLATION` in the workbook (or a copy of
it). Do **not** touch any other row class.

Rows that are `MIXED_OCCURRENCE_POLICY` must never be replaced globally by
string or `copy_id` — work them occurrence by occurrence from the
`OCCURRENCE POLICY FINAL` sheet.

## 3. Create the target display maps

Every `DISPLAY_MAP_ONLY` row keeps its RAW SOURCE VALUE byte-exact and gains a
localized label. Follow the existing convention (`src/copy/locale.ts` rules 1–2):

- keyed BY the raw contract value, e.g.
  `productProfileStatusLabelPl('PI Verified')`, `engineDisplayLabelPl`,
  `scaleMessagePl`, `productionRescueErrorMessagePl`, `branchCodeLabelPl`;
- a new locale adds a sibling map or a locale-keyed record — it NEVER edits the
  key;
- unmapped codes fall back to the raw value (visible-but-harmless), never throw.

Whole copy modules follow the `CommunityCopy` pattern: one `interface`, one
complete object per locale, one resolver, plus a source test asserting both
objects carry identical key sets.

## 4. Preserve NEVER / KEEP / REGULATORY

| Class | Rule |
|---|---|
| `NEVER_TRANSLATE_SOURCE` | source value unchanged — enums, statuses, object keys, DB/API values, routes, CSS/Tailwind, parser tokens, IDs, ProductBehavior codes |
| `KEEP_EXACT` | approved brand / machine model / technical abbreviation stays exact in every locale (Gellatti, Pro, Partner, Community, Gelato, Sorbet, EAN, SKU, POD, PAC, NPAC, ECO, OPTIMAL, QR, PDF, …) |
| `REGULATORY_PROFILE` | wording belongs to the market/legal profile (`src/features/master-label/marketProfiles.ts`, `renderers/*`), NOT the app locale — a Polish or German UI still prints the US `Nutrition Facts` panel in its legally required wording |
| `INTERNAL_EXCLUDE` | never exposed as customer copy |
| `REVIEW_REQUIRED` | never auto-translated; re-confirm against source first |

Dynamic data is never translated: canonical Mapper/PI-ING identity and technical
values, commercial brand and product names, machine names/models, and
user-entered recipe/profile titles. Localize those only through display aliases.

## 5. Placeholder validation (hard gate)

Placeholders must be byte-equivalent between source and translation — none
missing, none renamed, none added. Order may change, the set may not.

```
placeholder failures = 0
```

## 6. Functional-contract safety gate (hard gate)

Before applying any edit, prove the string is not a contract. For each candidate
check the whole repo for the literal and reject it when it is:

- compared (`===`), switched on, part of a union type, or an object/map key;
- a CSV/workbook column header, DB field, API value, route, storage key;
- asserted in a test as a contract value.

Recorded precedents from the Polish pass (all correctly refused):
`'Ingredients English'` / `'Ingredients Original'` (INTIMPORT CSV headers),
`'PI Calculated' | 'PI Generated' | 'Manual Adjusted' | 'PI Verified'`
(`CustomerStatusLabel` union + `productProfileStatusLabelPl` switch),
`'Protein Gelato'` (`mapProductProfile` lookup key).

```
functional source mutation risks = 0
```

## 7. Focused tests

```bash
npx vitest run src/copy src/features/master-label src/features/optimization \
  src/data/products src/features/recipe-score
```

Then the full suite. Never weaken an assertion to make a translation pass: when
a display string changes, update the assertion to the NEW display string so the
test keeps proving the same thing.

```bash
npm run typecheck && npm run lint && npm run build && git diff --check
```

## 8. Served crawl

Run the real app and crawl every reachable customer-facing route/state on
desktop AND 390 × 844 mobile: Recipe, Monitor, Production, Label, Products,
product picker, Scanner, Recipes, Account, Machines, Subscription, Community,
Partner, Work with us, Franchise, plus dialogs, sheets, empty states, errors,
blockers, tooltips and `aria-label` / `title` / `placeholder` text.

Record each route/state as `PASS` / `BLOCKED` / `FAIL`. Never fake an
unavailable role or token state — record it as externally blocked.

Leak gate for the target locale:

```
ordinary customer-facing text in another language = 0
```

except `KEEP_EXACT` terms, regulatory-profile wording, commercial/brand names
and user-entered content. If a RAW CONTRACT VALUE is visible, fix the DISPLAY
LAYER — never the contract.

## 9. Staging

```bash
git fetch origin staging   # immediately before push
```

If staging moved, rebase and reapply ONLY the language/display changes, keeping
every newer functional fix. Then commit, push `origin/staging`, and let Vercel
deploy the staging project. Never touch `origin/main`, customer Production, or
Production Supabase.

## 10. Owner acceptance and freeze

Produce `reports/GELLATTI_<LOCALE>_FINAL_SAFE_SERVED_AUDIT.md` and, after owner
acceptance, `docs/OWNER_LOCKED_LANGUAGE_<LOCALE>.md` recording: workbook SHA,
implementation commit, staging deployment id and immutable URL, the locale/
display architecture used, approved exact terms, display maps, regulatory
exclusions and the served audit result.

A frozen locale may not be silently modified by later language work. Polish is
frozen — see `OWNER_LOCKED_LANGUAGE_PL.md`.
