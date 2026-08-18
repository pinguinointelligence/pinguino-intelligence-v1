# Correction ProductBehavior repair

Status przed deployem: **LOCAL GATES PASS / SERVED RETEST PENDING**.

## Root cause

Solver tworzył lokalną linię `correction-inulin-0`. Bieżąca receptura była
autoryzowana przed budową propozycji, a binder próbował potem znaleźć snapshot
dla nowej lokalnej linii w snapshotach bieżącego draftu. Lokalny line ID był
więc błędnie traktowany jak produkt wymagający własnego bindingu.

## Repair

Proces jest dwufazowy:

1. walidacja bieżącego draftu;
2. budowa i kanoniczna normalizacja propozycji;
3. reuse istniejącej odblokowanej linii po canonical identity;
4. resolve snapshotów dla dokładnego proposed input;
5. server validation proposed input;
6. session-only proposal authority związana z base/proposed fingerprintami;
7. atomic Apply linii i snapshotów bez pre-sync do nieistniejącej linii.

Nowa Inulina zachowuje lokalny line ID tylko jako klucz UI, a produkt jest
rozwiązywany wyłącznie jako Mapper `PI-ING-000456`. Resolver nigdy nie dostaje
`correction-inulin-0` jako entity/product ID. Brak resolver authority kończy
się fail-closed i nie tworzy syntetycznego uprawnienia.

| Fixture                                   | Synthetic ID submitted | Canonical product/version used                | Result                       |
| ----------------------------------------- | ---------------------- | --------------------------------------------- | ---------------------------- |
| Watermelon Standard 700 + existing Inulin | no                     | existing exact line/snapshot                  | reused once                  |
| Kiwi Standard 700 + existing Inulin       | no                     | existing exact line/snapshot                  | reused once                  |
| Watermelon Standard 700, Inulin absent    | no                     | Mapper PI-ING-000456 + server version/binding | resolved proposal authority  |
| Inulin absent, resolver unavailable       | no                     | none                                          | fail closed, draft untouched |

Mapper dataset nie został zmieniony.
