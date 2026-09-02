# Recipe discovery — UX specification

## Entry question

The `/recipes` surface begins with one question: **“Co chcesz zrobić?”**

Three equal editorial decisions follow:

1. **Lost & Legendary** — documented, feasible historical/regional directions.
2. **Natural Icons** — premium modern ingredient-first directions.
3. **Znajdź inspirację** — the 2,500-row inspiration dataset as a discovery tree.

`Moje receptury` remains a direct link. Secondary mobile shortcuts are `Wybierz kraj`, `Zacznij od składnika`, and `Polecane`.

## Information limits

- Maximum six featured choices on an entry level.
- Maximum ten directions inside one ingredient family.
- Primary customer suggestions use at most six concrete flavour families selected dynamically from source popularity. `Proteinowe` is a product-type filter; technical clusters such as `protein`, `aromatic` and `other` remain internal and are not promoted as customer flavour families.
- No 2,500-card dump.
- No mandatory history detail page between card and current `/start` workbench.
- History stays one to three concise sentences; source detail remains internal/docs.

## Mobile-first behaviour

- One-column actions on narrow screens; compact two-column family grid where touch targets remain at least 128 px high.
- Search is immediately visible in ingredient and country discovery.
- Country view is a concise list; public data comes only from `publicCountryNavigation()`.
- Interactive text never relies on colour alone. Every pink state includes a label such as `Research`, `Mapper ready`, or `Wymaga testu`.

## Authentic vs adapted

Authentic cards show `Oryginalna wersja`. Adaptable cards show `Oryginał`, `Adaptacja PINGÜINO`, and the concrete substitution. Only an explicit “Użyj adaptacji” action can continue.

## Handoff contract

The card links to the existing `/start` route with:

- source and stable inspiration/candidate ID;
- canonical product family (`gelato`, `sorbet`, `vegan`, `protein`);
- flavour-defining ingredient intent;
- independently verified canonical Mapper IDs where available;
- explicit adaptation warning.

The URL and runtime intent contain no grams, dose, formula, role or Engine result. The existing PINGÜINO flow remains the only technical formulation owner.

## Readiness and public gate

Explicit owner review may show research and Mapper-ready cards only when the existing review-mode gate resolves true: local DEV or staging with `VITE_DESIGN_REVIEW=1`, plus a Pro owner/QA persona. Cards remain inside the pink `TESTOWE / NIEPRODUKCYJNE` system with stage labels such as `RESEARCH`, `NIEZWERYFIKOWANE PRODUKCYJNIE` and `WYMAGA TESTU`. Production selectors return only fully `PUBLISHED` candidates. At this checkpoint that count is zero, by design.

## Visual language

The surface follows the existing PINGÜINO Studio design system: paper white, charcoal text, ivory editorial image fields, Hanken Grotesk, hairline dividers, small radii and restrained motion. No generic SaaS gradient dashboard, no candy palette, no transformed brand mark.
