# Monitor range-scale audit

## Authority model

All seven visible modules use the canonical `MonitorRangeScale`. Every drawable model keeps metric, current value, Engine band and display domain separate. The display domain is derived only from the extrema of all locked `TARGET_BANDS` for the same metric plus the plotted value; no screenshot number or fixed CSS tolerance is used.

Current and Preview values share one normalized ruler. Preview is calculated from frozen ProductBehavior authority, matching the current Monitor path. Unknown or missing bands fail closed: no accepted band, marker or Preview marker is fabricated. Customer copy and accessibility labels contain only `w zakresie`, `poniżej zakresu`, `poniżej zakresu — bezpiecznie`, `powyżej zakresu` or `brak danych`; accepted endpoints stay internal.

`lactose_sandiness_risk` uses the Engine's existing one-sided authority. Its accepted band remains exactly 5–9, a value below 5 is `good` and draws no red segment, and a value above 9 is `risky` and draws red only from the upper accepted boundary to the marker. No Monitor-only threshold or classification rule was added.

Formulas:

- green left = `(acceptedMin - displayDomainMin) / (displayDomainMax - displayDomainMin) × 100`, clamped 0–100;
- green width = `(acceptedMax - acceptedMin) / (displayDomainMax - displayDomainMin) × 100`, clamped 0–100;
- marker = `(currentValue - displayDomainMin) / (displayDomainMax - displayDomainMin) × 100`, clamped 0–100;
- below red = marker → lower green boundary, except when Engine classifies the below side as safe/good;
- above red = upper green boundary → marker;
- in-range = no red segment.

## Canonical milk-gelato −11 fixture

| Module              | Headline metric        | Display domain                          | Accepted range |           Expected green width % | Actual before % |  Actual after % |   Marker % | Status                            |
| ------------------- | ---------------------- | --------------------------------------- | -------------- | -------------------------------: | --------------: | --------------: | ---------: | --------------------------------- |
| Słodycz             | POD                    | 12–25                                   | 12–17          |                            38.46 |              28 |           38.46 |      30.62 | PASS                              |
| Twardość            | NPAC                   | 33–64                                   | 33–42          |                            29.03 |              28 |           29.03 |       8.03 | PASS                              |
| Zamrożenie          | ice_fraction           | 45–61                                   | 45–54.5        |                            59.38 |              32 |           59.38 |      31.25 | PASS                              |
| Woda i ciała stałe  | water                  | 50–75                                   | 57–70          |                            52.00 |              30 |           52.00 |      48.72 | PASS                              |
| Tłuszcz i kremowość | fat                    | 0–12                                    | 5–12           |                            58.33 |              28 |           58.33 |      73.00 | PASS                              |
| Białko i struktura  | aerating_protein       | 3–6                                     | 3–6            |                           100.00 |              26 |          100.00 |      40.00 | PASS where Engine band exists     |
| Stabilność i ryzyka | lactose_sandiness_risk | Engine range extrema plus plotted value | 5–9            | Value-dependent, formula-derived |              24 | Formula-derived | Real value | PASS — below safe, red only above |

Fixture current values are POD 15.98, NPAC 35.49, ice fraction 50.00%, water 62.18%, fat 8.76% and aerating protein 4.20%. They exercise the actual formula; they are not customer-visible threshold copy.

## Directional Stability authority

The Owner approved the Engine-aligned one-sided contract for `lactose_sandiness_risk`. The Monitor consumes `classifyValue` rather than duplicating direction rules: below 5 is presented as safe/informational with no red; 5–9 remains the accepted green band; above 9 is presented as outside/risky with red only on the upper side. Unknown values or missing bands still fail closed.

## Seven-module mapping

| Module              | Headline number        | Marker                 | Green band                                  | Secondary expanded details                         |
| ------------------- | ---------------------- | ---------------------- | ------------------------------------------- | -------------------------------------------------- |
| Słodycz             | POD                    | POD                    | POD Engine band                             | Direction selection                                |
| Twardość            | NPAC                   | NPAC                   | NPAC Engine band                            | Direction selection                                |
| Zamrożenie          | ice_fraction           | ice_fraction           | ice_fraction Engine band                    | PAC, NPAC, serving temperature                     |
| Woda i ciała stałe  | water                  | water                  | water Engine band                           | total solids, fiber                                |
| Tłuszcz i kremowość | fat                    | fat                    | fat Engine band                             | batch fat mass                                     |
| Białko i struktura  | aerating_protein       | aerating_protein       | aerating_protein Engine band                | protein in solids, batch protein mass              |
| Stabilność i ryzyka | lactose_sandiness_risk | lactose_sandiness_risk | 5–9 Engine band, one-sided Engine direction | freezing state, stabilizer, lactose, alcohol, salt |

## Endpoint secrecy

Static rendering tests search for numeric range copy and tooltips. Runtime visual review found no accepted min/max text in visible content, aria labels or tooltips. Technical domains/ranges occur only in tests and this Owner report.
