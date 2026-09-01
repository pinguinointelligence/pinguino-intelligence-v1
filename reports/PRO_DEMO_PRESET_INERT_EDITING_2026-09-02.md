# PRO `/pro/recipe` DEMO PRESET — EDITING IS INERT

**Status:** OPEN — recorded, not fixed.
**Relationship to GEL-P0-027:** none. Found while setting up that QA; it is a
pre-existing defect on the PRO surface and is deliberately kept out of the
frozen Crown contract.
**Severity:** P1 — it blocks all gram/% QA on the preset, and it silently
withholds the Crown control, so a Main-capable product cannot be crowned at all.

## Observed on

`staging.pinguinoai.com` → `dpl_D9czTWjkZUoVFtwHgByjADewyDAd`,
`meta.githubCommitSha` `b611ff71`, signed in as `pro@pro.com` (PRO), 2026-09-01.
Reproduced at viewport 1440×900.

## Symptoms

The workbench opens on a preset base whose line ids are `milk-base:*`
(`milk-base:milk_3_5`, `milk-base:cream_30`, `milk-base:smp`,
`milk-base:sucrose`, `milk-base:dextrose`, `milk-base:tara_gum`). On that recipe:

1. **No line's grams can be changed.** `MILK 3.5%` stayed at `448.9` and an added
   `STRAWBERRIES · Fresh Fruit` stayed at `0` across every input path tried:
   - `HTMLButtonElement.click()` on the `— ilość w g — zwiększ` stepper,
   - a full synthetic `pointerdown → mousedown → pointerup → mouseup → click`
     sequence,
   - a **trusted** click through the automation driver, verified to land on the
     right element (`document.elementFromPoint(697,679)` returned
     `BUTTON[STRAWBERRIES · Fresh Fruit — ilość w g — zwiększ]`),
   - typing into the grams input with the native value setter plus
     `input` / `Enter` / `change` / `blur`.
   The stepper is not disabled (`disabled === false`, no `aria-disabled`), the
   input is neither `disabled` nor `readOnly`, and no modal is open
   (`document.querySelectorAll('[role="dialog"]').length === 0`).
2. **The Crown control never renders.** All seven `row-main-slot-*` elements are
   empty `<span>`s and the page contains zero buttons matching `Główny`, so a
   Main-capable product on this recipe cannot be crowned.
3. **Six of the preset lines advertise `Sprawdź produkt`** — CREAM 30%, DEXTROSE,
   MILK 3.5%, SKIMMED MILK, SUCROSE SUGAR, TARA GUM. The added Mapper product is
   NOT among them.
4. A recalculation on that state returns
   `Receptura zawiera produkt wymagający ponownej walidacji przed zapisem.`
   and the added row carries `row-dose-missing-hint-*`
   („Brak zweryfikowanej ilości. Ustaw ilość odpowiednią dla swojej receptury.").
   Preview then refuses with „Podaj gramaturę dla: STRAWBERRIES · Fresh Fruit.
   Minimalna ilość to 1 g." — a deadlock, because the control that would set that
   gram amount is the one that does not respond.

## The discriminator

`+ Nowa receptura` → confirm → produces a recipe with `new-recipe-*` line ids,
and **everything works immediately on that recipe**: `CREAM 30%` stepped
`130 → 131 → 132` on plain `.click()`, typed grams committed, the Crown control
rendered (`Ustaw składnik jako Główny` → `Składnik Główny`,
`aria-pressed="true"`), and Crown ON at 0 g auto-seeded 1 g as designed.

So the failure is bound to the **preset base**, not to the PRO surface, not to
the account, and not to the added Mapper product.

## Likely direction (not verified)

The preset's six lines appear to lack resolved ProductBehavior snapshots — hence
`Sprawdź produkt` on exactly those six, and hence the revalidation refusal.
`resolveMainCapability` returns `MAIN_UNKNOWN` for a snapshot whose
`resolutionState !== 'RESOLVED'` (`mainCapability.ts`), which would explain the
missing Crown control; the frozen grams need their own diagnosis. This matches
the previously recorded "demo preset BASE_RECIPE" note that local gram/% QA is
blocked, now reproduced on served staging with a PRO account.

## Why it matters beyond QA

A customer who opens the workbench on the preset can neither adjust an amount nor
crown a Main, and the message they get asks them to do the very thing the UI will
not let them do. The workaround — start a new recipe — is not discoverable from
that state.
