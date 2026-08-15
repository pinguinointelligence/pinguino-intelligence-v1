# Watermelon catalog → Mapper binding audit

Audit date: 2026-08-15
Starting served staging SHA: `e939d33536d5e0b26637683dc5df1f274815709b`
Immutable Mapper file: `docs/ingredients/validation/mapper_basement.csv`
Mapper row count: `2088` plus header
Mapper SHA-256: `B13F5DB4AFFD9C3BE5CCBE59B40920053197A3697A3FA1BD4A859406E8BAED38`

## Served identity finding

The starting served picker did not expose canonical product/version UUIDs in
its DOM. The rows below therefore identify the observed Mapper entities without
inventing the missing root/version identity. `PENDING FINAL SERVED CAPTURE` is
an explicit evidence boundary, not a product ID. The final post-deploy audit
must replace both pending columns from the new safe DOM attributes.

The rows are distinct exact identities. Search/display form is not used to
transfer a binding: Fresh Fruit, frozen juice, alcohol, energy drink, sports
drink and powder remain separate.

| Product ID | Product version | Product / form | Mapper ID | ProductBehavior binding | Picker status | Exact reason |
|---|---|---|---|---|---|---|
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | WATERMELON · Fresh Fruit / `fresh` | `PI-ING-000405` | Bound; Base behavior eligible; cold-process evidence present | `PRODUCT DATA INCOMPLETE` | Immutable Mapper status is `Estimated`, not `Verified`. The row must remain fail-closed. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | MALIBU WATERMELON · Flavoured Rum Liqueur · 21% Vol / `alcoholic_beverage` | `PI-ING-001764` | Bound; alcohol behavior; cold-process exact-product evidence; Main is `BLOCKED_SCIENCE` | `PINGÜINO VERIFIED` | Mapper composition is `Verified / PI Calculated`; 16.6% alcohol and the liqueur form remain distinct from fruit. Main still requires profile policy. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | RED BULL RED EDITION WATERMELON / `liquid` (`energy_drink`) | `PI-ING-001787` | Bound; beverage behavior; cold-process exact-product evidence; Main is `BLOCKED_DATA` | `PINGÜINO VERIFIED` | Mapper composition is `Verified / PI Calculated`; family evidence is still missing for Main. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | RED BULL RED EDITION WATERMELON SUGARFREE / `liquid` (`energy_drink`) | `PI-ING-001788` | Bound; beverage behavior; cold-process exact-product evidence; Main is `BLOCKED_DATA` | `PINGÜINO VERIFIED` | Separate sugar-free beverage identity; family evidence is still missing for Main. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | SIMPLE WATERMELON · Fabbri Base Mix / `powder` | `PI-ING-000676` | Bound; Standard-only; process evidence missing | `PINGÜINO VERIFIED` | Verified technical Mapper composition; not a fresh-fruit identity and not Main. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | WATERMELON · Campisi Citrus Juice · Frozen / `juice` | `PI-ING-000360` | Bound; Base eligible; Main `BLOCKED_SCIENCE`; process evidence missing | `PINGÜINO VERIFIED` | Verified frozen juice is not form-compatible with Fresh Fruit and must not replace it automatically. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | WATERMELON · Master Martini Powder Mix / `powder` | `PI-ING-001630` | Bound; Base eligible; Main `BLOCKED_DATA`; process evidence missing | `PINGÜINO VERIFIED` | Verified technical composition; family/process evidence remains incomplete for broader use. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | EFFECT WATERMELON SPLASH / `liquid` (`energy_drink`) | `PI-ING-001818` | Bound; Base behavior exists; Main/process evidence missing | `PRODUCT DATA INCOMPLETE` | Mapper status is `Estimated / Needs Label Review`. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | MONSTER ULTRA WATERMELON / `liquid` (`energy_drink`) | `PI-ING-001927` | Bound; Base behavior exists; Main/process evidence missing | `PRODUCT DATA INCOMPLETE` | Mapper status is `Estimated / Needs Label Review`. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | ROCKSTAR PUNCHED WATERMELON KIWI ZERO / `liquid` (`energy_drink`) | `PI-ING-001973` | Bound; Base behavior exists; Main/process evidence missing | `PRODUCT DATA INCOMPLETE` | Mapper status is `Estimated / Needs Label Review`. |
| `PENDING FINAL SERVED CAPTURE` | `PENDING FINAL SERVED CAPTURE` | PRIME HYDRATION STRAWBERRY WATERMELON / `liquid` (`sports_drink`) | `PI-ING-002082` | Bound; Base behavior exists; Main/process evidence missing | `PRODUCT DATA INCOMPLETE` | Mapper status is `Estimated / Needs Label Review`. |

## Fresh Watermelon decision

The warning is valid, not false. `PI-ING-000405` is the exact Fresh Fruit row,
but its immutable status is `Estimated`. `PI-ING-000360` is Verified but is a
frozen juice with different form and composition; it is not an exact compatible
Fresh Fruit reference. No binding or scientific status is changed.

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
