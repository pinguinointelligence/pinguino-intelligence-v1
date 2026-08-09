# Flavor Floor Registry

Status: fail-closed production registry. Exact product evidence authorizes only the exact product/form/profile entry.

## Safety contract

Flavor identity is primary. A Main ingredient may not disappear, change canonical identity, or be replaced by a flavor-defining concentrate, paste, extract, aroma, or compound introduced by PI.

For an exact verified policy, the minimum final-mix share is enforced. For unknown identity, ambiguous form, unsupported profile, or reference-only evidence, the Main baseline is frozen. Unknown never authorizes reduction.

Multi-Main recipes preserve their canonical identities and ratio with one shared scale. If any Main is unknown, the shared scale cannot reduce the group below its baseline.

Manufacturer dosage normalized from x g + 1000 g base uses:

floor g/kg final = 1000 \* x / (1000 + x)

The registry is product-layer evidence. It does not modify Mapper data or Engine science.

## Runtime exact policies

| Family     | Canonical ID  | Exact product/form                     | Minimum g/kg final | Runtime state |
| ---------- | ------------- | -------------------------------------- | -----------------: | ------------- |
| Strawberry | PI-ING-000737 | PreGel Strawberry Fortefrutto ST-45872 |              19.61 | Exact policy  |
| Raspberry  | PI-ING-000732 | PreGel Raspberry Fortefrutto ST-46272  |              19.61 | Exact policy  |
| Hazelnut   | PI-ING-000431 | PreGel Hazelnut Piemonte IGP ST-23302  |              65.42 | Exact policy  |
| Chocolate  | PI-ING-000757 | PreGel Prontociocc ST-28322            |              90.91 | Exact policy  |
| Coffee     | PI-ING-000245 | PreGel Coffee Costa d'Oro ST-28072     |              65.42 | Exact policy  |

Fresh fruit is reference-only. It has no universal reduction authority.

## Family coverage and owner decisions

| Family     | Evidence candidate                         | Mapper readiness          | Runtime decision                         |
| ---------- | ------------------------------------------ | ------------------------- | ---------------------------------------- |
| Strawberry | Fortefrutto 20-70 g/kg base                | Exact PI-ING-000737       | Exact product only; fresh/puree unknown  |
| Banana     | Fortefrutto 20-70 g/kg base                | SKU mismatch in Mapper    | Unknown until identity is reconciled     |
| Mango      | Fortefrutto 20-70 g/kg base                | No exact Mapper product   | Unknown                                  |
| Raspberry  | Fortefrutto 20-70 g/kg base                | Exact PI-ING-000732       | Exact product only                       |
| Lemon      | Recipe reference using juice and zest      | No minimum-dose product   | Reference only; unknown                  |
| Pistachio  | Fabbri Pistacchio Puro 70-100 g/kg base    | Exact product absent      | Unknown                                  |
| Hazelnut   | PreGel Piemonte IGP minimum 70 g/kg base   | Exact PI-ING-000431       | Exact product only                       |
| Almond     | PreGel Roasted Almond minimum 70 g/kg base | Conditional PI-ING-000745 | Unknown until exact identity is approved |
| Chocolate  | Prontociocc 100-150 g/kg base              | Exact PI-ING-000757       | Exact product only                       |
| Cocoa      | Recipe reference around 62.5 g/kg final    | Not a minimum-dose policy | Reference only; unknown                  |
| Coffee     | Costa d'Oro 70 g/kg base                   | Exact PI-ING-000245       | Exact product only                       |
| Vanilla    | Fabbri White Vanilla 35-50 g/kg base       | Exact product absent      | Unknown                                  |
| Coconut    | Fabbri Cocco 70-100 g/kg base              | Exact product absent      | Unknown                                  |

## No-booster behavior

A candidate is rejected when it:

- removes a Main line;
- changes a Main canonical identity;
- breaks the existing Multi-Main ratio;
- reduces an exact Main below its floor;
- reduces an unknown Main below baseline;
- adds a new flavor-defining fruit, nut, chocolate, flavor, concentrate, paste, extract, aroma, or legacy booster line.

Existing customer-selected flavor-defining lines may remain. This registry does not authorize PI to add or increase them as compensation for Main reduction.

## Maintenance

New policies require exact canonical identity, exact form, supported product profile, source evidence, verification date, and explicit publication approval. Family-name token matching is never sufficient. The Mapper dataset must not be modified as part of registry maintenance.

## Coverage counts

- Exact-product runtime floors: 5.
- Approved family fallback floors: 0.
- Reference-only registry rows: 1.
- Audited common flavour families: 13.
- Generic/common Main families remaining UNKNOWN: 13 of 13 unless the selected row is one of the five exact canonical products above.
- UNKNOWN behavior: baseline frozen; ECO cannot reduce Main.

## Primary evidence sources

- [PreGel Strawberry Fortefrutto ST-45872](https://shop.pregelamerica.com/strawberry-fortefrutto-45872)
- [PreGel Banana Fortefrutto ST-40472](https://shop.pregelamerica.com/banana-fortefrutto-40472)
- [PreGel official product catalogue](https://pregelamerica.com/pga_collateral/PreGel_Product_Catalog.pdf)
- [PreGel frozen-dessert catalogue](https://pregelamerica.com/pga_collateral/PreGel_CatalogFrozen.pdf)
- [Fabbri Pistacchio Puro](https://en.fabbri1905.com/fabbri-products/pistacchio-puro.kl)
- [Fabbri White Vanilla](https://en.fabbri1905.com/fabbri-products/delipaste-white-vanilla.kl)
- [Fabbri Cocco EU](https://en.fabbri1905.com/fabbri-products/cocco-eu.kl)
- [Fabbri Nevia Crema e Frutta](https://en.fabbri1905.com/fabbri-products/nevia-crema-e-frutta-.kl)
- [Carpigiani Strawberry Sorbet](https://carpigiani.com/it/news/sorbetto-Fragola-ricetta-FreezeGo)
- [Carpigiani Lemon Sorbet](https://www.carpigiani.com/us/news/lemon-sorbet)
- [Carpigiani Chocolate Gelato](https://carpigiani.com/us/news/chocolate-gelato-FreezeGo)
- [Carpigiani Coffee Gelato](https://carpigiani.com/us/news/coffee-gelato)

Manufacturer dosage is accepted only for the exact selected product and form. Recipe references remain reference-only and do not authorize a production floor.
