# PM PRIVACY / RETIRE STATE MISMATCH

Status: **DEFERRED — separate Scanner/PM privacy workstream**  
Priority boundary: finish INTIMPORT / Product Recognition first.  
Environment inspected: Supabase staging `tunabqqrwabacxjcxxkz` only. Production was not accessed.

## Exact proof artifact

- PM article: `PM-ING-007139`
- Product UUID: `4edf7a14-45d5-4076-a486-c52868685501`
- Product version UUID: `0d5cab43-81ef-4b5b-a06d-170220228a19`
- ProductBehavior binding UUID: `20eceaf7-2a72-48e5-84b2-2b0693834f6a`
- Scanner session UUID: `261d9e6f-5bc5-46cd-905f-6095b83d90eb`
- Saved state observed before cleanup: `visibility='shared'`, `owning_account_id=null`,
  `created_by=4ebc6ec7-b17d-4cd8-8a2d-457280738d6f`, `is_active=true`
- Catalog UI presentation: `La Chocolatera · GLOBAL`
- Scanner evidence owned by the creator: present
- Private scanner overlay owned by the creator: present; published overlay count `0`

## Exact mismatch

The photo scanner persisted an interactive `PM-ING-*` article as `shared`. The accepted
canonical owner-retire guard accepted only:

```sql
(p.visibility='account_private' and p.owning_account_id=p_actor_user_id) or v_is_admin
```

The product therefore appeared globally searchable while the ordinary owner cleanup correctly
failed closed for a non-private product. This is a Scanner/PM persistence-state mismatch, not an
INTIMPORT or Recognition V2 defect.

## Two-photo product proof result

- Image extraction: **PASS**
  - La Chocolatera, Cacao Puro Desgrasado en Polvo, 250 g
  - 375 kcal; fat 16 g; saturates 10.2 g; carbohydrate 16.3 g; sugars 0.7 g;
    fibre 31.7 g; protein 25.5 g; salt 0.03 g
  - ingredients preserved from the supplied label
- Rounding reconciliation: **PASS**
  - 10 vs 10.2, 16 vs 16.3 and 26 vs 25.5 retained as two evidence sources;
    the higher-precision label facts won without a hard contradiction
- Allergen semantics: **PASS**
  - persisted as no additional statement visible on the supplied label
  - explicitly did not mean no allergens
- Recognition V2 semantic classification: **PASS**
  - archetype `COCOA_POWDER`, family `cocoa`, form `POWDER`, role `BASE_ONLY`
  - technical `false`, dosage-dependent `false`, deterministic confidence `0.95`
- Mapper completion: **PASS, estimation only**
  - current Mapper universe `2088`
  - selected compatible donor `PI-ING-001313`
  - similarity `0.9169`
  - verified image facts remained `VERIFIED` and were not overwritten
- Product Accuracy: **76%**, persisted
- ProductBehavior: **FAIL-CLOSED**
  - article identity `PRODUCT_OWNED`
  - runtime Mapper ingredient ID `null`
  - outcome `unknown_requires_review`
  - reason `product_owned_profile_missing`
- Engine readiness: **NO**
  - composition readiness `REVIEW`
  - exact critical blocker `UNRESOLVED_SWEETENING_FREEZING_PATH`
  - the declared sugar total was 0.7 g while the known sugar spectrum covered 0.0 g
- PM exact search/picker discovery: **PASS** (but it exposed the PM as `GLOBAL`)
- PM → recipe → Engine: **NOT RUN / FAIL** because Engine readiness was honestly false
- Recipe save/reopen: **NOT RUN / FAIL**; no proof recipe was created

Overall two-photo usable-PM proof: **FAIL**. The photos were sufficient for extraction,
classification, safe Mapper estimation and persistence, but not sufficient to produce an
Engine-usable PM or complete the recipe/save/reopen chain.

## Cleanup and rollback chronology

Before the scope stop, two task-specific guards were briefly committed and applied to staging:

- `b9136a4` — future scanner PM private visibility
- `b6afd97` — legacy shared scanner owner-retire authority

The proof PM was then retired through the canonical preflight + `ingest_product_v1(operation='retire')`
sequence, producing ingest event `894bea27-49b0-4a9a-b1b5-53fffa73dcd9`. No raw product delete
or direct `is_active` update was used. Current artifact state is `is_active=false`; its immutable
audit row, version, binding and one owner relation remain.

After the owner stopped the privacy workstream:

- both live function changes were reversed;
- migration history `20260825233000` and `20260825234000` was marked `reverted`;
- the original visibility decision and original retire guard were read back from staging;
- the task-specific code commits were reverted by `2024b59` and `bcfc02d`;
- a later two-photo scan was abandoned before allergen confirmation and before `Zapisz produkt`;
  it created no PM.

No further Scanner/PM privacy implementation belongs in the current INTIMPORT / Product
Recognition workstream.

## Unchanged boundaries

- Mapper row count after proof: `2088`
- Mapper readback SHA-256: `397ebbdd59216bdad50d07d6d3cfd3c90a54a6822d13cd67f9b440d677568cf5`
- Product import runs: eight historical runs, all `ROLLED_BACK`; no active run
- Poland 820 import: untouched
- Production: untouched
