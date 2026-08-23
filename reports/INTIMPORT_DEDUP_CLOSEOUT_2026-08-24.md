# INTIMPORT dedup closeout (§15 + §16) — staging `1f54df7`

Deployed `dpl_GwtFTB6wDeErHaLWDC8C5bq8E7CC` READY on `staging.pinguinoai.com`.
Production untouched. No force push. Mapper fingerprint
`b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` unchanged.
Paid search 0 / 6. Matching, confidence, naming and process/dosage NOT reopened —
composition stayed at 450 / 370 throughout.

## Full-file preflight (§7) — PREVIEW ONLY, nothing applied

| bucket | rows |
|---|---|
| NEW_CANONICAL_PRODUCT | 817 |
| EXISTING_CANONICAL_REUSE | 0 |
| EXACT_DUPLICATE | 0 |
| IDENTITY_COLLISION_RESOLVED_AS_DISTINCT | 3 |
| POSSIBLE_DUPLICATE_REVIEW | 0 |
| IDENTITY_CONFLICT | 0 |
| **total accounted** | **820 / 820** |
| **silently lost** | **0** |

The six Comprital rows that used to collapse are all present: three as the first
of their group (NEW), three resolved as distinct and marked forceDistinct.

## §15 — a weaker fingerprint could overrule a stronger key

Identity is now read in strength order: EAN → manufacturer article code →
stable source Product ID → canonical identity → weak fingerprint. Where a
stronger key proves two rows differ, the weaker fingerprint does not get to
merge them; the write asks the canonical ingest for a distinct product. Where
nothing stronger separates them, the answer is POSSIBLE_DUPLICATE_REVIEW rather
than a guess. Two rows are called duplicates only when a strong key AGREES —
never because their names normalize alike.

No display name was touched. Distinctness is carried by identity keys, so
presentation stays as the accepted naming produced it.

The forced-distinct path was traced end to end: `ingestProduct` sends
`duplicateDecision` in the request body, `catalog-submit` writes it onto the
canonical input, and `ingest_product_v1` appends `:variant:<fingerprint>` to the
identity. The decision is ALSO injected into the client's input so the
idempotency key moves with the server's payload fingerprint — without that, a
changed decision on an unchanged row raises `idempotency key payload mismatch`.

## §16 — a second import reported creations that never happened

When the server replays a prior ingest it returns the ORIGINAL snapshot, whose
`kind` still reads `created`, plus `idempotent: true`. The client never carried
that flag, so a re-import counted every replayed row as a fresh creation. The
database was never wrong — the report was. `idempotent` now settles the outcome.

Controlled subset of the real file (3 with EAN, 5 without, the Comprital
collision pair; 2 composition-ready, 8 review) run twice through the real client
path:

* first run — 10 created, 10 distinct canonical products, 0 failed
* second run — **0 created**, 10 reused

## What this does NOT prove

The second-import proof runs against a model of the canonical ingest transcribed
from the migration SQL (identity rule, `:variant:` fingerprint, ingest-event
replay, fingerprint over `{source,input,evidence,privateOverlay}` with no clock
or randomness). It exercises the real client path and the documented server
rules — **not the deployed Postgres.**

A live double-import needs a signed-in owner session. Reading staging's actor
table to synthesise one is blocked because it is user PII, and I did not work
around that.

## Validation

- `npm run typecheck` — clean
- `npm run lint` — 0 errors (4 pre-existing warnings, `RecipeVersionSelector.tsx`)
- full suite — **660 files, 8298 tests, 0 failures**
- composition unchanged: 450 ready / 370 review / 0 process / 0 dosage blockers
