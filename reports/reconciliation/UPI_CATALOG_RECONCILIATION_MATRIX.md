# UPI + Global Catalog reconciliation matrix

Historical input prepared before reconciliation coding. The table below records
the pre-reconciliation conflicts and is intentionally retained as recovery
evidence; it is not the current implementation status. Current authority is
documented by `PRODUCT_ROOT_AND_INGEST_AUDIT.md` and
`RESOLVER_CONSUMER_MATRIX.md`. Visual authority remains
`origin/staging@5f796583955fb82f5ab08ce2e0236cb48cccdc16` plus the passing
64/64 pixel-lock contract.

Superseding architectural decision: `public.products` is the one canonical
identity root; `product_versions` and `product_behavior_bindings` are its
immutable/versioned authorities. Former `global_catalog_*` roots are read-only
compatibility views. `mapper_basement` remains separate and read-only. Caller
private data belongs only to `user_product_relations`.

| Capability | Report A implementation | Report B implementation | Conflict | Final authority | Merge action | Test | Status before reconciliation |
|---|---|---|---|---|---|---|---|
| Canonical products root | Refers to catalog versions but leaves both roots | `global_catalog_products`; legacy owner `products` remains OCR source | Two writable identity roots | Global catalog core | Migrate/adapter legacy data; stop new canonical writes to legacy root | Cross-channel identity/RLS | PARTIAL |
| Product versions | Behavior snapshots reference exact version | Immutable catalog versions with current pointer | Recipe snapshot and catalog version are not universally bound | Catalog product version + behavior binding snapshot | Persist exact version/binding in every recipe line | Version round-trip/stale preview | PARTIAL |
| Product evidence | Binding carries fingerprints/provenance | OCR images, attestations, evidence, submissions | Different provenance projections | Catalog evidence/attestation tables | Resolver projects immutable evidence version only | GREEN/BLUE/RED fixtures | PARTIAL |
| OCR | No intake | Customer scan + persistence + Edge adapter | OCR first writes legacy product | `catalog-submit` | Make Edge transaction the canonical identity/version path | OCR A–E E2E | PARTIAL |
| Manual product entry | Resolver can consume resulting version | Manual completion supported | No single source DTO/transaction | `catalog-submit` canonical equivalent | Route manual customer/admin adapters to same RPC | Source-adapter matrix | PARTIAL |
| Barcode | Context-independent | Exact EAN/variant handling | Not routed through all adapters | Catalog variant identity | Normalize in one ingest RPC | Existing/new EAN | PARTIAL |
| Duplicate detection | None | Exact/fuzzy/pHash/dispute in SQL | Legacy private duplicate checks still exist | Server catalog duplicate resolver | Keep pre-save hints only; server result authoritative | Duplicate truth table | PARTIAL |
| GREEN/BLUE/RED | Snapshot stores catalog verification | Server-attested GREEN, manual BLUE, blocked RED | UI/module gates partly re-interpret | Server catalog status + resolver | Project exact status/reasons through resolver | Trust-boundary/RLS | PARTIAL |
| Favorites | Not modeled | User favorites/recent | Picker/catalog only | User catalog relations | Resolve visibility separately from behavior | Cross-account favorite | IMPLEMENTED |
| Multilingual aliases | Taxonomy aliases | Product aliases/search | Two alias scopes | Product aliases + taxonomy aliases, both server-controlled | Keep identity/product vs taxonomy semantics separate | PL/ES/EN/DE/IT/FR | PARTIAL |
| Markets | Context exists | Variant market and user preferences | Sentinel/ranking historically duplicated | Catalog market/variant relations | Canonical market IDs and resolver context | Market/global search | PARTIAL |
| User private prices | Context placeholder | Owner-RLS private product data and topping price | Cost consumers not all snapshot-bound | Caller-private relation projected by server | Freeze effective price source into recipe snapshot | Cross-account price | PARTIAL |
| Product snapshots | Core UPI feature | Catalog version snapshot | Snapshot does not contain all module facts | Product version + immutable behavior snapshot | Extend with nutrition/process/price provenance | Historical replay | PARTIAL |
| Mapper bindings | Exhaustive fail-closed bindings | Version-bound authorized Engine mapping | Catalog mapping and behavior classification separate | Server mapping + behavior binding | Reclassify on mapping/policy change | Mapper 2,088 audit | PARTIAL |
| Resolved behavior | RPC + TS contract | Catalog flags/read model | Several consumers still bypass | `resolve_product_behavior_v1` | One consumer adapter per module; ban raw interpretation | Consumer source audit | PARTIAL |
| Main eligibility | Snapshot/gates | None beyond mapped Base | Legacy lines bypass snapshot | Behavior binding | Deterministic legacy backfill or REVALIDATION_REQUIRED | Main role tests | PARTIAL |
| Main floor/ceiling | Provisional dairy fruit policies and trustless gate | None | Coverage incomplete | Versioned policy registry | Unknown policy becomes `MAIN_BLOCKED_POLICY`, not generic unknown | Envelope matrix | PARTIAL |
| Product-profile matrices | Contract/context exists | Product type facts only | Missing server data for most forms/profiles | Versioned profile policy rows | Seed only approved policies; deterministic blocked outcome otherwise | Gelato/Sorbet/Vegan/Protein | PARTIAL |
| Base/Topping scopes | Snapshot scope and gates | Strong Base/Topping sidecar isolation | Base technical and label-only topping interpreted in multiple places | Recipe composition + resolver | Preserve strict Engine isolation; freeze both scopes | Same product Base+Topping | IMPLEMENTED/PARTIAL |
| Substitution | Fingerprint sees current snapshots | Mapper-only substitution | Replacement binding not resolved/persisted | Central resolver | Resolve candidate before Preview and replace snapshot on Apply | Substitution stale/blocked | MISSING |
| Cost | Module matrix | Effective private/catalog topping price | Not fully frozen/versioned | Resolver snapshot + caller-private price relation | Save effective/reference price provenance | Cost historical replay | PARTIAL |
| Monitor | Module matrix | Base result + product badges | Reads recipe/Engine but not one full product snapshot | Frozen Base snapshots + Engine result | Ban current product refetch | Monitor parity | PARTIAL |
| Nutrition | Module matrix | Label-only topping projection | Some facts read from composition-specific snapshot | Frozen recipe product facts | Central recipe snapshot projection | Final nutrition fixture | PARTIAL |
| Save/version | SAVE gate and behavior sidecar | Canonical recipe repository | Legacy no-snapshot bypass | Recipe version snapshot | Backfill/fail closed before new save | Save/reopen/restore | PARTIAL |
| Production | PRODUCTION gate | Frozen plan/actual Base+Topping | Legacy no-snapshot bypass | Frozen recipe/production snapshot | Require resolved lines before session | Production identity | PARTIAL |
| Batch Rescue | Apply fingerprint extension | Existing trustless rescue | Behavior snapshot not explicit in rescue proof | Frozen session behavior fingerprint | Bind rescue proof to behavior snapshot | Forged/stale rescue | PARTIAL |
| Master Label | LABEL matrix | Ingredients/allergens/nutrition/status handoff | Not all inputs proven from same snapshot | Frozen actual product snapshots | No current product refetch | Label replay | PARTIAL |
| Review cases | Behavior unknown can create case | Consolidated catalog cases | Different reason vocabularies | Catalog review case with behavior reason | Normalize deterministic outcome/reasons | Repeated unresolved scan | PARTIAL |
| Rate limits | None | SQL reservation/idempotency/risk | Edge/server deployment unproved | Server reservation RPC | Execute concurrency/bypass tests | Rate-limit E2E | IMPLEMENTED/UNPROVEN |
| RLS | Service-only behavior tables | Catalog/customer-private RLS | Not executed on staging | Database RLS + SECURITY DEFINER resolver | Linked two-account tests | RLS fixture suite | UNPROVEN |
| `catalog-submit` | Resolver downstream only | Edge intake implementation | Undeployed; verifier/risk dependencies missing | Canonical ingest Edge adapter | Deploy only after migration history and review pass | Function hash + E2E | NOT DEPLOYED |

Coding order: preserve checkpoint → isolated worktree → canonical root/ingest boundary → legacy backfill → resolver consumer completion → migration/history proof → independent reviews → staging-only deployment.
