# Odczyty bazy SHOP tylko przez SELECT (2026-09-17)

- **Projekt:** Supabase `tunabqqrwabacxjcxxkz`. To jedyny projekt w organizacji, wspólny dla staging i produkcji.
- **Zakres:** tylko SELECT i tylko agregaty. Nie czytano e-maili, adresów, identyfikatorów użytkowników ani treści snapshotów.

## 1. `shop_products` (bez kolumny `description`)

| sku | kind | cena (centy) | dostępność | image_url |
|---|---|---:|---|---|
| GEL-STARTER-PACK | bundle | 5900 | preorder (6 tyg.) | null |
| GEL-DEX-500 | single | 490 | in_stock | null |
| GEL-FRU-500 | single | 590 | in_stock | null |
| GEL-INU-500 | single | 990 | in_stock | null |
| GEL-YOL-500 | single | 1490 | in_stock | null |
| GEL-SMP-500 | single | 790 | in_stock | null |
| GEL-CRP-500 | single | 1090 | in_stock | null |
| GEL-STB-500 | single | 1290 | in_stock | null |

- Wszystkie 8 wierszy jest aktywnych.
- Nie ma produktu infopaku.

## 2. Kraje, gotowość i komponenty

| miara | wartość |
|---|---:|
| `shop_countries` razem / aktywne | 17 / 17 |
| `physical_starter_pack_available` | 15 |
| `local_starter_pack_available` (zamiar) | 3 |
| `shop_country_local_readiness.local_starter_pack_live` | 1 |
| kraje z komponentami (`components_ready/required`) | US 7/7 |
| wiersze komponentów testowych (`example.invalid`, „TEST PLACEHOLDER”, dostawca „TEST…”) | 7, wszystkie US |
| `shop_bundle_items` | 7 |

## 3. Zamówienia (agregaty)

| order_type | status | fulfillment | zamówień | ze snapshotem | total = 0 |
|---|---|---|---:|---:|---:|
| LOCAL_STARTER_PACK | paid | delivered | 8 | 8 | 8 |
| PHYSICAL | cancelled | awaiting | 3 | 0 | 0 |
| PHYSICAL | paid | awaiting | 1 | 0 | 0 |
| PHYSICAL | paid | delivered | 1 | 0 | 0 |
| PHYSICAL | paid | shipped | 1 | 0 | 0 |
| PHYSICAL | pending | awaiting | 2 | 0 | 0 |

Zamówienia LOCAL_STARTER_PACK według kraju i dnia:

| kraj | dzień | zamówień | z zadaniem mailowym | z atrybucją partnera | suma (centy) |
|---|---|---:|---:|---:|---:|
| US | 2026-09-03 | 8 | 7 | 0 | 0 |

## Ograniczenia interpretacji

- **Zamówienia.** 8 zamówień LOCAL_STARTER_PACK powstało jednego dnia (2026-09-03), w jedynym kraju z testowymi komponentami. Tego dnia scalono PR #128 i #132. Wskazuje to na zamówienia testowe przy wdrożeniu, ale bez odczytu danych osobowych nie jest to potwierdzone (**NOT_VERIFIED**). To nie jest dowód zakupów klientów ani kompletności rozwiązania.
- **Komponenty testowe.** 7 wierszy komponentów US nie dowodzi gotowości oferty zakupowej. Są to dane testowe, a tryb „live” w US wynika wyłącznie z nich.

## 4. Flagi Lokalnego Zestawu Startowego dla US (2026-09-17, do K4)

Jeden SELECT na widoku `shop_country_local_readiness` (tylko flagi kraju i uprawnienia widoku, bez danych klientów):

| iso2 | active | physical_starter_pack_available | local_starter_pack_available | local_starter_pack_live | anon SELECT na widoku | authenticated SELECT na widoku |
|---|---|---|---|---|---|---|
| US | true | false | true | true | true | true |

- Żaden inny kraj nie ma `local_starter_pack_live = true`.
- Po zmianie z K4 tryb US to `none`: US nie ma paczki fizycznej, a lokalny zestaw przestaje być „live”.
- Uprawnienie `SELECT` dla `anon` istnieje. Mimo to niezalogowany gość dostaje 401 przy odczycie widoku przez REST (przegląd staging, sekcja H2 raportu). Przyczyny nie badano (poza zakresem).

## 5. Diagnoza 401 listy krajów dla gości (2026-09-17, sekcja L raportu)

Tylko odczyt: metadane katalogu Postgres, powtórzenie w wycofanej transakcji, agregaty logów bramki (bez IP, nagłówków i kluczy).

**Widok.** `shop_country_local_readiness` ma `reloptions = {security_invoker=true}`. Tabele źródłowe: `shop_bundle_items`, `shop_countries`, `shop_country_components`, `shop_products`.

**Polityki RLS odczytu na tabelach czytanych przez klienta:**

| tabela | polityka | role | warunek |
|---|---|---|---|
| shop_bundle_items | shop_bundle_items_public_read | anon, authenticated | `true` |
| shop_countries | shop_countries_public_read | anon, authenticated | `(active = true) OR gellatti_admin_has_permission_v1('FINANCE', auth.uid())` |
| shop_countries | shop_countries_admin_write (ALL) | authenticated | `gellatti_admin_has_permission_v1('FINANCE', auth.uid())` |
| shop_country_components | shop_country_components_public_read | anon, authenticated | `(active = true) OR gellatti_admin_has_permission_v1(...)` |
| shop_country_components | shop_country_components_admin_write (ALL) | authenticated | `gellatti_admin_has_permission_v1(...)` |
| shop_products | shop_products_public_read | anon, authenticated | `(active = true) OR gellatti_admin_has_permission_v1(...)` |
| shop_shipping_rates | shop_shipping_rates_public_read | anon, authenticated | `((active = true) AND (enabled = true)) OR gellatti_admin_has_permission_v1(...)` |
| shop_shipping_rates | shop_shipping_rates_admin_write (ALL) | authenticated | `gellatti_admin_has_permission_v1(...)` |

**Uprawnienia.** Na wszystkich 4 tabelach i na widoku `anon` ma `SELECT`.

| funkcja | SECURITY DEFINER | EXECUTE anon | EXECUTE authenticated | ACL |
|---|---|---|---|---|
| `gellatti_admin_has_permission_v1(text,uuid)` | tak | **nie** | tak | `postgres, service_role, authenticated` |
| `gellatti_shop_catalog_v1()` | tak | tak | tak | `public, postgres, anon, authenticated, service_role` |

**Powtórzenie (wycofane transakcje).**
- `set local role anon; select count(*) from public.shop_country_local_readiness;` → `ERROR 42501: permission denied for function gellatti_admin_has_permission_v1`.
- `set local role authenticated; …` → 17 wierszy, 1 z `local_starter_pack_live`.

**Logi bramki (`edge_logs`), ścieżka `/rest/v1/shop_country_local_readiness`, metoda `GET`, okno 2026-09-16 10:30 → 2026-09-17 10:30 UTC:**

| minuta (UTC) | rola JWT | status | referer | żądań |
|---|---|---|---|---|
| 2026-09-17 07:34 | authenticated | 200 | staging.pinguinoai.com | 1 |
| 2026-09-17 09:30 | authenticated | 200 | staging.pinguinoai.com | 1 |
| 2026-09-17 09:41 | anon | 401 | staging.pinguinoai.com | 2 |
| 2026-09-17 10:06 | anon | 401 | staging.pinguinoai.com | 2 |
| 2026-09-17 10:08 | anon | 401 | staging.pinguinoai.com | 2 |
| 2026-09-17 10:09 | anon | 401 | staging.pinguinoai.com | 2 |

- 09:41 to przegląd „przed” na `b668349b`, przed merge'em #383 (10:04:09 UTC); 10:06–10:09 to przeglądy „po”.
- W oknie brak odczytów z domen produkcyjnych.
