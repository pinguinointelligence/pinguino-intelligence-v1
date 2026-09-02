# PRO RECALCULATION — TRANSIENT FAILURE, RECOVERED BY RETRY

**Status:** OPEN — recorded, not fixed. Single observation.
**Relationship to GEL-P0-027:** none. Observed during that served QA run and
deliberately kept out of the frozen Crown contract.
**Severity:** P3 — self-recovering, no wrong result produced, recipe not mutated.

## Observation

`staging.pinguinoai.com` → `dpl_D9czTWjkZUoVFtwHgByjADewyDAd`
(`meta.githubCommitSha` `b611ff71`), PRO `pro@pro.com`, 2026-09-01.
Gelato / Ninja CREAMi Deluxe / 670 g / OPTIMAL / STRAWBERRIES `PI-ING-001553` /
Crown ON, starting Main **100 g**.

`Przelicz` first showed „Liczymy balans receptury…" and then terminated with:

> PODGLĄD PRZELICZENIA — Nie udało się zakończyć przeliczenia.
> Nie udało się zakończyć przeliczenia. Twoja receptura nie została zmieniona.
> [Spróbuj ponownie] [Wróć do receptury]

Pressing the dialog's own **Spróbuj ponownie** completed in ~4 s and returned the
correct result: `STRAWBERRIES 100 g → 173 g`, support vector
MILK 201 / CREAM 141 / SMP 48 / SUCROSE 22 / DEXTROSE 83 / TARA 2, sum 670 g,
score 10 — byte-identical to the other six starting values in that run.

## What is already correct

- The failure is **fail-closed**: it states the recipe was not changed, and it
  was not. No partial or wrong vector was applied.
- The refusal is typed and offers a retry, which worked.

## Open questions for whoever picks this up

- Frequency: 1 of 8 recalculations in this session. Cause unknown — no console
  error was captured at the time.
- Whether it is a client-side solver budget/timeout, a transient network failure,
  or a server-authority round trip that gave up.
- Whether an automatic single retry is warranted, or whether the manual
  „Spróbuj ponownie" is the correct product behaviour.

No fix attempted. Recorded so the next PRO lane can instrument it rather than
rediscover it.
