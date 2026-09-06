# Gellatti SOL ledger

This is the single canonical, append-only ledger for the SOL workstream. Do not
copy this list into a second ledger. Reports must link to this file and may quote
it, but they must not become an independent source of numbering or status.

Rules:

- IDs are append-only and are never deleted, moved, renumbered, or reused.
- A newly confirmed defect receives the next free ID at the end of this file.
- A code change or a green test alone does not prove a staging resolution.
- Status changes are appended to the history below; prior states are retained.
- `RESOLVED_IN_PR_AWAITING_MERGE` means the repair exists only in an unmerged PR.
- `RESOLVED_ON_STAGING` requires the normal merge, the exact staging deployment,
  and proof that no migration SQL was executed again.

`NEXT_FREE_SOL_ID: SOL-046`

## Current ledger

- [ ] **SOL-001 · TODO — terminalny timeout kombinacji dwóch owoców.** Historycznie 12 przypadków M05–M06, M11–M12, M17–M18, M23–M24, M35–M36 i M41–M42 kończyło się watchdogiem około 20 s; solver potrzebował 50–92 s. W komentarzu kodu widnieje „Thirty seconds”, a stała nadal wynosi `20_000` — również wyjaśnić tę niespójność.
- [ ] **SOL-002 · TODO — wizualnie nietknięte Direction może być aktywne.** Historyczne `U*` wyglądało jak brak wyboru, ale po przejściu przez profil zapisywało `direction_targets_active: true`. Ustalić dokładny bieżący lifecycle: nowa receptura, wybór profilu, zapis i reopen.
- [ ] **SOL-003 · TODO — Sorbet Direction omija wymagane minimum Main.** Historycznie solver publikował 57,2% Main przy polityce minimum 60%, oznaczał `mainHeldByExactDirection`, a późny Binder odrzucał wynik. Dotyczy przypadków Owner A/C i części M13–M24.
- [ ] **SOL-004 · TODO — Preview i Apply mają sprzeczny kontrakt TARA.** Preview legalnie proponowało TARA `1,3 → 1 g`, po czym Apply nazywało gramaturę zablokowaną mimo braku widocznej kłódki. Historyczne przypadki M31–M34.
- [ ] **SOL-005 · TODO — arbuz nie ma potwierdzonej polityki Main dla Sorbet/Vegan/Protein.** Historycznie Preview mogło przejść jako `USER_HELD`, ale trustless Apply nie potrafił ponownie potwierdzić Main. Zweryfikować aktualne dane po #189; nie tworzyć polityki bez decyzji Ownera.
- [ ] **SOL-006 · TODO — rzeczywista przyczyna skoku masy Sorbet pozostaje nieustalona.** Stary raport przypisał ją dodaniu owocu przy `0 g`, lecz badany kod już wymagał `planned_grams > 0`. Nie powtarzać tej diagnozy; odtworzyć kolejność zdarzeń i znaleźć miejsce, w którym draft miał rosnąć do około 1024 g.
- [ ] **SOL-007 · TODO — acceptance matrix może być fałszywie zielona.** Kontrolowane `REFUSED` są liczone jako wiersze, główna asercja pilnuje liczby rekordów, test omija realny picker/UI, używa fallbacków fixture, in-memory save/reopen i nie wykonuje prawdziwego Production Check.
- [ ] **SOL-008 · TODO — stare wyniki Ninja są nieaktualne po #193.** Ponowić wszystkie Home/Ninja dopiero po zamknięciu wcześniejszych błędów, z rozdzieleniem soft recommendation, target batch i hard capacity oraz z modułem Home i temperaturą −11°C.
- [ ] **SOL-009 · TODO — historyczny audyt nie wykonał dokładnego bazowego układu Professional −11°C.** W macierzy Professional było −13°C, a −11°C testowano na Ninja. Dokładny przypadek Professional −11°C jest obowiązkową bazą SOL-001.
- [ ] **SOL-010 · TODO — RPC zaproszenia partnerskiego uruchamia się przed gotową sesją.** `rpc/gellatti_accept_my_partner_invitation_v1` zwraca HTTP 400 `authentication_required`, ponieważ wywołanie biegnie przed zakończeniem inicjalizacji użytkownika i dostępnością `auth.uid()`. Po podłączeniu sesji błąd nie występuje. Należy później zweryfikować bramkowanie RPC stanem gotowej sesji.
- [ ] **SOL-011 · TODO — panele Studio pokazują użytkownikom PRO wewnętrzne pojęcia Engine.** `OptimizationPreviewPanel` i `BranchWorkflowPreviewPanel` ujawniają NPAC, POD oraz określenie „solver”. Należy później zastąpić je językiem klienta zgodnym z zasadą Gellatti, bez zmiany logiki Engine.
- [ ] **SOL-012 · TODO — komunikat odmowy Produkcji podaje niewłaściwą przyczynę.** UI mówi o konieczności odświeżenia weryfikacji produktów również wtedy, gdy rzeczywistą przyczyną są brakujące dane procesu. Należy rozdzielić przyczyny i pokazywać komunikat odpowiadający rzeczywistemu blockerowi.
- [ ] **SOL-013 · TODO — CACAO ma podejrzane dane składu `water=0 / totalSolids=100`.** CACAO przechodzi obecnie NUTRITION, LABEL i PRODUCTION, ale jakość tych wartości wymaga osobnego audytu źródła. Nie poprawiaj ich przez zgadywanie ani automatyczne wyliczenie.
- [ ] **SOL-014 · RESOLVED_IN_PR_AWAITING_MERGE — stagingowa baza zawiera migrację reklasyfikującą, której nie ma jeszcze w scalonym stagingowym repo.** PR #198 dopasowuje pliki do zastosowanych wersji `20260906003955` i `20260906004154`, lecz pozostaje draftem, nie jest scalony ani wdrożony. Status można zmienić na `RESOLVED_ON_STAGING` dopiero po zwykłym merge, deploymencie dokładnego merge SHA i dowodzie braku ponownego wykonania SQL.
- [ ] **SOL-015 · TODO — natychmiastowe Undo po Apply może być no-op.** Kompletna logika Undo i snapshot istnieją, lecz UI nie bramkuje akcji stanem trwającego Apply.
- [ ] **SOL-016 · TODO — wynik 10/10 nie gwarantuje idempotencji przy Multi-Main.** Fixed point istnieje, ale ścieżka null hypothesis wymaga braku `mainIntent`, przez co ponowne przeliczenie może nadal proponować zmiany.
- [ ] **SOL-017 · TODO — zielony „Wynik aktualny” może być pokazany przy dirty draft.** Aktualny staging pokazywał zielone `10` równocześnie z komunikatem „Receptura się zmieniła”.
- [ ] **SOL-018 · TODO — świeży draft może zostać potraktowany jako receptura historyczna.** Guard obejmuje starter template, ale nie każdą niezapisaną working copy.
- [ ] **SOL-019 · TODO — odświeżanie niezapisanej working copy prowadzi do dead-endu.** Refresh bez saved recipe/version ID bezwarunkowo zwraca `saved_version_required`.
- [x] **SOL-020 · RESOLVED_LATER — CACAO PURO było zaklasyfikowane jako `other`.** Późniejszy audyt potwierdził binding `chocolate_cocoa`, formę `cocoa_powder`, `MAIN_ALLOWED` i pełne wymagane role.
- [ ] **SOL-021 · TODO — w PRO montowany jest niewłaściwy panel Guide.** #197 zmienił responsywny shell i swipe, ale audytowane wejście nadal pokazywało ogólny `ContextualEducationView`.
- [x] **SOL-022 · RESOLVED_LATER — stary układ Label został zastąpiony właściwym układem.** PR #199 przywrócił autorytet bieżącej etykiety i usunął ustawienia z głównego widoku Label.
- [x] **SOL-023 · RESOLVED_LATER — pętla CACAO Apply → stale → ponowne przeliczanie → blokada Produkcji.** Późniejszy E2E oraz role w bazie potwierdziły NUTRITION, LABEL i PRODUCTION bez stale bindingu.
- [ ] **SOL-024 · TODO — komunikat po skanowaniu Crunchy Sante ukrywa gotowość produktu wyłącznie jako topping.** Exact GTIN `5900617002228` prowadzi do właściwego produktu z `TOPPING_ONLY` i `TOPPING_READY`, ale UI mówi, że produkt „wymaga jeszcze weryfikacji”.
- [ ] **SOL-025 · TODO — starter Professional 1000 jest projekcją Home 670.** Fresh flow może utworzyć starter/key/fingerprint dla Home 670, a następnie tylko przeskalować materialne wiersze do deklarowanego Professional 1000.
- [ ] **SOL-026 · TODO — Sorbet Preview nie przechodzi własnego Apply proof.** Preview publikuje propozycję, której trustless Apply nie potrafi zaakceptować.
- [ ] **SOL-027 · TODO — Vegan picker pokazuje nabiał jako selectable Base.** Picker dopuszcza nabiał jako Base w profilu Vegan.
- [ ] **SOL-028 · TODO — Protein Multi-Main przekracza watchdog.** Przypadek Protein z wieloma składnikami Main nie kończy obliczeń w wymaganym czasie.
- [ ] **SOL-029 · TODO — otwarty Guide znika po zmianie desktop → tablet/mobile.** Problem dotyczy zachowania otwartego panelu podczas zmiany breakpointu, nie geometrii plansz.
- [ ] **SOL-030 · TODO — draft Label pomija topping i finalną masę.** Draft korzysta tylko z bazy; dla bazy 1000 g i toppingu 25 g powinien przedstawiać produkt finalny 1025 g.
- [ ] **SOL-031 · TODO — draft Label nie przedstawia znanych alergenów.** Znane alergeny bazy i toppingu nie są prawidłowo przedstawiane w aktualnym draft Label.
- [ ] **SOL-032 · TODO — wyścig gotowości Produkcji Sorbet po Apply/Save.** Gotowość Produkcji może być oceniona przed ustabilizowaniem aktualnego stanu po Apply lub Save.
- [ ] **SOL-033 · TODO — aktywny backend Scannera pochodzi częściowo z niezmergowanego PR #186.** Ledger migracji i aktywne funkcje zawierają elementy workstreamu `claude/scanner-complete`, których nie ma w scalonym stagingowym repo.
- [ ] **SOL-034 · TODO — Knowledge Tour ma niestabilną geometrię w embedded PRO i pełnej wersji webowej.** Krok, tytuł, obraz oraz teksty zmieniają pozycję między planszami, a w PRO przesuwa się również dolna nawigacja. PR #201 istnieje na stagingu, ale sam kod lub test nie zmieniają statusu bez osobnego staging proof zgodnego z ledgerem.
- [ ] **SOL-035 · TODO — automatycznie generowany LOT jest błędnie pokazywany jako brakujący zamiast od razu pojawić się na etykiecie.**
- [ ] **SOL-036 · TODO — nowa etykieta nie inicjalizuje i nie pokazuje dzisiejszej daty produkcji.**
- [ ] **SOL-037 · TODO — etykieta jest błędnie blokowana przez wymóg potwierdzenia składników z Produkcji.**
- [ ] **SOL-038 · TODO — brakujące dane są pokazywane jako bierna lista zamiast edytowalnych pól; brakuje kompletnego przejścia ZMIEŃ → Ustawienia → Wróć.**
- [ ] **SOL-039 · TODO — HOME nie odczytywał opublikowanego werdyktu „Przelicz i popraw”.**
- [ ] **SOL-040 · TODO — HOME nie miał działającego etapu wykonania po „Zróbmy to”.**
- [ ] **SOL-041 · TODO — frakcyjny stabilizator dla Gelato/Vegan/Protein nadal używa Sorbet-only authority.**
- [ ] **SOL-042 · TODO — odczyt kodu zależy od orientacji produktu; Cola Zero wymagała obrócenia puszki.**
- [ ] **SOL-043 · TODO — klient widzi surowe statusy techniczne, np. `INGREDIENTS_EVIDENCE_REQUIRED`, `roleReadiness` i `recognition`.**
- [ ] **SOL-044 · TODO — niejasny lifecycle prywatnego produktu oraz przejścia do wspólnego Product Registry; niezrozumiałe „Zgłoś do weryfikacji”.**
- [ ] **SOL-045 · TODO — kamera komputerowa pokazuje kod zbyt rozmyty do odczytu.** Należy sprawdzić rzeczywistą rozdzielczość strumienia, autofocus i rozdzielczość klatki przekazywanej dekoderowi.

## SOL-014 migration dependency checkpoint — 2026-09-06

This is a read-only reconciliation checkpoint, not a migration plan and not an
authorization to execute SQL.

- `origin/staging`: `f03038d06efc41325a715cdd66ded2cc1e1d835b`.
- PR #181: OPEN draft, API base SHA `7cb20e7f564f3a2f36cd9b42014c544de89afdaf`,
  head SHA `5adcd5345f5ce1c67304aaac39248b52a107a78c`, behind staging.
- PR #198: OPEN draft, API base SHA `c66c1d011a8f5cd5d16005aaa012b775a3a29776`,
  pre-reconciliation head SHA `d6825f5046f376d9de97942ac6884e026d0f1da1`,
  behind staging.

| Operation                             | Applied remote version                                    | Repository state at checkpoint                                                                                                     | Reconciliation required before merge                                           |
| ------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| BASE_ONLY nutrition/label classifier  | `20260905103024_base_only_nutrition_label_permission`     | PR #181 has semantically identical SQL as `20260905120000_base_only_nutrition_label_permission.sql`; staging has no source file    | Rename the PR #181 file to the applied version without changing executable SQL |
| Customer private not-ready product    | `20260905132215_customer_private_not_ready_product`       | Source exists only on unmerged PR #186; staging has no source file                                                                 | Remains frozen under SOL-033; it is not a semantic prerequisite of #181/#198   |
| BASE_ONLY nutrition reclassification  | `20260905142334_reclassify_base_only_nutrition_bindings`  | PR #181 has semantically identical SQL as `20260905120100_reclassify_base_only_nutrition_bindings.sql`; staging has no source file | Rename the PR #181 file to the applied version without executing it again      |
| Current Mapper lineage                | `20260906003955_mapper_lineage_current_binding`           | Staging uses the wrong local identity `20260905150000`; PR #198 corrects it by a 100% rename                                       | Keep the PR #198 canonical identity                                            |
| Stale Mapper-lineage reclassification | `20260906004154_reclassify_stale_mapper_lineage_bindings` | Staging has no source file; PR #198 contains the canonical applied identity                                                        | Keep the PR #198 canonical identity and never rerun it                         |

Semantic dependency and safe sequence:

1. First synchronize PR #181 with current staging and align its two filenames to
   applied versions `20260905103024` and `20260905142334`, preserving executable
   SQL.
2. Re-run #181 structural migration contracts and confirm those two operations
   are local/remote matches rather than pending.
3. Merge #181 normally into staging.
4. Merge the resulting staging into PR #198 normally; do not rebase or force
   push.
5. Confirm the repository execution order is classifier change → BASE_ONLY
   reclassification → current Mapper-lineage resolver → stale-lineage
   reclassification.
6. Only then merge #198 normally and verify the exact deployed merge SHA plus
   no repeated migration SQL.

PR #198 semantically depends on #181: its stale-lineage reclassification invokes
the canonical queue and classifier and asserts the NUTRITION/PRODUCTION
relationship introduced by #181. Green CI on #198 does not replace that database
ordering requirement. The wider remote-only Scanner history remains SOL-033 and
is not repaired by this checkpoint.

## Recovery provenance

- SOL-001–SOL-014: original Solver ledger and append-only owner checkpoints.
- SOL-015–SOL-024: PROVENANCE-001 audit checkpoint.
- SOL-025–SOL-033: canonical ordering frozen after BASIC-PRO follow-up tests.
- SOL-034: recovered verbatim from the GUIDE owner checkpoint.
- SOL-035–SOL-038: recovered verbatim from the LABEL owner checkpoint.
- SOL-039–SOL-045: restored from the owner reconciliation checkpoint of 2026-09-06.
- Search of repository files, all Git refs, retained attachments, and retained task
  checkpoints found no assigned SOL ID above SOL-045. SOL-046 is therefore the
  next free ID at this checkpoint.

## Status history

| Date       | ID      | Previous status | New status                    | Evidence                                                                                                                                |
| ---------- | ------- | --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-06 | SOL-020 | RETEST_REQUIRED | RESOLVED_LATER                | Later CACAO binding and role audit.                                                                                                     |
| 2026-09-06 | SOL-022 | TODO            | RESOLVED_LATER                | PR #199 and served Label audit.                                                                                                         |
| 2026-09-06 | SOL-023 | RETEST_REQUIRED | RESOLVED_LATER                | Later CACAO E2E and binding audit.                                                                                                      |
| 2026-09-06 | SOL-014 | TODO            | RESOLVED                      | Incorrect report-only transition; PR #198 was still draft, unmerged, and undeployed. Retained here so the status history is not erased. |
| 2026-09-06 | SOL-014 | RESOLVED        | RESOLVED_IN_PR_AWAITING_MERGE | Owner correction: PR #198 contains the technical repair, but staging does not.                                                          |

No other current status was changed during the 2026-09-06 ledger
reconciliation.
