# OCR Product Intake — Safe Pause & Staging-Resume Checkpoint

This document is the **file-first safe-pause checkpoint** for REAL OCR Product Intake
for the Mapper. It records exactly what is complete in the repository, what is
deliberately deferred behind the **OCR LAUNCH GATE**, and the precise owner-run steps
to resume once a paid staging environment exists.

> **Honesty rule (enforced):** nothing here claims a live-database PASS. Everything
> below is either (a) file-first + deterministically tested in the repo, or (b)
> explicitly `BLOCKED EXTERNAL — OCR LAUNCH GATE`. Mock-backed / fixture-backed code is
> never described as a live backend pass.

---

## 1. What is COMPLETE in the repository (file-first)

All of the following are implemented and covered by deterministic tests that run
offline in CI (`npm ci && npm run typecheck && npm run lint && npm test && npm run build`),
with **no** network, **no** live database, and **no** secrets:

| Area | Status | Where |
|---|---|---|
| OCR provider abstraction (interface + registry + fixture provider) | PASS (file-first) | `src/features/ocr-intake/provider/*`, `intakeContracts.ts` |
| Real Tesseract provider (keyless in-process WASM) | PASS (real OCR, local) | `provider/tesseractProvider.ts`, `ocrEngine.ts` |
| Real OCR node proof — EN/ES/DE/PL/IT (5/5 languages) | PASS (real pixels) | `*.node.test.ts`, `__fixtures__/label_*.png` |
| Deterministic label parser + normalization | PASS | `labelTextParser.ts` |
| Per-field evidence extraction (28 fields, provenance-honest) | PASS | `evidenceExtractor.ts` |
| Multi-image session state machine (roles/order/replace/retry) | PASS | `session/intakeSession.ts` |
| Duplicate assessment (EAN / identity hash / normalized) | PASS | `session/duplicateCheck.ts` |
| Save flow through the EXISTING identity-aware import path | PASS | `session/saveFlow.ts` → `importProductCatalog` |
| Batch intake (~40 products, derived summary, CSV export) | PASS | `session/batchIntake.ts` |
| Migrations 0022–0024 (sessions/images/runs/evidence + private bucket) | PASS (file-first, guard-tested) | `supabase/migrations/0022–0024`, `ocrIntake.migration.test.ts` |
| OCR persistence **service boundary** (sessions/images/runs/evidence + storage) | PASS (file-first, mocked-client tests) | `src/services/ocrIntake*.ts` |
| Intake UI (multi-image, evidence review, duplicate, batch) | PASS (SSR-tested) | `src/features/ocr-intake/ui/*`, dev pages |
| Real in-browser OCR (quick path) | PASS (browser evidence) | `/dev/ocr-intake` quick path |
| Deploy config (SPA host) | PASS (file-first, inert) | `netlify.toml`, `vercel.json`, `docs/deploy/` |

### Locked invariants verified in the repo
- OCR **cannot** write `mapper_basement` (no service path targets it; guard tests).
- OCR **never** assigns **PI Verified** (status decision + red-flag block).
- PAC/POD are **never** invented from OCR — products keep `pac_value`/`pod_value` null.
- Unknown nutrition stays **null** — "not detected" is never coerced to `0`.
- Red-flag detection remains active on the save path.
- Owner scoping: every OCR table + the storage bucket is `auth.uid()`-scoped RLS;
  images/evidence cannot leak between owners or sessions.
- File-size limit is **10 MiB (10485760)** consistently across engine, session,
  migration `byte_size` CHECK, and the `0024` bucket `file_size_limit`.
- Private storage: `product-intake-images` is `public = false`, no anon read, signed
  URLs only, owner-folder path (`{uid}/{session}/{file}`).
- No secrets in the repo (`.env.local` gitignored; only public `VITE_` vars).
- Billing untouched.

---

## 2. What is BLOCKED EXTERNAL — OCR LAUNCH GATE

These require a **paid Supabase staging** project (a future owner decision — do NOT buy
until the launch phase begins) and cannot be honestly completed file-first:

1. **Provision paid staging** — an authorized non-prod Supabase project. The two free
   slots are occupied by production + MOOTOORS (locked ACTIVE), so a free project is
   not available.
2. **Apply migrations 0022–0024** to staging (creates the OCR tables + RLS + the
   private `product-intake-images` bucket). Never apply to production here.
3. **Configure runtime** — set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for the
   staging project in the host; no service-role key in the frontend, ever.
4. **`saved_product_id` server write-back** — the `ocr_intake_sessions.saved_product_id`
   column has **no client grant** (service-role only). The persistence layer records
   `state='saved'` + `saved_at` and surfaces `savedProductLinkPending: true`, but the
   session→product link must be written by a future **server-side / edge-function**
   step. This is a deliberate, honest limitation, not a bug.
5. **Authenticated live E2E** — real signed-in user runs: upload → OCR → review →
   persist session/images/runs/evidence → save through the product pipeline → open the
   saved product; duplicate detection against live owned rows; batch of ~40.
6. **Deployment** — connect one host (Netlify/Vercel/Cloudflare Pages, free tier) using
   the committed configs; a host subdomain becomes the staging `APP_BASE_URL`.

---

## 3. Staging-resume prompt (owner actions, in order)

Run this exact sequence when ready to lift the OCR LAUNCH GATE:

1. **Provision** a paid Supabase staging project (or an authorized branch). Record its
   ref + URL + anon key (never commit them).
2. **Apply migrations** in order on staging only:
   `0001 … 0013` (base), then the OCR set `0022`, `0023`, `0024`.
   (Billing `0014–0021` are out of scope for the OCR gate — do not apply them here
   unless the separate billing gate is being lifted.)
   Confirm with `list_migrations` and verify the `product-intake-images` bucket exists,
   is private, and enforces the 10 MiB / png|jpeg|webp limits.
3. **Set env** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for staging in the host
   dashboard (see `docs/deploy/DEPLOYMENT.md`). Store any server secrets in the Supabase
   Edge secret manager, not the repo.
4. **Deploy** the SPA to the chosen host from `main`.
5. **Implement + deploy** the small server-side step that writes
   `ocr_intake_sessions.saved_product_id` after a successful product save (edge
   function or trigger with the service role). Wire `savedProductLinkPending → false`.
6. **Run authenticated live E2E** on staging (signed-in): the full upload→save→open
   loop, duplicate handling, and a ~40-product batch. Capture real evidence.
7. Only after live E2E passes may any item in §2 be marked a live PASS. Until then it
   stays `BLOCKED EXTERNAL — OCR LAUNCH GATE`.

---

## 4. Safe-pause status

- The repository is at a clean, gate-green, file-first safe pause for OCR Product Intake.
- No production system, live bucket, live user data, `mapper_basement`, Billing,
  Stripe, or MOOTOORS was touched.
- No paid infrastructure was purchased or activated.
- The only remaining OCR work is the OCR LAUNCH GATE list in §2, resumable via §3.
