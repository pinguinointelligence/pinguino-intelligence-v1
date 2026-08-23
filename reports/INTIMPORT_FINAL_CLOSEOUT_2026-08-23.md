# INTIMPORT final closeout — state at staging `cce6c1b`

Date 2026-08-23. Branch `staging`, deployed `dpl_6VRgD8xSRBmhPpiRvC42HK4bfc6C`
READY on `staging.pinguinoai.com`. Production untouched. No force push.
Mapper fingerprint `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`
— unchanged. Paid search 0 / 6 (none spent this session).

## The numbers on the real file (820 rows, `PL_Poland.csv`)

| | |
|---|---|
| rows imported to Product Catalog | 820 (all valid rows) |
| composition-ready (Engine usable) | 450 |
| REVIEW (stored, not Engine-ready) | 370 |
| process blockers | 0 |
| dosage blockers | 0 |

Engine-usable rose 190 → 450 when process/dosage stopped gating use.

## What was fixed

### 1. Silent loss of 25 products (P0)

The catalogue's identity for a product without an EAN is
`brand + name + category + package size`. INTIMPORT built the name from the
product-name column alone and **dropped the source's variant**, so different
formulations resolved to ONE identity and later rows were absorbed.

Measured on the real file: **44 rows collapsed into 19 products.** The worst
case was `Twaróg klinek Delikate` *chudy / półtłusty / tłusty* — three fat
levels at the same 250 g size, which the Engine would have received as one.
Only 57 of the 820 rows carry an EAN, so the name keeps the other 763 apart.

`canonicalProductName` now appends the variant in the SOURCE's own words, and
only when the name does not already carry it. Readiness was unchanged by this
(450 / 370), which is the point: it separates products, it does not alter what
is known about them.

**Residual: 3 groups / 6 rows.** All Comprital, all genuinely distinct — two
product LINES sharing a name (`Speedy Classic` vs the vegan `Speedy Trilogy`;
a paste vs a cream variegate), differing in dosage, process H/C and description.
Appending the line would fix those 6 and degrade the other 364 rows that carry
a generic one (`CIOCCOLATO 130 Czekolada [Czekolady]`), so it was NOT done.
These must be surfaced at preflight instead — see "Not done" §15.

### 2. Process and dosage no longer gate use

Owner decision: HEAT / COLD / BOTH / UNKNOWN and professional dosage are
INFORMATIONAL. Readiness previously applied a technical gate on top of the
composition verdict, refusing 260 professional products that were every one of
them composition-ready. The flag is demoted, not deleted:
`technicalAuthorityRequired` is still resolved and still written into the
stored intelligence, so unproven dosage stays visible without being blocking.

### 3. All valid rows enter the catalogue

Verified already implemented: `planIntimportImport` plans every row, and a
REVIEW row keeps whatever evidence was resolved rather than being stored empty.

## Validation

- `npm run typecheck` — clean
- `npm run lint` — 0 errors (4 pre-existing warnings, `RecipeVersionSelector.tsx`)
- full suite — **657 files, 8282 tests, 0 failures**, twice, reproducibly
- `npm run process:validate` — clean, `alignmentDifferences: 0`, UNKNOWN (1389)
  correctly treated as legitimate, not a failure. No change needed.

The earlier "4 failed files / 11 failed tests" was machine contention from
competing test runners across worktrees, not a real failure — it does not
reproduce on a quiet machine.

## NOT done — this is why the answer is NO-GO for bulk import

- **§15** same-file duplicate detection surfaced at preflight. The 3 Comprital
  collisions above would still merge silently. This is the one that should be
  closed before a bulk run.
- **§16** idempotency not empirically proven. The server identity is EAN-first
  and nutrition-free, so re-import SHOULD be stable under changed estimates, but
  a second-import NEW = 0 run was not performed.
- **§23–§25** process provenance under the product `?` in Polish
  ("Obróbka: Na ciepło" / "Brak informacji") — not built.
- **§27–§28** preview summary counts / Apply semantics — only partially present.
- **§30–§35, §42–§44** controlled developer and served staging QA — not run.
  Served QA needs the owner to sign in; Claude never types account credentials.

## Recommendation

**NO-GO for owner bulk import of all 820 today**, on one specific ground: §15.
Deduplication now loses 6 rows instead of 44, but "instead of" is not "none",
and a bulk import is the wrong place to discover which. Close §15 so the owner
SEES the colliding rows before Apply, then a bulk run is defensible.

A controlled QA import (a few rows) is safe now.
