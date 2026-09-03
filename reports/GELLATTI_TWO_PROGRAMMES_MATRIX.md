# GELLATTI — THE TWO REFERRAL PROGRAMMES

Recovered from canonical authority on 2026-09-03. Nothing here is inferred from
memory or from UI copy; every row cites the file that decides it.

**They are not one programme.** They share no tables and meet at exactly one
point, which is a refusal.

---

## Comparison matrix

| | **A — PARTNER / AFFILIATE** | **B — ORDINARY REFERRAL ("Poleć Gellatti")** |
|---|---|---|
| **Trigger** | Partner link click or explicit partner code, then a commissionable payment | Referred user claims a user code, then makes their FIRST paid purchase |
| **Customer benefit** | **15 months for the price of 12** (= 3 additional months), annual only | **NONE.** The invited customer receives nothing |
| **Referrer / partner benefit** | MONEY — `commission_entries` → `partner_payouts` | PRO DAYS — monthly referral +7, annual referral +30 |
| **Attribution window** | 30 days (`AFFILIATE_REFERRAL_WINDOW_DAYS`), `window_expires_at` | No window column; claim is explicit at `claimed_at` |
| **Lock moment** | `status='active'`, `locked_at` set on the FIRST commissionable payment | First paid purchase of the referred customer (F3) |
| **Renewal behaviour** | Renewals keep earning for the locked partner | F3 — first paid purchase ONLY; later renewals never earn again |
| **Eligibility** | Annual HOME/PRO for the customer benefit; all cadences for commission | Any first paid purchase; 7 vs 30 days by the referred customer's cadence |
| **Conflict precedence** | Explicit code beats an unconverted cookie (decision 7). At most ONE active owner per subscription | A purchase already owned by a partner attribution can NEVER also mint a user reward (§9) |
| **Canonical authority** | `0017_referral_attribution.sql`, `src/billing/domain/attribution.ts` | `20260902100000_refer_a_friend_pro_bonus.sql` (F1–F9) |

---

## Ordinary referral — the seven answers

Owner rules F1–F9, stated in the migration header itself.

1. **Invited customer receives:** nothing. `claim` inserts only
   `user_referral_attributions`; no entitlement, no discount, no bonus. The
   copy promises days only to the referrer ("dopisujemy **Ci** dni").
2. **Referring customer receives:** F1 monthly → **+7 PRO days**; F2 annual →
   **+30 PRO days**.
3. **Depends on:**
   * HOME/PRO — affects ACTIVATION only, not earning. F6 a HOME referrer's days
     start immediately as temporary PRO; F5 a paid-PRO referrer banks them and
     they activate when paid PRO would otherwise end.
   * monthly/annual — YES, 7 vs 30, by the REFERRED customer's cadence.
   * first payment — YES. F3, first paid purchase only.
   * existing subscription — banked, never lost (F5).
4. **Reward kind:** bonus PRO **days**, as an entitlement overlay
   (`source_type='referral_bonus'`, `scope='pro'`, `ends_at NOT NULL`).
   Not a free month, not a discount. F4: Stripe billing is never modified.
5. **Consumed / locked:** at the referred customer's first paid purchase.
6. **Refund / cancel:** F7 unpaid, failed and zero-value earn nothing; refunds
   and disputes reverse. F9 a late reversal never cuts access already granted —
   it offsets the bank, which may go negative until future rewards absorb it.
7. **Coexist with partner attribution:** **NO.** One owner per conversion.

---

## DEFECT — two approved authorities are disconnected

Both are fully written and exhaustively test-pinned, and both are imported by
**nothing but their own tests**.

### D-01 — the 3-months-free customer benefit is not wired (P0)

`decideFifteenMonthBenefit` (`src/billing/domain/attribution.ts`) decides grant
vs refusal across every case — `conversion_to_annual`, `annual_renewal`,
`rebuy_after_cancel`, prior benefit, benefit already granted for the
subscription, unattributed, the partner's own free entitlement, prior invite
trial. Nothing calls it.

`partner_benefit_uses` appears in the webhook only inside schedule-linkage
refusal strings — there is no write path. The table holds **0 rows**.

**Consequence:** `/affiliate` publicly promises "3 miesiące gratis", and no
backend path can grant it. The page makes a customer promise the system cannot
currently keep.

### D-02 — the monthly→annual conversion authority is not wired (P0)

`conversionStateMachine.ts` carries the full locked semantics — proration quote
in integer cents, confirm bound to the exact `prorationTimestamp`, SEPA holding
monthly entitlement until `completed`, idempotent replay, single-use benefit
consumed only on `completed`. Imported by its own test only.

D-01 and D-02 are the same seam: the benefit the conversion machine promises to
consume is the benefit D-01 never grants.

---

## Live staging state (2026-09-03)

| Table | Rows | Note |
|---|---|---|
| `commission_rules` | 14 | home/pro × monthly/annual + `shop_starter_pack/one_off` |
| `commission_entries` | 0 | no commission ever booked |
| `partner_benefit_uses` | 0 | benefit never granted — see D-01 |
| `referral_attributions` | 7 | only `pending` / `superseded` — **never an `active` lock** |
| `referral_rewards` | 0 | |
| `user_referral_codes` | 1 | active |
| `user_referral_attributions` | 0 | |

The structures and rules exist; nothing has yet flowed through them. Neither the
commission matrix nor "3 months free" can be proven from data until a real
Stripe TEST purchase runs.
