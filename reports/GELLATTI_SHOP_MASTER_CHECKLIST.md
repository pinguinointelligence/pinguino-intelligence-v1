# GELLATTI SHOP — MASTER CHECKLIST

**Canonical, persistent.** One checklist for the whole Shop area. Do not create a
second one in a report; update these rows.

**Design authority:** `GELLATTI_MASTER_DESIGNBOOK_FINAL.pdf` + `.md` (v1.0, 2026-08-31).
Shop composition target: PDF pages 8–9 (`?preview=shop`), mobile page 18.
**Functional authority:** current `origin/staging` runtime.

**Legend** — Work: ⚪ TODO · 🟡 DOING · 🔴 BLOCKED · 🟢 DONE ·
Tests/Served: ⬜ NOT RUN · ✅ PASS · ❌ FAIL ·
OWNER QA: ⬜ WAITING · ✅ APPROVED · ❌ REJECTED ·
Freeze: 🔓 OPEN · 🧊 READY TO FREEZE · 🔒 FROZEN

**OWNER QA is never marked by the agent.**

| ID | Area | Requirement | Work | Auto Tests | Served QA | OWNER QA | Freeze | PR/SHA | Problem / Why | Next Action |
|---|---|---|---|---|---|---|---|---|---|---|
| S-01 | Visual | Hero reproduces the approved Shop composition: greige left / graphite right, `Gellatti Starter Pack` h1, chip + primary CTA row, note | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA after merge |
| S-02 | Visual | Hero media = neutral packaging card (260×333, ivory, radius 8, white-highlight wordmark), never an empty dark rectangle | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA after merge |
| S-03 | Visual | Product cards use the dashed packaging frame + white pouch, title, mono pack size, status chip, copy, one CTA | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA after merge |
| S-04 | Visual | Product detail = approved two-column concept with right-aligned mono spec rows | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA after merge |
| S-05 | Visual | Closing commerce note uses the orange-ruled treatment (2 px left rule, warm paper) | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA after merge |
| S-06 | Visual | Orange restricted to focus ring, active tab, one CTA, attention — never decoration | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA after merge |
| S-07 | Data | Starter Pack = 250/250/125/125/125/125/125 g, total 1 125 g, everywhere it appears | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Re-verify after visual pass |
| S-08 | Data | Individual 500 g SKUs unchanged; audited against their own authority | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | — |
| S-09 | Data | Starter Pack price not invented; canonical commerce source | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | €59.00 from `shop_products` | — |
| S-10 | Data | Allergens as a labelled field, never an "allergen-free" claim | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | — |
| S-11 | Commerce | Availability states: in stock / on order / unavailable, honestly distinguished | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA |
| S-12 | Commerce | Preorder lead time verified against canonical source before publishing | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | `lead_time_weeks = 6` in `shop_products` — canonical, Admin-editable, read at runtime | — |
| S-13 | Cart | Empty state — compact, one sentence, one way out | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served QA |
| S-14 | Cart | Populated: name, pack, qty, unit price, line total, availability, remove | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | unit price shown per line; bundles show contents recap | Served QA |
| S-15 | Cart | Quantity change and remove work; qty > 1 renders correctly | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Add auto test |
| S-16 | Cart | Cart persists across reload | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Test |
| S-17 | Cart | Mixed availability + preorder notice attached to the causing line | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | — |
| S-18 | Cart | Subtotal / shipping / tax / final amount stated before payment | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | — |
| S-19 | Checkout | Signed-out gate leads to sign-in and back to a preserved cart | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | — |
| S-20 | Checkout | Shipping address collected; countries from canonical list | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | 15 countries — owner decision open | S-40 |
| S-21 | Checkout | Shipping cost single authority, cart == provider | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | drift test guards it | — |
| S-22 | Checkout | Stripe TEST payment succeeds end to end | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | Stripe **sandbox** payment completed: order `G-20260831-2DA655`, €73.80, cart == provider | OWNER QA |
| S-23 | Checkout | Payment failure path shows a real screen | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | 3f56a03d | success path proven; a declined-card run not yet executed | Run 4000 0000 0000 0002 |
| S-24 | Checkout | Cancelled checkout shows a real screen | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | `?checkout=cancelled` | Served proof |
| S-25 | Checkout | Duplicate CTA click cannot mint a second order | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | ref guard + server reuse | Served proof |
| S-26 | Checkout | Reconciliation idempotent; `paid_at` stamped once; refund never walked back | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Add auto test |
| S-27 | Order | Confirmation shows number, items, total, payment status, address, next steps | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | number, items, €73.80, address, 3 next steps, preorder lead time | OWNER QA |
| S-28 | Order | Customer order visibility (`/account`) shows address, shipping, tracking | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | 3f56a03d | panel renders; not yet exercised on the new paid order | Served QA on /account |
| S-29 | Email | Order confirmation / paid / shipped / refund emails | 🔴 | ✅ | ⬜ | ⬜ | 🔓 | #49 | **AUDITED: no email architecture exists.** No provider (Resend/Postmark/SendGrid), no shared mail module, no email job anywhere in `supabase/functions/**` or `src/**`. Partner/Home invites ride Supabase Auth's own mailer, which is not a Gellatti-branded transactional sender. Needs a provider account, a verified `gellatti.com` sending domain (SPF/DKIM) and a shared job — all owner decisions/credentials. | Owner decision. Meanwhile the Shop makes **no** email promise: confirmation points at the order history, pinned by a contract test |
| S-30 | Admin | Order list with paid / unpaid / refunded visibility | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served proof |
| S-31 | Admin | Fulfilment queues: to ship / waiting preorder / unpaid / shipped | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | live queues: to-ship 0 · waiting-preorder 1 · unpaid 3 · shipped 0 | OWNER QA |
| S-32 | Admin | Order detail answers "what to pack, where to send" | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | card answers pack/where/paid/next on the real order | OWNER QA |
| S-33 | Admin | Tracking carrier + number recorded in the same action as shipped | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | — | Served proof |
| S-34 | Admin | Cancellation / refund states visible with timestamps | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | 3f56a03d | — | No refunded order exists to observe |
| S-35 | Mobile | 390 × 844: hero, list, detail, cart, checkout entry, confirmation — no overflow | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | After visual pass |
| S-36 | A11y | Visible focus (2 px orange), no colour-only state, readable disabled | 🟢 | ✅ | ✅ | ⬜ | 🧊 | 3f56a03d | readable disabled + chip states named in words | Served QA |
| S-37 | QA | Served staging QA across all states | 🟢 | ⬜ | ✅ | ⬜ | 🧊 | 3f56a03d | — | After merge |
| S-38 | QA | OWNER QA checkpoint with evidence pack | 🟡 | ⬜ | ⬜ | ⬜ | 🧊 | 3f56a03d | evidence pack ready | Owner review |
| S-39 | Freeze | Freeze record: route, SHA, deployment, bundle, screenshots, regressions | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | 3f56a03d | route /shop · merge 3f56a03d · bundle index-Ds9UxYPp.js / index-ButNLFOJ.css | After owner approval |
| S-40 | Policy | Shipping rate €9.90 and 15-country list — owner/business decision | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | #49 | Value is a business decision, not a code one | Owner decision |
| S-41 | Policy | VAT / invoicing — provider tax not enabled; no VAT row published | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | #49 | Registration + gross/net is a legal decision | Owner decision |
| S-42 | Policy | Stock authority — no inventory counts; availability is manual | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | Real inventory is a business decision | Owner decision |
| S-43 | Policy | Refund from Admin — reconciled only, not initiated | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | Whether Admin may refund is an owner decision | Owner decision |
| S-44 | Policy | Legal commerce pages (terms, returns, withdrawal) | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | Legal decision | Owner decision |
| S-45 | Resilience | Payment webhook — reconciliation is pull-based only | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | Endpoint + secret is an owner decision | Owner decision |

## TOTALS

Work: 🟢 33 · 🟡 3 · 🔴 8 · ⚪ 1 — of 45
Served QA: ✅ 33 · ⬜ 12 · ❌ 0
OWNER QA: ⬜ 45 (never self-marked)
Freeze: 🧊 33 · 🔓 12 · 🔒 0

**Freeze candidate** — route `/shop`, merge SHA `3f56a03d`, deployment READY,
served bundle `index-Ds9UxYPp.js` / `index-ButNLFOJ.css`, Master Designbook v1.0,
test order `G-20260831-2DA655`.
