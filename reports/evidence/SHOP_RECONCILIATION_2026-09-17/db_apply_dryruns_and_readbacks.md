# Próby przed zastosowaniem i odczyty po zastosowaniu (2026-09-17)

Źródło: wyniki `execute_sql` z tej sesji (blok DO kończony `raise exception`, więc każda próba wycofana).
Hash `executed_sha256` / `migration_sha256` liczony w bazie z dokładnego wykonywanego tekstu (`sha256(convert_to(tekst,'UTF8'))`).
Wersje pierwszej próby K6 (`23b14474…`, rollback `5778a48c…`) zostały zastąpione: widok w rollbacku odtworzono z definicji live i ponowiono próbę (`c4e78937…` / `b6bb4918…`, `rollback_identical: true`).

## K6/K4: próba migracji w transakcji wycofanej (role anon / authenticated / finance / service_role)

Czas wyniku (UTC): `2026-09-17T11:04:40.590Z`

```json
{
  "admin_fn_anon_execute": false,
  "anon_canonical_id": "42501",
  "anon_carrier_cost": "42501",
  "anon_catalog_rpc": "ok",
  "anon_components": 7,
  "anon_components_reserved": 0,
  "anon_countries": 17,
  "anon_country_readiness_overview": 17,
  "anon_delete_components_rows": 0,
  "anon_insert_country": "42501",
  "anon_live_countries": 0,
  "anon_products": 8,
  "anon_rates": 15,
  "anon_readiness_rows": 17,
  "anon_stripe_price_id": "42501",
  "anon_update_products_rows": 0,
  "executed_sha256": "23b144740c003a78ee9ea704690b10107f51c4a68285c4dda1c5b98204710eef",
  "finance_components": 14,
  "finance_countries": 18,
  "finance_products": 9,
  "finance_readiness_rows": 18,
  "finance_stripe_price_id_direct": "42501",
  "finance_update_countries_rows": 1,
  "fn_anon_execute": true,
  "migration_sha256": "23b144740c003a78ee9ea704690b10107f51c4a68285c4dda1c5b98204710eef",
  "service_US_live": false,
  "service_US_missing": "7",
  "service_US_ready": 0,
  "service_live_countries": 0,
  "url_cases": {
    "example.org/path": true,
    "http://localhost:3000": true,
    "https://example.co.uk": false,
    "https://example.invalid/x": true,
    "https://foo.test": true,
    "https://mytest.invalidshop.com": false,
    "https://shop.example.com/a": true,
    "https://testshop.com": false,
    "https://user@EXAMPLE.INVALID.:8080/p?q": true,
    "https://www.amazon.com/dp/x": false,
    "null": false
  },
  "user_carrier_cost": "42501",
  "user_components": 7,
  "user_countries": 17,
  "user_insert_country": "42501",
  "user_products": 8,
  "user_readiness_rows": 17,
  "user_update_countries_rows": 0
}
```

## K6/K4: próba rollbacku (pierwsza wersja; widok różnił się kosmetycznie od definicji live, poprawione)

Czas wyniku (UTC): `2026-09-17T11:06:28.845Z`

```json
{
  "column_grants_equal": true,
  "helper_mid": true,
  "helper_post": false,
  "helper_pre": false,
  "identical_after_rollback": false,
  "migration_sha256": "23b144740c003a78ee9ea704690b10107f51c4a68285c4dda1c5b98204710eef",
  "policies_equal": true,
  "rollback_sha256": "5778a48c2e54ffb024f0a077de0a2f9c9049b9518d06267f8f51db48bb447aea",
  "table_grants_equal": true,
  "view_changed_mid": true,
  "view_equal": false
}
```

## K6/K4: próba migracji w transakcji wycofanej (role anon / authenticated / finance / service_role)

Czas wyniku (UTC): `2026-09-17T11:09:52.307Z`

```json
{
  "admin_fn_anon_execute": false,
  "anon_canonical_id": "42501",
  "anon_carrier_cost": "42501",
  "anon_catalog_rpc": "ok",
  "anon_components": 7,
  "anon_components_reserved": 0,
  "anon_countries": 17,
  "anon_country_readiness_overview": 17,
  "anon_delete_components_rows": 0,
  "anon_insert_country": "42501",
  "anon_live_countries": 0,
  "anon_products": 8,
  "anon_rates": 15,
  "anon_readiness_rows": 17,
  "anon_stripe_price_id": "42501",
  "anon_update_products_rows": 0,
  "finance_components": 14,
  "finance_countries": 18,
  "finance_products": 9,
  "finance_readiness_rows": 18,
  "finance_stripe_price_id_direct": "42501",
  "finance_update_countries_rows": 1,
  "fn_anon_execute": true,
  "migration_sha256": "c4e789370bf232fccd9b681cbe311739ba091c7b59328e2b1d76d5986bc32995",
  "rb_column_grants": true,
  "rb_helper_gone": true,
  "rb_policies": true,
  "rb_table_grants": true,
  "rb_view": true,
  "rollback_identical": true,
  "rollback_sha256": "b6bb491869dd6f1109fe4fa222fe37af169c16175efa4a613724185cbd4d74bd",
  "service_US_live": false,
  "service_US_missing": "7",
  "service_US_ready": 0,
  "service_live_countries": 0,
  "url_cases": {
    "example.org/path": true,
    "http://localhost:3000": true,
    "https://example.co.uk": false,
    "https://example.invalid/x": true,
    "https://foo.test": true,
    "https://mytest.invalidshop.com": false,
    "https://shop.example.com/a": true,
    "https://testshop.com": false,
    "https://user@EXAMPLE.INVALID.:8080/p?q": true,
    "https://www.amazon.com/dp/x": false,
    "null": false
  },
  "user_carrier_cost": "42501",
  "user_components": 7,
  "user_countries": 17,
  "user_insert_country": "42501",
  "user_products": 8,
  "user_readiness_rows": 17,
  "user_update_countries_rows": 0
}
```

## K6/K4: odczyt po zastosowaniu migracji 20260917111101

Czas wyniku (UTC): `2026-09-17T11:12:04.539Z`

```json
{
  "anon_carrier_cost": "42501",
  "anon_countries": 17,
  "anon_insert": "42501",
  "anon_live": 0,
  "anon_products": 8,
  "anon_rates": 15,
  "anon_readiness_rows": 17,
  "anon_reserved_components": 0,
  "component_rows_total": 14,
  "finance_components": 14,
  "finance_countries": 18,
  "finance_products": 9,
  "lsp_orders_with_snapshot": 8,
  "service_US_live": false,
  "service_US_ready": 0,
  "user_countries": 17,
  "user_products": 8,
  "user_stripe": "42501"
}
```

## K1: próba migracji dokumentów w transakcji wycofanej (sztuczny obiekt storage, wersja 1.1-dryrun)

Czas wyniku (UTC): `2026-09-17T11:29:18.821Z`

```json
{
  "A_first": {
    "created": true,
    "documentKey": "GELATO_BASE_INGREDIENTS",
    "documentVersion": "1.1-dryrun",
    "emailJobId": null,
    "qaAccount": true,
    "qaRecipient": "info@gellatti.com"
  },
  "A_same_order": true,
  "A_second_created": false,
  "B_created": true,
  "B_distinct_order": true,
  "B_not_entitled": {
    "error": "document_not_available"
  },
  "admin_documents": 3,
  "admin_documents_as_B": "finance_administrator_required",
  "admin_documents_fn_anon": false,
  "admin_orders_v1_unchanged": true,
  "authenticated_reads_registry": "42501",
  "authenticated_sees_objects": 0,
  "avail_A": true,
  "avail_B": false,
  "avail_anon": {
    "documentKey": "GELATO_BASE_INGREDIENTS",
    "language": "en",
    "orderable": false,
    "state": "TEST_ACCOUNTS_ONLY"
  },
  "avail_unknown_key": {
    "documentKey": "NOPE",
    "orderable": false,
    "state": "OFF"
  },
  "availability_fn_anon": true,
  "bucket": {
    "limit": 20971520,
    "mime": [
      "application/pdf"
    ],
    "public": false
  },
  "change_sha": "shop_document_version_is_immutable",
  "delete_referenced_version": "23503",
  "dl_A_own": {
    "asAdmin": false,
    "bucket": "shop-documents",
    "byteSize": 1000,
    "documentVersion": "1.1-dryrun",
    "fileName": "Gellatti-Gelato-Base-Ingredients-EN.pdf",
    "path": "gelato-base-ingredients/1.1-dryrun/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf"
  },
  "dl_B_on_A": {
    "error": "order_not_found"
  },
  "dl_finance_on_A_asAdmin": true,
  "dl_null_user": {
    "error": "unauthorized"
  },
  "document_orders_after_refusal": 0,
  "document_with_price": "23514",
  "download_fn_authenticated": false,
  "download_when_off_ok": true,
  "fake_object": "ok",
  "migration_sha256": "3a6a07b7f159cfc8c907eadf1e7e27098e81f18ebce306a61898bc12ecc86529",
  "my_documents_A": 1,
  "my_documents_B": 1,
  "my_documents_B_own": true,
  "my_documents_fn_anon": false,
  "my_orders_v1_unchanged_A": true,
  "non_document_orders_after": 16,
  "order_fn_anon": false,
  "order_fn_authenticated": false,
  "order_fn_service": true,
  "order_when_off": {
    "error": "document_not_available"
  },
  "order_when_on_finance_created": true,
  "order_without_file": {
    "error": "document_file_missing"
  },
  "orders_before": 16,
  "physical_with_document_key": "23514",
  "registry_anon_select": false,
  "registry_authenticated_select": false,
  "revenue_v1_unchanged": true,
  "second_active_order_same_version": "23505",
  "ship_document": "digital_document_has_no_fulfilment"
}
```

## K1: próba rollbacku (wszystko identyczne poza bucketem, którego storage nie pozwala usunąć SQL-em)

Czas wyniku (UTC): `2026-09-17T11:35:05.664Z`

```json
{
  "bucket_pre_mid_post": [
    false,
    true,
    true
  ],
  "columns_equal": true,
  "constraints_equal": true,
  "fn_count_pre_mid_post": [
    5,
    11,
    5
  ],
  "fn_diff": null,
  "fn_equal": true,
  "identical_except_bucket": true,
  "indexes_equal": true,
  "migration_sha256": "3a6a07b7f159cfc8c907eadf1e7e27098e81f18ebce306a61898bc12ecc86529",
  "registry_pre_mid_post": [
    false,
    true,
    false
  ],
  "rollback_sha256": "860ea5780b76c798fca9c170a5433bcc62a142330f0bf389e995fca39a9dc506"
}
```
