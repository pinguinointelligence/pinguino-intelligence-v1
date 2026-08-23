# SERVED QA — full_formulation user intent, Polish Lost (staging, 2026-08-24)

Served SHA `bcacb06` · bundle `index-BufAY2Ke.js` · deploy
`dpl_2Juf7drq9ZdsaAuuKHySUSpdzsSc` · account `pro@pro.com` (Plan Pro) ·
Gelato · OPTIMAL · −11 °C · Direction 0/0 · target 1000 g.

Source state rebuilt by hand (the `lost-pl-*` library entry is still gated on
staging): 595 / 180 / 30 / 90 / 50 / 2 / **40** / 20 = **1007 g**.

## VERDICT

| test | previous served run (`aa56e8d`) | now (`bcacb06`) |
|---|---|---|
| **A — yolk UNLOCKED** | ❌ 40 g → **1 g** | ✅ 40 g → **44 g** |
| **B — yolk HARD-LOCKED** | ✅ 40 g held | ✅ 40 g held |

Both runs report `Źródło formulacji: milk_base_v1 + kanoniczny solver korekt PI`
— the **full_formulation** path, i.e. the exact route that was broken.

## TEST A — yolk unlocked

| line | before | after |
|---|---|---|
| MILK 3.5% | 595 g | 477 g |
| CREAM 30% | 180 g | 246 g |
| SKIMMED MILK | 30 g | 45 g |
| SUCROSE | 90 g | 141 g |
| DEXTROSE | 50 g | 25 g |
| TARA GUM | 2 g | 2 g (bez zmian) |
| **EGGS CHICKEN YOLK DRIED** | **40 g** | **44 g (+4 g)** |
| INULIN | 20 g | 20 g (bez zmian) |
| **total** | 1007 g | **1000 g** |

Violations 1 → 0 · Score **10** · POD 16.88 · NPAC 41.88 · PAC 45.13 ·
water 59.17 · fat 11.57 · protein 5.13 · stability 9.

- **no material-deviation banner** — the „ZNACZĄCA ZMIANA WSKAZANEGO SKŁADNIKA"
  section that fired on `aa56e8d` is absent, because nothing was collapsed;
- canonical `PI-ING-001645` preserved, **no fresh-yolk substitution**;
- Inulin held at 20 g; total exactly 1000 g; **no 0 g rows**;
- **Preview == Apply** (byte-identical vector);
- **Undo** restored the source exactly (595/180/30/90/50/2/40/20 = 1007 g);
- **Save → full reload → reopen**: 477/246/45/141/25/2/**44**/20 = 1000 g,
  zero 0 g rows. Saved as „QA Lost PL zoltka UNLOCKED v2" v1.

## TEST B — yolk hard-locked at 40 g

| line | before | after |
|---|---|---|
| INULIN | 20 g | 37 g |
| MILK 3.5% | 595 g | 620 g |
| CREAM 30% | 180 g | 120 g |
| SKIMMED MILK | 30 g | 33 g |
| SUCROSE | 90 g | 120 g |
| DEXTROSE | 50 g | 28 g |
| TARA GUM | 2 g | 2 g (bez zmian) |
| **EGGS CHICKEN YOLK DRIED** | **40 g** | **40 g — BEZ ZMIAN · ZABLOKOWANE** |
| **total** | 1007 g | **1000 g** |

`CHRONIONE PRZEZ APPLY — Blokady: 1`. Violations 1 → 0 · Score **10** ·
POD 15.08 · NPAC 36.01 · PAC 51.32 · water 63.66 · fat 8.06 · protein 4.7 ·
stability 7.82. Inulin 37 g is inside the owner 20–80 g band (2–8 %), so the
20 g minimum remains active. Save → full reload → reopen persisted every line
and the gram lock exactly.

## UNLOCKED vs LOCKED (owner §12)

| | unlocked | locked |
|---|---|---|
| Score | 10 | 10 |
| violations | 1 → 0 | 1 → 0 |
| POD | 16.88 | 15.08 |
| NPAC | 41.88 | 36.01 |
| PAC | 45.13 | 51.32 |
| water | 59.17 | 63.66 |
| solids (100 − water) | 40.83 | 36.34 |
| fat | 11.57 | 8.06 |
| protein | 5.13 | 4.70 |
| yolk | **44 g** | **40 g** |
| yolk drift (normalized) | **0.098** | 0 |
| material deviations | none | none |

Both reach identical hard validity. The unlocked run keeps the user's yolk
within ordinary optimization distance (+4 g) instead of destroying it — §12
satisfied. The two gram vectors legitimately differ; the contract was never
byte-identity, only that unlocked must not be dramatically more destructive.

## Incidental — recorded, not fixed (owner §22)

- Adding Inulin still auto-seeds **40 g** (owner-preferred 4 %), not the 20 g
  minimum. Owner-preferred default, recorded for completeness.
- The settings panel still shows „Zmiany niepotwierdzone" when only the base
  mass DISPLAY changes, which reads like a user edit. UX observation.
- The `lost-pl-*` Lost & Legendary collection remains gated on staging
  („Ta kolekcja przechodzi jeszcze Mapper…"), so the reproducer must be built
  by hand. Not a defect of this work.
- Driving the gram inputs by synthetic `input`/`change` events does NOT commit
  to the store — only real typing/steppers do. QA-harness note.
