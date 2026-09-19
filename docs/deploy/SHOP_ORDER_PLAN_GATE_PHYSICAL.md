# Shop order gate — physical orders (PREPARED, NOT APPLIED)

Owner decision 2026-09-18: **PUBLIC VIEW for everyone, ORDER only with an active HOME or PRO plan**, for the whole
shop. The 0 € PDF gate is live (`shop_document_place_order`, migration `20260918072510`). This package does the same
for the two physical order paths. It goes out **with the production release**, not before.

| Path              | Creates                                                                 | Gate                                                                                                |
| ----------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `shop-checkout`   | a `PHYSICAL` order, its items and a Stripe Checkout Session             | `decideShopOrderPlan` right after the JWT, before the body, the catalogue, the order row and Stripe |
| `shop-local-pack` | the default address and a 0 EUR `LOCAL_STARTER_PACK` order, then a mail | `decideShopOrderPlan` right after the JWT, before the body, the address, the order row and the mail |

Both ask `supabase/functions/_shared/shopPlanGate.ts`, which asks the existing Billing authority
`gellatti_has_paid_access_v1`. No plan name, price id, e-mail, test role or shop-owned list is read. The gate fails
closed: an unreachable authority answers `503 plan_check_failed`, and a missing plan answers `403 plan_required`.
Settlement paths (`stripe-webhook`, `shop-order-sync`) only update existing orders and are not gated.

## Why it is not applied yet

Staging and production share one backend, and these functions serve www.gellatti.com today. The production frontend
(main) does not know `plan_required` yet and would show a raw error. The frontend that does know it is PR #413: the
cart and the local pack page show „Zamawianie w sklepie jest dostępne z aktywnym planem Gellatti HOME lub PRO.” and
„Wybierz plan” (`/subscription`).

## Release order

1. Production frontend with #413 is live on www (staging → main, served SHA verified).
2. Confirm that the live source of both functions equals the release base, so only the gate ships:
   `supabase functions download shop-checkout --project-ref tunabqqrwabacxjcxxkz --use-api`, then the same for
   `shop-local-pack`, then diff each against the release base.
3. Deploy both functions from this package:
   `supabase functions deploy shop-checkout shop-local-pack --project-ref tunabqqrwabacxjcxxkz --use-api`.
   Keep `verify_jwt` on, then download both again and diff them against the package.
4. Direct API checks (no UI). Each call is a signed-in POST with a valid body:

| Account              | `shop-checkout`       | `shop-local-pack`                                          | Also verify                                                    |
| -------------------- | --------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| no JWT               | 401                   | 401                                                        | —                                                              |
| admin@ (no HOME/PRO) | 403 `plan_required`   | 403 `plan_required`                                        | no new `shop_orders` row, no Stripe session, address unchanged |
| home@ (HOME)         | 200 with a Stripe URL | passes the gate: 200, or the country's own business answer | cancel the pending test order afterwards                       |
| pro@ (PRO)           | same as HOME          | same as HOME                                               | —                                                              |

5. In the browser: without a plan, the cart shows the plan sentence and the link. With HOME/PRO, checkout opens.

## Rollback

Code only; there is no database change to undo. Redeploy the previous source of both functions:

```bash
git checkout <release-base> -- supabase/functions/shop-checkout supabase/functions/shop-local-pack
supabase functions deploy shop-checkout shop-local-pack --project-ref tunabqqrwabacxjcxxkz --use-api
```

Orders created while the gate was live stay valid. The frontend's `plan_required` handling is harmless without the
gate, because it only reacts to that code.
