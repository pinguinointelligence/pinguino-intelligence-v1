# GELLATTI GLOBAL COMMUNICATION DESIGN — owner gate v1.7

Date: 2026-08-27
State: **AUDIT AND DESIGN PACKAGE ONLY**
Rollout state: **NOT STARTED — OWNER APPROVAL REQUIRED**

This document inventories the current communication layer across customer, professional, account, catalog, label, community, partner, and administrative surfaces. It proposes a small shared system and contains exactly five owner-approval samples. It does not authorize or implement a global copy/component migration.

## 1. Coverage and method

Audited surfaces:

- Home/customer flow: `/home`, `/start`, ready recipes, Monitor, Home save, machine onboarding;
- Pro: Recipe, settings, Recalculate, Preview/Apply/Undo, Monitor, versions, profile, Production, Rescue, Label;
- product/catalog: Product Scanner v1, assisted scan, manual product, product picker, shared catalog, account markets;
- identity/account: Auth modal, customer menu, invitations, subscription and account gates;
- Community/Partner: publications, sharing, creator profile, partner workspace;
- Admin: overview, users, invites, catalog, customer-added product queue, community moderation, partners, operations;
- shared communication primitives: `WorkflowNotice`, `DialogShell`, empty states, service-error forwarding, loading/status regions.

For each material message, the audit records its current copy or signal, trigger, severity, blocking behavior, persistence/dismissal, visual form, and communication debt. Internal identifiers, event names, database columns, test ids, and audit payloads are not candidates for public copy replacement.

## 2. Current communication inventory

Legend: `B` blocking, `NB` non-blocking, `P` persistent while condition holds, `D` dismissible, `T` transient.

### Pro Recipe, Recalculate, Preview, Monitor, save/version

| ID | Current copy or signal | Module / trigger | Class | Behavior | Audit finding |
| --- | --- | --- | --- | --- | --- |
| PR-01 | `Przelicz` / `Zaktualizuj wynik receptury` | `WorkbenchIntelligenceHeader.tsx`; draft is stale | action | NB/P | Clear intent; keep `Przelicz` as the canonical calculation verb. |
| PR-02 | `PI przygotowuje wynik` | same; calculation running | progress | B/T | Public legacy `PI`; proposed public form: `Przygotowujemy wynik`. |
| PR-03 | `PI przelicza recepturę…` | `ProRecalcPanel.tsx`; overlay working | progress | B/T | Duplicate progress copy and public `PI`; one short status is sufficient. |
| PR-04 | `Najpierw potwierdź ustawienia receptury.` | Recalculate precondition | prerequisite | B/P | Correct timing; hierarchy is too modal-heavy for a one-action prerequisite. |
| PR-05 | `Przejdź do ustawień` | same | recovery action | B/P | Correct action alignment. |
| PR-06 | `Nie udało się zakończyć przeliczenia.` | timeout | recoverable error | B/P | Clear, but title and body may repeat the same failure. |
| PR-07 | `Nie udało się przeliczyć receptury.` | calculation error | recoverable error | B/P | Good plain-language title; technical `messagePl` must remain sanitized. |
| PR-08 | `Spróbuj ponownie` / `Wróć do receptury` | recoverable calculation failure | action pair | B/P | Correct primary/secondary pair. |
| PR-09 | `Proponowane zmiany receptury` | successful Preview | decision | B/P | Good customer-facing title; use as the canonical Preview title. |
| PR-10 | `Zastosuj zmiany` / `Anuluj` | Preview ready | decision action | B/P | Correct: `Zastosuj` is reserved for applying a calculated preview. |
| PR-11 | `Nie mogę osiągnąć dokładnie wybranego celu.` | nearest/best result | attention | B/P | First-person system voice is inconsistent with the rest of the product. |
| PR-12 | `Przelicz najlepiej możliwie` / `Wróć` | best-achievable consent | decision action | B/P | Verb is awkward; future canonical form should describe accepting the nearest result. |
| PR-13 | `PI nie doda tego składnika automatycznie…` | Rescue ingredient advice | guidance | NB/P | Accurate but long, technical, and repeats the workflow; public `PI` leak. |
| PR-14 | `PI zmieniło wyłącznie dozwolone składniki…` | Preview technical explanation | assurance | NB/P | Valuable for details, not for primary hierarchy; public `PI` leak. |
| PR-15 | `Podgląd gotowy` / `Obliczenia zakończone` | workbench score state | success/status | NB/P | Two adjacent completion labels describe nearly the same state. |
| PR-16 | `Wynik pojawi się po przeliczeniu` | score pending | empty/status | NB/P | Clear and correctly placed. |
| PR-17 | `Potwierdź ustawienia` | `WorkbenchSettingsLine.tsx`; settings dirty | action | NB/P | Correct use of `Potwierdź`: acknowledge an explicit configuration. |
| PR-18 | `Zapisz recepturę`, `Zapisz nową wersję`, `Zapisz jako nową recepturę` | save dialog/workbar | persistence action | B/P | Semantically distinct and should remain distinct. |
| PR-19 | raw caught error or `Nie zapisano profilu.` | profile/editor saves | error | NB/P | Raw service messages can expose technical/English copy; needs typed customer mapping. |
| PR-20 | `PI ma propozycję poprawy →` | Monitor recommendation | status/action cue | NB/P | Public `PI` and arrow-as-copy; should become a normal action label. |

### Production, Rescue, TARA/process, Label handoff

| ID | Current copy or signal | Module / trigger | Class | Behavior | Audit finding |
| --- | --- | --- | --- | --- | --- |
| PD-01 | `Zapisz wersję wykonawczą` | `useProductionWorkspace.ts`; source has no immutable version | prerequisite | B/P | Correct rule, but title sounds internal and action sends the user elsewhere. |
| PD-02 | `Produkcja wymaga dokładnej, niezmiennej wersji receptury…` | same | explanation | B/P | Accurate, too technical/long for the primary layer. |
| PD-03 | `Wróć i zapisz recepturę` | same | recovery action | B/P | Bundles navigation and save although only navigation occurs. |
| PD-04 | `Receptura wykonawcza gotowa` | start-ready | readiness | NB/P | Useful, calm pre-start state. |
| PD-05 | `Rozpocznij partię` | ready and acknowledgments complete | primary action | B/P | Canonical Production start verb. |
| PD-06 | `Najpierw potwierdź odgazowanie` | required degassing pending | prerequisite action label | B/P | Button is being used as a message; disabled state should retain an adjacent reason. |
| PD-07 | `Najpierw potwierdź informację` | heat acknowledgment pending | prerequisite action label | B/P | Generic `informację`; the visible heat card supplies the missing context. |
| PD-08 | `Pamiętaj o obróbce` + named products + `OK` | pre-start authoritative heat metadata | safety guidance | B/P until ack | Correct timing after Phase A; one acknowledgment only. |
| PD-09 | `Informacja potwierdzona` card | former post-ack state | redundant success | NB/P | Removed in Phase A; it repeated an already-completed acknowledgment. |
| PD-10 | `Obróbka na ciepło: …` | completed summary when label lacks instruction | reminder | NB/P | Correct low-noise retention of information that would otherwise disappear. |
| PD-11 | `Napój gazowany` / `Przed użyciem należy całkowicie odgazować` | carbonated product present | safety prerequisite | B/P | Separate safety contract; do not merge with generic heat guidance. |
| PD-12 | `− / grams / + / ✓` with default `DO DODANIA` | unconfirmed ingredient | row action/status | B/P | Default badge removed in Phase A; the single control now carries the action. |
| PD-13 | `Faktycznie`, `0 g`, `zgodnie z planem` | every exact-plan row | row metadata | NB/P | Repetitive noise removed visually; semantics retained for assistive technology. |
| PD-14 | `+95 g ponad plan` | non-zero overweigh | deviation | NB/P | Replaced by `Planowo: 705 g` + `95 g więcej`; clearer comparison. |
| PD-15 | `Kontynuuj bez korekty` | Rescue decision | risk decision | B/P | Correct use of `Kontynuuj`: resume the same batch with an acknowledged deviation. |
| PD-16 | `Zastosuj korektę` / `Zastosuj nową partię` | Rescue authorization | decision action | B/P | `Zastosuj` is correct for an explicit calculated result. |
| PD-17 | `Zakończ ważenie bazy` / `Zakończ produkcję` | terminal Production step | terminal action | B/P | Two scopes are legitimate; future copy should consistently call the object `partia`. |
| PD-18 | `Zakończ z wynikiem X` | final confirmation | terminal action | B/P | Score in the destructive/terminal button adds pressure and should be secondary context. |
| PD-19 | `Produkcja chwilowo niedostępna` | repository unavailable | blocking error | B/P | Clear; following body correctly says the recipe was not changed. |
| PD-20 | `Lokalna sesja nie ma trwałego runu` | orphan recovery | blocking error | B/P | `run` is internal language in a public surface. |
| PD-21 | `Nie udało się odzyskać partii` / `Odzyskujemy partię` | recovery state | error/progress | B/P or T | Customer language is good; raw recovery detail still requires sanitization. |

### Home, start flow, machine onboarding

| ID | Current copy or signal | Module / trigger | Class | Behavior | Audit finding |
| --- | --- | --- | --- | --- | --- |
| HM-01 | Home prompt, type/machine/batch questions | `CustomerShellV1.tsx`; step flow | guidance | NB/P | Information hierarchy is conversational and suitable for Home. |
| HM-02 | `Dalej` | multi-step Home/assistant progression | continue action | B/P | Canonical for advancing to the next required step. |
| HM-03 | browser Go/Done key mirrors `Dalej` | first input | input behavior | NB/T | Good behavioral parity; no extra message needed. |
| HM-04 | `Zapisz recepturę` | Home with no saved recipe | persistence action | B/P | Correct and aligned with the one-recipe entitlement. |
| HM-05 | `Zapisz jako wersję N` | Home already owns its one recipe | persistence action | B/P | Clear distinction from creating a second recipe. |
| HM-06 | Home one-recipe limit explanation | `HomeSaveSection.tsx`; limit reached | entitlement guidance | NB/P | Important; keep inline rather than a blocking modal. |
| HM-07 | Monitor result/adjustment notices | `PiMonitorSection.tsx`; result changes | status/attention | NB/P | Uses several similarly weighted cards; taxonomy can reduce competing emphasis. |
| HM-08 | `Zapisz i przejdź do receptury` / `Zapisz i przejdź dalej` | machine onboarding by destination | persistence/navigation action | B/P | Contextual difference is intentional; do not mechanically unify. |
| HM-09 | `Zalecany wsad PINGÜINO` | machine batch proposal | guidance | NB/P | `PINGÜINO` is the approved public brand, not a legacy `PI` leak. |
| HM-10 | internal profile/routing details in technical disclosure | Home diagnostic/details | technical info | NB/D | Acceptable only inside an explicit disclosure, not primary Home copy. |

### Product Scanner, catalog, product picker

| ID | Current copy or signal | Module / trigger | Class | Behavior | Audit finding |
| --- | --- | --- | --- | --- | --- |
| SC-01 | `Skanuj produkt` | Scanner entry | heading/action intent | NB/P | Clear. |
| SC-02 | `Analizuję produkt…` + busy detail | scan analysis | progress | B/T | Good; detailed stage may remain secondary. |
| SC-03 | `Nie udało się wiarygodnie ustalić rodzaju produktu…` | low-confidence classification | recoverable attention | B/P | Clear next need, but should offer one direct rescan action. |
| SC-04 | raw caught `Error.message` with Polish fallback | scan/read/save/retry | error | B/P | Risk of provider/technical/English leakage. |
| SC-05 | `Sprawdź odczytane dane` | OCR result ready | review heading | B/P | Correct review verb. |
| SC-06 | `Krok 4 z 4 · Zapis` | final assisted scan step | progress | NB/P | Useful orientation; `Zapis` is a noun while buttons use `Zapisz`. |
| SC-07 | `Zapisz produkt` / `Zapisz uzupełnienia` | final scanner decision | persistence action | B/P | Correct intent-specific actions. |
| SC-08 | `GOTOWY DO UŻYCIA` | product accepted | success | NB/P | All-caps success competes with the product identity; reduce emphasis. |
| SC-09 | `Zweryfikowany produkt PINGÜINO` | verified product | trust state | NB/P | Approved brand form. |
| SC-10 | `PI Calculated · class-derived · not independently measured` | ingredient picker fallback | provenance | NB/P | Public English/legacy/internal terminology; high-priority rollout candidate. |
| SC-11 | `PINGÜINO — SPRAWDZONY` | picker/catalog trust badge | provenance | NB/P | Approved customer-facing trust name. |
| SC-12 | `Katalog jest chwilowo niedostępny. Spróbuj ponownie.` | catalog read failure | recoverable error | NB/P | Good concise failure/action. |
| SC-13 | `Nie udało się pobrać produktów. Spróbuj ponownie.` | picker read failure | recoverable error | NB/P | Duplicate of SC-12 with different noun; can share a typed pattern. |
| SC-14 | `Engine: profil gotowy/niegotowy` | Scanner detail | technical status | NB/P | Internal terminology appears in customer Scanner primary result; move to details or translate. |

### Label, Community, Partner, Auth, account

| ID | Current copy or signal | Module / trigger | Class | Behavior | Audit finding |
| --- | --- | --- | --- | --- | --- |
| LB-01 | `Najpierw zakończ Produkcję` | Label tab without completion | prerequisite | B/P | Correct dependency, but imperative reads as an error rather than an unavailable future state. |
| LB-02 | `Etykieta powstaje z faktycznie wykonanej partii… ACTUAL…` | Pro Label empty state | explanation | B/P | `ACTUAL` and technical payload list are internal language. |
| LB-03 | `Otwórz Produkcję` | Label prerequisite action | navigation action | B/P | Correct direct recovery. |
| LB-04 | raw caught label/profile/PDF errors | label workflows | error | B/P | Requires typed customer messages; regulatory details can remain under preflight. |
| LB-05 | `Zapisz finalną etykietę` | successful preflight | persistence action | B/P | Clear. |
| CM-01 | `Nie udało się wczytać Community.` | Community read failure | recoverable error | NB/P | Missing a visible retry action. |
| CM-02 | `Gotowe` | share dialog terminal state | close action | NB/D | Correct use of `Gotowe`: close a completed non-destructive flow. |
| CM-03 | raw service errors in profile/rating/use-copy | community mutations | error | NB/P | Provider/English leakage risk. |
| PT-01 | `Public profile`, `Website HTTPS`, mixed Polish/English fields | Partner profile | form guidance | NB/P | Public/admin-like workspace has systematic mixed language. |
| PT-02 | `Tryb Partner niedostępny` | inactive or uninvited partner | access gate | B/P | Clear with reason and Home recovery. |
| AU-01 | localized auth headings/buttons | `AuthModal.tsx` | identity action | B/P | Primary copy is localized. |
| AU-02 | raw `result.message`/service message | auth failure/info | error/status | B/P | High-risk external/provider copy path; type and localize before rollout. |
| AU-03 | `Logowanie jest chwilowo niedostępne` | auth backend absent | blocking availability | B/P | Honest and customer-safe. |
| AC-01 | `Dostęp administracyjny wymagany` | Admin route guard | access gate | B/P | Correct. |
| AC-02 | Home invitation redemption statuses | account invite flow | status/error | B/P | Must follow the same success/error taxonomy; raw service errors need mapping. |

### Admin and operations

| ID | Current copy or signal | Module / trigger | Class | Behavior | Audit finding |
| --- | --- | --- | --- | --- | --- |
| AD-01 | `Public content only` / `Community & Content` | Community moderation | section heading | NB/P | Mixed language; internal admin UI still needs one locale. |
| AD-02 | `Review`, `Dismiss`, `Hide`, `Restore` | moderation actions | action | B/P | English actions alongside Polish reason field. |
| AD-03 | `Separate authority` / `One-time Home month invites` | invitation admin | section heading | NB/P | Internal architecture exposed as UI copy. |
| AD-04 | `Slot`, `Status`, `Created`, `Expires`, `Redeemed` | invite table | table header | NB/P | Mixed language. |
| AD-05 | `Support authority` / `Users` | user admin | section heading | NB/P | Mixed language. |
| AD-06 | `Open`, `Audited action`, `Suspend`, `Reactivate` | user admin | actions | B/P | Mixed language and destructive actions lack an explicit confirmation layer. |
| AD-07 | `Grant audited` / `Revoke active grant` | entitlement mutation | action | B/P | Technical/audit vocabulary instead of user outcome. |
| AD-08 | raw `action.error.message` | admin mutations | error | B/P | Technical detail may be useful to Admin, but needs a summary + expandable diagnostic. |
| AD-09 | `Canonical actions`, `Inspect`, `Publish`, `Unpublish`, `Retire` | catalog admin | actions | B/P | English domain actions with Polish surrounding copy. |
| AD-10 | `Mapper/PI jest chroniony…` | protected catalog origin | assurance/block | B/P | Appropriate admin-only internal vocabulary; do not rewrite internal identity blindly. |
| AD-11 | `Rozpocznij review`, `exact duplicate`, `canonical PR` | product request decision | action/technical | B/P | Mixed language; domain identifiers may remain in details, not primary buttons. |
| AD-12 | `Invitation controlled`, `Invite by email`, `Activate existing user` | partner admin | section/action | B/P | Mixed language. |
| AD-13 | `Reactivate`, `Suspend`, `Provision Connect`, `Approve profile` | partner admin | account/financial action | B/P | High-impact actions need consistent confirmations and outcome messages. |
| AD-14 | `Versioned commission authority`, `Create version` | commission rules | financial action | B/P | Technical primary copy; needs a plain-language result plus retained audit detail. |
| AD-15 | `Queues & failures`, `Scanner failures`, `Deployment identity` | operations | diagnostic | NB/P | Admin-only English is understandable but inconsistent. |
| AD-16 | `Nie udało się odczytać…` boxes | admin reads | recoverable error | NB/P | Consistent Polish summary; add retry and keep trace details expandable. |

### Shared component and error-path findings

| ID | Current signal | Module / trigger | Class | Behavior | Audit finding |
| --- | --- | --- | --- | --- | --- |
| SH-01 | visually unrelated notices built with ad-hoc borders/backgrounds | many features | all | mixed | Same severity has several visual treatments; users cannot infer priority reliably. |
| SH-02 | `WorkflowNotice` | shared inline notice | info/attention | NB/P | Good base primitive; variants need semantic names and action slots. |
| SH-03 | `DialogShell` | line-level and blocking dialogs | decision | B/D | Good shared primitive; callers still provide inconsistent hierarchy and widths. |
| SH-04 | raw caught/service `Error.message` | auth, scanner, labels, community, admin | error | mixed | Largest systemic content risk: internal/provider/English copy can bypass product language. |
| SH-05 | native `title`, hover-only explanations, and color-only accents | row/detail surfaces | guidance | NB/T | Must preserve keyboard/touch equivalents and non-color state labels. |
| SH-06 | `PI`, `PI Calculated`, `Monitor PI`, `Przelicz z PI` | public Pro/Picker/legacy surfaces | brand/technical | mixed | Public legacy naming; replace with neutral verbs or `PINGÜINO` in the rollout. Internal ids remain unchanged. |

## 3. Action vocabulary decision

The lexical scan found candidate terms across the product, then each occurrence was reviewed in context. The design rule is intent-based rather than a blind find-and-replace.

| Intent | Canonical action | Use / do not use |
| --- | --- | --- |
| Start a new Production batch | `Rozpocznij partię` | Do not use `Start`, `Zacznij`, or a generic `Rozpocznij`. |
| Advance to the next required step | `Dalej` | Home/onboarding only. |
| Resume an already-started process | `Kontynuuj` | Example: `Kontynuuj bez korekty`; never for a new batch. |
| Acknowledge a short factual/safety notice | `OK` | TARA/process acknowledgment. |
| Confirm a user-selected configuration or irreversible fact | `Potwierdź …` | Include the object: settings, degassing, completion. |
| Apply a calculated preview without saving | `Zastosuj …` | Preview, Rescue, label/profile settings. |
| Persist user data | `Zapisz …` | Recipe, version, product, profile, label. |
| End a running batch/phase | `Zakończ …` | Prefer `Zakończ partię` when the whole batch ends. |
| Close a completed non-destructive flow | `Gotowe` | Share/profile completion; not a substitute for Save or Apply. |
| Retry the same failed operation | `Spróbuj ponownie` | Always paired with the failed object in the heading/body. |

`Start` remains valid inside code concepts, test names, event identifiers, and English technical diagnostics. It is not approved as customer-visible Polish action copy.

## 4. Proposed shared communication taxonomy

| Type | Purpose | Visual hierarchy | Blocking / lifetime | Required action contract |
| --- | --- | --- | --- | --- |
| `guidance` | Optional help before action | quiet text or neutral inline strip | NB; contextual | no primary button unless it opens details |
| `status` | Loading, processing, current state | one-line status with progress affordance | NB or B while operation runs; T | cancel only when cancellation is real |
| `attention` | User can continue, but a consequence deserves notice | warm border, short title, optional detail | NB/P; D only if safe | action names the consequence |
| `prerequisite` | A required condition blocks the requested flow | compact card/modal, title + one reason | B/P until condition changes | one direct recovery action; optional back |
| `recoverable_error` | Operation failed without corrupting work | error title, reassurance, retry | B or NB/P | `Spróbuj ponownie` + safe exit |
| `confirmation` | Destructive, irreversible, financial, or physical record change | modal with consequence before buttons | B/D | neutral cancel first; explicit object in primary action |
| `success` | Operation completed | low-noise inline/temporary status | NB/T; P only if it becomes record state | `Gotowe` only when closing is the remaining action |
| `diagnostic` | Admin/owner technical trace | disclosure below a plain-language summary | NB/D | copy/export only where authorized |

Shared message model proposed for rollout after approval:

```ts
type CommunicationMessage = {
  kind:
    | 'guidance'
    | 'status'
    | 'attention'
    | 'prerequisite'
    | 'recoverable_error'
    | 'confirmation'
    | 'success'
    | 'diagnostic';
  title: string;
  body?: string;
  primaryAction?: { label: string; intent: string };
  secondaryAction?: { label: string; intent: string };
  blocking: boolean;
  dismissible: boolean;
  persistence: 'transient' | 'until_condition_changes' | 'record_state';
  diagnosticDetail?: string;
};
```

Guardrails:

- primary layer: maximum one short title, one consequence/reason, one primary action;
- technical detail never replaces a customer-safe summary;
- raw external errors are mapped by typed error code, with trace only in Admin/owner disclosure;
- color is never the sole severity signal;
- touch target minimum remains 44 px even when visual density is compact;
- screen-reader live regions announce state changes once, not every re-render;
- public brand is `PINGÜINO`; `PI` may remain only in internal/diagnostic identities approved for that audience;
- no internal event name, database enum, test id, or migration identifier is renamed by a communication rollout.

## 5. Exactly five owner-approval samples

### 1 — Recalculate prerequisite

**Before**

- Copy: `Najpierw potwierdź ustawienia receptury.`
- Button: `Przejdź do ustawień`; separate overlay close `Zamknij`/`Anuluj`.
- Style: full-screen black scrim; dark 680 px dialog; small uppercase dialog label; prerequisite has the same shell as long diagnostics.

**Proposed after**

- Title: `Uzupełnij ustawienia receptury`
- Body: `Potwierdź typ produktu, temperaturę i wielkość partii, aby przeliczyć recepturę.`
- Primary: `Przejdź do ustawień`
- Secondary: `Anuluj`
- Hierarchy: prerequisite title → one reason → primary/secondary actions; no `PI`, no duplicated working/status label.
- Approximate geometry: desktop 560 × 230 px; mobile bottom sheet/full-width card about 358 × 250 px; 24 px outer padding, 12 px title/body gap, 44 px actions.

### 2 — Production save prerequisite

**Before**

- Title: `Zapisz wersję wykonawczą`
- Body: `Produkcja wymaga dokładnej, niezmiennej wersji receptury. Zapisz zastosowaną recepturę przed rozpoczęciem partii.`
- Button: `Wróć i zapisz recepturę`
- Style: warm warning card in the Production panel; one full-width dark action.

**Proposed after**

- Title: `Zapisz recepturę przed produkcją`
- Body: `Produkcja korzysta z zapisanej wersji, aby skład i gramatury nie zmieniły się w trakcie partii.`
- Primary: `Wróć do receptury`
- Hierarchy: short prerequisite → reason tied to user safety → truthful navigation action.
- Approximate geometry: panel card 480 × 178 px desktop; full available width on mobile; 20 px padding; 44 px action; no modal scrim.

### 3 — Label unavailable until Production completes

**Before**

- Title: `Najpierw zakończ Produkcję`
- Body: `Etykieta powstaje z faktycznie wykonanej partii. Po zakończeniu runu pojawią się tutaj składniki ACTUAL, wartości odżywcze, koszt, baza techniczna i automatyczny LOT.`
- Button: `Otwórz Produkcję`
- Style: large empty-state card with an imperative title and technical payload list.

**Proposed after**

- Title: `Etykieta będzie dostępna po zakończeniu partii`
- Body: `Zakończ ważenie składników, aby utworzyć etykietę z faktycznie użytych ilości.`
- Primary: `Otwórz Produkcję`
- Hierarchy: future availability → one dependency → direct recovery; no `run`, `ACTUAL`, or internal model terms.
- Approximate geometry: inline empty state 560 × 176 px desktop; 100% panel width mobile; 20 px padding and one 44 px action.

### 4 — TARA/process information at the right moment

**Before**

- Copy before acknowledgment: `Pamiętaj o obróbce` / `Dla poniższych składników wskazana jest obróbka na ciepło:` / product list / `OK`.
- Copy after acknowledgment: the same card persisted as `Informacja potwierdzona`, and it also returned during active weighing.
- Style: persistent warm/green status card competing with ingredient actions.

**After implemented in Phase A**

- Pre-start only: `Pamiętaj o obróbce` / named products / `OK`.
- Active weighing and Rescue: no process card.
- Completed summary, only because the label lacks the instruction: `Obróbka na ciepło: [products]` as a quiet one-line record reminder.
- Hierarchy: one pre-action safety acknowledgment → silence during execution → low-noise retention at completion.
- Approximate geometry: pre-start card 100% panel width, typically 460 × 154 px for one product; 12 px padding and one 44 px action. Completion reminder is a single ~18 px text line.

### 5 — Production deviation row

**Before**

- Repeated labels/status: `Plan`, `Faktycznie`, `Odchylenie`, `DO DODANIA`.
- Exact-plan rows also showed `0 g` / `zgodnie z planem`.
- Deviation copy: `+95 g ponad plan`.
- Style: five-column table plus separate action/status area; information competed with the stepper.

**After implemented in Phase A**

- Primary row: ingredient identity/status context + one `− / grams / + / ✓` control.
- Exact plan: no visual deviation message.
- Non-zero deviation: `Planowo: 705 g` and `95 g więcej` (or `mniej`).
- Contextual status appears only for edited, confirmed, correction, or top-up states; full plan/actual/deviation semantics remain screen-reader accessible.
- Hierarchy: ingredient → actual control → only material difference; confirmation is integrated into the control.
- Approximate geometry: desktop two tracks `minmax(260px,1fr) / minmax(226px,300px)`; mobile stacked/full-width; 44 px touch targets, compact 28 px visual controls at large breakpoints.

## 6. Approval decision requested

Owner approval should decide the following before any global implementation:

1. approve or revise the eight-type taxonomy;
2. approve the action vocabulary table;
3. approve public replacement of legacy `PI` wording while preserving internal identifiers;
4. approve the five sample hierarchies and density targets;
5. choose rollout order: recommended `raw error paths → Pro prerequisites → Scanner/catalog terminology → Admin language → remaining shared notices`.

Until that decision, the global rollout remains intentionally untouched. Only the already-authorized Phase A Production/TARA/deviation changes represented in samples 4 and 5 are implemented.
