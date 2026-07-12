# Resume PI Verified on Staging — Paste-Ready Prompt

Use once a **paid non-production Supabase staging** exists. Lifts the PI VERIFIED LAUNCH
GATE. Never run against production (`riwipywgqobrulyzrzad`) or MOOTOORS
(`tjntmljkrxbpwjmkautu`). Do not modify Billing/Stripe/OCR/Account-Access checkpoints or
`mapper_basement`.

## Absolute safety rules
- Never run migrations / SQL / deploy against production or MOOTOORS.
- No secrets in chat/logs/commits; no `service_role` key in client code.
- PI Verified is written only by the guarded server path — never a direct client write.

## Ordered steps
1. **Enable paid staging.** Record ref + URL + anon key (never commit them).
2. **Prove staging ≠ production ≠ MOOTOORS** before any write.
3. **Apply migrations** on staging only: base `0001`–`0013`, then `0026` (this slice).
   (Billing `0014`–`0021`, OCR `0022`–`0024`, Account Access `0025` follow their own gates.)
   Verify the 9 verification tables + RLS with `list_migrations`.
4. **Configure roles.** Seed `review_roles` for the test reviewers (service-role);
   seed one active `verification_policy_versions` row for status + required_fields.
5. **Install runtime configuration** in the Supabase secret manager (never the repo).
6. **Deploy privileged services/functions**: the Supabase adapter mirroring
   `inMemoryVerification`, plus the Edge Function that (a) inserts the immutable
   `verification_signoffs` row and (b) writes the product `pi_verified` status through the
   existing guarded `setProductLifecycleStatus` (the four attestations enforced server-side).
7. **Create reviewer/admin test users** (a reviewer, a senior_reviewer, a review_admin, an
   owner) and at least one product each: own-measured matched (verifiable) and a
   red-flagged one (must never verify).
8. **Authenticated E2E** (signed-in): submit → assign → review → resolve required fields →
   request evidence → provide evidence → waive (senior) → sign off → **verify** → reopen
   (preserves the prior snapshot) → reject path.
9. **Verify RLS**: an owner cannot read another owner's case/candidates/events; a client
   cannot insert `verification_signoffs`, grant `review_roles`, or activate a policy; a
   client cannot update/delete audit rows.
10. **Verify immutable snapshots**: a verified revision's sign-off cannot be altered;
    reopening creates a new revision and keeps the old one.
11. **Verify audit history**: every event has actor + timestamp + reason where required;
    no rewrite/delete.
12. **Verify production untouched** (`riwipywgqobrulyzrzad`, MOOTOORS).
13. **Return a PASS/FAIL matrix** for steps 8–12.
