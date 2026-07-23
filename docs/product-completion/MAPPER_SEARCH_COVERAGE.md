# MAPPER SEARCH COVERAGE — complete discoverability audit

**Date:** 2026-07-23 · Staging `tunabqqrwabacxjcxxkz` · Method: SQL replay of the EXACT shipped matcher semantics (normalized tokens → case-insensitive substring over the 6 safe columns: display, internal, id, brand, category, subcategory) across every active searchable row. The owner is NOT required to remember any record — this audit enumerates all of them.

## Census

| Metric | Value |
|---|---:|
| Active + engine-approved (searchable) rows | **2,070** |
| Discoverable by exact stable `PI-ING-*` ID | **2,070 (100%)** — an id's own tokens are always substrings of the id column |
| Discoverable by exact normalized display/internal name | **2,070 (100%)** after the rose-alias fix (see below) |
| Rows with an unmatchable own-name token (before fix) | 1 — `PI-ING-001462` „ROSE PETALS R A · Polska **Róża** Botanical": „roza" is non-ASCII in display and absent from internal. Closed by the `roza/rozy/rose/rosa` alias family (query „róża" now reaches the row via its „ROSE" display word). |
| Missing IDs | none |
| Coverage | **100%** by ID · **100%** by exact name (1 row needs its alias, shipped) |

Structural guarantee (why 100% holds for every row, not a sample): each significant normalized token of a row's own name is, by construction, an ASCII prefix-substring of a word in that row's raw columns (stems are suffix-strips, internal names are 100% ASCII — verified: 0 non-ASCII internal names; the 16 accent-carrying display names — BACARDÍ×10, JÄGERMEISTER, PATRÓN, KAHLÚA, BÉNÉDICTINE×2, Róża — all match through their ASCII internal names, except Róża, closed via alias). The per-query candidate sets are far below the page limit (largest verified concept family: milk = 95 < 200), so no candidate is ever cut before ranking.

## Canonical basic-ingredient inventory (exact records + concept queries)

| Concept | Canonical record | ID | Form | Concept queries |
|---|---|---|---|---|
| ordinary milk | MILK 3.5% · Milk · Chilled | `PI-ING-000236` | milk | milk, whole milk, mleko, mleko 3,5%, mleko pełne |
| whole milk | WHOLE MILK · Milk | `PI-ING-000296` | milk | milk, whole milk, mleko |
| milk 1.5/2/3.2% | MILK 1.5/2/3.2% | `PI-ING-000234/000200/000235/000201` | milk / fresh_milk | milk, mleko |
| skimmed milk powder | SKIMMED MILK · Milk | `PI-ING-000270` | skimmed_milk_powder | skimmed milk powder, mleko odtłuszczone |
| buttermilk | BUTTERMILK · Milk · Chilled | `PI-ING-000177` | buttermilk | buttermilk, maślanka |
| cream 30% | CREAM 30% · Mlekovita | `PI-ING-000180` | cream | cream, śmietana, cream 30 |
| sucrose | SUCROSE SUGAR · Sweetener | `PI-ING-000514` | sucrose | sugar, cukier, sucrose, sacharoza |
| dextrose | DEXTROSE · Sweetener | `PI-ING-000494` | dextrose | dextrose, dekstroza |
| fructose | FRUCTOSE · Sweetener | `PI-ING-000496` | fructose | fructose, fruktoza |
| glucose | GLUCOSE SYRUP DRY ×5 | `PI-ING-000497–000501` | glucose_syrup_dry | glucose, glukoza |
| invert sugar | INVERT SUGAR (+ SYRUP) | `PI-ING-001369/001370` | invert_sugar | invert sugar |
| inulin | INULIN · Specialty (+ BIO) | `PI-ING-000456/000455` | specialty_component | inulin, inulina |
| tara gum | TARA GUM · Stabilizer | `PI-ING-000492` | tara_gum | tara gum |
| guar gum | GUAR GUM · Stabilizer | `PI-ING-000472` | guar_gum | guar |
| locust bean gum | LOCUST BEAN GUM (+ CAROB) | `PI-ING-001384/000475` | locust_bean_gum | locust bean |
| pineapple | PINEAPPLE · Fresh Fruit | `PI-ING-000390` | fresh_fruit_profile | pineapple, ananas, piña |
| strawberry | STRAWBERRIES · Fresh Fruit | `PI-ING-001553` | fresh_fruit_profile | strawberry, truskawka, fresa, fragola |
| banana | BANANA · Fresh Fruit | `PI-ING-000345` | fresh_fruit_profile | banana, banan, plátano |
| raspberry | RASPBERRIES · Fresh Fruit | `PI-ING-000394` | fresh_fruit_profile | raspberry, malina |
| apple / pear / peach / apricot | … · Fresh Fruit | `PI-ING-000343/000387/000385/000344` | fresh_fruit_profile | apple/jabłko, pear/gruszka, peach/brzoskwinia, apricot/morela |
| orange / lemon-adjacent / lime / blueberry / cherry | ORANGES / LEMON PEEL·SKIN / LIME / BLUEBERRY / SWEET+SOUR CHERRIES · Fresh Fruit | `PI-ING-000380/001546+001547/000369/000347/000402+001408` | fresh_fruit_profile / fruit_peel | orange/pomarańcza, lemon/cytryna, lime/limonka, blueberry/borówka, cherry/wiśnia |
| basil (fresh herb) | BASIL · Botanical · Fresh | `PI-ING-001654` | fresh_herb | basil, bazylia, basilico |
| mint (fresh herb) | MINT · Botanical · Fresh | `PI-ING-001561` | fresh_herb | mint, mięta |
| vanilla pod | VANILLA POD · Specialty | `PI-ING-000459` | specialty_component | vanilla bean, laska wanilii, wanilia |
| vanilla paste | VANILLA · Pi-NUTS Paste (+41 forms) | `PI-ING-000334` … | vanilla_paste / cream | vanilla, wanilia, vaniglia, vainilla |
| cocoa / chocolate / pistachio / hazelnut | multiple approved rows | (families) | various | kakao/cocoa, czekolada/chocolate, pistacja/pistachio, orzech laskowy/hazelnut |

## Honestly absent natural forms (no physical record — NOT invented)

- **mango fresh fruit** — no `MANGO · Fresh Fruit` row exists (only pastes/variegati/cream); „mango" resolves to the approved processed forms.
- **whole lemon / whole orange fresh fruit** — LEMON exists as PEEL/SKIN only; ORANGE as ORANGES · Fresh Fruit + juices.
- **rosemary, thyme fresh herbs** — no active rows (fresh herbs present: BASIL `PI-ING-001654`, MINT `PI-ING-001561`; plus other botanicals).
- **vanilla extract** — no extract row (pod `PI-ING-000459`, pastes, creams exist).
- **fresh/raw ananas (Polish-named)** — `PI-ING-001351` ANANAS · Giuso Powder Mix stays `approved_for_base=false`/Blocked (curation decision; „ananas" aliases to the pineapple family).

## Dynamic freshness proof (Phase 6, performed — not simulated)

On verified staging `tunabqqrwabacxjcxxkz` (never prod `riwipywgqobrulyzrzad` / MOOTOORS `tjntmljkrxbpwjmkautu`):
1. app-filter query `zzqatest` → **0 rows**;
2. inserted reversible QA row `PI-ING-QA0001` „ZZQATEST FRESHNESS PROBE · QA" (active + approved);
3. the SAME app filter → **returns `PI-ING-QA0001`** (no redeploy, no rebuild — the query path is live);
4. deleted the QA row (reversal complete);
5. the same filter → **0 rows** again. Catalogue restored byte-identically (only the probe row was ever touched; no scientific value modified).
Client-side the contract is pinned by tests: query-keyed cache (`['ingredient-search', norm, limit]`), `staleTime` 15 s, `refetchOnMount: 'always'` — a repeat query after a data change refetches in-session. In-browser confirmation on the served authenticated picker = owner step (agent cannot log in).
