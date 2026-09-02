# Live Score — Ring Progress + Formal Recalc State — Staging Closeout

**Date:** 2026-08-22
**Result:** **A. SCORE RING + FORMAL RECALC UX VERIFIED ON STAGING**

---

## 1. Identity

| Item | Value |
| --- | --- |
| Staging SHA at task start | `d9fafd4d5f2a5a771323742d571d9a468ac798e9` |
| Final staging SHA | `a7cc71f426ad22a6b52c02d98bda60bf8d95aaa6` |
| Deployment ID | `dpl_BkyVUDHVksW82syAAGoo4HMP5uuk` — `READY`, aliased to staging.pinguinoai.com |
| Production `main` | `4dfb097d…23a2` — **unchanged, not deployed** |
| Mapper fingerprint | `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**, 2088 rows |

## 2. Ring-progress root cause

The ring was a **CSS border**: `className="… size-9 rounded-full border-2 …"` with
`style={{ borderColor: tone.color }}`. A border paints the *entire* circumference in one
colour, so the ring carried no progress information at all — a 5 was drawn exactly like a 10,
just in a different colour. There was no arc, and nothing for the neutral track to show.

## 3. Duplicate-score root cause

Mine, from the live-score change. I had loosened the recipe dock's gate so calculation
freshness no longer suppressed the score:

```
- const current = hasRecipe && !awaitingRecalculation && monitorGate.ready && !legacyInspection;
+ const scorable = hasRecipe && monitorGate.ready && !legacyInspection;   // freshness ignored
```

and rendered the score and `Przelicz` as two independent blocks rather than one exclusive
branch. Against the new Monitor header that produced **three** score surfaces at once
(Monitor + footer + `Przelicz`), destroying the designed state semantics.

## 4. The ring fix

`ScoreRing` is now an SVG, same 36 px box and 2 px stroke:

- a **full neutral `#dcd8cf` track** circle, always drawn;
- a **coloured arc** over it with
  `stroke-dasharray = "{C × score/10} {C − C × score/10}"`, where `C = 2πr = 106.81`
  (r = 17 from the 36 px box less the 2 px stroke);
- rotated `-90°` so progress starts at the top;
- the bare numeral centred, no `/10`.

The visible circumference *is* the progress — there is no full coloured border with a separate
hidden indicator. Geometry now lives in `workbenchScoreRingTones.ts` so the component file
exports only a component (lint stays at its pre-existing 2 warnings).

## 5–8. Behaviour, verified served

Driven through the real UI on staging (steppers, Przelicz, Apply — no store injection):

| State | Monitor | Recipe footer | Verified |
| --- | --- | --- | --- |
| **B** — manual gram edit | `4` live, 40 % arc, "Oczekuje na przeliczenie" | **only** `Przelicz` | `bothAtOnce: false` |
| **Preview ready** | `4` → `8` with arrow | `Przelicz` (formal state unchanged) | comparison Monitor-only |
| **C** — after Apply | `8`, `stale: false`, comparison **cleared** | Score `8`, 80 % arc | `recalcPresent: false` |
| **D** — edit again | `8 → 6` live, 60 % arc | footer Score **gone**, `Przelicz` back | `bothAtOnce: false` |

The Monitor live score updates while the recipe is formally stale, and never certifies
freshness: `monitorLiveScore.ts` imports no store and references no
`awaitingRecalculation` / `savedRecipeId` / `productionReadiness` in code (pinned by test).

## 9. Score 5 visual proof

Served, from computed markup at score 5:

```
data-score-progress = "0.50"
stroke-dasharray    = "53.40707511102649 53.40707511102649"
arc stroke          = #f58a07     track stroke = #dcd8cf
```

Exactly half orange, half neutral. Other served samples: 4 → arc 42.73/106.81 (`#f58a07`),
6 → 64.09 (`#f0ad26`), 8 → 85.45 (`#9dc43e`).

## 10–11. Tests

- `scoreRingProgress.test.tsx` — **26 tests**: every score 1–10 maps to its exact arc
  fraction, the remainder is the neutral track, no partial score ever closes the ring, only
  10 does, no-data draws the track alone, the arc starts at the top, all six approved colours,
  36 px / 2 px geometry, bare numeral with no `/10`.
- `scoreStateSeparation.test.ts` — **8 tests**: the footer stays gated on
  `awaitingRecalculation`, its branch renders `Przelicz` **or** the score exclusively (one
  `WorkbenchScoreDisplay`, one recalc button), the footer never imports the live seam, the
  Monitor owns the header and the comparison, the live score still moves while stale, and it
  derives no freshness authority.
- `workbenchScoreRing.contract.test.tsx` (Phase 3) was **superseded** by
  `scoreRingProgress.test.tsx`, which pins the same colours and geometry plus the arcs.

| Gate | Result |
| --- | --- |
| `npm test` | **7164 passed / 571 files**, 0 failed |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 2 warnings (both pre-existing) |
| `npm run build` | ✓ built |
| `products:audit` / `mapper:runtime-audit` | mapper `b13f5db4…ed38`, active 2088 |
| `catalog:mapper-only:validate` | 0 violations |
| `production-rescue:bundle-check` | verified `0fd4f0c7…8480` |
| `git diff --check` | clean |

## 12. Served QA result

A ✓ · B ✓ · C ✓ · D ✓ · E ✓ · F no `/10` anywhere on the page ✓ · G no duplicate ✓ ·
H console clean (zero messages) ✓. Live editing fired **zero** network requests.

## 13. One thing left alone, deliberately

The recalculation dialog still renders `Najbliższy poprawny wynik: 8/10`. That is
constraint-studio copy, not the Score ring, and §12 forbids touching Rescue in this task, so
it was not changed. Flagging it in case the owner wants `/10` removed there too — it is a
one-line copy change in `constraintStudioCopy.ts`.

---

MONITOR = LIVE CURRENT RECIPE SCORE
RECIPE FOOTER = FORMAL CALCULATION STATE
NO DUPLICATE SCORE
PARTIAL SCORE RING VERIFIED
NO /10
NO PRODUCTION DEPLOY
MAPPER BASE UNCHANGED
