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
