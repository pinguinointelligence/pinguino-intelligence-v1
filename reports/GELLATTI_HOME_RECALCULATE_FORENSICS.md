# HOME-FUNC-RECALCULATE — forensic

Owner report: *"OWNER could not recalculate the recipe. There appeared to be an error
likely related to old/unassigned ingredient/ProductBehavior data."*

**No logic was changed to produce this document.** It records what the served build
actually does. Environment: `https://staging.pinguinoai.com`, staging `0c5763a2`.

## The same button produces three different refusals

`Przelicz i popraw` → `runPiRecalculationWithTerminal` (the exact Pro function).

| # | Session state | Served refusal | Honest? |
| --- | --- | --- | --- |
| 1 | **Signed in**, recipe genuinely incomplete | „Brakuje składnika w roli: **Owoc**. Wybierz składnik z katalogu Gellatti…" | ✅ true and actionable |
| 2 | **Never signed in** | „…nie spełnia jeszcze bieżącej bramki technicznej: \<all 6 lines\>. **Warstwa: ProductBehavior binding**. …brak aktualnego snapshotu ProductBehavior dla produkt · **Mapper brak**; odśwież dane produktu" | ❌ blames product data |
| 3 | **Session lost under the UI** | „Nie udało się potwierdzić aktualnego powiązania technicznego dla: \<lines\>. **Brakująca warstwa: walidacja serwerowa**. Odśwież dane produktu albo wybierz jego aktualną wersję" | ❌ blames product data |

Cases 2 and 3 name **every ingredient in the recipe at once**. That is the tell: a real
data fault does not strike six unrelated canonical Mapper products simultaneously.

## What is actually happening

The anonymous session is refused the Mapper read (`401 permission denied for view
mapper_basement_search` — the same condition recorded for PC-03). The ProductBehavior
binding therefore cannot be confirmed, and the guard refuses. **The guard is correct.**
What is wrong is the attribution: an AUTH condition is reported as stale product data,
and the customer is told to „odśwież dane produktu" — advice they cannot act on, because
refreshing product data is not the problem.

Against the owner's five candidates:

| Candidate | Verdict |
| --- | --- |
| Unresolved ProductBehavior | **Symptom, not cause.** Signed in, the same lines resolve. |
| Legacy product identity | **No.** Same recipe, same ids, succeeds signed in. |
| Missing canonical mapping | **No.** The mapping exists; the READ is refused. |
| Historical recipe data | **No.** Reproduced on a recipe created minutes earlier. |
| **Another guard** | **Yes** — the server-validation layer, refusing correctly on an unreachable server. |

## WITHDRAWN: the "stale signed-in shell" was my own test artefact

An earlier draft of this document reported that the shell keeps offering „Wyloguj się"
after the session is gone, and called it the most likely shape of the owner's failure.
**That is withdrawn.** I produced it by deleting the stored token directly, and the
Supabase SDK does not watch `localStorage` — so no auth event fired and the store was
never told. It is an artefact of the test method, not a product behaviour.

Checked afterwards: `useAuthStore.init()` subscribes through `onAuthChange` →
`supabase.auth.onAuthStateChange` and sets `{ user: null, status: 'anon' }` on any real
session loss. A genuine expiry, sign-out or failed refresh therefore DOES flip the shell
to „Zaloguj się". I have not demonstrated any real path that leaves it stale, and the
case 3 message above was captured in that artificial state — treat it as unverified.

## What survives, and is genuinely reachable

Case 2 stands on its own and needs no simulation: **a signed-out HOME user can build a
recipe and press `Przelicz`**, which is exactly how it was first captured here — no sign
in at any point. They are told their PRODUCT DATA is stale („brak aktualnego snapshotu
ProductBehavior … Mapper brak; odśwież dane produktu") when the real condition is that
an anonymous session may not read the Mapper. The advice is unactionable and the
attribution is wrong. That is the defect to fix.

## A separate latent risk found while reading the code — NOT the cause here

`HomeRecalculate` renders a refusal only when the variant carries `messagePl`. Of the
refusal codes in `BuildPreviewResult`, these carry one — `standard_presence_removal_required`,
`practicalization_blocked`, `missing_required_role` — while `invalid_constraints`,
`already_clean`, `missing_prices`, `no_proposal`, `unsafe_proposal`,
`vegan_ingredient_conflict`, `rescale_no_scalable` and `rescale_locked_sum` do **not**.
On any of those, HOME shows nothing at all and `Przelicz` looks inert.

That did not cause the observed failures — all three rendered — so it is recorded, not
acted on. Fixing it means giving HOME an honest fallback sentence for a refusal without
customer copy; that is a copy decision for the owner.

## Recommended next step (not taken)

1. When the ProductBehavior binding cannot be confirmed **because the caller is not
   authenticated**, say so and offer sign-in, instead of blaming product data. Copy
   change → needs owner approval.
2. Give HOME a fallback sentence for the eight message-less refusal codes, so `Przelicz`
   is never silently inert. Copy change → needs owner approval.
3. Nothing to do about the shell's session state: it already reacts correctly.

None of these weakens ProductBehavior or the Engine: the guard keeps refusing exactly
when it cannot confirm the binding.
