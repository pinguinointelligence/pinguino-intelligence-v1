# Legacy `products` → Mapper Basement mapping report

Date: 2026-07-18
Source: read-only Supabase MCP against STAGING `tunabqqrwabacxjcxxkz`
(verified live: `mapper_basement` = 2083 rows, `products` = 69 rows before trusting anything).

> Binding owner decision (2026-07-18): the ~69 `products` rows and the bundled 66-product
> frontend sample are LEGACY transitional data. Their useful content lives in the canonical
> 2,083-row `mapper_basement` („Składniki PI"). They are NO LONGER a shared/public catalogue.
> The `products` table, Product Intake domain, OCR pipeline, private-product architecture,
> readiness, and `product_snapshots` are PRESERVED for FUTURE user-created private products.

## 1. Headline facts

- All **69** product rows are a single import batch: `source_type = 'mercadona'`,
  `catalog_source = NULL`, owned by **one** user (`owner_user_id = 8bb05419-16c5-4f43-a038-213dff23e7ee`),
  `product_code` range `PR-ING-000002` … `PR-ING-000070`, all `is_active = true`, `dataset_version = NULL`.
- Status split: **23** `pi_generated` (all matched), **42** `draft`, **1** `pi_calculated`, **3** `rejected`.
- **23** rows carry a `matched_basement_id` (all `match_confidence = high`, `match_method = manual_mapping`),
  folding onto **16 distinct** `mapper_basement` ingredients (7 rows are duplicate mappings onto an
  already-represented ingredient).

## 2. Classification summary

| Class | Count | Meaning |
|---|---:|---|
| fully-represented-in-mapper | 16 | matched to a **distinct** mapper ingredient (content captured 1:1) |
| duplicate | 7 | matched, but onto a mapper ingredient already represented by an earlier row |
| no-longer-needed | 3 | `status = 'rejected'` (dead legacy rows — not gelato ingredients / rejected mapping) |
| unmatched | 43 | 42 `draft` + 1 `pi_calculated`, **no** `matched_basement_id` (raw label content NOT in mapper) |
| **total** | **69** | |

(All 23 matched rows = 16 fully-represented + 7 duplicate.)

## 3. FK / reference audit

The only hard foreign key **into** `public.products` is `product_snapshots.product_id`
(FK `product_snapshots_product_id_fkey`, `ON DELETE CASCADE`).

| Referencing table | Column | Rows referencing these 69 products |
|---|---|---:|
| `product_snapshots` | `product_id` (FK, ON DELETE CASCADE) | **69** (one per product, all `change_type = 'created'`) |
| `saved_recipes` | `recipe_input` (jsonb, no FK) | **0** — the single saved recipe („Raspberry Cream") references no product id or product_code |
| `accepted_corrections` | `recipe_id`/snapshots (jsonb, no FK) | **0** (table empty) |
| any other table | — | none (no other FK targets `products`) |

Repo grep (`PR-ING-…`, `customerCatalogueSnapshot`, `BUNDLED_CATALOGUE`, product uuids): **no test or
fixture hardcodes a live `products.id` UUID.** The frontend coupling was the bundled snapshot only —
`src/data/products/customerCatalogueSnapshot.ts` (a static staging export) consumed by
`src/features/product-picker/bundledCatalogue.ts` and its test. That snapshot is removed in this change
(Deliverable 3); no DB row id is referenced by any test.

Conclusion: **no external row references** the 69 products. The only dependents are their own
`product_snapshots` (obsolete `created` snapshots from the import), which cascade with the parent.

## 4. Deletion decision (safe set)

Two instructions are in tension: the owner decision treats the whole batch as legacy, while the task
requires unmatched rows to be **retained + reported**. The migration therefore takes the **conservative,
maximally-safe** predicate:

```
source_type = 'mercadona' AND (matched_basement_id IS NOT NULL OR status = 'rejected')
```

- **Targets exactly 26 rows** (23 matched — content provably in `mapper_basement` — + 3 rejected/dead),
  and **26** dependent `product_snapshots`.
- **Retains 43 unmatched draft rows** (raw label content not yet in the mapper). They are unverified,
  unreferenced, `is_active` legacy rows; retaining them loses nothing and keeps any not-yet-mapped label
  data available for future mapper work / private-product seeding.
- Reversible: `0034` first copies both target sets into `_backup_legacy_products_0034` /
  `_backup_legacy_product_snapshots_0034`.
- Never touches future OCR/manual/private products: those will be `customer_upload` / `label_scan` /
  `barcode_ean` / `manual` / `api`, never `mercadona`, and none are matched-or-rejected mercadona rows.

If the owner later wants the full-batch cleanup (all 69), widening the predicate to `source_type = 'mercadona'`
is a one-line change — the header of `0034` documents it. MCP access here is **read-only**; the migration is
FILE-ONLY and is applied by the owner after review.

Safe to delete now: **26**. Retained (unmatched, reported): **43**. Referenced externally: **0**.

## 5. Full per-row mapping (all 69)

Legend for class: R = fully-represented, D = duplicate, X = no-longer-needed (rejected), U = unmatched.
`source_type` = `mercadona` and `owner` = `8bb05419…` for every row (omitted from the table).

| product_code | id | product_name_display | brand | ean_code | status | matched_basement_id | mapper ingredient | class |
|---|---|---|---|---|---|---|---|:--:|
| PR-ING-000002 | 18313d47-ddad-4e4e-b1f9-ba39c9ad9434 | Leche entera Hacendado brick 1L | Hacendado | 8402001002083 | pi_generated | PI-ING-000236 | MILK 3.5% · Milk · Chilled | R |
| PR-ING-000003 | 6fe0aaaa-6b6d-4fca-9c4f-7c04165b4a0b | Leche semidesnatada Hacendado brick 1L | Hacendado | 8402001002106 | pi_generated | PI-ING-000234 | MILK 1.5% · Milk · Chilled | R |
| PR-ING-000004 | ddeffe10-bea5-45ca-8a22-0ffc10427e47 | Leche desnatada Hacendado brick 1L | Hacendado | 8410297112010→8402001002120 | draft | — | — | U |
| PR-ING-000005 | de50368f-af7f-4d54-a598-ca23ba101369 | Leche entera Asturiana brick 1L | Central Lechera Asturiana | 8410297112010 | pi_generated | PI-ING-000236 | MILK 3.5% · Milk · Chilled | D |
| PR-ING-000006 | a761860b-1642-467e-8a05-80dc6052fa21 | Leche en polvo desnatada Hacendado | Hacendado | 8402001019067 | pi_generated | PI-ING-000270 | SKIMMED MILK · Milk | R |
| PR-ING-000007 | 9c5df76f-5415-4236-a0a2-29b866e23d20 | Leche semidesnatada sin lactosa Hacendado brick | Hacendado | 8480000104731 | draft | — | — | U |
| PR-ING-000008 | efe7140d-328a-44b2-b826-4123d5195388 | Leche entera sin lactosa Hacendado brick | Hacendado | 8480000104694 | draft | — | — | U |
| PR-ING-000009 | 9c6674ac-bda3-4c84-bbd4-b9a613edc945 | Leche desnatada +Proteínas & calcio Hacendado brick | Hacendado | 8480000106780 | draft | — | — | U |
| PR-ING-000010 | 0acf8585-0967-4d8f-ad4e-597d2dd26f6a | Nata para montar Hacendado brick | Hacendado | 8402001017742 | pi_generated | PI-ING-000180 | CREAM 30% · Mlekovita Cream · Chilled | R |
| PR-ING-000011 | 50bee8c3-60b4-447a-84c6-ce8474e2ff59 | Nata fresca para cocinar Hacendado tarrina | Hacendado | 8480000101174 | pi_generated | PI-ING-000180 | CREAM 30% · Mlekovita Cream · Chilled | D |
| PR-ING-000012 | a8cecf22-d2ef-4426-af9a-8133a1516782 | Nata ligera para cocinar Hacendado pack 3 | Hacendado | 8480000101990 | pi_generated | PI-ING-000179 | CREAM 18% · Piątnica Cream · Chilled · BIO | R |
| PR-ING-000013 | 36207c65-f33d-4464-94e2-9730cf84579c | Queso fresco mascarpone de vaca Hacendado | Hacendado | 8480000510723 | pi_generated | PI-ING-000232 | MASCARPONE CREAM CHEESE · Cream · Chilled | R |
| PR-ING-000014 | 083de8ba-6a49-452a-819b-e71cc9607822 | Yogur natural Hacendado pack 6 | Hacendado | 8480000223135 | pi_calculated | — | — | U |
| PR-ING-000015 | 8b2e2b1f-5f35-4a72-97da-22b1352f8e43 | Yogur natural azucarado Hacendado pack 6 | Hacendado | 8480000207234 | rejected | — | — | X |
| PR-ING-000016 | 60411d8d-9731-4f71-acf6-3c1a81c0771b | Yogur griego natural Hacendado pack 6 | Hacendado | 8480000205599 | draft | — | — | U |
| PR-ING-000017 | 9458f1f3-d42d-4f08-ad04-876523d75d8f | Yogur griego natural Hacendado bote 1kg | Hacendado | 8480000205124 | draft | — | — | U |
| PR-ING-000018 | 9b3ee5c6-2958-40be-bcae-875cd30eb798 | Yogur griego natural ligero Hacendado 2% MG pack 6 | Hacendado | 8402001012051 | draft | — | — | U |
| PR-ING-000019 | 141ce464-5cf2-4e33-9c60-3b0b51b64e46 | Yogur griego natural ligero Hacendado 2% MG bote 1kg | Hacendado | 8480000213587 | draft | — | — | U |
| PR-ING-000020 | f5c2d6a7-87f1-42d4-a2e2-de82b3af844e | Yogur griego stracciatella Hacendado pack 6 | Hacendado | 8480000205711 | rejected | — | — | X |
| PR-ING-000021 | f5788b93-2fe6-40a0-b349-70f3f315c409 | Yogur sin lactosa natural Hacendado 0% MG pack 4 | Hacendado | 8480000201645 | draft | — | — | U |
| PR-ING-000022 | ddf0001b-8ffa-4ea5-83ed-c4babc477581 | Kéfir natural sabor suave Hacendado bote | Hacendado | 8436547770137 | draft | — | — | U |
| PR-ING-000023 | ffdb6671-f861-4d0d-8866-cbfd45dadccd | Kéfir bebible Hacendado | Hacendado | 8480000156624 | draft | — | — | U |
| PR-ING-000024 | 3489e1f1-fa4b-47d5-96ff-a56cd8e56b32 | Chocolate blanco Hacendado tableta | Hacendado | 8480000124760 | pi_generated | PI-ING-000142 | WHITE CHOCOLATE 30% · Pi-NUTS Chocolate · Dry | R |
| PR-ING-000025 | 21e46b0c-a5f3-44a6-8aee-50cfd9cc1c4a | Chocolate blanco fundir Hacendado tableta | Hacendado | 8480000125439 | pi_generated | PI-ING-000142 | WHITE CHOCOLATE 30% · Pi-NUTS Chocolate · Dry | D |
| PR-ING-000026 | d21b01cb-5794-43ad-9682-555af2087d44 | Chocolate con leche Classic Hacendado tableta | Hacendado | 8402001041471 | draft | — | — | U |
| PR-ING-000027 | 6fd803a3-e366-4b46-b432-70e0d76385d4 | Chocolate con leche fundir Hacendado tableta | Hacendado | 8480000125330 | pi_generated | PI-ING-000122 | MILK CHOCOLATE COCOA 32% · ICAM Couverture · Dry | R |
| PR-ING-000028 | c9767917-5976-4394-8f8c-aed34edc0096 | Chocolate negro 72% de cacao Hacendado tableta | Hacendado | 8480000237736 | draft | — | — | U |
| PR-ING-000029 | 7a13f4a6-7d9a-4155-a2d8-0d6c46bb9381 | Chocolate negro 85% cacao Hacendado tableta | Hacendado | 8480000607225 | pi_generated | PI-ING-000089 | BITTER CHOCOLATE POWER 80% · Callebaut Couverture · Dry | R |
| PR-ING-000030 | 4702e055-a410-4fa3-affb-e4276e029250 | Chocolate negro 99% cacao Hacendado tableta | Hacendado | 8480000125866 | draft | — | — | U |
| PR-ING-000031 | 69fb82a0-62a8-4eb2-94ed-4e1fbe648691 | Chocolate extrafino con leche Hacendado 0% azúcares añadidos | Hacendado | 8402001033902 | pi_generated | PI-ING-000096 | CHOCOLATE MALCHOC M · Callebaut Chocolate · Dry | R |
| PR-ING-000032 | 658056c0-6477-46a8-bc54-485e7a8eced2 | Chocolate negro 85% extrafino y edulcorante Hacendado 0% azúcares | Hacendado | 8402001025594 | draft | — | — | U |
| PR-ING-000033 | 8a81d140-8b9e-4066-9340-7c11f4957576 | Cacao puro en polvo La Chocolatera 0% azúcares añadidos | La Chocolatera | 8410109121551 | draft | — | — | U |
| PR-ING-000034 | 009ef0c2-3e89-488b-b96b-ba17c8092799 | Cacao en polvo a la taza Hacendado | Hacendado | 8402001025617 | draft | — | — | U |
| PR-ING-000035 | cddd7775-6942-43b2-b5cd-88fbbe1dc9ff | Pistacho natural Hacendado pelado | Hacendado | 8480000342621 | draft | — | — | U |
| PR-ING-000036 | af469523-7dac-4b1b-8d34-5f4bb8fc6f33 | Crema de pistacho Hacendado tarro | Hacendado | 8480000804884 | pi_generated | PI-ING-000427 | PISTACCHIO CROCK · Irca Nut · Dry | R |
| PR-ING-000037 | 06e02386-ff19-4e5b-96ae-164abccbe98c | Crema de leche y avellanas Hacendado tarro | Hacendado | 8480000225092 | draft | — | — | U |
| PR-ING-000038 | aee21517-de03-450a-8b8f-310c5550bef0 | Crema al cacao con avellanas Hacendado bote | Hacendado | 8402001045004 | draft | — | — | U |
| PR-ING-000039 | b62635c8-c96a-45f8-9f3c-868e38d55347 | Crema de avellanas y cacao Hacendado bote | Hacendado | 8402001025693 | draft | — | — | U |
| PR-ING-000040 | acc925f1-289b-4f85-8a22-34d4b1a787e9 | Almendra natural Hacendado sin piel paquete | Hacendado | 8480000235756 | draft | — | — | U |
| PR-ING-000041 | 0a4a2c13-b0aa-4b82-9f8f-595600cb1ab1 | Almendra natural Hacendado paquete | Hacendado | 8402001001727 | draft | — | — | U |
| PR-ING-000042 | 9853db86-b203-429b-9f4b-2c04f94a9c17 | Almendra molida Hacendado paquete | Hacendado | 8480000349217 | draft | — | — | U |
| PR-ING-000043 | 3b68309f-7f77-41e3-82f1-62c44aae9955 | Crema de cacahuete 100% Hacendado tarro | Hacendado | 8480000168832 | pi_generated | PI-ING-000435 | PEANUT JOHNNY CASTE E · Iannino Paste · Dry | R |
| PR-ING-000044 | ff8099d6-a6cf-4aa1-93f2-78becfe040b1 | Crema de cacahuete 100% Crunchy Hacendado tarro | Hacendado | 8480000228369 | pi_generated | PI-ING-000435 | PEANUT JOHNNY CASTE E · Iannino Paste · Dry | D |
| PR-ING-000045 | b3ddb65d-e999-4ffe-bc56-6dcb211fa589 | Cacahuete +Proteínas en polvo desgrasado Hacendado | Hacendado | 8480000137388 | draft | — | — | U |
| PR-ING-000046 | 259ec9a7-6d69-4dcb-ba6e-0b0a7b3b8536 | Fresas enteras Hacendado ultracongeladas | Hacendado | 8480000610928 | pi_generated | PI-ING-000406 | WILD STRAWBERRY · Fresh Fruit | R |
| PR-ING-000047 | 365cd65d-e12c-4696-8aaf-4495cdc8499e | Arándanos enteros Hacendado ultracongelados | Hacendado | 8480000610935 | pi_generated | PI-ING-000347 | BLUEBERRY · Fresh Fruit | R |
| PR-ING-000048 | 4da6ec7f-1aaf-4672-8567-0c3c2151965a | Mix frutos rojos Hacendado ultracongeladas | Hacendado | 8480000610898 | draft | — | — | U |
| PR-ING-000049 | 1aef798c-ea03-4c38-8d93-9895b6026797 | Mix frutas tropical Hacendado ultracongeladas | Hacendado | 8402001024733 | draft | — | — | U |
| PR-ING-000050 | 4d571b5a-a35f-4525-bbfe-fb8c99fac4d6 | Dúo frutas fresa y plátano Hacendado congeladas | Hacendado | 8402001037139 | draft | — | — | U |
| PR-ING-000051 | 6db4d4de-c376-409d-993b-fbafe470efee | Pudding sabor café +Proteínas Hacendado 12g | Hacendado | 8402001025235 | draft | — | — | U |
| PR-ING-000052 | 4ba67447-93cd-4ed6-9a68-e32acf23fc4c | Pudding sabor caramelo +Proteínas Hacendado pack 4 | Hacendado | 8402001025242 | draft | — | — | U |
| PR-ING-000053 | bd800505-db69-45a8-96ed-da0931450b5b | Bebida láctea sabor fresa +Proteínas Hacendado 0% MG 20g | Hacendado | 8480000213334 | draft | — | — | U |
| PR-ING-000054 | 31a9a7df-ccb3-4c61-a1ea-dd5d86c2a079 | Batido lácteo sabor chocolate +Proteínas Hacendado 30g brick | Hacendado | 8402001025334 | rejected | — | — | X |
| PR-ING-000055 | f4e6f628-0a3d-4dba-9318-79f0d5c7ee3b | Bebida láctea fresa-plátano +Proteínas Hacendado 17.4g | Hacendado | 8402001030383 | draft | — | — | U |
| PR-ING-000056 | 4b097465-1a6f-4d70-a956-10e9931159bb | Postre lácteo con arándanos +Proteínas Hacendado pack 4 | Hacendado | 8480000210739 | draft | — | — | U |
| PR-ING-000057 | 21a90a42-f127-40e3-93b0-c2fc8b719a5a | Confitura de fresa Hacendado 0% azúcares añadidos | Hacendado | 8402001009266 | draft | — | — | U |
| PR-ING-000058 | 0598ac65-1568-4b67-aa21-9266adfa1336 | Confitura de melocotón Hacendado 0% azúcares añadidos | Hacendado | 8402001011771 | draft | — | — | U |
| PR-ING-000059 | afb858ee-b952-4907-ad49-49f0894890e6 | Mermelada albaricoque Hacendado light 0% azúcares | Hacendado | 8480000150691 | draft | — | — | U |
| PR-ING-000060 | 1a8cadeb-88b2-4156-8dab-b3b26e4b3feb | Edulcorante Eritritol y Sucralosa Hacendado bote | Hacendado | 8480000676375 | draft | — | — | U |
| PR-ING-000061 | f7e2d18a-4be5-4c1c-a425-6fd7da976a37 | Edulcorante en pastillas stevia Hacendado | Hacendado | 8480000198129 | draft | — | — | U |
| PR-ING-000062 | 044c4d87-b7bc-4631-b941-09a3112ce744 | Edulcorante granulado stevia Hacendado bote | Hacendado | 8480000198174 | draft | — | — | U |
| PR-ING-000063 | fec56c55-12a9-4544-a085-73879d968818 | Edulcorante sacarina en sobres Hacendado | Hacendado | 8480000198082 | draft | — | — | U |
| PR-ING-000064 | b54ab248-2163-4884-ae34-ec1616c6854d | Café en grano natural Hacendado | Hacendado | 8402001041174 | pi_generated | PI-ING-000166 | COFFEE BEAN ROASTED GROUND · Coffee · Dry | R |
| PR-ING-000065 | 278ac401-0e89-4d15-81b9-c88686c0f6d1 | Café en grano extra fuerte Hacendado | Hacendado | 8402001043239 | pi_generated | PI-ING-000166 | COFFEE BEAN ROASTED GROUND · Coffee · Dry | D |
| PR-ING-000066 | e873f335-050f-46d7-ad39-7f0642082e7d | Café molido natural Hacendado | Hacendado | 8480000111722 | pi_generated | PI-ING-000166 | COFFEE BEAN ROASTED GROUND · Coffee · Dry | D |
| PR-ING-000067 | 5e6a7b3e-b636-4099-8b7d-935ac357eee8 | Café molido natural Hacendado Espresso | Hacendado | 8480000117144 | pi_generated | PI-ING-000166 | COFFEE BEAN ROASTED GROUND · Coffee · Dry | D |
| PR-ING-000068 | 94cad021-b6ed-40cb-9fef-37a02e92e5a0 | Café molido mezcla Hacendado Espresso | Hacendado | 8480000159236 | draft | — | — | U |
| PR-ING-000069 | 0dab9215-6630-40f0-b25f-cda7b7a3352c | Aroma de vainilla Hacendado bote | Hacendado | 8402001020599 | draft | — | — | U |
| PR-ING-000070 | 75f14ec2-eab6-41b4-8f89-67aa5102edd8 | Azúcar vainillado Hacendado paquete | Hacendado | 8480000325259 | pi_generated | PI-ING-000516 | VANILLIN SUGAR · Sweetener · Dry | R |

> Note on PR-ING-000004: the DB `ean_code` is `8402001002120`; the Asturiana row PR-ING-000005 carries
> `8410297112010`. (Typo guard — the table above shows both to flag that PR-004 is a distinct draft, not a dup.)

## 6. Deletion targets (26 rows) — exact list

Matched (23): PR-ING-000002, 000003, 000005, 000006, 000010, 000011, 000012, 000013, 000024, 000025,
000027, 000029, 000031, 000036, 000043, 000044, 000046, 000047, 000064, 000065, 000066, 000067, 000070.

Rejected (3): PR-ING-000015, 000020, 000054.

Retained (43 unmatched drafts / 1 pi_calculated): every remaining `PR-ING-*` code above with class `U`.

Migration: `supabase/migrations/0034_remove_legacy_products.sql` (FILE ONLY — read-only MCP, owner-applied).
