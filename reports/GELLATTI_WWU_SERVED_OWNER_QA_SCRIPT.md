# Work With Us / Partner — served owner QA script

**Staging:** https://staging.pinguinoai.com. Prepared 2026-09-17 against `origin/staging` `6e83b8d1`.
**Covers:** every row marked **READY FOR SERVED OWNER QA** — 22 in Lane A, plus K16 in Lane B.

- A PASS here is **served QA**. It is not owner approval: mark *Owner ✅* separately, and only when you decide to.
- Automated coverage for each row, and its gaps, is in `reports/GELLATTI_WWU_TEST_COVERAGE_MAP.md`.
- **Staging and production share one database.** Steps that change data are marked **MUTATES**. Use the throwaway names given, and do §1 before the rest.

## Accounts

The data below is from a read-only check on 2026-09-17. Passwords stay in the QA manifest, never in this file.

| Account | State | Used in |
|---|---|---|
| `test1@test1.com` | The only active Partner among the QA accounts: tier Standard, public profile `marysia-lody` (approved), one active code `MARYSIALOD`, no links, no Connect account, no commissions, payouts or referral rewards | §1, §2, §5 |
| `admin@admin.com` | `super_admin` | §3, §4 |
| **a new applicant account you create** | Sign up on staging with an address you control. Don't use `home@` or `pro@`: other lanes' QA depends on their plans | §2.3, §4 |

## Index

| § | Row(s) | Account | Mutates |
|---|---|---|---|
| 1.1 | E-REV-04, H-DASH-03 | test1 | no |
| 1.2 | E-REV-04 | test1 | no |
| 1.3 | H-DASH-02 | test1 | no |
| 1.4 | G-WEL-01, 02, 03, 05, 06, 07 | test1 | no |
| 1.5 | H-DASH-07 | test1 | no |
| 1.6 | H-DASH-08 | test1 | no |
| 2.1 | D-CODE-03 | test1 | no |
| 2.2 | D-CODE-02, D-CODE-05 | test1 | **yes** (2 codes, 1 archived) |
| 2.3 | D-CODE-04 | new partner from §4.2 | no |
| 2.4 | H-DASH-06 | test1 | one click record |
| 2.5 | G-WEL-03, D-LINK-03, H-DASH-06 | test1 | **yes** (1 link, click records) |
| 3.1 | I-ADM-02 | admin | no |
| 3.2 | I-ADM-05 | admin | no |
| 3.3 | D-CODE-07, I-ADM-05 | admin | **yes**, reversible |
| 3.4 | I-ADM-05 (optional) | admin + test1 | **yes**, reversible |
| 4.1 | C-APP-07 | new applicant + admin | **yes** |
| 4.2 | C-APP-09 | new applicant + admin | **yes**, persistent |
| 5 | K16 (Lane B) | test1 | the data it needs does not exist yet |

---

## §1 — Partner dashboard, read-only (sign in as `test1@test1.com`)

### 1.1 — E-REV-04, H-DASH-03: Settings reads as copy
- **Route:** `/partner?section=settings`
- **Steps:** open the page and read the list.
- **Expected:**
  - Status → **Aktywny**
  - Tier → **Standard**
  - Publiczny identyfikator → **marysia-lody**
  - Home + Pro → **Bez opłat podczas aktywnego statusu Partner**
- **PASS:** every value is Polish copy.
- **FAIL:** any raw value (`active`, `standard`, `APPROVED`), or `undefined` / `null`.
- *Not a failure:* "ID Partnera" shows an internal id. That's an open owner question (R-DES-02).
- Gold and Elite can't be seen on this account; automated tests render all three.

### 1.2 — E-REV-04: public-profile moderation as copy
- **Route:** `/partner?section=profile`
- **Steps:** read the moderation state. Hover it. Do not press save.
- **Expected:** **Zatwierdzony**; the hover text reads "Profil publiczny jest widoczny."
- **PASS:** copy as above.
- **FAIL:** `APPROVED`, `UNDER_REVIEW` or `DISABLED` printed raw.

### 1.3 — H-DASH-02: money first on the Overview
- **Route:** `/partner` (opens on *Podsumowanie*)
- **Expected:**
  - The money tiles lead the page: **Prowizja w tym miesiącu**, **W trakcie** and **Do wypłaty**, each **0,00 €** on this account.
  - **Aktywne kody 1 / 3**.
  - The Connect tile says **Konto Connect oczekuje na przygotowanie przez Admina**.
  - **No "next payout batch" tile.** That's deliberate: it waits on your decision (H-DASH-02 / F-PAY-04).
- **PASS:** as above.
- **FAIL:** a missing money tile, a raw status, or any payout date promised.

### 1.4 — G-WEL-01, 02, 03, 05, 06, 07: *Pierwsze kroki*
- **Route:** `/partner` (Overview), top of the page
- **Expected on this account** (1 code, no link, no Connect account):
  - The guide **Pierwsze kroki** shows **1 z 3 gotowe**.
  - **Twój kod** is done: "Kod MARYSIALOD jest aktywny."
  - **Pierwszy link** is open: "Utwórz link do przepisu, profilu lub cennika — z Twoim kodem w środku." with **Utwórz link**.
  - **Wypłaty** reads "Gellatti przygotowuje Twoje konto wypłat — nic nie musisz robić. Kody i linki działają już teraz." with **nothing to click** (G-WEL-05, G-WEL-07).
  - Clicking **Utwórz link** opens *Generator linków* (don't create anything yet).
- **PASS:** as above; the rest of Partner mode still works without Connect.
- **FAIL:** the guide is missing, the step states are wrong, or a Connect step blocks other functions.
- *Not testable here:* G-WEL-06, "the guide disappears when every step is done", needs Connect enabled (admin + Stripe). It's covered by `partnerFirstSteps.render.test.tsx`.

### 1.5 — H-DASH-07: commissions list (header only)
- **Route:** `/partner?section=earnings`
- **Expected:** the table header reads **Data · Do wypłaty od · Plan · Cykl · Status · Kwota · Środowisko**, with no rows (this account has no commissions).
- **PASS:** the header including *Do wypłaty od*, and no raw values.
- **FAIL:** a crash, a raw value, or the eligible-date column missing.
- *Not testable here:* rows need commission data. A reversal reads as a minus with *Zwrot płatności*; covered by `partnerEarnings.render.test.tsx`.

### 1.6 — H-DASH-08: payouts (Connect state and header)
- **Route:** `/partner?section=payouts`
- **Expected:** the **Konto Connect** box says **Admin musi najpierw przygotować konto Connect**, with no *Dokończ konfigurację* button and no payout rows.
- **PASS:** as above.
- **FAIL:** a raw provider code, or a date promised.
- *Not testable here:* payout rows (statuses as copy, a failure without the provider's raw code, a negative carry-forward) need payout data; automated only.

---

## §2 — Codes and links (still `test1@`) — MUTATES test1's data

Use these throwaway codes: **QAWWU01**, **QAWWU02**. **A created code stays reserved forever, even after archiving**, so use only these names.

### 2.1 — D-CODE-03: availability while typing (submit nothing)
- **Route:** `/partner?section=codes`, field **Kod**. Type each value and wait about half a second:

| Type | Expected message |
|---|---|
| `abc` | nothing is checked (under 5 characters) |
| `marysialod` | **To już jest jeden z Twoich aktywnych kodów.** |
| `admin123` | **Kod zawiera zastrzeżone słowo. Wybierz inny.** |
| `łódź12` | **Tylko litery A–Z i cyfry — bez polskich znaków i symboli.** |
| `abcdefghijklmnopq` (17) | **Kod może mieć najwyżej 16 znaków.** |
| a code another partner holds¹ | **Ten kod jest już zajęty. Wybierz inny.** |
| `qawwu01` | **Kod jest dostępny.** |

- ¹ To find one, sign in as admin and open `/admin/partners`, which lists every partner's codes. Pick one that isn't test1's.
- **PASS:** each message as listed; the form refuses to submit a refused code.
- **FAIL:** a raw reason code, a wrong message, or a refused code submitted.
- **Mutates:** no.

### 2.2 — D-CODE-02, D-CODE-05: three slots, aliases don't count — MUTATES
- **Steps:**
  1. Create **QAWWU01**, then **QAWWU02** (*Utwórz kod*).
  2. Go to *Podsumowanie*: expect **Aktywne kody 3 / 3**.
  3. Go back to *Moje kody*: expect **Limit 3 aktywnych kodów osiągnięty. Zarchiwizuj jeden, aby utworzyć kolejny.**, and **Utwórz kod** disabled.
  4. Type `qawwu03`: expect **Masz już 3 aktywne kody. Zarchiwizuj jeden, aby dodać kolejny.**
  5. Press **Archiwizuj** on QAWWU02. It stays in the list as **Zarchiwizowany**. The Overview shows **Aktywne kody 2 / 3**, and *Utwórz kod* is enabled again.
- **PASS:** archived codes aren't counted; a 4th current code is refused; archiving frees a slot; the archived code is still listed.
- **FAIL:** an archived code is counted, a 4th current code is accepted, or the archived code disappears.
- **Mutates:** 2 codes created, 1 archived (still reserved).

### 2.3 — D-CODE-04: another partner cannot claim test1's alias
- **Precondition:** a second partner exists, meaning the new account approved in §4.2. Run this after §4.
- **Steps:** as that new partner, open `/partner?section=codes` and type `qawwu02` (test1's archived alias).
- **Expected:** **Ten kod jest już zajęty. Wybierz inny.**, and the form won't submit.
- **PASS:** refused.
- **FAIL:** "Kod jest dostępny." or a successful create.
- **Mutates:** no.

### 2.4 — H-DASH-06: copy a code and its public link
- **Route:** `/partner?section=codes`
- **Steps:**
  1. In the **MARYSIALOD** row, find the public path **/marysia-lody/marysia-lody** and the buttons **Kopiuj kod** and **Kopiuj link**.
  2. Click **Kopiuj kod**. The label reads **Skopiowano** for a moment. Paste into any field: `MARYSIALOD`.
  3. Click **Kopiuj link**. Paste it into a private window.
- **Expected:** step 3 opens the partner's public page for *marysia-lody*. The **QAWWU02** row (archived) has no copy buttons.
- **PASS:** as above.
- **FAIL:** a wrong value copied, no feedback, or copy buttons on an archived code.
- **Mutates:** opening the link records one referral click.

### 2.5 — G-WEL-03, D-LINK-03, H-DASH-06: first campaign link — MUTATES
- **Route:** `/partner?section=generator`
- **Steps:**
  1. Set **Kod** to MARYSIALOD. Leave **Typ celu** = Cennik (path `/subscription`). Set **Etykieta linku** = `QA WWU link`.
  2. Press **Generuj bezpieczny link**.
  3. Open `/partner?section=content`.
  4. Open the link in a private window, then refresh *Treści i linki*.
  5. Open `/partner` again.
- **Expected:**
  - After step 2: **Gotowy link** shows the full URL (`…/marysia-lody/marysia-lody/l/<slug>`) and **Kopiuj link**.
  - After step 3: the link is listed with **Kopiuj link**, status **Aktywny** (hover "Link jest włączony."), and **Kliknięcia: 0**.
  - After step 4: **Kliknięcia: 1**. A second visit from the same browser may not count twice (clicks are de-duplicated).
  - After step 5: *Pierwszy link* is done ("Masz link gotowy do udostępnienia."), and the guide shows **2 z 3 gotowe**.
  - Only **Kliknięcia** is shown per link. **Rejestracje**, **Klienci** and **Aktywne subskrypcje** per link, and the active-subscriptions count per code, wait for migration `20260910200000` (NOT APPLIED), so their absence is expected.
- **PASS:** as above.
- **FAIL:** a raw status (`ACTIVE`), no copy button, or the step not updating.
- **Mutates:** 1 link, plus click records.

---

## §3 — Admin (sign in as `admin@admin.com`), `/admin/partners`

### 3.1 — I-ADM-02: find a partner
- **Steps:** type into **Szukaj partnera** (placeholder "e-mail, nazwa, slug, kod lub ID") each of `marysia`, `MARYSIALOD`, `QAWWU01` and `test1@test1.com`. Set **Status** to *Aktywni*, then *Wstrzymani*, then back to *Wszyscy*.
- **Expected:** each search leaves test1's card only, with **Wyniki: 1 z N**. *Wstrzymani* hides active partners. The card's line includes **tier standard**.
- **PASS:** as above.
- **FAIL:** search misses an alias or code, the count is wrong, or the filter is ignored.
- **Mutates:** no.

### 3.2 — I-ADM-05: nothing fires on one click (cancel path)
- **Steps:**
  1. On test1's card click **Zawieś**.
  2. Press the dialog's **Zawieś** with the field empty.
  3. Press **Anuluj**.
  4. Open again and press **Escape**.
  5. Open **Przygotuj konto Connect** and press **Anuluj**. **Do not confirm it:** it creates a Stripe account.
- **Expected:**
  - Step 1 opens a dialog, "Zawiesić partnera …?", with "Status zmieni się na „Wstrzymany”." and an **empty** field **Powód — trafi do dziennika audytu**.
  - Step 2 shows **Wpisz powód — trafi do dziennika audytu.**, and nothing happens.
  - Steps 3 and 4 close the dialog; the partner stays *active*.
  - Step 5's dialog has no reason field.
- **PASS:** no action without confirmation and a written reason; Escape and Anuluj never confirm.
- **FAIL:** an action runs on one click, a blank reason is accepted, or Escape confirms.
- **Mutates:** no.

### 3.3 — D-CODE-07, I-ADM-05: disable a compromised code — MUTATES, reversible
- **Precondition:** §2.2 created QAWWU01.
- **Steps:**
  1. On test1's card, click **Wyłącz** on the chip `QAWWU01 · active`. Enter a reason (`QA WWU 2026-09-17`) and press **Wyłącz kod**.
  2. As test1, open `/partner?section=codes`.
  3. Back as admin, click **Włącz**, enter a reason, and press **Włącz kod**.
- **Expected:**
  - Step 1 opens a dialog "Wyłączyć kod QAWWU01?"; afterwards the chip reads `QAWWU01 · blocked`.
  - Step 2 shows the code as **Zablokowany**.
  - Step 3 opens "Włączyć ponownie kod QAWWU01?"; afterwards the code is `active` again.
- **PASS:** each action needed a reason, and each takes effect.
- **FAIL:** no dialog, or a blank reason accepted.
- **Known finding, not a failure:** re-enabling always sets *active*. Don't re-enable the archived QAWWU02 unless you want to see that.
- **Mutates:** status changes plus 2 audit rows.

### 3.4 — I-ADM-05 (optional): suspend and restore with reasons — MUTATES, reversible
- **Steps:**
  1. **Zawieś** test1 with a reason.
  2. As test1, open `/partner`.
  3. As admin, **Przywróć** test1 with a reason.
- **Expected:**
  - After step 2: **Tryb Partner nie jest jeszcze aktywny** ("Status Partnera nie jest aktywny. Historia finansowa pozostaje zachowana.").
  - After step 3: the dashboard is back.
- **PASS/FAIL:** as expected.
- **Mutates:** 2 status changes plus audit rows. Restore before finishing.

---

## §4 — Applicant lifecycle (new applicant account + `admin@`) — MUTATES

### 4.1 — C-APP-07: one readable status per state
- **Steps:**
  1. Sign in as the **new** account and open `/partner` (or `/work-with-us#partner-application`). Fill the required fields (name, main link, consent) and press **Wyślij zgłoszenie**.
  2. As admin, open `/admin/partners` → **Zgłoszenia partnerskie** → this application. Press **Poproś o informacje**, typing a message in *Powód decyzji (opcjonalnie)*.
  3. As the applicant, refresh `/partner`.
  4. Re-submit.
  5. *Optional, on a second throwaway account:* the admin presses **Odrzuć**.
- **Expected:**
  - After step 1: the card **Zgłoszenie przyjęte**, "Mamy Twoje zgłoszenie. Odezwiemy się na podany adres e-mail.", and a line saying nothing is needed from the applicant.
  - After step 3: **Potrzebujemy więcej informacji**, "Uzupełnij zgłoszenie, żebyśmy mogli je dokończyć.", the team's message, and the form **pre-filled** with what was sent (consent *not* pre-ticked).
  - After step 4: back to *Zgłoszenie przyjęte*.
  - After step 5: **Nie tym razem**, "Tym razem nie rozpoczynamy współpracy. Możesz zgłosić się ponownie później."
- **PASS:** every card is copy, with no raw status and no empty form shown under an "in progress" heading.
- **FAIL:** a raw status, a mismatched title and body, a lost answer, or pre-ticked consent.
- **Known, not a failure:** the in-app notification for "more information" opens `/work-with-us`, which redirects to Franchise. The fix is PR #280 plus migration `20260910220000`, both waiting.
- *Not reachable from the app:* *Szkic* (the form keeps no server draft), *W trakcie sprawdzania*, and the suspended/terminated cards. They're automated only (`ApplicationStatusCard.test.tsx`, `applicationSurface.test.ts`). No QA rows are fabricated in the shared DB.
- **Mutates:** an application, decisions, audit rows.

### 4.2 — C-APP-09: approval grants — MUTATES, persistent (do it last)
- **Steps:**
  1. As admin, press **Zatwierdź partnera** on the new applicant's application.
  2. As the applicant, open `/partner`.
- **Expected:**
  - The Partner dashboard opens with **Pierwsze kroki**.
  - *Moje kody* lists **one minted active code**.
  - The account has HOME and PRO access plus Partner mode.
  - An in-app notification opens `/partner`.
  - *Wypłaty* reads "Gellatti przygotowuje Twoje konto wypłat — …".
  - As admin, the new partner appears in the list as active.
- **PASS:** every grant listed above.
- **FAIL:** the dashboard is still gated, no code, no HOME/PRO access, or the notification points elsewhere.
- **Not a failure:** no approval **e-mail** arrives. That's C-APP-08, and its migration `20260910180000` is NOT APPLIED.
- **Mutates:** a partner row, entitlements, a code and audit rows. **The account stays a Partner.** Then run §2.3 as this partner.

---

## §5 — Lane B K16: a reversed referral reward is shown struck through

- **Route:** `/account?section=referral` (*Poleć Gellatti*)
- **Checkable today** (test1 has no rewards): the panel shows **Twój kod** and **Twój link** with copy buttons, and "Nikt jeszcze nie skorzystał z Twojego linku."
- **Precondition for K16 itself (NOT met):** a *reversed* reward. To produce one, a referred account opens test1's referral link and buys a first paid plan with a Stripe test card on staging, then that payment is fully refunded. **MUTATES** (a payment, a refund, a reward), so it's your call.
- **Expected when the data exists:** rewards list as **Zdobyte**; the reversed one reads **Cofnięte**, with its days **struck through** and dimmed.
- **PASS:** the reversal stays visible and struck.
- **FAIL:** the reversal is hidden, shown as earned, or not struck.
- Automated today: the reversal itself (`referralWebhookWiring.test.ts`). The struck-through row has no render test yet (see the coverage map). Not served-proven.

---

## After the run

Mark each row's *Served* result in its lane ledger with the date and account used. Leave *Owner ✅* untouched unless you approve the row.
