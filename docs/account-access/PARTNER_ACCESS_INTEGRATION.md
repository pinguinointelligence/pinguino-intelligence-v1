# Partner Access Integration (Account ↔ Billing/Partner)

How an **approved partner** gets free Home + Pro + Partner mode through the standard account,
without any parallel identity and without touching Billing financial history.

> The partner/affiliate platform (application, approval, tiers, commissions, payouts, invite
> codes, Stripe Connect) lives entirely in **`docs/billing-partner/`** + migrations
> **0016–0021** and `src/billing/domain/*`. Those are **LOCKED / read-only** for Account
> Access. This document only defines the *connection*; it changes none of those rules.
> **Franchise ≠ affiliate partner** — Franchise is a customer account type in the draft pack;
> the affiliate/referral partner is the Billing/Partner program.

## The seam
Billing already defers login/identity to Account Access (see
`docs/billing-partner/IMPLEMENTATION_STATUS.md`). Account Access reciprocates by consuming
Billing's entitlement result — the single object where the two systems meet:

```
partners.status (0016) + partner_applications ─┐
                                               ├─► entitlements rows (0015, source_type=
paid_subscription / admin_grant / invite ──────┘     'approved_partner' | 'paid_subscription' | …)
                                                          │
                          Billing entitlementResolver ────┤  (pure, Billing-owned)
                                                          ▼
   src/services/accountAccess/billingEntitlementBridge.ts  (READ-ONLY map)
                                                          ▼
   src/access/accountAccess/effectiveAccess.ts  (layers account-state / partner-status / admin)
                                                          ▼
                       EffectiveAccess { canHome, canPro, canPartner, allowedModes, … }
```

## Flow
1. User creates / uses a normal Pinguino account (Supabase Auth → internal user id).
2. User has (or submits) a partner application — the existing Billing/Partner workflow
   (`partner_applications`, migration 0016). Account Access does not re-implement this.
3. On approval the Billing/Partner side links the `partners` row to the internal user id and
   writes an `approved_partner` **entitlement** (0015). No €0 Stripe subscription, no 100%
   discount, no fake invoice, no commission from the partner's own free entitlement.
4. The user logs in normally (incl. Google). The account-access resolver reads the
   entitlement rows + `partners.status` and returns `allowedModes = [home, pro, partner]`.
5. Partner mode links to partner analytics **only while** `partners.status = 'approved'`.

## Status gating (enforced in `effectiveAccess.ts`, tested)
| `partners.status` | Home/Pro (if partner-sourced) | Partner mode |
|---|---|---|
| `approved` | granted | granted |
| `under_review` / `rejected` | denied | denied |
| `suspended` | **denied** (unless another source, e.g. a paid subscription, still grants it) | **denied** |
| `terminated` | denied (entitlement removed by Billing; historical financial records preserved) | denied |

A partner who ALSO holds a paid Pro subscription keeps Pro on suspension (multiple sources
are preserved; only the partner-only grants are withdrawn).

## Boundaries
- Account Access never writes `partners`, `entitlements`, commissions or payouts — it reads.
- Suspension/termination of the partner program is a Billing/Partner action; Account Access
  reflects the resulting entitlement/status but does not rewrite financial history.
- Temporary access (invite Home trial, admin grant) uses the same entitlement channel and is
  bounded/expiring — an invite never becomes a permanent role.
