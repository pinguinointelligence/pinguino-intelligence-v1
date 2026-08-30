GELLATTI — EU label, served proof (blocker 2 closed as a verification matter)
Served on https://staging.pinguinoai.com as test1@test1.com
Staging 49dea0b4 · captured 2026-08-30

The first acceptance run could not produce a label because four Mapper articles
carry no confirmed saturated-fat figure and it refused to invent one. That was
correct — but it also left the print pipeline unproven. The workspace already
owns the designed way through: an operator supplies the FINAL value plus its
confirmation source, which flips `saturatedFatAuthority` from `missing` to
`manual_final_value`. That path has now been exercised end to end.

SOURCE BATCH
  QA Protein Kakao -12 · LOT-20260830-D0469F7926 · 1000 g · completed 2026-08-30

RESOLVED FROM THE BATCH, NO INPUT NEEDED  (all "GOTOWE")
  product name · real batch mass · LOT · ingredients · allergens · nutrition
  · packaging (whole batch = one package, 1000 g)

SIX FIELDS THE OPERATOR MUST SUPPLY  (the form said "Uzupelnij 6 pol")
  1 target member state ............ Poland
  2 legal product name (PL) ........ "Lody proteinowe o smaku kakaowym"
  3 responsible business ........... "GELLATTI QA STAGING — FIKCYJNY OPERATOR
                                      TESTOWY", ul. Testowa 1, 00-001 Warszawa
                                      (dane testowe), PL
  4 best before .................... 2027-02-28
  5 saturated fat + source ......... 3.3 g/100 g, source string recorded on the
                                      label as "QA STAGING — wartosc testowa,
                                      NIE do obrotu; do zastapienia
                                      specyfikacja dostawcy"
  6 pre-print confirmation ......... "Sprawdzilem dane etykiety przed wydrukiem"

  EVERY value in 1-5 is a STAGING QA PLACEHOLDER. None is a supplier figure and
  none is fit for a real package. The operator/address is deliberately written
  as a fictitious test operator so the artifact can never be mistaken for a
  real label. The blocked articles the panel named were MILK 3.5%, CREAM 30%,
  PROTEIN GEL WPC, TARA GUM and CACAO.

RENDERED LABEL (EU profile, 102 x 152 mm, 300 dpi, x-height 1.20 mm)
  Ingredients, descending by mass: MILK 3.5%, CREAM 30%, DEXTROSE, WATER,
  PROTEIN GEL WPC, SUCROSE SUGAR, CACAO, TARA GUM
  Nutrition declaration · per 100 g
    Energy 725 kJ / 170 kcal   Fat 6.4 g, of which saturates 3.3 g
    Carbohydrate 20 g, of which sugars 19 g   Fibre 0.17 g
    Protein 8.6 g   Salt 0.08 g
  Net quantity 1000 g · LOT-20260830-D0469F7926
  Production date 2026-08-30 · Best before 2027-02-28
  Storage: Przechowywac w temperaturze -18°C lub nizszej.
  Business: (the fictitious QA operator above)

PRINT PIPELINE
  "Pobierz PDF" produced a real document: application/pdf, 512 762 bytes.
  "Zapisz finalna etykiete" -> "Etykieta partii zapisana · 30.08.2026, 07:04:16"

WHAT REMAINS FOR THE OWNER
  Nothing in the code. Supply supplier-confirmed saturated-fat values for the
  named Mapper articles (or have the operator enter the per-label value, which
  is the designed path and is now proven to work end to end).
