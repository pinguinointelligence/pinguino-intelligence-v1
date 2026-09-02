# Lost & Legendary product-review visual QA

Captured from the served local runtime on 2026-08-08. Desktop viewport: `1440x900`. Mobile viewport: `390x844`.

## Customer mode

- `inspiration-first-desktop.png`
- `inspiration-first-mobile.png`
- `strawberry-family-desktop.png`
- `strawberry-family-mobile.png`
- `pistachio-family-desktop.png`
- `pistachio-family-mobile.png`
- `country-selector-customer-desktop.png` — zero countries because no candidate is `PUBLISHED`; this is the served proof that ordinary customer mode hides unpublished candidates.
- `protein-filter-mobile.png` — `Proteinowe` selected as product type while all visible cards remain concrete flavour families.

## Explicit owner-review mode

The existing DEV persona control was explicitly changed from Demo to Pro before navigating client-side to `/recipes`. This satisfies the same `useReviewMode` contract used by staging: an allowed environment plus the Pro owner/QA capability.

- `owner-review-pink-desktop.png`
- `owner-review-pink-mobile.png`
- `country-selector-owner-desktop.png`
- `country-selector-owner-mobile.png`
- `authentic-candidate-desktop.png`
- `authentic-candidate-mobile.png`
- `adaptable-candidate-desktop.png`
- `adaptable-candidate-mobile.png`
- `lost-authentic-adaptable-desktop.png`

All owner-review surfaces visibly carry pink `TESTOWE / NIEPRODUKCYJNE`, `RESEARCH` or equivalent pre-publication state. The adaptable candidate visibly separates `Oryginał` from `Adaptacja PINGÜINO`.

The viewport override was reset and the browser QA tab finalized after capture.
