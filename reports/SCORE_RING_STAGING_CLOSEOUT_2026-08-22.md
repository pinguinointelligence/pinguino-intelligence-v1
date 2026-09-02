# Score Ring — Staging Closeout

**Date:** 2026-08-22
**Result:** **A. SCORE RING VERIFIED ON STAGING**

---

## 1. Git / deployment identity

| Item | Value |
| --- | --- |
| `origin/staging` at phase start | `4a3128db40de6fa74a7c2f6d6a4e43fd64e0c08d` |
| Worktree | `pinguino-intelligence-v1-score-ring-staging` (fresh, from that head) |
| Branch | `claude/score-ring-v1` |
| New `origin/staging` | `0cf9feb908e2a66e3ffed3b2163e3168334bdb70` |
| Deployment ID | `dpl_AJKpR2fqi39qBbXc4DSkWyeb7voQ` — `READY`, SHA `0cf9feb`, aliased to staging.pinguinoai.com |
| `origin/main` (production) | `4dfb097d…23a2` — **unchanged, not deployed** |
| Mapper fingerprint | `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**, 2088 rows |

## 2. Integration

The owner-approved patch `e3b0eb457663fd7083a4d924906ce153ca0d13b3` was inspected before
use. Its base file `WorkbenchIntelligenceHeader.tsx` proved **byte-identical** to current
staging, so the accepted visual behaviour ported cleanly with **no conflicts** — nothing had
to be reconstructed or guessed.

It adds `WorkbenchScoreDisplay` and the centralized `workbenchScoreRingTones`, and replaces
the previous ring, which was a fixed `#63bd32` at `border-[3px]` **regardless of score**.

**UI only.** No Score calculation, engine, solver or Direction code was touched.

## 3. Accepted visual spec — verified

| Spec | Result |
| --- | --- |
| Ring 36 × 36 px | ✓ `size-9`; served computed style `36px × 36px` |
| Stroke 2 px | ✓ `border-2`; served computed style `2px` |
| No visible `/10` in the ring | ✓ ring text is the bare numeral |
| Score numeral stays clear | ✓ mono, tabular, semibold |
| 10 → `#51ad3e` | ✓ served `rgb(81, 173, 62)` |
| 9 → `#70ba43` | ✓ |
| 8 → `#9dc43e` | ✓ |
| 7 → `#ddcb32` | ✓ |
| 6 → `#f0ad26` | ✓ |
| 5 → `#f58a07` | ✓ |
| 1–4 → same lowest orange | ✓ all `#f58a07` |
| No data → `#dcd8cf` | ✓ |
| No invented gradients | ✓ asserted absent |
| Score math unchanged | ✓ same recipe still scores 10/10 |

## 4. Tests

`workbenchScoreRing.contract.test.tsx` — **32 tests** pinning the contract: each approved
colour per score, the shared lowest orange for 1–4, the neutral no-data ring, no colour
outside the approved set, no gradient, the 36 px / 2 px / fully-round geometry, the absence
of the old `border-[3px]`, the bare numeral for every score 1–10, an **em dash rather than a
fabricated 0** when there is no score, the scale still exposed to assistive technology, and
that the component renders only the score it is handed and imports no score calculation.
The raw-source assertions carry an explicit guard so they cannot pass vacuously.

The patch's own `WorkbenchScoreDisplay.test.tsx` (owner-reference tokens, `/10` removal,
accessibility, narrow-width safety) is retained unchanged.

| Gate | Result |
| --- | --- |
| `npm test` | **7122 passed / 568 files**, 0 failed |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (2 pre-existing warnings) |
| `npm run build` | ✓ built |
| `npm run products:audit` | mapper `b13f5db4…ed38` |
| `npm run mapper:runtime-audit` | active 2088, searchable 2088 |
| `npm run catalog:mapper-only:validate` | 0 violations |
| `npm run production-rescue:bundle-check` | verified `0fd4f0c7…8480` |
| `git diff --check` | clean |

## 5. Served QA (https://staging.pinguinoai.com/pro/recipe)

The ring was driven to a real scored state through the actual product flow — confirm
settings → **Przelicz** → apply the Engine proposal — and inspected via **live computed
style**, not markup guessing:

```
size         36px × 36px
borderWidth  2px
borderColor  rgb(81, 173, 62)   → #51ad3e
text         "10"               → contains "/10": false
tone         fresh-green
aria-label   "Dopasowanie techniczne receptury — Wynik aktualny: 10 na 10 — Wyjątkowo dobrze dopasowana"
```

- **Score 10** — verified served, above.
- **Awaiting-calculation state** — verified served: editing a gram value correctly returns the
  header to `AWAITING_CALCULATION` and shows **no** stale ring; cancelling a preview likewise
  refuses to publish a score. No fabricated numeral.
- **Responsive** — at 375 px the ring holds 36 × 36 px / 2 px with the correct colour,
  stays visible, and the document has **no horizontal overflow**. No layout jump.
- **Console clean** — no errors or warnings across the whole flow.
- Old fixed ring colour `#63bd32` is **absent** from the served bundle; all seven approved
  colours are present.

### Two honest notes

**Non-10 scores were not reachable served.** On the default Gelato recipe the Engine
optimizes back to 10/10 even from a deliberately unbalanced draft (SUCROSE forced to 330 g),
so a served 8 / low-score ring could not be produced through the normal path. That is Engine
behaviour, not a ring defect — and it is also positive evidence that **Score logic is
unchanged**. The other bands are covered by the 32 pinned unit tests and by the approved
palette being present in the served bundle. An authenticated sweep across deliberately
off-target recipes remains the owner's to run.

**A separate `10/10` badge still exists.** The mobile cockpit trigger
(`data-testid="mobile-cockpit-trigger"`, `xl:hidden`) renders a text badge reading `10/10`.
It is **not** the score ring and predates this patch, so it was left alone — §3.3 says to
preserve current labels and change only the ring treatment. Flagging it in case the owner
considers "no `/10`" to extend to that control; it is a one-line change if so.

## 6. Outstanding item

**OWNER AUTHENTICATED SMOKE PENDING** — the visual sweep across a middle score, a low score
and the no-data ring in a signed-in Pro session, for the reason above. Score 10, the
awaiting state, geometry, colour, responsiveness and console cleanliness are all verified
served.
