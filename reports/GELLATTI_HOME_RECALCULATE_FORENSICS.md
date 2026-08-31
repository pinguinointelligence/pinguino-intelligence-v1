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

## The aggravating defect: the shell shows a stale signed-in state

With the session token gone, the drawer still offered **„Wyloguj się"** and never
offered „Zaloguj się":

```
{ tokenRemoved: true, showsSignOut: true, showsSignIn: false,
  STALE_SESSION_MISMATCH: true }
```

So a customer whose session has lapsed still looks signed in, presses `Przelicz`, and is
told their product data is stale. Neither message mentions the session
(`mentionsSignIn: false`). This is the most likely shape of what the owner hit.

Honest limit: I **simulated** the lapse by dropping the stored token without a reload. I
did not observe a natural token expiry. The mismatch and both refusals are real and
reproducible; the trigger in the owner's own run is not established.

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

1. Make the shell's session state truthful, so a lapsed session offers „Zaloguj się".
2. Let the server-validation refusal say the session could not be confirmed, instead of
   blaming product data — a copy change, so it needs owner approval.
3. Give HOME a fallback for the eight message-less refusal codes.

None of these weakens ProductBehavior or the Engine: the guard keeps refusing exactly
when it cannot confirm the binding.
