# GELLATTI — SECURITY RISK REGISTER

Owner decision 2026-09-02: proactive security hardening is **deferred** until the product is
functionally and visually complete, at which point a dedicated
**GELLATTI FULL APPLICATION SECURITY HARDENING** phase re-audits HOME, PRO, Shop, Affiliate,
Referral, Stripe, Scanner, Catalog, Admin, Auth, API/RPC, RLS/ACL, browser and network
exposure, score/oracle probing, automation abuse and IP leakage.

This register exists so none of it has to be rediscovered. Every entry below was found with
evidence, not suspected. **Nothing here is a blocking H-row**; the H01–H166 checklist tracks
product completion separately.

Deferring hardening does **not** authorise weakening what already protects the system. A
newly discovered CURRENT critical defect — unauthorised write, data destruction, secrets
exposure or cross-user access — is reported immediately and is not deferred.

---

## Status legend

`DEFERRED_TO_FINAL_SECURITY_AUDIT` — recorded, understood, deliberately not fixed now.
`CLOSED` — fixed and proven; kept for history.

---

## SEC-HOME-01 · Anonymous recipe grams live in the browser

| | |
| --- | --- |
| **Surface** | signed-out HOME · `recipeStore` · browser memory |
| **Finding** | The demo starter is generated client-side, so true grams for every line are in `recipeStore` and readable from browser memory. `••• g` is a display mask over data the page already holds. |
| **Evidence** | Served staging, signed out: 5 recipe rows rendered `••• g` while the client held the real values. Masking contracts cover DOM, accessibility tree and hidden inputs — not client state. |
| **Impact** | Entitlement masking is a presentation guarantee, not a confidentiality guarantee. A user who opens devtools sees the amounts the plan gates. |
| **Current exposure** | Live. Pre-existing; not introduced by any recent change. |
| **Mitigation ideas** | Server-held demo draft with an opaque token and a safe projection — fully designed, see the architecture artifact. Requires moving demo recipe ownership out of the client. |
| **Status** | `DEFERRED_TO_FINAL_SECURITY_AUDIT` |

## SEC-HOME-02 · The 0–10 score is an oracle

| | |
| --- | --- |
| **Surface** | `calculateRecipe(input).scores` → `recipeMatchScore(...)` → HOME score (`useHomeRecipeResult`) |
| **Finding** | The score is a deterministic integer that flips at precise, reproducible gram values. Sweeping one line at 1 g resolution locates each band edge exactly. |
| **Evidence** | 1 g sweeps over three starter lines, 1000 g batch: line 0 flipped at **188 / 420 / 574 g**; line 1 at **90 / 245 / 536 g**; line 3 at **40 / 80 / 167 / 450 g**. Ten boundaries recovered from three sweeps of a control the customer may operate. Each is localised to ±0.1 % of batch; the response is monotone around an edge, so binary search converges in ~10 queries. |
| **Impact** | An automated caller can map the engine's target bands — proprietary calibration — without any privileged access. |
| **Current exposure** | Live, and **not demo-only**: any signed-in HOME or PRO user can probe the same way. See SEC-HOME-07. |
| **Mitigation ideas** | Coarser public result; withholding quality feedback until Apply; hysteresis. Note honestly: coarsening *reduces* the number of recoverable boundaries, it does not remove the oracle — any deterministic quality signal that varies with input leaks to some degree. Reusing the existing `MATCH_SCORE_LABELS` does **not** help: it is ~1:1 with the number (only 3–4 and 1–2 share a row). |
| **Owner ruling** | The 0–10 score **stays**. Product UX wins for now. |
| **Status** | `DEFERRED_TO_FINAL_SECURITY_AUDIT` |

## SEC-HOME-03 · `recommendedDose` percentages reconstruct masked grams

| | |
| --- | --- |
| **Surface** | `sharedFacts.recommendedDose` → `productRecommendedDosagePl` → ask-amount prompt |
| **Finding** | When no manufacturer string exists, the dosage hint renders **percentages** (`"2,0%–5,0%"`). A user knows their batch size, so `maxPercent × batch` reconstructs the exact grams the mask hides. |
| **Evidence** | `productRecommendedDosagePl` returns `percent(min)–percent(max)` when `rawValue` is absent. §52 lists *percentages* first among what HOME deliberately hides. |
| **Impact** | Masking bypass by arithmetic, on a screen HOME shows deliberately. |
| **Current exposure** | Reachable in the manual-amount flow for `MAIN_TECHNICAL_BLOCKED` products. |
| **Mitigation ideas** | Show the manufacturer's verbatim string only, and omit the hint entirely when only percentages exist. |
| **Status** | `DEFERRED_TO_FINAL_SECURITY_AUDIT` |

## SEC-HOME-04 · `mainPolicy` thresholds are formulation authority

| | |
| --- | --- |
| **Surface** | `ServerResolvedProductBehavior.mainPolicy` → `ProductBehaviorSnapshot` → client |
| **Finding** | The snapshot carries `ecoFloorPercent`, `optimalCeilingPercent`, `hardLimitPercent`, `mainEquivalentFactor`, carrier floors and temperature bounds. Any client holding a snapshot holds the calibrated Main envelope. |
| **Evidence** | `hasCalibratedMainEnvelope` derives calibration by reading those percentages directly; the envelope enforcement path reads them across `product-intelligence` and `recipe-constraints`. |
| **Impact** | Gellatti's calibrated Main envelope is proprietary; it is currently distributed to every entitled client. |
| **Current exposure** | Authenticated clients today. Anonymous clients cannot reach it — the resolver is denied to `anon` (see SEC-HOME-05). |
| **Mitigation ideas** | Server-side envelope execution with a derived safe result. The server already computes `mainAuthority = CALIBRATED / USER_HELD`, which is the safe truth the client could trust instead of re-deriving from thresholds. |
| **Status** | `DEFERRED_TO_FINAL_SECURITY_AUDIT` |

## SEC-HOME-05 · Anonymous ProductBehavior needs a minimal-data contract

| | |
| --- | --- |
| **Surface** | `resolve_product_behavior_v1` → `resolve_product_behavior_evidence_gate_v1` |
| **Finding** | The professional resolver returns a payload far broader than HOME needs — `sharedFacts` (including `referencePrice`, `technicalComposition`, `nutritionPer100g`), `privateOverlay` (private price, supplier, note, stock), raw `warnings` and raw `blockReasons`. Anonymous access must never be granted to this surface as-is. |
| **Evidence** | Two independent layers currently deny anon: no `EXECUTE` grant, **and** the canonical gate's first statement is `if auth.uid() is null then raise exception 'authentication required'`. Confirmed by calling it as service role. |
| **Impact** | A naive grant would expose commercial and private data to the public. |
| **Current exposure** | None — anon is denied. Recorded so the eventual bridge is built narrow. |
| **Mitigation ideas** | A narrow `resolve_product_behavior_demo_v1` returning an explicit field-by-field allowlist over the same canonical core; never a `demo_mode` branch inside the professional resolver. Field audit already completed. |
| **Status** | `DEFERRED_TO_FINAL_SECURITY_AUDIT` (design complete) |

## SEC-HOME-06 · No anti-abuse controls on systematic probing

| | |
| --- | --- |
| **Surface** | any deterministic calculation endpoint reachable by a client |
| **Finding** | Nothing detects or limits automated binary-search behaviour of the kind that produced SEC-HOME-02. |
| **Evidence** | The oracle sweep ran 596 evaluations per line unimpeded (local harness); no rate, budget or pattern control exists on the equivalent product path. |
| **Impact** | Makes every deterministic-signal risk cheaper to exploit at scale. |
| **Mitigation ideas** | Request budgets, probing-pattern detection, per-session compute caps. Reuse an existing quota authority if one fits rather than inventing infrastructure. |
| **Status** | `DEFERRED_TO_FINAL_SECURITY_AUDIT` |

## SEC-HOME-07 · Anti-oracle protection must be global, not demo-only

| | |
| --- | --- |
| **Surface** | HOME demo, HOME paid, PRO |
| **Finding** | SEC-HOME-02 is not a property of the anonymous demo. Any paid HOME or PRO user probes the same deterministic authority with the same precision. |
| **Evidence** | The score path (`calculateRecipe` → `recipeMatchScore`) is shared by every surface; nothing about it is entitlement-dependent. |
| **Impact** | A demo-only mitigation would leave the leak fully open to anyone with a cheap subscription. |
| **Mitigation ideas** | Whatever is chosen for SEC-HOME-02 must apply across surfaces, not just signed-out. |
| **Status** | `DEFERRED_TO_FINAL_SECURITY_AUDIT` |

---

## CLOSED — fixed, kept for history

### SEC-DB-01 · Anonymous write reached `mapper_basement` through a demo view · `CLOSED`

`mapper_basement_search_demo` was a `security_invoker=false` view owned by `postgres` with
`ALL` granted to `anon`, so writes through it ran with the owner's rights and bypassed the
underlying table's RLS. An anonymous INSERT reached the table and failed only on a NOT NULL
constraint, while the same insert straight into `mapper_basement` was refused with `42501`.
**`gellatti.com` serves the same Supabase project as staging**, so this was live in production.

Root cause was an incomplete REVOKE against Supabase's schema default privileges (which grant
`ALL` on new objects to `anon` and `authenticated`), not a bad grant: `0809194002` revoked from
`public, anon` and `0809194003` from `public` only.

Fixed by migration `mapper_search_views_read_only` (PR #104, staging `140e7745`). After: anon
SELECT still `200`; INSERT/UPDATE/DELETE all `401 permission denied for view`; row counts
unchanged 2089 / 2076. A permanent guard fails any future migration that creates a public view
without revoking browser writes from every role.

### SEC-DB-02 · Anonymous read/write on an orphaned snapshot table · `CLOSED`

`_main_authority_baseline_20260823` (2088 rows) had RLS **disabled** with `anon` holding
SELECT/INSERT/UPDATE/DELETE. Unlike the sixteen other tables where a browser role holds DML,
there was no policy layer behind the grant — RLS enabled with zero policies denies by default;
RLS disabled does not. Anonymous SELECT confirmed live (`200`). Columns were taxonomy only, so
no cost, supplier or PAC/POD was exposed; the write privilege was the real problem.

Fixed by migration `main_authority_baseline_not_browser_facing`. After: ACL is `postgres` and
`service_role` only; anon, authenticated and PUBLIC all denied at the privilege layer; row
count unchanged 2088. Data deliberately untouched — it is a backup.

### Default privileges · `ACCEPTED, NOT A DEFECT`

`public` grants `ALL` on new TABLES/VIEWS to `anon` and `authenticated` by default. Narrowing
this globally was rejected on evidence: of 174 public tables, 115 give `anon` DML and **98 of
those are protected by RLS** — the "table privileges + RLS" pattern is load-bearing. The
accepted control is explicit REVOKE plus the two repository guards.

---

## Parked design work

The full server-held demo architecture (A–Q, including table schema, Edge action contract,
safe projection, token lifecycle, claim path, source-parity mechanism, leak and performance
test plans, file list, migrations and rollback) is preserved as an artifact and is the starting
point for the final hardening phase.

Supporting spike evidence, reproducible in ~130 ms via the
`buildProductionRescueEdgeBundle.mjs` pattern:

- the canonical optimize path bundles for a Deno/Edge runtime with **zero** forbidden
  browser/client modules, deterministic across builds, no external or dynamic imports
- browser vs generated-bundle **parity 6/6** on solved and refused fixtures
- solver execution is single-digit milliseconds warm; bundling costs nothing measurable
- the real Supabase Edge cold/warm measurement was **never taken** — deployment was blocked

Untested and explicitly not claimed: Raspberry, Cocoa 22/24 and a calibrated `MAIN_CAPABLE`
case, which need ProductBehavior snapshots that do not exist until the bridge is built.
