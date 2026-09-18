# SHOP — SERVED QA CLOSURE (2026-09-18)

Owner decision being verified: **the shop is public for everyone; placing an order needs an
active Gellatti HOME or PRO plan — the 0 € PDF included.**

Everything below was executed against the **served** staging deployment, not a local build
and not a preview: `https://staging.pinguinoai.com` (bundle `/assets/index-D5GpW6aN.js`),
shared backend project `tunabqqrwabacxjcxxkz`.

No functional change ships with this document. It is the record of what was tested and what
the server actually answered.

---

## 1. Verdict

| Check | Result |
| --- | --- |
| SHOP PUBLIC | **PASS** |
| GUEST ORDER BLOCK | **PASS** |
| NO-PLAN ORDER BLOCK | **PASS** |
| HOME ORDER | **PASS** |
| PRO ORDER | **PASS** |
| DUPLICATE | **PASS** |
| ACCOUNT ORDER HISTORY | **PASS** |
| PDF HASH | **PASS — 3/3** |
| HISTORICAL ORDER | **PASS** |
| PR #413 | **MERGED + SERVED on staging** |
| PR #416 | **PREPARED / NOT APPLIED** |
| **REAL BLOCKER** | **none** |

## 2. What is served where

| Surface | State |
| --- | --- |
| `origin/staging` (918bead6) | Contains #413's merge commit `25dd54c7` — confirmed with `git merge-base --is-ancestor`. |
| Served staging bundle | Contains the gate sentence and the machine code `plan_required` ⇒ #413 is **served**. |
| Served production (`www.pinguinoai.com`, `/assets/index-yEAiKU4W.js`) | Contains **neither** the sentence **nor** `plan_required`. |
| PR #416 (head `3843f9e0`, CI green) | Open, draft, **not** in `origin/staging`, **not** applied to the shared backend. |

The production line of that table is the whole reason #416 waits: today's production frontend
cannot render a physical `plan_required`, so applying the physical gate to the shared backend
now would turn a clear sentence about plans into a generic error on the live site.

## 3. Document registry as served

`gellatti_shop_document_markets_v1` on staging answers **75 countries / 108 documents /
43 languages**, every row `TEST_ACCOUNTS_ONLY`, every row orderable for the QA account list.
That matches the accepted dataset; nothing was re-pointed to a single global English PDF.

## 4. Test A — guest

- `gellatti_shop_catalog_v1` as `anon` → HTTP 200 with the full product list. The shop is public.
- `gellatti_shop_document_availability_v1` as `anon` → `state: OFF`, `orderable: false`.
- `POST /functions/v1/shop-digital-document {action:"order"}` as `anon` → **HTTP 401 `{"error":"unauthorized"}`**.
- Served UI, signed out (no auth token in storage): `/shop` renders in full — Starter Pack 59,00 €,
  all seven singles with prices and "Dodaj do koszyka", the 0 € infopak offer, nothing hidden,
  no paywall. "Zamów za 0 €" opens the sign-in dialog.
- **Zero orders created.**

## 5. Tests B and E — signed in without a plan (admin@admin.com)

`admin@admin.com` (`cdde5544-3ffa-4e06-a6e1-4079ade8f446`) has no HOME or PRO plan and **is** on
the document QA list, so it separates the two authorities cleanly.

- Shop, catalog, prices and buttons all visible.
- Country Polska, "Zamów za 0 €" → the UI answers with exactly one sentence,
  `role="alert"`: **„Zamawianie w sklepie jest dostępne z aktywnym planem Gellatti HOME lub PRO."**
  plus the existing link "Wybierz plan" → `/subscription`
  (`data-testid` `shop-infopak-plan-required` / `-plans`). No generic error.
- Server: **HTTP 403 `{"error":"plan_required"}`**.
- `gellatti_my_shop_documents_v1` before = `[]`, after = `[]` ⇒ **zero orders created**.
- Refused **although** the account is on the QA availability list ⇒ the plan gate runs **before**
  availability, and **admin has no bypass**. That is the existing test plan's expectation, not a new
  semantic invented here.

## 6. Test C — HOME (home@home.com, plan Home)

Ordered on a **fresh market** so it cannot collide with the earlier BE/nl QA.

| Step | Result |
| --- | --- |
| `/shop`, country Deutschland | "Kraj: Deutschland · niemiecki", order button enabled |
| "Zamów za 0 €" | „Zamówienie przyjęte. Twój infopak jest gotowy." → **G-20260918-EE1F11** |
| Order row | `STARTER_PACK_LOCAL_GUIDE`, DE/de, version 1.0, status **paid**, total **0** EUR |
| Download | `Gellatti-Starter-Pack-DE-de.pdf`, 486 027 B, `%PDF-1.4` |
| Duplicate | second order call → **same orderId**, same number, `created: false` |
| Konto → Zamówienia | "PDF · Niemcy · niemiecki" and "PDF · Belgia · niderlandzki", one row per market |
| After a full page reload | both rows still there, both "Pobierz PDF" still working |

## 7. Tests D and F — PRO and duplicate (test1@test1.com, plan Pro)

`G-20260918-3D18D2` — `STARTER_PACK_LOCAL_GUIDE`, PL/pl, version 1.0, **paid**, 0 €.

A note for the record on how that order came to exist: a guest click on "Zamów za 0 €" arms the
documented one-shot intent (`gellatti.shop.infopakIntent`, sessionStorage, 30 minute TTL, consumed
exactly once — `src/features/shop/infopakIntent.ts`). When the account signed in, the intent
resumed and placed the order. That is the designed behaviour, and the server gate still ran.

Duplicate: a second `{action:"order", STARTER_PACK_LOCAL_GUIDE, PL, pl}` → HTTP 200, **same
orderId** `1d82b842-b6e5-46d7-bd55-1bee8e36b244`, same order number, `created: false`, exactly one
active order for that document, order count unchanged. The idempotency authority is the existing
`on conflict (user_id, document_id) … do nothing` inside `shop_document_place_order`; no second
duplicate logic was added anywhere.

## 8. Test G — historical order

`G-20260917-9F038F` (test1@test1.com, ordered 2026-09-17) is **untouched**:

- still `GELATO_BASE_INGREDIENTS` **version 1.1**, English, no country — it was **not** re-pointed
  to the new per-market local guide;
- still listed in Konto → Zamówienia as "PDF po angielsku" with a working "Pobierz PDF";
- still downloads: `Gellatti-Gelato-Base-Ingredients-EN.pdf`, 2 773 306 B.

It downloads although the account's plan is never consulted on that path —
`gellatti_shop_document_download_v1` reads the order's own document row and never the gate, so a
document ordered with a plan stays downloadable.

## 9. PDF hash — downloaded bytes vs the sha pinned on the order

Pinned values read with `gellatti_admin_shop_documents_v1`; downloaded values computed with
SHA-256 over the bytes the served download link returned.

| Order | Market / version | sha256 (pinned == downloaded) |
| --- | --- | --- |
| G-20260918-EE1F11 (home@) | DE/de 1.0 | `c4f0041acd0d67a4228762610f9da3907ec974de642da64c13e0538048944f7e` |
| G-20260918-3D18D2 (test1@) | PL/pl 1.0 | `e02e8aaaca28dc0c9c1cf05800b79f232e579d86499c27b12101407213a8176e` |
| G-20260917-9F038F (test1@) | — /en **1.1** | `f92262842f56e4b987ee0ba011cbe2420ddd2a6d3d7798dfa8224821912ca2e8` |

Three matches out of three. Two further facts fall out of the same table: pro@'s independent
PL/pl order `G-20260918-AED70D` carries the **same** sha as test1@'s PL/pl order — one registry
file per market, not a per-order render — and the DE, PL and EN files are three **different**
files, so no order fell back to one global English PDF.

## 10. Order table after the run — 5 document orders, no duplicates

| Order | Account | Document | Market | Version | Status |
| --- | --- | --- | --- | --- | --- |
| G-20260918-EE1F11 | home@home.com | STARTER_PACK_LOCAL_GUIDE | DE/de | 1.0 | paid |
| G-20260918-3D18D2 | test1@test1.com | STARTER_PACK_LOCAL_GUIDE | PL/pl | 1.0 | paid |
| G-20260918-AED70D | pro@pro.com | STARTER_PACK_LOCAL_GUIDE | PL/pl | 1.0 | paid |
| G-20260918-C79376 | home@home.com | STARTER_PACK_LOCAL_GUIDE | BE/nl | 1.0 | paid |
| G-20260917-9F038F | test1@test1.com | GELATO_BASE_INGREDIENTS | — /en | **1.1** | paid |

## 11. Nothing was duplicated

Reused, in place, with no second implementation added: the central Billing authority
`gellatti_has_paid_access_v1`, the entitlements it reads, the digital document registry, the
order store, Konto → Zamówienia, the idempotency authority, the PDF download authority. No
`shopEntitlementV2`, no second plan checker, no second order table, no second duplicate logic,
no second registry, no alternate guest or shop flow. The browser never decides a plan: it only
maps the server's machine code to the one sentence.

## 12. #416 — physical and local pack gate

**PREPARED / NOT APPLIED.** It ships in the same window as the production release, after the
#413 frontend reaches production. Until then, local pack and physical checkout are ungated on
the shared backend by design, so an account without a plan can still place those.

Release order, unchanged:

1. confirm the #413 frontend on the production candidate;
2. apply the physical / local-pack gate from #416;
3. production smoke: guest block, no-plan block, HOME, PRO, physical checkout, local pack;
4. confirm the central authority is still `gellatti_has_paid_access_v1`.

Green CI on #416 is not a reason to apply it earlier.

## 13. Not re-verified here

The editorial content of the 108 PDFs — availability, shipping and price wording — was accepted
earlier as non-blocking for acceptance and was not re-audited in this run.
