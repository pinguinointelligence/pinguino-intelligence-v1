# SCAN IMPORT 2.0 — architecture (branch `claude/scan-import-v2`, base origin/staging)

Scan Import 2.0 is a NEW module. Legacy Scan Import (`src/features/product-scanner`, `product-intelligence`, the `product-*` edge functions) stays intact, un-renamed and untouched; HOME keeps using it. Nothing in this branch changes a legacy file, a HOME entry point, or production.

## Two modules, one typed boundary
```
MODULE 1  SCAN CORE  (branch claude/scan-core-phase-0; not on staging)
  camera → acquisition → localisation → tracking → ROI → rectification → decode → temporal evidence → confirmation
  emits  ScanObservation (scan-core/observation.ts)  — no product data
                │
                │  src/scan-contract/confirmedScan.ts   (shared contract package: types + pure adapter, no runtime deps)
                ▼
MODULE 2  SCAN IMPORT 2.0  (src/scan-import-v2)
  ConfirmedScan → code identity → exact resolution → precedence → behaviour authority (port) → price state → import (port) → ScanImportV2Result
```
Dependencies point one way: `scan-import-v2 → scan-contract`. Scan Core never imports Scan Import 2.0; Scan Import 2.0 never imports `scan-core` (it consumes the contract shape only; the end-to-end test uses a real observation dumped from the Scan Core engine as a fixture).

## Ports (why the module is pure)
Scan Import 2.0 is written against ports so every rule is unit-testable without Supabase and so the legacy authorities are reused rather than re-implemented:
- `CatalogPort` — exact-by-EAN candidates (all lookup keys), with the row facts needed for identity strength: `productKind`, `visibility`, `linkedToAccount`, `mergedInto`, `isActive`. Real adapter (later): one shared RPC over `products.ean_code_normalized ∪ product_variants.ean` (closes audit F4.2/F7.2).
- `PreferencePort` — explicit user preferred exact SKU per Mapper slot (`get_user_preferred_product_for_slot_v1`) and the country slot authority (`resolve_country_product_slots_v1`: PRIMARY_DEFAULT / SAFE_FALLBACK, admin-approved). V2 consumes them; it does NOT define a second country authority.
- `BehaviourPort` — the canonical ProductBehaviour authority (`PRODUCT_BEHAVIOR_V1`): `classified | unknown_requires_review | blocked` for a resolved product. V2 never invents behaviour.
- `ExternalEvidencePort` — provider research (evidence only; bounded by an explicit timeout; malformed → ignored). Evidence never becomes a product by itself.
- `ImportPort` — idempotent persistence (`gellatti_upsert_customer_added_product_v1` semantics: central by EAN, account link, idempotency key).
- `OfflineCachePort` — per-account cache of confirmed exact products (id, EAN, name, version) for offline resolution of known products.
In this branch every port has an in-memory implementation for tests; Supabase adapters are the NEXT STEP and are not wired to any UI.

## Deterministic precedence (from the audit, not invented)
1. strong exact identity: catalogue row(s) whose EAN matches a lookup key, ranked by strength `shared commercial (canonical) > provisional linked to this account > private/own > provisional not linked (invisible → treated as absent)`; two rows at the same top strength → AMBIGUOUS (never "first row").
2. explicit user preferred exact SKU (only when it is itself an exact-EAN candidate or the code is unknown and the slot is being resolved — never overrides a stronger exact identity).
3. approved canonical country exact SKU (PRIMARY_DEFAULT), then SAFE_FALLBACK, for the resolved Mapper slot; foreign-country assignments are never used (prohibited fallback).
4. external evidence → attached to an UNKNOWN result with `next: 'analyze_label'`; never a product.
5. manual confirmation states (`needs_confirmation`) where the legacy contracts require them (family, missing critical fields).
6. honest `unknown` / `offline` / `failed`.
Exact identity and Engine mapping stay separate: an exact branded SKU keeps its identity; its behaviour comes from the authority port.

## Vocabulary
Repo-native names are reused: `ScannerErrorCode` copy semantics (`connection`, `quota_reached`, …), `ProductScanOverlayState`, `ProductBehaviorClassificationOutcome`, `routeScan` next-step kinds, `ScanExactProduct` shape. New outcomes that the audit found missing: `ambiguous`, `invalid_code` (checksum/length/charset/symbology reasons), `offline`.

## Out of scope in this branch
HOME/PRO wiring, Supabase adapters, edge functions, any legacy modification, production.

## Decisions taken without the owner (documented, reversible)
- **D1 — slot authorities only disambiguate.** The user-preferred exact SKU and the approved country assignments (`user_preferred_product_slots`, `country_product_slot_assignments`) answer "which product for this Mapper slot"; in Scan Import 2.0 they may only choose between exact candidates that already match the confirmed code. An unknown code stays UNKNOWN (`next: 'analyze_label'`) — no authority in the repo maps a barcode to a different product, and doing so would be the silent collapse the audit forbids.
- **D2 — identity strength order.** `canonical_shared commercial > canonical_shared pi_base (Mapper reference) > provisional_linked > private_own`; equal strength → AMBIGUOUS with the candidates (never "first ranked row", audit F4.1/F4.3). A provisional row not linked to the account is invisible (legacy rule preserved).
- **D3 — no `resolved_generic` variant.** The audit found no canonical policy that lets a confirmed barcode resolve to a generic ingredient; the variant is deliberately absent so it cannot be reached by accident. Engine mapping stays a ProductBehaviour concern behind the exact identity.
- **D4 — idempotency key** = `<accountId|guest>:<GTIN-13>:<symbology>`; the same confirmed code from the same account always replays the same import (`created: false`); the real adapter passes it as `p_idempotency_key`.
- **D5 — external evidence is never fatal.** Timeout (pipeline-enforced, `externalTimeoutMs`), malformed and failed provider answers are recorded on the UNKNOWN result (`evidenceError`) — the legacy rule "a refused lookup is not a failure of the scan" kept.
- **D6 — offline.** Known = present in the per-account offline cache written on every successful online resolution (candidate + behaviour outcome + price state); unknown offline = honest `offline`. A network failure while online is `failed: connection`, distinct from `unknown`.

## Adapter layer (2026-09-04, evening)
`src/scan-import-v2/adapters/supabaseAdapters.ts` — `createSupabaseV2Ports(client)` returns catalogue, behaviour, price, preference and import ports over ONE data path: `search_products_v1(p_query = <digits>, p_context = 'BASE', p_market_scope = 'global')`, whose numeric qualification is exact equality against `eans[]` (= `products.ean_code_normalized` ∪ current `product_variants.ean`). Every key of the identity (`lookupKeys`) is tried on that same path; rows are accepted only when an EAN matches (name/alias matches are discarded). The row is memoised per session so the behaviour and price ports read the same facts (`public_data.productIntelligence.productBehaviorAuthority`, `lifecycleRejected`, `private_price/currency`). Preferences: `get_user_preferred_product_for_slot_v1` + `resolve_country_product_slots_v1` (same-country rows only). Offline: `createOfflineCache` (TTL 30 days PROVISIONAL, entries keep `currentVersionId`).
- **D7 — link-only import.** V2 never creates a product row. An exact resolution links the account to the existing product through `user_product_relations` (PK user_id, product_id → idempotent). Creating a new product from a confirmed code without label profiling would need `gellatti_upsert_customer_added_product_v1`, which requires an analysed scan session — owner decision pending; until then `unknown → analyze_label` hands over to the legacy evidence flow.
- **D8 — explicit guest scope.** The exact RPC is revoked from anon, so a guest gets `unknown` with no RPC call (no silent partial catalogue). This is the only place client/server results legitimately differ, and it is by account visibility, not by path.
- **Verified on staging (read-only, QA account home@home.com):** Hacendado 8402001047251 → PR-ING-007173 (ES), Łaciate 5900820012434 → PR-ING-007172 (PL), Alsace Lait 3262970109108 → PR-ING-007174 (FR): all `canonical_shared commercial_product`, behaviour `classified`, price `missing`, confidence 97; unknown 4305615614434 → `unknown`; guest → `unknown`. Direct table reads by the same account return nothing (RLS: own rows only) — proof that the RPC is the only client-usable exact path today. File: `STAGING_READ_PROOF_2026-09-04.json`.
- **Known limits:** the RPC exposes no ownership/visibility, so a `private_own` twin is indistinguishable from `canonical_shared` (both would be reported at the same strength → AMBIGUOUS rather than a wrong pick); `bindingId` is the current version pointer, not the binding row id; a dedicated `resolve_exact_products_by_code_v1` RPC returning visibility, ownership, active state and version would remove both limits (NEXT STEP, migration + PR, not applied by hand).
