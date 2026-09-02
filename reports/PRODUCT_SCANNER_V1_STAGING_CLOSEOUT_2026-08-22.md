# Product Scanner v1 — Staging Closeout

**Date:** 2026-08-22
**Result:** **A. PRODUCT SCANNER V1 DEPLOYED AND READY FOR OWNER TESTING ON STAGING**

---

## 1. Git / deployment identity

| Item | Value |
| --- | --- |
| Baseline `origin/staging` at phase start | `eb669495abbf1b5aa321a5bb896af81c1c00de71` |
| Integration worktree | `pinguino-intelligence-v1-scanner-staging` (fresh, from `eb66949`) |
| Branch | `claude/scanner-v1-staging` |
| New `origin/staging` | `5486e362bd8441415ef8ed7e9abba8b458e0f5c5` |
| Vercel project | `pinguino-staging` (`prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`) |
| Deployment ID | `dpl_6JxM8byyvssdyN1sdUiDWx64Mm69` — state `READY`, SHA `5486e36` |
| Served URL | https://staging.pinguinoai.com/products/scan |
| `origin/main` (production) | `4dfb097d14fe91c2cc7bd67e02265e6ac41123a2` — **unchanged, not deployed** |
| Mapper fingerprint | `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**, 2088 rows |

Integration was a clean cherry-pick of the three Scanner commits (`5e28b0b`, `05e0d11`,
`e3d1372`) onto current staging — **zero conflicts, zero deletions**. Diff vs `eb66949` is
exactly the Scanner surface (30 files). All current Sorbet / Direction / Rescue / Monitor /
Production work is preserved untouched.

## 2. What already existed vs what this phase changed

The handoff branch already contained a substantially complete implementation: cumulative
server-owned merge, malformed-barcode rejection, evidence hierarchy, high-risk fail-closed,
bounded paid calls, camera/upload/drag/paste capture, the migration and both Edge Functions.
That work was reused, not rewritten.

Two **genuine defects** were found during this phase and fixed at the source:

### 2.1 A withheld conflict could never be resolved — permanent `SCAN_DRAFT`

When two equally specific direct readings disagreed (the exact HARIBO Quaxi protein/salt
case), the merge correctly withheld the value and recorded an unresolved conflict
(`retainedSource: null`), which blocks readiness on purpose. **Nothing could ever clear it.**
Even after the owner supplied the precise confirmation image the scanner asked for, the stale
conflict kept the session pinned to `SCAN_DRAFT` forever — so a HARIBO-style scan was
unfinalizable by construction.

Fix: a directly visible reading that corroborates one of the two disputed values now fills in
the retained source. The disagreement stays fully on record; only the tie-break is recorded,
so the session can finalize. Weak or indirect readings (retailer, `directVisibility: false`)
still cannot break a genuine label tie.

### 2.2 The server-owned merge wrote back into caller state

`mergeProductScanResults` aliased the caller's conflict rows into its result, so resolving a
conflict mutated the prior session object. Conflict rows are now copied. Covered by an
explicit non-mutation test.

Both were caught by the new named regressions, not assumed.

## 3. Real-product regressions (§1.15)

`src/features/product-scanner/realProductRegression.test.ts` reproduces the two owner-reported
failures as named scenarios rather than synthetic shapes:

**HARIBO Quaxi** — fast pass establishes `HARIBO` / `Quaxi` / EAN `4001686322536` / allergen
evidence; the accurate continuation finds ingredients but omits allergens, emits the exact
malformed candidate `4001686322536'}]},` and disagrees on protein and salt. Asserted:

- validated EAN preserved, malformed candidate rejected (`barcode_candidate_rejected`);
- earlier allergen text **and** its evidence row survive the omission;
- ingredients supplement without disturbing brand or energy;
- protein/salt become truthful conflicts — **not** last-call-wins;
- readiness is held on the unresolved conflicts;
- the requested confirmation image finalizes the session (`PENDING_PUBLICATION`);
- a weak indirect reading does **not** break the tie;
- prior session state is never mutated.

**La Chocolatera** — strong identity/nutrition/ingredients with no separate allergen line, only
directly visible "może zawierać" wording. Asserted: allergen summary is derived from that
direct evidence, the product reaches `PENDING_PUBLICATION` instead of staying draft, and the
same input **still fails closed** when the may-contain evidence is not directly visible
(missing text ≠ "no allergens").

## 4. Test and gate evidence

| Gate | Result |
| --- | --- |
| Focused scanner suite | **76 passed** (10 files) |
| `npm test` (full) | **7034 passed / 564 files**, 0 failed |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (2 pre-existing react-refresh warnings) |
| `npm run build` | ✓ built |
| `npm run products:audit` | mapper `b13f5db4…ed38` |
| `npm run mapper:runtime-audit` | active 2088, searchable 2088 |
| `npm run process:validate` | 2088 rows, 0 alignment differences |
| `npm run catalog:mapper-only:validate` | 2075 Base-selectable covered, 0 violations |
| `npm run production-rescue:bundle-check` | verified `0fd4f0c7…8480` |
| `git diff --check` | clean |

## 5. Backend state (staging only)

- Supabase project `tunabqqrwabacxjcxxkz` (staging). **No production Supabase touched.**
- Migration `20260821120000_product_scanner_v1` — already applied; **not** recreated.
- Edge Functions redeployed (shared module changed): `product-scan-analyze` and
  `product-scan-finalize`, both **v5, ACTIVE**.
- Unauthenticated `POST` to both functions → **401**. No anonymous paid-call surface.

### Actual non-secret configuration (§1.11, §1.14)

Verified from Supabase secret digests (values are SHA-256 in the API; matched against known
plaintext hashes — no secret was read or exposed):

| Flag | Value |
| --- | --- |
| `PRODUCT_SCANNER_ENABLED` | `true` |
| `PRODUCT_SCANNER_V1_ENABLED` | `true` |
| `PRODUCT_SCANNER_WEB_SEARCH_ENABLED` | **`false`** |
| `PRODUCT_SCANNER_MAX_WEB_CALLS` | **`0`** |

Broad paid web enrichment stays **off**, exactly as §1.11 requires. `OPENAI_API_KEY` and
`OPENAI_PROJECT_ID` exist only as server-side Edge Function secrets. Paid calls remain bounded
at **1 fast + at most 1 accurate continuation** (`Math.min(2, …)` — hard-capped in code, not
merely configured).

## 6. Served runtime QA (https://staging.pinguinoai.com)

- `/products/scan` returns **200** and renders **Skanuj produkt**.
- Primary product-add UX exposes **Skanuj kamerą** and **Dodaj zdjęcia**; desktop drag & drop
  zone present ("Przeciągnij zdjęcia etykiety tutaj"); paste supported; up to 4 images.
- Privacy notice shown before any cloud analysis.
- Bounded-cost notice served: "Maks. 1 analiza + 1 dokładne ponowienie."
- Camera denied → "Nie udało się uruchomić kamery. Sprawdź uprawnienia lub dodaj zdjęcia."
  with the upload path still available. **No dead end** (§1.13).
- **Console clean** — no errors or warnings.

### Secret isolation, verified on the served bundle

Served `assets/index-D6xLL0Gi.js` (3.18 MB) was downloaded and scanned:

- **0** matches for `sk-proj` / `sk-…` / `OPENAI_API_KEY` / the OpenAI project id / `service_role`;
- **0** references to `api.openai.com` — the browser never calls OpenAI directly;
- scanner strings and both Edge Function names present.

### HEIC/HEIF claim is honest (§1.12)

The UI advertises HEIC/HEIF, and it genuinely works: `heic-to@^1.5.2` is a real dependency,
the code-split chunk `heic-to-CGGuGQrK.js` is built and referenced, detection is by MIME, file
name **and** content sniffing, and an undecodable file fails closed with a truthful message.

### Image privacy proven structurally (§1.10)

`public.product_scan_assets` has **no column capable of holding image bytes or base64** — only
`original_mime`, `normalized_mime`, `byte_size`, `checksum_sha256`, `transformations`,
`quality_score`. Scanner code contains **no** Storage reference at all; neither existing bucket
is touched. Persisting a raw image is structurally impossible, not merely avoided.

## 7. Outstanding item

**OWNER AUTHENTICATED SMOKE PENDING.**

The scan flow is authenticated, so driving the two real owner fixtures
(`Zrzut ekranu 2026-08-20 o 09.51.12/09.51.26.png` — La Chocolatera;
`…09.49.20.png` — HARIBO Quaxi, all three present on the owner's Desktop) through the deployed
Vision path requires the owner's own signed-in session, and would spend real paid calls. No
credentials were entered and no session was fabricated.

Everything not gated on that session is verified above: code, structured real-product
regressions, full suite, all repository gates, migration state, function versions, auth
boundary, served UI, secret isolation, privacy schema and cost configuration.

Per the queue's stop rule, a missing authenticated browser session alone is **not** a reason to
stop, so the queue continues to Phase 2.

### What the owner should click

1. Sign in on https://staging.pinguinoai.com → **Produkty** → **Skanuj produkt**.
2. HARIBO Quaxi front image → **Analizuj produkt**; then add the ingredients shot to the *same*
   session. Expect: EAN `4001686322536` preserved, allergens retained, ingredients added, any
   protein/salt disagreement shown as a conflict with one targeted follow-up request.
3. La Chocolatera (both shots). Expect a usable/final state, not a permanent draft.
4. Re-scan a finalized product by its EAN. Expect the existing product, **0 Vision calls,
   0 new-product quota, no duplicate**.
