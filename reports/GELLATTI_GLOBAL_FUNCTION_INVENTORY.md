# GELLATTI — GLOBAL FUNCTION INVENTORY

Every reachable customer-facing route outside the protected PRO calculation
core, walked as `test1@test1.com` (PRO) and as `admin@admin.com`, against the
staging database. Branch `claude/gellatti-full-app` (base `origin/staging`
1a10f7cf); routes enumerated from `src/app/router.tsx`, not guessed.

Legend — **PASS**: does its job. **FIXED**: was broken or absent, repaired in
this run (commit named). **INCOMPLETE**: still unfinished, with the reason.
**LOG ONLY**: protected core, recorded in `GELLATTI_PROTECTED_CORE_BUGS.md`.

## Public / guest

| ROUTE | STATE | VISIBLE ACTION | EXPECTED PURPOSE | CURRENT RESULT | VERDICT | FIX COMMIT |
|---|---|---|---|---|---|---|
| `/` | guest | Stwórz recepturę · Zobacz jak działa | Landing, one clear entry | Renders; both CTAs route | PASS | — |
| `/start` | guest | flow entry | Customer flow | Renders | PASS | — |
| `/how-it-works` | guest | Wypróbuj Gellatti · Porównaj Home i Pro | Explain the product | Renders, both actions route | PASS | — |
| `/shop` | any | Dodaj do koszyka · Przejdź do płatności | Sell the Starter Pack + 7 articles | Was a placeholder ("Katalog zakupowy nie jest jeszcze dostępny"). Now a real catalogue, cart, Stripe TEST checkout | **FIXED** | `1d28f694` |
| `/franchise` | any | Zapytaj o Franchise → form | Business inquiry funnel | Ended in a `mailto:` link; a lead never reached Admin. Now stores a real inquiry and confirms it | **FIXED** | `04106031` |
| `/work-with-us` | any | Wyślij zgłoszenie · Porozmawiaj z Gellatti · Zobacz Franchise | Cooperation, creators first | Showed four machine/ingredient blocks and **no creator path at all**. Rebuilt: partners and creators own the page and the only complete flow on it | **FIXED** | `04106031` |
| `/subscription` | any | Miesięcznie / Rocznie / Wypróbuj bezpłatnie | Plans | Renders, Stripe TEST checkout reachable | PASS | — |
| `/community` | any | window filters · search · open a recipe | Discovery layer | Renders; published card visible with image and creator attribution; **now keeps the Recipes library strip** | **FIXED** | `04106031` |
| `/top100` | any | Receptury / Twórcy · windows | Ranking | Ranks the single eligible recipe as #1 — truthful rather than empty; **keeps the library strip** | **FIXED** | `04106031` |
| `/creator` | member | creator profile form | Creator identity | Renders and saves | PASS | — |
| `/api` | any | none | Integrations | Renders a heading and **no action whatsoever**. Deliberately unrouted from navigation (owner decision recorded in `router.tsx`: "preserved, but no longer promoted"), so it is not promoted to customers | INCOMPLETE (by owner decision) | — |
| `/classic`, `/demo`, `/customer-v1`, `/studio`, `/calculator`, `/label`, `/my-recipes`, `/profile/machine`, `/pro/machine`, `/pro/settings`, `/pro/history`, `/create-ingredient` | any | — | Legacy addresses keep their meaning | All redirect to their canonical destination with query state preserved | PASS | — |

## Member (Home / Pro)

| ROUTE | STATE | VISIBLE ACTION | EXPECTED PURPOSE | CURRENT RESULT | VERDICT | FIX COMMIT |
|---|---|---|---|---|---|---|
| `/recipes` | member | Moje · Udostępnione mi · Gellatti · Inspiracje · Community · Top 100 · + Nowa receptura | One recipe library | Renders; honest empty state; **Community no longer ejects the customer** | **FIXED** | `04106031` |
| `/products` | member | Skanuj produkt · Rynki · ★ Ulubione · search | Product catalogue | Catalogue and search worked; **★ wrote nothing** — every favourite was refused by RLS. Fixed and served-verified | **FIXED** | `df4f41a7` |
| `/products/scan` | member | Zrób zdjęcie · Dodaj ze zdjęcia · drag-and-drop | Add a commercial product | Intake affordances render; **image-only** — no EAN path. Not exercised (blocker 3) | INCOMPLETE (blocked) | — |
| `/production` | pro | Bieżąca · Historia · Etykiety · Otwórz Gellatti Pro | Production hub | Renders, all four route | PASS | — |
| `/labels` | pro | Edytuj · Uzupełnij N pól | Label workspace | Renders and names exactly which regulatory field is missing | PASS | — |
| `/machine` | member | machine selection | Machine profile | Renders; 12 machines offered; selection persists to the account | PASS | — |
| `/account` | member | Profil · Plan · Język · Bezpieczeństwo · rynki · **Zamówienia** | Account and settings | Signed-out state said "Zaloguj się, aby zarządzać kontem" as **plain text with no way to sign in**; now has the button. Shop order history added | **FIXED** | `1d28f694` |
| `/pro`, `/pro/recipe`, `/pro/monitor`, `/pro/versions`, `/pro/production`, `/pro/costs`, `/pro/exports` | pro | workbench | Protected core | Exercised, never modified | LOG ONLY | — |
| `/partner` | member | 8 workspace sections | Partner workspace | Existed but was unreachable — the only door was an admin invitation, and the gate told an account it lacked an invitation it could not request. Application lane added; gate now says why and what next | **FIXED** | `04106031` |

## Admin (`admin@admin.com`, super_admin)

| ROUTE | VISIBLE ACTION | CURRENT RESULT | VERDICT | FIX COMMIT |
|---|---|---|---|---|
| `/admin` | overview | Renders; correctly refuses a non-admin | PASS | — |
| `/admin/partners` | **applications queue** · invite · activate · codes · links · commissions · Connect | Applications queue added; **Zatwierdź partnera** performs the whole activation in one transaction | **FIXED** | `04106031` |
| `/admin/shop` | article price / availability / preorder lead time / visibility · order queue · Sync ze Stripe · fulfilment | New section | **NEW** | `1d28f694` |
| `/admin/franchise` | lead queue · status transitions · operator note | New section | **NEW** | `04106031` |
| `/admin/users`, `/admin/catalog`, `/admin/revenue`, `/admin/community`, `/admin/product-requests`, `/admin/customer-added-products`, `/admin/operations`, `/admin/audit`, `/admin/settings` | existing operations | Render and act | PASS | — |
| `/products/import` | INTIMPORT | **Excluded from this task by the brief** | NOT TESTED | — |

## Navigation

| ITEM | BEFORE | AFTER |
|---|---|---|
| `Ustawienia etykiety` | Second door into label settings, duplicating the Production/Label experience | **Removed** (owner authorized). Label settings keep working in both surviving places |
| `Community` | **No navigation entry at all**, for any audience | One ecosystem destination for guest, Home and Pro |
| Recipes → Community | Left the Recipes context with no way back | Community and Top 100 keep the library strip; both remain real public routes |

## Mobile — 390 × 844

`/shop`, `/work-with-us`, `/franchise`, `/community`, `/recipes`, `/account`:
`scrollWidth === clientWidth === 390` on every one. **No horizontal overflow.**

---
Generated during the autonomous acceptance run at `df4f41a7`.
