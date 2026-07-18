# Legacy `products` — SEMANTIC audit of all 69 rows (focus: the 43 unmatched)

Date: 2026-07-18
Source: read-only Supabase MCP against **STAGING `tunabqqrwabacxjcxxkz`**
(verified live before trusting anything: `mapper_basement` = **2083** rows, `public.products` = **69** rows,
all 69 `source_type='mercadona'`). No write was ever issued; the migration is FILE-ONLY.

> Why this exists. The prior pass (`LEGACY_PRODUCTS_MAPPING_2026-07-18.md` + migration `0034`) classified rows by
> **foreign-key** only — 26 safe-to-delete (23 with `matched_basement_id` + 3 `rejected`) and **43 left unmatched**.
> Owner instruction (2026-07-18): *an existing FK link must NOT be the only proof of migration; audit all 43
> SEMANTICALLY.* This document re-audits every row by ingredient **identity + nutrition**, not by FK, and produces a
> revised delete set consumed by `supabase/migrations/0035_retire_legacy_products_reviewed.sql`.

## 0. Method

For each row: normalise the Spanish display/internal name to an ingredient identity, then search
`mapper_basement.ingredient_name_display / _internal` (ILIKE) for that identity, cross-check by `ean_code` where
present, and confirm with category + core nutrition (`fat_percent`, `total_sugars_percent`, `protein_percent`,
`total_solids_percent`, `lactose_percent`). Each row gets: best mapper candidate(s), the chosen `PI-ING-*`, a
match confidence (high / medium / low / none), a one-line normalisation note, any UNIQUE info found only on the
product row, its reference counts, and exactly one class.

Classes: `exact_mapper_representation` · `normalized_mapper_representation` · `duplicate` · `obsolete` ·
`future_private_product_retain` · `genuinely_unmatched`. The migration deletes the first four; it RETAINS the last
two and anything with a required reference.

## 1. Classification summary (all 69)

| Class | Count | Action | Meaning |
|---|---:|:--:|---|
| `exact_mapper_representation` | 3 | delete | mapper carries the same product (brand-exact twin or the canonical form of exactly this ingredient, matching nutrition) |
| `normalized_mapper_representation` | 22 | delete | mapper carries this ingredient under a generic/other-brand name, same class + nutrition |
| `duplicate` | 12 | delete | folds onto a mapper ingredient already represented by an earlier row, or a pack/format twin of an earlier row in this batch |
| `obsolete` | 3 | delete | `status='rejected'` — dead legacy rows (not gelato ingredients) |
| `future_private_product_retain` | 1 | **retain** | has a required source reference (dev Mapper-smoke row — see §3) |
| `genuinely_unmatched` | 28 | **retain** | a real ingredient whose distinguishing content is NOT in the mapper |
| **total** | **69** | | |

**Delete = 40** (3 + 22 + 12 + 3). **Retain = 29** (1 + 28). DB-verified: the 40 delete codes match exactly 40
`mercadona` rows with 40 dependent `product_snapshots`; 29 rows remain.

Versus the FK-only `0034` (deleted 26, retained 43), the semantic pass **adds 15** conclusively-represented
unmatched rows to the delete set (16 unmatched are represented, but PR-ING-000035 is held back — pistachio has only
*pastes* in the mapper, no raw-nut entry) and **subtracts PR-ING-000002** (moved to retain because it is live-wired
into the dev smoke tool). Net delete 26 → 40; net retain 43 → 29.

## 2. Reference audit (queried, not assumed)

| Referencing surface | How checked | Result |
|---|---|---|
| `product_snapshots.product_id` | only hard FK into `products` (`product_snapshots_product_id_fkey`, `ON DELETE CASCADE`) — confirmed via `pg_constraint` | **69** rows, exactly one `created` snapshot per product; 40 of them belong to the delete set |
| `saved_recipes.recipe_input` (jsonb, no FK) | 1 row („Raspberry Cream"): tested for `PR-ING`, any UUID, `mercadona`, `matched_basement` | references **none** of the 69 |
| `accepted_corrections` | row count | **0** (empty table) |
| any other table | `pg_constraint contype='f' confrelid=products` | **none** — `product_snapshots` is the only FK target |
| repo source/tests | Grep for the 69 UUIDs + owner id + `PR-ING-0000` | **one** live code reference: PR-ING-000002's UUID `18313d47-…-ba39c9ad9434` is hardcoded in `src/pages/dev/MapperSmokePage.tsx` and asserted in `mapperSmoke.test.tsx` / `MapperSmokePage.security.test.ts` |

## 3. The one required source reference — PR-ING-000002 (retained)

`src/pages/dev/MapperSmokePage.tsx` (DEV-only route `/dev/mapper-smoke`) calls the **live** orchestrator
`matchAndSaveProduct('18313d47-ddad-4e4e-b1f9-ba39c9ad9434')` on button click — that UUID is **PR-ING-000002
„Leche entera Hacendado brick 1L"**. The two tests hardcode the same UUID but do NOT touch the DB
(`mapperSmoke.test.tsx` mocks the service and asserts the rendered string; `MapperSmokePage.security.test.ts` is a
static source scan), so a row delete would not fail them — but it WOULD leave the dev smoke tool pointing at a
missing row. The prior report's claim „no test or fixture hardcodes a live products.id UUID" is therefore incorrect
for PR-ING-000002.

Decision: **RETAIN PR-ING-000002** (`future_private_product_retain`). Its ingredient content (whole milk) is fully
in the mapper (`PI-ING-000236`, and the exact Hacendado twin `PI-ING-000546`), so if the owner prefers to delete
it, first repoint `SMOKE_PRODUCT_ID`/`SMOKE_PRODUCT_CODE` in `MapperSmokePage.tsx` to a surviving product (or
remove the dev tool), then add its id to the migration.

## 4. Unique information found ONLY on a product row (not in the mapper)

These are the reasons the corresponding rows are `genuinely_unmatched` (retained). None of this content is
reproduced anywhere in `mapper_basement`:

- **Lactose-free milks** — PR-ING-000007 (semi-skim, sin lactosa), 000008 (whole, sin lactosa), 000021 (yogurt, sin lactosa 0% MG). Mapper has the base milks/yogurt but no lactose-hydrolysed variant (which shifts sweetness/PAC via free glucose+galactose).
- **Protein/calcium-fortified dairy** — PR-ING-000009 (skimmed milk +Proteínas & calcio, protein 5), plus the +Proteínas finished desserts/drinks 000051, 000052, 000053, 000055, 000056.
- **Defatted high-protein peanut powder** — PR-ING-000045 (protein 50, fat 13): mapper peanuts are all full-fat ~50 % fat / ~23 % protein pastes.
- **0%-sugar sweetened dark chocolate** — PR-ING-000032 (85 % + sweetener, sugars 1): mapper's only sugar-free chocolate is a *milk* MALCHOC (`PI-ING-000096`).
- **Sweetened drinking-cocoa „a la taza"** — PR-ING-000034 (fat 8, sugars 65, contains starch): distinct from pure cocoa powder and from Nesquik-type powders.
- **Raw peeled pistachio** — PR-ING-000035: mapper has pistachio *pastes* only, no raw-nut entry (contrast: almonds DO have a raw `ALMONDS · Nut` entry `PI-ING-001585`).
- **Fruit BLENDS** — PR-ING-000048 (mix frutos rojos), 000049 (mix tropical), 000050 (fresa+plátano): the individual fruits exist in the mapper; the fixed blends (unknown proportions) do not.
- **0%-sugar diet jams** — PR-ING-000057 (fresa), 000058 (melocotón), 000059 (albaricoque): mapper has fresh fruit / fruit pastes but no reduced-sugar jam.
- **Kefir** — PR-ING-000022, 000023: mapper has only a base-mix „SPRINT KEFIR", no fermented-kefir dairy ingredient.
- **Tabletop sweeteners** — PR-ING-000060 (eritritol+sucralosa blend), 000061 (stevia tablets), 000062 (granulated stevia), 000063 (**saccharin — absent from the mapper entirely**). Mapper has pure ERYTHRITOL/STEVIA/SUCRALOSE as bulk ingredients but not these consumer blends, and no saccharin at all.
- **Light high-protein Greek yogurt** — PR-ING-000018/000019 (2 % MG, protein 7.5): between mapper's full-fat Greek (protein ~4) and Skyr (protein 12); not cleanly represented.
- **Vanilla aroma/essence** — PR-ING-000069 (0/0/0): mapper vanillas are sugar-laden pastes/creams or a vanilla pod, not a near-zero-solids essence.

## 5. Full per-row audit (all 69)

`brand` = Hacendado unless noted. `refs` = 1 `created` product_snapshot for every row (cascade-safe); only
PR-ING-000002 additionally carries the dev-smoke code reference (§3). Confidence is for the chosen mapper identity.

| code | product (display) | EAN | status | best mapper candidate → chosen | conf | class | action |
|---|---|---|---|---|:--:|---|:--:|
| PR-ING-000002 | Leche entera brick 1L | 8402001002083 | pi_generated | `PI-ING-000236` MILK 3.5% (twin `PI-ING-000546` LECHE ENTERA Hacendado) | high | future_private_product_retain | **retain** |
| PR-ING-000003 | Leche semidesnatada brick 1L | 8402001002106 | pi_generated | `PI-ING-000234` MILK 1.5% / `PI-ING-000547` LECHE SEMIDESNATADA Hacendado | high | normalized_mapper_representation | delete |
| PR-ING-000004 | Leche desnatada brick 1L | 8402001002120 | draft | `PI-ING-000548` LECHE DESNATADA 1L Hacendado (fat 0.3, sug 4.9, prot 3.2 — exact) | high | exact_mapper_representation | delete |
| PR-ING-000005 | Leche entera Asturiana brick 1L (brand: Central Lechera Asturiana) | 8410297112010 | pi_generated | `PI-ING-000236` MILK 3.5% (same identity as 002) | high | duplicate | delete |
| PR-ING-000006 | Leche en polvo desnatada | 8402001019067 | pi_generated | `PI-ING-000270` SKIMMED MILK (powder: sug 51, prot 35.7) | high | normalized_mapper_representation | delete |
| PR-ING-000007 | Leche semidesnatada SIN LACTOSA | 8480000104731 | draft | nearest `PI-ING-000547` semi-skim — but lactose-free not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000008 | Leche entera SIN LACTOSA | 8480000104694 | draft | nearest `PI-ING-000546` whole — but lactose-free not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000009 | Leche desnatada +Proteínas & calcio (prot 5) | 8480000106780 | draft | nearest `PI-ING-000548` skim — fortification not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000010 | Nata para montar (whipping cream) | 8402001017742 | pi_generated | `PI-ING-000180` CREAM 30% | high | normalized_mapper_representation | delete |
| PR-ING-000011 | Nata fresca para cocinar | 8480000101174 | pi_generated | `PI-ING-000180` CREAM 30% (same as 010) | high | duplicate | delete |
| PR-ING-000012 | Nata ligera para cocinar | 8480000101990 | pi_generated | `PI-ING-000179` CREAM 18% | high | normalized_mapper_representation | delete |
| PR-ING-000013 | Queso fresco mascarpone | 8480000510723 | pi_generated | `PI-ING-000232` MASCARPONE CREAM CHEESE | high | exact_mapper_representation | delete |
| PR-ING-000014 | Yogur natural pack 6 | 8480000223135 | pi_calculated | `PI-ING-000241` YOGURT · Chilled (plain yogurt) | high | normalized_mapper_representation | delete |
| PR-ING-000015 | Yogur natural azucarado | 8480000207234 | rejected | — | none | obsolete | delete |
| PR-ING-000016 | Yogur griego natural pack 6 | 8480000205599 | draft | `PI-ING-000204` GREEK YOGURT | high | normalized_mapper_representation | delete |
| PR-ING-000017 | Yogur griego natural bote 1kg | 8480000205124 | draft | pack/format twin of 000016 | high | duplicate | delete |
| PR-ING-000018 | Yogur griego ligero 2% MG pack 6 (prot 7.5) | 8402001012051 | draft | nearest `PI-ING-000204` Greek — light high-protein Greek not cleanly represented | low | genuinely_unmatched | **retain** |
| PR-ING-000019 | Yogur griego ligero 2% MG bote 1kg | 8480000213587 | draft | format twin of 000018 (also retained) | low | genuinely_unmatched | **retain** |
| PR-ING-000020 | Yogur griego stracciatella | 8480000205711 | rejected | — | none | obsolete | delete |
| PR-ING-000021 | Yogur sin lactosa natural 0% MG | 8480000201645 | draft | nearest `PI-ING-001395` Skyr — lactose-free 0% not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000022 | Kéfir natural sabor suave | 8436547770137 | draft | only `PI-ING-000082` „SPRINT KEFIR" base-mix — no real kefir | none | genuinely_unmatched | **retain** |
| PR-ING-000023 | Kéfir bebible | 8480000156624 | draft | drinkable twin of 000022 (kefir unrepresented) | none | genuinely_unmatched | **retain** |
| PR-ING-000024 | Chocolate blanco tableta | 8480000124760 | pi_generated | `PI-ING-000142` WHITE CHOCOLATE 30% | high | normalized_mapper_representation | delete |
| PR-ING-000025 | Chocolate blanco fundir tableta | 8480000125439 | pi_generated | `PI-ING-000142` (same as 024) | high | duplicate | delete |
| PR-ING-000026 | Chocolate con leche Classic tableta (fat 32, sug 54) | 8402001041471 | draft | `PI-ING-000123` MILK CHOCOLATE (fat 31.8, sug 55.8) | high | normalized_mapper_representation | delete |
| PR-ING-000027 | Chocolate con leche fundir tableta | 8480000125330 | pi_generated | `PI-ING-000122` MILK CHOCOLATE COCOA 32% | high | normalized_mapper_representation | delete |
| PR-ING-000028 | Chocolate negro 72% cacao (fat 42, sug 25) | 8480000237736 | draft | `PI-ING-000100` DARK CHOCOLATE RENO FOND 72% (fat 41.5, sug 27.7) | high | normalized_mapper_representation | delete |
| PR-ING-000029 | Chocolate negro 85% cacao | 8480000607225 | pi_generated | `PI-ING-000089` BITTER CHOCOLATE POWER 80% | high | normalized_mapper_representation | delete |
| PR-ING-000030 | Chocolate negro 99% cacao (fat 52, sug 2) | 8480000125866 | draft | `PI-ING-001583` COCOA MASS 100% (fat 54, sug 0.3 — ≈ pure cocoa) | high | normalized_mapper_representation | delete |
| PR-ING-000031 | Chocolate extrafino con leche 0% azúcares | 8402001033902 | pi_generated | `PI-ING-000096` CHOCOLATE MALCHOC M (sugar-free) | high | normalized_mapper_representation | delete |
| PR-ING-000032 | Chocolate negro 85% + edulcorante 0% azúcares | 8402001025594 | draft | no sugar-free *dark* choc in mapper (MALCHOC is milk) | none | genuinely_unmatched | **retain** |
| PR-ING-000033 | Cacao puro en polvo 0% azúcares (brand: La Chocolatera; fat 14, prot 21) | 8410109121551 | draft | `PI-ING-001579` DEFATTED COCOA 12% / `PI-ING-001206` CACAO MAGRO | high | normalized_mapper_representation | delete |
| PR-ING-000034 | Cacao en polvo a la taza (fat 8, sug 65, +starch) | 8402001025617 | draft | nearest `PI-ING-002039` Nesquik — sweetened drinking-cocoa w/ starch not represented | low | genuinely_unmatched | **retain** |
| PR-ING-000035 | Pistacho natural pelado (raw nut) | 8480000342621 | draft | pistachio only as PASTE (`PI-ING-001259` etc.); no raw-nut entry | low | genuinely_unmatched | **retain** |
| PR-ING-000036 | Crema de pistacho tarro | 8480000804884 | pi_generated | `PI-ING-000427` PISTACCHIO CROCK | high | normalized_mapper_representation | delete |
| PR-ING-000037 | Crema de leche y avellanas (fat 32, sug 50) | 8480000225092 | draft | `PI-ING-001487` GRAN LATTE E NOCCIOLA (milk+hazelnut; fat 33, sug 54) | high | normalized_mapper_representation | delete |
| PR-ING-000038 | Crema al cacao con avellanas (fat 30, sug 55) | 8402001045004 | draft | `PI-ING-000124` NUTELLA / `PI-ING-002108` (fat 30.9, sug 56.3) | high | normalized_mapper_representation | delete |
| PR-ING-000039 | Crema de avellanas y cacao | 8402001025693 | draft | Nutella-type twin of 000038 | high | duplicate | delete |
| PR-ING-000040 | Almendra natural sin piel (blanched; fat 53, prot 22) | 8480000235756 | draft | `PI-ING-001585` ALMONDS · Nut (fat 53, sug 5.2, prot 25) | high | normalized_mapper_representation | delete |
| PR-ING-000041 | Almendra natural | 8402001001727 | draft | raw-almond twin of 000040 | high | duplicate | delete |
| PR-ING-000042 | Almendra molida | 8480000349217 | draft | ground-almond twin of 000040 (same composition) | high | duplicate | delete |
| PR-ING-000043 | Crema de cacahuete 100% | 8480000168832 | pi_generated | `PI-ING-000435` PEANUT JOHNNY CASTE E | high | normalized_mapper_representation | delete |
| PR-ING-000044 | Crema de cacahuete 100% Crunchy | 8480000228369 | pi_generated | `PI-ING-000435` (same as 043) | high | duplicate | delete |
| PR-ING-000045 | Cacahuete +Proteínas en polvo desgrasado (prot 50) | 8480000137388 | draft | nearest `PI-ING-000437` peanut butter — defatted protein powder not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000046 | Fresas enteras ultracongeladas | 8480000610928 | pi_generated | `PI-ING-000406` WILD STRAWBERRY | high | normalized_mapper_representation | delete |
| PR-ING-000047 | Arándanos enteros ultracongelados | 8480000610935 | pi_generated | `PI-ING-000347` BLUEBERRY | high | normalized_mapper_representation | delete |
| PR-ING-000048 | Mix frutos rojos ultracongelados (blend) | 8480000610898 | draft | individual berries exist; fixed blend does not | low | genuinely_unmatched | **retain** |
| PR-ING-000049 | Mix frutas tropical ultracongeladas (blend) | 8402001024733 | draft | individual tropicals exist; fixed blend does not | low | genuinely_unmatched | **retain** |
| PR-ING-000050 | Dúo frutas fresa y plátano congeladas (blend) | 8402001037139 | draft | strawberry + banana exist; fixed blend does not | low | genuinely_unmatched | **retain** |
| PR-ING-000051 | Pudding sabor café +Proteínas | 8402001025235 | draft | protein pudding — finished dessert, not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000052 | Pudding sabor caramelo +Proteínas | 8402001025242 | draft | protein pudding — finished dessert, not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000053 | Bebida láctea fresa +Proteínas 0% MG | 8480000213334 | draft | protein milk drink — finished, not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000054 | Batido lácteo chocolate +Proteínas | 8402001025334 | rejected | — | none | obsolete | delete |
| PR-ING-000055 | Bebida láctea fresa-plátano +Proteínas | 8402001030383 | draft | protein milk drink — finished, not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000056 | Postre lácteo arándanos +Proteínas | 8480000210739 | draft | protein dairy dessert — finished, not represented | none | genuinely_unmatched | **retain** |
| PR-ING-000057 | Confitura de fresa 0% azúcares (diet jam) | 8402001009266 | draft | strawberry exists; 0%-sugar jam does not | low | genuinely_unmatched | **retain** |
| PR-ING-000058 | Confitura de melocotón 0% azúcares (diet jam) | 8402001011771 | draft | peach exists; 0%-sugar jam does not | low | genuinely_unmatched | **retain** |
| PR-ING-000059 | Mermelada albaricoque light 0% azúcares (diet jam) | 8480000150691 | draft | apricot exists; 0%-sugar jam does not | low | genuinely_unmatched | **retain** |
| PR-ING-000060 | Edulcorante Eritritol y Sucralosa (blend) | 8480000676375 | draft | ERYTHRITOL + SUCRALOSE exist separately; this blend does not | low | genuinely_unmatched | **retain** |
| PR-ING-000061 | Edulcorante pastillas stevia (tablets) | 8480000198129 | draft | `PI-ING-001424` STEVIA exists as bulk; tabletop tablets do not | low | genuinely_unmatched | **retain** |
| PR-ING-000062 | Edulcorante granulado stevia (tabletop) | 8480000198174 | draft | STEVIA exists as bulk; granulated tabletop blend does not | low | genuinely_unmatched | **retain** |
| PR-ING-000063 | Edulcorante sacarina en sobres | 8480000198082 | draft | **saccharin is absent from the mapper entirely** | none | genuinely_unmatched | **retain** |
| PR-ING-000064 | Café en grano natural | 8402001041174 | pi_generated | `PI-ING-000166` COFFEE BEAN ROASTED GROUND | high | normalized_mapper_representation | delete |
| PR-ING-000065 | Café en grano extra fuerte | 8402001043239 | pi_generated | `PI-ING-000166` (same as 064) | high | duplicate | delete |
| PR-ING-000066 | Café molido natural | 8480000111722 | pi_generated | `PI-ING-000166` (same as 064) | high | duplicate | delete |
| PR-ING-000067 | Café molido natural Espresso | 8480000117144 | pi_generated | `PI-ING-000166` (same as 064) | high | duplicate | delete |
| PR-ING-000068 | Café molido mezcla Espresso | 8480000159236 | draft | `PI-ING-000166` COFFEE BEAN (coffee identity, same as 064) | high | duplicate | delete |
| PR-ING-000069 | Aroma de vainilla (essence, 0/0/0) | 8402001020599 | draft | mapper vanillas are sugared pastes/creams / a pod — not a near-zero-solids essence | low | genuinely_unmatched | **retain** |
| PR-ING-000070 | Azúcar vainillado paquete | 8480000325259 | pi_generated | `PI-ING-000516` VANILLIN SUGAR | high | exact_mapper_representation | delete |

## 6. Delete set (40) — exact codes for the migration

Predicate: `source_type='mercadona' AND product_code IN (…40 codes…)`.

- **exact_mapper_representation (3):** PR-ING-000004, 000013, 000070
- **normalized_mapper_representation (22):** PR-ING-000003, 000006, 000010, 000012, 000014, 000016, 000024, 000026, 000027, 000028, 000029, 000030, 000031, 000033, 000036, 000037, 000038, 000040, 000043, 000046, 000047, 000064
- **duplicate (12):** PR-ING-000005, 000011, 000017, 000025, 000039, 000041, 000042, 000044, 000065, 000066, 000067, 000068
- **obsolete (3):** PR-ING-000015, 000020, 000054

## 7. Retained set (29) — with reason

- **Required reference (1):** PR-ING-000002 (live dev Mapper-smoke row — §3).
- **genuinely_unmatched (28):** PR-ING-000007, 000008, 000009, 000018, 000019, 000021, 000022, 000023, 000032, 000034, 000035, 000045, 000048, 000049, 000050, 000051, 000052, 000053, 000055, 000056, 000057, 000058, 000059, 000060, 000061, 000062, 000063, 000069.

Every retained row keeps its single `created` product_snapshot. If the owner accepts any borderline
`genuinely_unmatched` (confidence low) row as represented — e.g. the fruit blends 000048–000050, tabletop
sweeteners 000060–000062, diet jams 000057–000059, or raw pistachio 000035 — those can be moved into the delete
list; the migration is an explicit enumeration, so promotion is a one-line-per-code change reviewed by the owner.
