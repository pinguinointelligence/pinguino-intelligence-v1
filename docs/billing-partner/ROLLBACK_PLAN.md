# Billing / Partner Platform — Rollback Plan (§23.3)

Three unbreakable rules, in order:

1. **Flags off FIRST.** Every domain has a feature-flag lever
   (`ENVIRONMENT_VARIABLES.md` §5). Rolling back starts by turning the flag
   off — new activity stops immediately while every existing record stays
   intact and auditable. Schema/data changes come only after the flag is off
   and the blast radius is understood.
2. **NEVER delete financial history.** `commission_entries`,
   `commission_adjustments`, `partner_payouts`, `partner_payout_items`,
   `payout_batches`, `referral_attributions`, `partner_benefit_uses`,
   `partners`, redeemed `invite_codes`, `stripe_webhook_events`, `audit_log`
   and granted `entitlements` are history. Correction is always an appended
   row (adjustment, revocation, status flip) — never UPDATE of financial
   fields, never DELETE. The `drop table` blocks in the migration footers are
   for dev/sandbox only.
3. **Stripe keeps running even when we stop.** Disabling our processing does
   not stop Stripe from charging customers. Any rollback that lasts must
   include a decision about live subscriptions (pause collection / cancel at
   period end — an owner decision, executed via Stripe, never by deleting our
   records).

## Safe-disable order per domain

Each domain lists: lever → what stops → what keeps working → recovery.

### 1. Checkout / catalog (new sales)
- **Lever**: `BILLING_CHECKOUT_ENABLED=false`; optionally set
  `billing_price_catalog.public_enabled=false` per offer (service-role
  update) to pull individual offers from the pricing surface.
- **Stops**: new checkout sessions; the pricing page shows no purchasable
  offers that are disabled.
- **Keeps working**: existing subscriptions, webhook processing, entitlement
  resolution, the customer portal.
- **Recovery**: flip the flag back; re-enable offers. Catalog rows are never
  deleted while any `customer_subscriptions.offer_key` references them.

### 2. Webhooks (event intake)
- **Lever**: disable the event destination in the Stripe dashboard (Nicolas).
  Do NOT delete it — disabled endpoints let events accumulate on Stripe's
  side for later replay.
- **Stops**: cache/ledger updates from Stripe events.
- **Keeps working**: everything already recorded; reads are unaffected.
- **Recovery**: re-enable the endpoint, replay missed events from Stripe;
  `stripe_webhook_events` unique key + re-fetch-current-object handlers make
  replays and out-of-order delivery safe (locked decision 9). The caches
  self-heal on the next event per object.
- **Warning**: while intake is off, `subscriptions`/`customer_subscriptions`
  go stale — grace logic (`past_due` until period end) keeps honest access,
  but do not run tier snapshots or payout batches against stale data.

### 3. Entitlements (access)
- **Lever**: none needed for the resolver (pure code — roll back by revert).
  To withdraw a specific grant: set the entitlement row's
  `status='revoked'` + `revoked_by`/`revoke_reason` (service role) — never
  delete the row.
- **Stops**: the revoked grant only. Resolver semantics guarantee revoking
  one source never hides another.
- **Recovery**: issue a NEW active row (the partial-unique allows it once the
  old one is non-active). History of the revocation stays in `audit_log`.

### 4. Partner program (applications / codes / attribution)
- **Lever**: `PARTNER_PROGRAM_ENABLED=false`.
- **Stops**: new applications, code minting, click capture, NEW attributions.
- **Keeps working**: existing partners' dashboards (read-only state),
  already-locked attributions, commission accrual on already-attributed
  subscriptions (unless also disabled — separate decision).
- **Recovery**: flip the flag. To retire a single partner instead: partner
  `status='suspended'|'terminated'` + code `status='retired'` — rows are
  never deleted (the ledger references them).

### 5. Commission engine
- **Lever**: stop recording (webhook handler feature branch off) — entries
  simply stop being created; OR freeze eligibility by pausing the snapshot
  job.
- **Stops**: new entries / tier snapshots.
- **Keeps working**: existing ledger; partners still see their history.
- **Recovery**: recompute missed entries from `stripe_webhook_events` /
  Stripe invoice history — the `stripe_invoice_id` unique key makes backfill
  idempotent (double-recording is impossible).
- **Never**: edit or delete an entry. Wrong amounts are corrected by an
  appended `commission_adjustments` row (unique `source_event_key` prevents
  double-correction), with `audit_log` reason.

### 6. Payouts (real money transfers — most critical)
- **Lever**: `PARTNER_PAYOUTS_ENABLED=false` — the monthly job refuses to
  start. This is the FIRST switch to throw in any billing incident.
- **Stops**: new batches and new Stripe transfers.
- **Keeps working**: ledger accrual, partner visibility of eligible balances
  (they simply carry forward — that is designed behavior, threshold logic
  already carries balances).
- **Recovery**: re-enable and run the batch: `payout_batches` unique
  `(month, currency, livemode)` + payout `idempotency_key` + globally-unique
  payout items guarantee a resumed/re-run month can never pay twice.
- **A transfer already sent in error**: reverse via Stripe transfer reversal
  (Nicolas/owner) and record a manual `commission_adjustments` row + audit
  entry. Never delete the payout row.

### 7. Invite codes
- **Lever**: `INVITE_CODES_ENABLED=false` (stops mint, rotate AND redeem).
- **Stops**: new invites and redemptions.
- **Keeps working**: already-granted trial entitlements run to their
  `ends_at` (or revoke them individually per domain 3 if the incident
  requires it).
- **Recovery**: flip the flag. To recall unredeemed codes: `status='revoked'`
  (the partial unique frees the slot for a fresh code). Redeemed codes are
  history — they justify granted entitlements and are never deleted.

### 8. Schema rollback (last resort, dev/sandbox only)
- Every migration file ends with a commented, ordered `drop` plan. Reverse
  dependency order across files: 0021 → 0020 → 0019 → 0018 → 0017 → 0016 →
  0015 → 0014.
- In production, tables are NEVER dropped once financial rows exist. The
  supported "off" state for an unused domain is: flags off + RLS-closed
  tables sitting idle (they cost nothing).
- Migrations 0001–0013 are untouched by this slice; 0003's `subscriptions`
  cache keeps working with zero changes even if ALL 0014+ tables are ignored
  — the platform is additive by construction.

## Incident quick card

| Symptom | First action |
|---|---|
| Wrong charge / wrong price live | `BILLING_CHECKOUT_ENABLED=false`, pull offer via `public_enabled=false`, fix catalog + Stripe price, validate, re-enable |
| Commission amounts wrong | `PARTNER_PAYOUTS_ENABLED=false` (stop money out), append adjustments, re-enable |
| Attribution dispute / fraud | revoke the attribution row (status flip), commissions stop accruing; already-paid entries get adjustments |
| Webhook handler crash-looping | disable endpoint in Stripe, fix, re-enable, replay (dead_letter rows list what needs attention) |
| Invite leaked publicly | `INVITE_CODES_ENABLED=false`, revoke open codes, rotate |
