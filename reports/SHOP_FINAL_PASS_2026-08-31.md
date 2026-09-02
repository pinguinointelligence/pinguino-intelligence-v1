# SHOP — ONE SCREEN, FULL FINAL PASS (2026-08-31)

Scope: `/shop` and its complete purchase and fulfilment flow. Engine, Solver,
formulation mathematics, Mapper science and HOME were not touched.

---

## 1. BEFORE — what was actually there

Audited against the canonical commerce source (the live `shop_products`,
`shop_bundle_items` and `shop_orders` tables), not against the copy.

### 1.1 The Starter Pack was wrong IN THE DATA

`shop_bundle_items` linked `GEL-STARTER-PACK` to the seven **500 g retail SKUs**
at quantity 1. The pack therefore described itself as 7 × 500 g = **3 500 g**,
and the description said „Po 500 g każdy". What Gellatti packs is **1 125 g**:

| Ingredient | Packed |
| --- | ---: |
| Odtłuszczone mleko w proszku | 250 g |
| Dekstroza | 250 g |
| Inulina | 125 g |
| Fruktoza | 125 g |
| Śmietanka w proszku 42% | 125 g |
| Suszone żółtko jaja | 125 g |
| Gellatti Stabilizer | 125 g |
| **Razem** | **1 125 g** |

The presentation then produced a second, visible contradiction: because the SKU
title already carries its retail size, the contents list rendered
**„Dekstroza · 500 g · 250 g"** — two different pack sizes on one line.

### 1.2 An order could not be shipped

`shop_orders` carried **no address, no shipping cost and no tax**, and the
Stripe Checkout session was never asked to collect an address. Whoever packs a
parcel had no destination, and Admin had no way to obtain one without opening
Stripe. Three orders already existed in this state.

### 1.3 Presentation

- The hero's graphite half held a dashed panel whose own copy read
  „Neutralny placeholder / brak zatwierdzonego zdjęcia lub packaging assetu".
- The hero's left half was one line of copy in a 470 px band.
- The Starter Pack was a plain white card with a bullet list — no price
  hierarchy, no reason to buy, no lead-time prominence.
- Product cards put the availability chip beside the title, so a long title
  („Odtłuszczone mleko w proszku · 500 g") pushed the chip onto a second line
  and that card stood taller than the two beside it.
- Allergen statements were buried mid-paragraph in prose.
- The cart was one wide column: quantity as a bare number input, a floating
  „Razem", the sign-in prompt drifting right, and a large empty area.
- The preorder lead time rendered as an orange alert bar above the totals —
  system information, not a fact about the product causing it.
- Returning from payment showed a one-line strip: no order number, no contents,
  no destination, no next step.

### 1.4 Price

`GEL-STARTER-PACK` = **5 900 (€59.00)**, `availability = preorder`,
`lead_time_weeks = 6`. Verified against the commerce source and against the
three existing orders. **Deliberately unchanged** — the owner forbade inventing
a price, and it is referenced by placed orders. The seven 500 g SKUs and their
prices are likewise **untouched**; they are separate articles with their own
authority.

---

## 2. AFTER — what changed

### 2.1 Data (migrations `20260831120000` … `20260831160000`)

- `shop_bundle_items.packed_grams` — what a bundle line actually contains. The
  bundle keeps pointing at the same product rows (that link carries identity and
  canonical ingredient authority); only the packed amount is now explicit.
- `gellatti_shop_catalog_v1` returns the packed grams and a `contentsTotalG`, so
  hero, card and cart cannot disagree about the box.
- The Starter Pack description now states the seven ingredients and 1 125 g.
- `shop_products.allergens` — a labelled field carrying exactly the statements
  the owner had already authored in prose („Zawiera mleko", „Zawiera jaja").
  Null where no statement exists; an article with no data renders **nothing**,
  because „contains no allergens" is a regulatory claim, not a default.
- `shop_orders` gained the destination, `shipping_cents`, `tax_cents`, tracking
  carrier/number, and `shipped_at` / `cancelled_at` / `refunded_at`.
- `gellatti_my_shop_orders_v1` and `gellatti_admin_shop_orders_v1` return all of
  it; `gellatti_admin_shop_order_action_v1` records a shipment and marks it
  shipped in ONE call, stamping `shipped_at` once.

### 2.2 Checkout (`shop-checkout`)

- Collects a shipping address (15 countries) and a phone number.
- One flat courier rate, **€9.90**, with a 2–5 business-day estimate.
- **Duplicate-order guard**: an unpaid order for exactly this cart from the last
  30 minutes returns ITS still-open session instead of minting a second order.
  (Two orders 1.3 s apart already existed in the table.)

### 2.3 Payment reconciliation (`shop-order-sync`)

- Writes the destination, shipping and tax back onto the order, so fulfilment
  never has to open Stripe.
- `paid_at` is stamped **once** — it previously moved on every re-sync and was
  blanked whenever a sync found the order unpaid.
- A **refunded** order can no longer be walked back to `paid` by a re-sync
  (Stripe still reports the session as paid after a refund).
- The address is only overwritten when the session HAS one, so a later sync
  cannot erase the address a parcel is being packed against.
- Returns the whole order, so the confirmation screen can close the purchase
  without a second round trip — the cart is already cleared by then.

### 2.4 Presentation

- **Hero.** The graphite half now PRESENTS the Starter Pack: seven rows, each
  bar drawn to scale against the largest portion, closing on 1 125 g. There is
  no product photography, so instead of announcing the absence the panel shows
  the one thing the shop genuinely owns. The left half carries three commerce
  facts — shipping, lead time, final amount — instead of empty band.
- **Starter Pack as the hero product.** What it is, why these seven (three
  grouped reasons in customer language), allergens, and a buy box with price,
  €/kg over the packed weight, availability with its real lead time, contents
  recap, shipping cost, delivery estimate and one CTA.
- **Cards.** Title, pack size, description, allergen chips, price, €/kg,
  availability and CTA — availability stated ONCE, in the footer beside the
  button, so the header can never wrap and break the row's height. Sold out
  disables the button at `--g-lock` on `--g-line-quiet` (5.03:1, AA).
- **Cart.** Two columns: lines with a real quantity stepper and a remove
  control, and a summary panel that states Produkty / Wysyłka / Do zapłaty. The
  preorder lead time is attached to the LINE that causes it. Empty cart is one
  sentence and one way out, not a large panel of nothing.
- **Confirmation.** Order number, amount paid, destination, contents and three
  next steps — with a distinct screen for pending, failed and cancelled.
- **Customer orders** (`/account`) show destination, shipping cost and tracking.

### 2.5 Admin — the pack-and-ship test

Four derived queues over the lifecycle that already existed, so nothing is
stored twice: **Do wysyłki** (paid, not yet out), **Czeka na zestaw startowy**
(the same, held by a preorder), **Nieopłacone i nieudane**, **Wysłane**. Each
order card answers the four bench questions — what goes in the box, where it
goes, what was paid, and what may be done next — and records carrier + tracking
number in the same action that marks it shipped.

The owner's requested states map onto the existing columns without a new one:

| Requested | Existing representation |
| --- | --- |
| NEW | `status=pending` |
| PAID | `status=paid` |
| TO SHIP | `paid` + `fulfillment ∈ {awaiting, preparing}` + not preorder |
| WAITING-PREORDER | the same + `contains_preorder` |
| SHIPPED | `fulfillment ∈ {shipped, delivered}` |
| CANCELLED | `status=cancelled` or `fulfillment=cancelled` |
| REFUNDED | `status=refunded` |

---

## 3. §7 — what the owner did not list

### Implemented (safe, obvious, inside Shop scope)

Shipping collection · flat shipping rate shown before payment · duplicate-click
and back-button protection · sold-out state · preorder handling attached to its
line · order confirmation · tracking number capture · Admin filtering by
fulfilment state · customer order history with destination and tracking ·
cancelled-checkout screen · failed-payment screen.

### RECORDED — these need a genuine owner/business decision, not a guess

1. **The €9.90 flat shipping rate.** A shop cannot function without one, so a
   single named constant was introduced (`SHOP_SHIPPING_FLAT_CENTS`, mirrored in
   the edge function, with a test that fails if the two ever drift). The VALUE
   is the owner's call, as is whether it should vary by country or weight.
2. **The 15 shipping countries.** Currently PL, ES, DE, FR, IT, PT, NL, BE, AT,
   CZ, SK, DK, SE, FI, IE.
3. **VAT and invoicing.** Stripe Tax is NOT enabled, so the session charges
   exactly items + shipping and returns `amount_tax: 0`. The cart therefore
   states that the amount shown is the amount charged, and shows no VAT line —
   an invented one would be a claim the checkout cannot honour. Open: VAT
   registration, gross vs net pricing, and whether a VAT invoice is issued.
   `tax_cents` is stored and Admin displays it the moment it is non-zero.
4. **Stock handling.** `availability` is a three-state field the owner sets by
   hand. There is no stock count and nothing decrements on an order. Real
   inventory (counts, reservation at checkout, automatic sold-out) is a business
   decision about how Gellatti wants to run the warehouse.
5. **Refunds and cancellations.** `status=refunded` and `refunded_at` exist and
   are respected everywhere, but there is no button that refunds through Stripe;
   a refund is issued in Stripe and reconciled here. Whether Admin should be
   able to refund directly is an owner decision.
6. **Order confirmation email.** Not implemented — no transactional email
   sender is configured for the shop. The confirmation screen states that a
   confirmation goes to the customer's email; the copy should follow whatever
   the owner decides here.
7. **Payment webhook.** Reconciliation is pull-based (verified against Stripe on
   return and from Admin), which is correct and safe. A webhook would also catch
   a customer who pays and closes the tab; that needs an endpoint decision.
8. **Legal/commerce pages** (terms of sale, returns, right of withdrawal) — a
   legal decision, not a code one.

---

## 4. Evidence

See `SHOP_FINAL_PASS_EVIDENCE_2026-08-31.md`.
