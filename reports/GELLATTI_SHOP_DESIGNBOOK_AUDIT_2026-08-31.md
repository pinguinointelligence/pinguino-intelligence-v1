# SHOP — MASTER DESIGNBOOK AUDIT

Composition target: approved V2.1 Shop screen, `?preview=shop`
(GELLATTI_MASTER_DESIGNBOOK_FINAL.pdf pp. 8–9 desktop, p. 18 mobile).
Measured element-by-element from the live approved preview, not eyeballed.

| Approved element | Current served Shop | PR #49 (before this pass) | Difference | Correction applied |
| --- | --- | --- | --- | --- |
| Hero h1 = **`Gellatti Starter Pack`** | `Sklep` | `Sklep` | Page-led, not product-led | Hero now leads with the product |
| Hero grid 670.94 / 607.05, band 470 px, radius 12 | same (approved component) | same | — | unchanged |
| Hero copy inset 74 px, greige | same | same | — | unchanged |
| Hero media = ivory pack card 260×333, radius 8, 1px white/18%, on graphite | dashed "Neutralny placeholder" panel | **bar-chart specimen** with proportional rails | Designbook forbids "bar charts, dashboard specimens" | `ShopPackShot` — real packaging card, official wordmark asset, live mono caption |
| Hero actions = chip + one primary | none | 3-column fact strip | Not the approved composition | `ShopHeroActions` — availability chip + one graphite CTA |
| Hero note line | none | — | — | Shipping + final-amount note |
| Product card frame: 1px **dashed** `#c9c4bb`, radius 10, warm paper, min-h 230 | plain card, no media | plain card, no media | No product presentation at all | `ShopPackFrame` |
| Pouch inside frame: 118 wide, radius 8 8 14 14, 1px hairline, shadow 0 14 34 /10% | absent | absent | — | implemented |
| Card: title + mono pack size left, chip right | chip beside title (wrapped, uneven heights) | availability in footer | Neither is the approved layout | title + mono size left, chip right |
| Product detail: 2 columns, labelled spec rows, right-aligned mono | absent | buy-box column | Not the approved detail | `ShopStarterPack` — frame left, kicker/name/copy/spec rows right |
| Closing note: 2 px orange left rule on warm paper | absent | absent | — | `shop-closing-note` |
| `.btn` radius `var(--radius)` = **12 px** | 12 px (`applicationPrimaryClasses`) | 12 px | new components used bare `buttonClasses` → **10 px** | unified on `applicationPrimaryClasses` (12 px), pinned by contract |
| Orange = focus, active tab, one CTA, attention | — | orange rails in the specimen | Decorative orange | Orange now only: attention chip, preorder line, closing rule |
| Hamburger LEFT (owner correction B) | LEFT | LEFT | — | unchanged |
| Mobile 390: no overflow | pass | pass | — | pass (`scrollWidth == clientWidth`) |

## States audited

| State | Result |
| --- | --- |
| Signed out | real content, not a gate — sign-in prompt in the cart summary |
| Signed in | checkout CTA replaces the sign-in prompt |
| Empty cart | compact one-line panel + one way out |
| Populated cart | lines + summary panel; preorder attached to the causing line |
| In-stock product | green-outline chip, active CTA |
| Preorder product | attention chip carrying the canonical `lead_time_weeks` |
| Sold out | readable disabled at 5.03:1, never `opacity-45` |
| Payment success / failure / cancelled | distinct confirmation states |
| Admin order + fulfilment queues | four derived queues over the existing lifecycle |

## Verified against canonical sources

- Starter Pack contents 250/250/125/125/125/125/125 g → **1 125 g** (`shop_bundle_items.packed_grams`).
- Individual 500 g SKUs unchanged.
- Price €59.00 unchanged — the value in `shop_products`, referenced by placed orders.
- Lead time **6 weeks** — `shop_products.lead_time_weeks`, Admin-editable, read at runtime, never written into copy.
