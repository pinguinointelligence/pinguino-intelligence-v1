# SHOP — WHERE THE CURRENT COMMERCE VALUES COME FROM

Written so no later reader mistakes a staging test value for business policy.
**None of the values below are owner-approved production policy.**

## Shipping — €9.90 flat (S-40 · BLOCKED, owner/business decision)

| | |
| --- | --- |
| Origin | Introduced by Claude on 2026-08-31 so the checkout could function at all. A shop cannot take an order without a shipping charge. |
| Owner input | **None.** The number was never chosen by the owner. |
| Where it lives | `SHOP_SHIPPING_FLAT_CENTS = 990` in `src/features/shop/shopShipping.ts` (cart display) and in `supabase/functions/shop-checkout/index.ts` (what the provider actually charges). `shopShipping.test.ts` fails if the two ever drift apart. |
| Where it is stored per order | `shop_orders.shipping_cents`, written back from the provider — so a historical order keeps the rate it was actually charged, not today's constant. |
| Status | **Sandbox/staging test value only.** |

### Destinations — 15 countries (S-40 · BLOCKED)

`SHIPPING_COUNTRIES` in `shop-checkout`: PL, ES, DE, FR, IT, PT, NL, BE, AT, CZ,
SK, DK, SE, FI, IE. Chosen by Claude as a plausible EU set. **No owner input.**

### What the final policy will need

The architecture already supports more than a flat rate without a rewrite:
Stripe `shipping_options` accepts several `shipping_rate_data` entries, and the
order stores the charged amount rather than deriving it. Weight- or
country-banded rates, free-shipping thresholds and multiple named services can
be added as additional options. **Nothing needs restructuring — only the policy
values need deciding.**

## Tax — `tax_cents = 0` (S-41 · BLOCKED, owner/legal decision)

| | |
| --- | --- |
| Origin | Not a decision at all. Stripe Tax is **not enabled** on the account, so the session returns `total_details.amount_tax = 0` and the order stores exactly that. |
| Consequence today | The customer pays exactly items + shipping. The cart therefore states that the amount shown is the amount charged, and publishes **no VAT line** — an invented one would be a claim the checkout cannot honour. |
| Where it is stored | `shop_orders.tax_cents`, written back from the provider. Admin already displays it the moment it is non-zero. |
| Status | **Sandbox/staging reality, not policy.** |

### Open legal questions

VAT registration and the countries it covers · whether listed prices are gross
or net · whether a VAT invoice is issued and by what numbering · OSS/IOSS
handling for cross-border EU sales · the legal seller identity shown at
checkout.

### What the final policy will need

Enabling Stripe Tax populates `amount_tax` through the same field the order
already reads and Admin already renders. **No checkout restructuring** — but the
customer-facing cart copy must change at the same moment, because the current
"nothing is added at payment" line stops being true.

## Stock and lead time (S-42 · BLOCKED, owner inventory authority)

| Fact | Determined by | Owner authority needed? |
| --- | --- | --- |
| in stock / on order / unavailable | `shop_products.availability`, a three-state field set by hand in Admin | No — the operator sets it today |
| lead time | `shop_products.lead_time_weeks` (Starter Pack = **6**), Admin-editable, read at runtime and never written into copy | No — canonical and operator-controlled |
| how much is on hand | **nothing** — there is no stock quantity anywhere | **Yes** |
| whether an order decrements anything | **nothing** | **Yes** |
| when a preorder becomes shippable | the operator moving the order to `preparing` | No — but see below |

The preorder hand-off deliberately uses the operator's own existing transition
rather than an invented stock rule: `awaiting` means untouched, `preparing`
means an operator has the goods in hand, so a preorder order in `preparing`
joins the packing bench. **No stock counts were invented.** Real inventory —
counts, reservation at checkout, automatic sold-out — remains an owner decision.

## Email (S-29 · BLOCKED, dependency)

Audited 2026-08-31 across `supabase/functions/**` and `src/**`: **no email
provider, no shared mail module, no email job.** Partner and Home invites ride
Supabase Auth's own mailer, which is not a Gellatti transactional sender.

The Shop therefore makes **no email promise** — the confirmation points at the
order history, pinned by a contract test. When the shared canonical email-job
architecture exists, the Shop should emit its business events into it rather
than growing a Shop-specific provider.
