# Gellatti V2.1 — visual reconciliation on top of the newest staging

**Branch** `claude/v21-visual-on-staging`, cut clean from `origin/staging` @ `66ad298c`.
Supersedes PR #2, which was written against an older staging and would have deleted
`ShopCatalog`, `PartnerApplicationPanel` and the OWNER DECISION (2026-08-29) on cooperation
routes.

**The rule this branch follows:** FUNCTIONALITY = newest staging. VISUAL PRESENTATION =
approved V2.1. Nothing staging does was removed or replaced.

## Method

Authority served on `localhost:5299` (V2.1 pack, `index.html` SHA256 `758b4f90…a30b`);
this branch's app on `localhost:5501`. Playwright + system Chrome, `deviceScaleFactor: 1`,
locale `pl-PL`. States addressed the way the authority itself addresses them —
`?preview=<page>` and `?pro=<module>&state=<state>`.

`px` = share of sampled pixels within 16/255 luminance. `ink` = structural agreement
(pixel is "ink" on both sides). High ink with lower px means the structure matches and the
tone or line-wrap differs.

## What changed

### Shared shell — measured, and now exact

| Property | Authority | Before | After |
|---|---|---|---|
| page block origin, mobile | 26 px | 32 px | **26 px** |
| page block origin, ≥640 | 42 px | 40 px | **42 px** |
| eyebrow line-height | 12.5 px | 15 px | **12.5 px** |
| eyebrow → title gap | 7 px | 8 px | **7 px** |
| title tracking | −0.04 em | −0.035 em | **−0.04 em** |
| heading action width, mobile | 358 px (full) | 129 px (content) | **358 px** |
| title y (mobile) | 127.5 | 131 | **127.5** |

These live in `shellGeometry.ts` and `PageHeading.tsx`, so the correction lifts every
authenticated screen at once rather than one page at a time.

### Destinations

`destinationEditorial.tsx` carries the approved vocabulary — hero, section head, eyebrow,
section rhythm, image-direction frame, commerce lock. `DestinationSurface` gains an additive
`bare` flag so a hero can own the top of the canvas instead of the page title being painted
twice. Measured hero calibrations: Sklep 470 px at 1.05/0.95 with a 74 px inset, Franchise
380 px at 1.1/0.9 with 66 px, Współpraca 372 px graphite at 1.15/0.85.

A real legibility defect was fixed on the way: the graphite hero's call to action used
`primary` (`bg-ink`), i.e. near-black on near-black. The authority uses the orange fill, so
`buttonClasses` gained an additive `orange` variant.

## Results

| State | Desktop before → after | Mobile before → after |
|---|---|---|
| Sklep | 71.0 → **88.4** | 55.1 → 44.7 ¹ |
| Franchise | 76.5 → **94.5** | 70.4 → **81.7** |
| Współpracuj z nami | 94.7 → 87.1 ² | 73.0 → 72.3 ² |
| Receptury | 95.1 → 95.1 | 82.7 → **85.1** |
| Produkty | 95.0 → **95.1** | 84.8 → **85.2** |
| Ustawienia etykiety | 93.9 → 93.8 | 79.5 → **80.6** ³ |
| Ustawienia maszyny | 95.1 → **95.4** | 84.4 → **87.6** |
| PRO Receptura / Monitor / Produkcja / Etykieta ×2 | 92.2–94.2, unchanged | 86.3–91.0, unchanged |

¹ The Sklep catalogue cannot load in this local environment — the page renders
"Nie udało się wczytać sklepu." The hero itself measures correctly at both viewports; the
score is a data blocker, not a design gap. Resolves on served staging.

² Expected and correct. The old 94.7 % came from a page that reproduced the preview's four
category cards — the version that deleted the partner flow. Staging's cooperation content is
different by owner decision, so pixel agreement necessarily drops while the *visual system*
now matches.

³ **State-mapping mismatch, not a gap.** The authority's `label-settings` is a full-page
settings editor with four jurisdictions and a `Zapisz profil` action. Staging implements the
same content as a MODAL sheet opened from `/labels`, with six jurisdictions (Kanada and
Australia / Nowa Zelandia added). Page-vs-modal is an architecture difference, not a visual
one, so it is recorded rather than silently converted — see OPEN below.

## Open

1. **Ustawienia etykiety: page vs modal.** Needs an owner decision — keep staging's modal
   (and dress it in the approved tokens), or promote it to the authority's full page.
2. **Sklep catalogue data** unavailable locally; blocks the mobile Sklep number only.
3. **PRO Monitor / Produkcja computed states — PENDING_AUTH.** The local demo preset is
   stale and `Przelicz` cannot complete, so Monitor renders skeleton bars. §16 (7 rows, one
   Score) and §17 (`0/6` with no invented Score) can only be closed on served staging with
   the TEST PRO session.
4. ~~PRO Workbench Master at 82.5 %~~ — **closed, not a gap.** `?pro=master&state=master` is
   a DOCUMENTATION view of the pack itself ("Gellatti V2.1 across the complete working loop",
   four cards linking to the modules, a frozen-function panel). It has no app counterpart, in
   the same way the gate's `/` cover has none, so it is excluded from the scorecard rather
   than scored against `/pro/recipe`.

## Decision 2 — machine save relocation, verified

Ported from the superseded branch and refitted to this staging (the preference
record moved to `preferenceContracts` with a new input shape, and the default suite
is node-only so the interactive test needed the repo's `// @vitest-environment jsdom`
pragma and `.runtime.test.tsx` name).

Verified on a real saved machine driven through the actual picker flow — not a forged
store:

| | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| `Zapisz ustawienia` controls | **exactly 1** | **exactly 1** |
| position | x 1228, y 171 (page heading, top-right) | x 16, y 224 |

The settings surface now matches the authority's composition: KONTO eyebrow, title and
blurb, the heading save action, the machine card beside its `Podsumowanie` summary, and
`Przywróć zalecany wsad` / `Zmień maszynę`. 121/121 machine-onboarding tests pass.

CI caught three real React errors in the ported code — `useRef`/`useEffect` after the
`view === null` early return, and a ref assigned during render. Fixed at the source by
lifting `submit` and both hooks above the early return rather than by relaxing the rule.

### Remaining machine-settings refinements (visual only, not yet applied)

1. the authority's machine card header carries an icon tile and a `Zapisany default` chip;
2. the authority's `Podsumowanie` card is ivory-tinted, ours is white;
3. the authority has no `Moja maszyna` section heading above the cards, so its cards start
   at y 227 against our y 303.
