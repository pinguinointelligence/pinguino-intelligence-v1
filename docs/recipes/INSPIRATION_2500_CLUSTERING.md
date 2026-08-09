# Inspiration 2500 — deterministic clustering

## Source audit

- Workbook: `PINGUINO_FLAVOR_INSPIRATION_2500.xlsx`
- Sheet: `TOP_2500`
- Source rows: **2,500** (ranks 1–2500)
- Workbook SHA-256: `23837d15c0a8a194dad36ee845296cffc3e872fd63297c801b236b6b7c6ef68c`
- Existing source images preserved: **80**
- Rows without a unique image: **2,420**
- Duplicate image hashes: **0**
- Formulas/grams in workbook: **none**

The workbook is imported once into a generated immutable manifest. Runtime clustering uses source category plus the first defining ingredient. Every row belongs to exactly one root family. Branded confectionery, alcohol and protein are isolated before ingredient rules. No workbook row is copied, deleted or written back.

## Exact clustering snapshot

The initial screen shows exactly 6 featured families: Strawberry, Chocolate, Pistachio, Vanilla, Mango and Coffee. A family shows at most 10 directions. `Long tail` means source inspirations remaining after one representative card per visible direction.

| Family              |     Count | Visible directions (count)                                                                                                   | Long tail |
| ------------------- | --------: | ---------------------------------------------------------------------------------------------------------------------------- | --------: |
| Desserts and bakery |       312 | classic 2; chocolate 124; white chocolate 8; cheesecake 24; caramel 43; nut 25; spiced 24; other 19; crunch 10; coffee/tea 3 |       302 |
| Confectionery       |       294 | chocolate 258; white chocolate 36                                                                                            |       292 |
| Other               |       232 | classic 2; chocolate 55; white chocolate 4; crunch 12; other 25; caramel 21; alcohol 7; nut 18; spiced 42; cheesecake 9      |       222 |
| Alcohol             |       170 | chocolate 66; caramel 28; cheesecake 20; alcohol 9; citrus 19; floral 4; nut 16; herbal 4; coffee/tea 2; spiced 2            |       160 |
| Pistachio           |       159 | classic 1; nut 83; chocolate 72; white chocolate 3                                                                           |       155 |
| Mango               |       158 | classic 1; crunch 16; fruit 50; caramel 10; chocolate 12; alcohol 8; nut 11; spiced 14; cheesecake 5; citrus 13              |       148 |
| Coffee              |       152 | coffee/tea 68; caramel 6; chocolate 66; nut 7; cheesecake 3; white chocolate 2                                               |       146 |
| Aromatic            |       146 | floral 36; caramel 12; chocolate 17; nut 22; cheesecake 5; white chocolate 3; spiced 21; coffee/tea 2; herbal 20; other 5    |       136 |
| Citrus              |       145 | classic 2; citrus 78; caramel 8; chocolate 14; nut 13; spiced 10; cheesecake 6; white chocolate 2; coffee/tea 4; floral 4    |       135 |
| Chocolate           |       134 | chocolate 111; white chocolate 14; alcohol 5; cheesecake 1; caramel 1; nut 2                                                 |       128 |
| Strawberry          |       122 | classic 1; crunch 10; caramel 7; chocolate 11; nut 10; fruit 27; alcohol 5; cheesecake 24; citrus 9; white chocolate 2       |       112 |
| Protein             |       106 | chocolate 53; other 11; crunch 4; caramel 6; coffee/tea 5; fruit 8; nut 3; alcohol 3; spiced 5; citrus 5                     |        96 |
| Tea / matcha        |        91 | classic 2; coffee/tea 60; caramel 5; chocolate 10; nut 8; cheesecake 4; white chocolate 2                                    |        84 |
| Caramel             |        66 | caramel 50; chocolate 9; nut 6; white chocolate 1                                                                            |        62 |
| Vanilla             |        63 | classic 1; spiced 4; other 7; alcohol 4; chocolate 10; cheesecake 1; crunch 6; caramel 6; nut 4; citrus 4                    |        53 |
| Coconut             |        59 | classic 1; crunch 6; other 11; caramel 3; chocolate 5; alcohol 4; nut 5; spiced 4; cheesecake 3; citrus 4                    |        49 |
| Hazelnut            |        41 | classic 1; nut 34; chocolate 5; white chocolate 1                                                                            |        37 |
| Raspberry           |        37 | classic 1; crunch 4; fruit 10; caramel 3; chocolate 5; alcohol 2; nut 3; spiced 1; white chocolate 4; cheesecake 1           |        27 |
| Banana              |        12 | classic 1; crunch 2; fruit 2; caramel 3; chocolate 1; alcohol 1; nut 1; spiced 1                                             |         4 |
| Peanut              |         1 | classic 1                                                                                                                    |         0 |
| **Total**           | **2,500** | **20 root families**                                                                                                         | **2,350** |

## Customer contract

- Never call these “2,500 ready recipes”.
- Never import source ingredient lists as production roles, composition or grams.
- Selection produces intent metadata and, where independently mapped, canonical ingredient IDs.
- The existing `/start` flow remains responsible for product choice, serving context and technical formulation.
- Protein remains a visible canonical customer family but an honest unsupported Engine state where applicable.
