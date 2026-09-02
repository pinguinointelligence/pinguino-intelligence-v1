# Watermelon catalog → Mapper binding audit

> Status note: identity/binding evidence below is retained, but the old
> provenance-as-eligibility conclusion is superseded by the Owner's
> information-only contract. Final served proof belongs in
> `WATERMELON_FINAL_SERVED_QA.md`.

Audit date: 2026-08-15
Starting served staging SHA: `e939d33536d5e0b26637683dc5df1f274815709b`
Immutable Mapper file: `docs/ingredients/validation/mapper_basement.csv`
Mapper row count: `2088` plus header
Mapper SHA-256: `B13F5DB4AFFD9C3BE5CCBE59B40920053197A3697A3FA1BD4A859406E8BAED38`

## Served identity finding

The starting served picker did not expose canonical product/version UUIDs in
its DOM. The UUIDs below come from the linked staging authority before the
forward information-only migration. The final deployment exposes only safe
audit attributes on each result row; the required post-deploy authenticated
recapture remains tracked in `WATERMELON_FINAL_SERVED_QA.md`. No private
relation data is exposed here.

The rows are distinct exact identities. Search/display form is not used to
transfer a binding: Fresh Fruit, frozen juice, alcohol, energy drink, sports
drink and powder remain separate.

| Product ID | Product version | Product / form | Mapper ID | ProductBehavior binding | Picker status | Exact reason |
|---|---|---|---|---|---|---|
| `e3264816-1050-d2a6-cc55-149e0d363bbf` | `009d5b8a-f0bd-4c19-958b-3feec2f045f9` | WATERMELON · Fresh Fruit / `fresh` | `PI-ING-000405` | Bound; Base behavior eligible; cold-process evidence present | `Dane szacowane` | Immutable Mapper status is `Estimated`; this is visible information and not an eligibility block. |
| `54188c6b-c1c7-332d-5c60-ed30b6c4d89d` | `18894ccb-76d0-410f-8619-8e7567dee5b2` | MALIBU WATERMELON · Flavoured Rum Liqueur · 21% Vol / `alcoholic_beverage` | `PI-ING-001764` | Bound; alcohol behavior; cold-process exact-product evidence; Main is `BLOCKED_SCIENCE` | `PINGÜINO VERIFIED` | Mapper composition is `Verified / PI Calculated`; 16.6% alcohol and the liqueur form remain distinct from fruit. Main still requires profile policy. |
| `f94ca5c0-181e-fc85-3547-cb2a7e126d62` | `10c7fe54-54fa-4292-bf94-9844bfc9c32e` | RED BULL RED EDITION WATERMELON / `liquid` (`energy_drink`) | `PI-ING-001787` | Bound; beverage behavior; cold-process exact-product evidence; Main is `BLOCKED_DATA` | `PINGÜINO VERIFIED` | Mapper composition is `Verified / PI Calculated`; family evidence is still missing for Main. |
| `48e9321f-55c5-65ff-d44e-54a5cf1dfacd` | `7ea539af-5a7d-4660-8c13-8a4e3ccdb266` | RED BULL RED EDITION WATERMELON SUGARFREE / `liquid` (`energy_drink`) | `PI-ING-001788` | Bound; beverage behavior; cold-process exact-product evidence; Main is `BLOCKED_DATA` | `PINGÜINO VERIFIED` | Separate sugar-free beverage identity; family evidence is still missing for Main. |
| `c02d67da-6a60-d79d-2409-04ad28512f19` | `c4a2183c-9464-42b4-bfd8-07f151a11ed9` | SIMPLE WATERMELON · Fabbri Base Mix / `powder` | `PI-ING-000676` | Bound; Standard-only; process evidence missing | `PINGÜINO VERIFIED` | Verified technical Mapper composition; not a fresh-fruit identity and not Main. |
| `c6eda2c3-6654-90bc-71e1-36f91b6e1513` | `6437a281-10d1-4eb3-86d5-fa51bf6ac72b` | WATERMELON · Campisi Citrus Juice · Frozen / `juice` | `PI-ING-000360` | Bound; Base eligible; Main `BLOCKED_SCIENCE`; process evidence missing | `PINGÜINO VERIFIED` | Verified frozen juice is not form-compatible with Fresh Fruit and must not replace it automatically. |
| `826369d8-6a65-8e1c-ce72-f65142dc45e8` | `36fcc7dd-0f8b-47bd-a060-57a13eeb3f01` | WATERMELON · Master Martini Powder Mix / `powder` | `PI-ING-001630` | Bound; Base eligible; Main `BLOCKED_DATA`; process evidence missing | `PINGÜINO VERIFIED` | Verified technical composition; family/process evidence remains incomplete for broader use. |
| `576d8597-757c-858c-8093-b511be5df8fd` | `929a7b5b-738c-4f87-ba32-9775487143fa` | EFFECT WATERMELON SPLASH / `liquid` (`energy_drink`) | `PI-ING-001818` | Bound; Base behavior exists; Main/process evidence missing | `WYMAGA SPRAWDZENIA ETYKIETY` | Mapper status is `Estimated / Needs Label Review`; technical use remains available. |
| `437fea0a-e6a3-24ef-357c-a8d847bcbe52` | `635689d6-1607-4d53-99ea-b6e6318e0385` | MONSTER ULTRA WATERMELON / `liquid` (`energy_drink`) | `PI-ING-001927` | Bound; Base behavior exists; Main/process evidence missing | `WYMAGA SPRAWDZENIA ETYKIETY` | Mapper status is `Estimated / Needs Label Review`; technical use remains available. |
| `c124a6c2-d85a-71e4-e3ec-02e9e0073aab` | `422c9dca-ac02-4ee6-ac30-43ee096efe2c` | ROCKSTAR PUNCHED WATERMELON KIWI ZERO / `liquid` (`energy_drink`) | `PI-ING-001973` | Bound; Base behavior exists; Main/process evidence missing | `WYMAGA SPRAWDZENIA ETYKIETY` | Mapper status is `Estimated / Needs Label Review`; technical use remains available. |
| `bb0b2840-67a9-3d5b-9bb2-b664918c9528` | `e985b999-377c-437c-b2c9-4d55e7871284` | PRIME HYDRATION STRAWBERRY WATERMELON / `liquid` (`sports_drink`) | `PI-ING-002082` | Bound; Base behavior exists; Main/process evidence missing | `WYMAGA SPRAWDZENIA ETYKIETY` | Mapper status is `Estimated / Needs Label Review`; technical use remains available. |

## Fresh Watermelon decision

`PI-ING-000405` is the exact Fresh Fruit row and its immutable status remains
`Estimated`. That status is displayed but does not block Base/PI. PI-ING-000360
is Verified but is a frozen juice with different form and composition; it is
not an exact compatible Fresh Fruit reference. No binding, form or scientific
status is transferred.

## Independent binding-layer defect

The commercial catalog classifier and administrator mapping path compared the
governed Mapper status to lowercase `verified`. Mapper 2088 uses title-cased
values such as `Verified` and `Verified / PI Calculated`. This can discard an
otherwise evidence-backed commercial product binding during reclassification.

Migration `20260815143000_catalog_mapper_binding_case_repair.sql`:

- patches both server authorities to the accepted `Verified%` vocabulary;
- repairs only current commercial versions with exact `admin_mapper_decision`
  evidence and a still-active Verified Mapper target;
- explicitly excludes `mapper_reference` products;
- refuses Estimated targets;
- contains no write to `mapper_basement`.
