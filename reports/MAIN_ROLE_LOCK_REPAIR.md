# Main role / lock repair

Status przed deployem: **LOCAL GATES PASS / SERVED RETEST PENDING**.

## Root cause

`IngredientRow` wywoływał `lock.onToggle()` w wyrażeniu z `??`. Handler zwraca
`void`, więc prawa strona wykonywała się zawsze. Pierwszy dispatch ustawiał
blokadę gramów i poprawnie zachowywał `lock_type: main`; drugi dispatch używał
ogólnego `setLockType(..., 'grams')`, usuwał sidecary i nadpisywał rolę Main.

Naprawa rozdziela obsługę blokady od przejścia roli. Klik blokady nigdy nie
wywołuje zapasowego `setLockType`, jeśli istnieje dedykowany handler.

## Kontrakt po naprawie

| Fixture  | Role before | Lock before | Action       | Role after | Lock after | Grams after |
| -------- | ----------- | ----------- | ------------ | ---------- | ---------- | ----------: |
| Standard | Standard    | off         | lock grams   | Standard   | on         |   unchanged |
| Standard | Standard    | on          | unlock grams | Standard   | off        |   unchanged |
| Main     | Main        | off         | lock grams   | Main       | on         |   unchanged |
| Main     | Main        | on          | unlock grams | Main       | off        |   unchanged |
| Main     | Main        | off         | lock percent | Main       | percent    |   unchanged |

Preview liczy wszystkie linie `lock_type === 'main'`, niezależnie od blokady.

| Main rows | Locked Main rows | Preview Main count | Expected |
| --------: | ---------------: | -----------------: | -------: |
|         2 |                0 |                  2 |        2 |
|         2 |                1 |                  2 |        2 |
|         2 |                2 |                  2 |        2 |
|         3 |                1 |                  3 |        3 |

## Evidence

- rzeczywisty klik DOM blokady Main jest testowany;
- store/persistence zachowują rolę, gramy i `main_ratio_weight`;
- Preview rozdziela `Główne` od `Blokady`;
- Multi-Main locked 200 g + unlocked 541 g pozostaje dwiema liniami Main.
