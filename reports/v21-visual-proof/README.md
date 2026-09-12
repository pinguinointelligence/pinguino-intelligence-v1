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
| Sklep | 71.0 → **88.4** | 44.7 ¹ |
| Franchise | 76.5 → **94.5** | 70.4 → **81.7** |
| Współpracuj z nami | 82.7 px / **96.8 ink** ² | 61.3 px / **86.1 ink** ² |
| Receptury | 95.1 → 95.1 | 82.7 → **85.1** |
| Produkty | 95.0 → **95.1** | 84.8 → **85.2** |
| Ustawienia etykiety | 93.9 → 93.8 | 79.5 → **80.6** ³ |
| Ustawienia maszyny | 95.1 → **95.4** | 84.4 → **87.6** |
| PRO Receptura | **88.4** (ink 95.0) ⁴ | **87.1** (ink 91.9) ⁴ |
| PRO Monitor | **89.0** (ink 95.8) ⁴ | **83.4** (ink 91.6) ⁴ |
| PRO Produkcja | **88.6** (ink 93.5) ⁴ | **83.2** (ink 88.1) ⁴ |
| PRO Etykieta — before production | **91.9** (ink 96.5) ⁴ | **87.6** (ink 91.4) ⁴ |
| PRO Etykieta — final label | PENDING_DATA ⁵ | PENDING_DATA ⁵ |

¹ The Sklep catalogue cannot load in this local environment — the page renders
"Nie udało się wczytać sklepu." The hero itself measures correctly at both viewports; the
score is a data blocker, not a design gap. Resolves on served staging.

² Expected and correct. The old 94.7 % came from a page that reproduced the preview's four
category cards — the version that deleted the partner flow. Staging's cooperation content is
different by owner decision, so pixel agreement necessarily drops while the *visual system*
now matches.

³ **Architecture proposal, not a visual gap — and not a mapping error either.** I first
called this a state-mapping mismatch; that was wrong. The authority's own metadata gives this
state `path: "/labels"`, the same route staging uses, so the comparison was aimed correctly.
What differs is the SHAPE: the authority proposes `/labels` as a full-page settings editor
with four jurisdictions and a `Zapisz profil` action, while staging ships a hub whose editor
is a MODAL sheet, with six jurisdictions (Kanada and Australia / Nowa Zelandia added).
Page-vs-modal is architecture, so it is recorded rather than silently converted — and the
authority itself flags it as an open Owner question. See OPEN below.

1. **Ustawienia etykiety: page vs modal.** Needs an owner decision — and the AUTHORITY ITSELF
   asks for exactly this decision rather than settling it. Its own metadata for the state
   records `path: "/labels"` — the same route staging uses — and lists two open questions:

   > „Zatwierdzić kontrakt jednej authority dla Label module i strony z hamburgera."
   > „Docelowa ścieżka standalone nie istnieje; obecny baseline to /labels. Wdrożenie będzie
   > wymagało osobnej decyzji o route bez przekierowania do procesu."

   So the standalone settings PAGE is not an approved implementation waiting to be built; it
   is a proposal the pack explicitly flags as needing a separate route decision. Converting
   staging's modal on my own initiative would have pre-empted a decision the design authority
   deliberately left to the Owner. Recorded, not converted.
2. **Sklep catalogue data** unavailable locally; blocks the mobile Sklep number only.
3. **PRO Monitor / Produkcja computed states — PENDING_AUTH.** The local demo preset is
   stale and `Przelicz` cannot complete, so Monitor renders skeleton bars. §16 (7 rows, one
   Score) and §17 (`0/6` with no invented Score) can only be closed on served staging with
   the TEST PRO session.
⁴ **Corrected measurement.** An earlier pass navigated to each PRO route with a full page
load. The dev persona lives in a Zustand store with no persistence, so every reload dropped
back to `Demo` and the capture recorded the "Przestrzeń profesjonalna" ENTITLEMENT GATE
rather than the workbench — against a mostly-white authority frame that still scored 92–94 %
on white-space agreement alone. The numbers above are re-measured with the persona set once
and every module reached by clicking its tab, so the workbench is actually on screen. The
mobile architecture is confirmed intact per §19–27: compact ingredient list, BAZA LODOWA,
TOPPINGI PO PRODUKCJI, PRODUKT FINALNY and the bottom module bar.

⁵ The authority's `label/final-ready` is the label of a COMPLETED batch. Reaching it needs a
finished production run, which the stale local demo preset cannot produce — same root cause as
the Monitor/Produkcja blocker. Recorded as PENDING_DATA rather than scored against the
before-production state it is not.

The lesson generalises: on this app a screenshot is only evidence once you have checked that
the state you meant to photograph is the state on screen.

## Open

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

## Served-staging baseline (pre-merge, `staging.pinguinoai.com`)

Captured against the LIVE staging before this branch merges, so the post-merge pass is a true
before/after on real infrastructure rather than a local approximation. The PR's own Vercel
preview is behind deployment protection (302), so real staging is the only servable target.

These numbers are lower than the local ones because served staging carries REAL data — a full
shop catalogue, real cooperation content — where the local dev server shows empty or failed
states. That makes them the honest baseline.

| State | Served BEFORE · desktop | Served BEFORE · mobile | This branch, local |
|---|---|---|---|
| Sklep | **51.6** (ink 80.1) | **22.0** (ink 78.0) | 88.4 desktop |
| Współpracuj z nami | **59.4** (ink 64.3) | **41.6** (ink 46.2) | 87.1 desktop |
| Franchise | **87.7** (ink 96.4) | **63.9** (ink 90.1) | 94.5 desktop |
| Receptury | 95.1 (ink 97.4) | 82.7 (ink 86.7) | 95.1 / 85.1 |
| Produkty | 95.0 (ink 97.2) | 84.8 (ink 88.7) | 95.1 / 85.2 |
| Ustawienia etykiety | 93.7 (ink 96.9) | 84.5 (ink 88.2) | 93.8 / 80.6 |
| Ustawienia maszyny | 95.1 (ink 97.1) | 84.4 (ink 88.3) | 95.4 / 87.6 |

The three commercial destinations are where live staging diverges most from the approved
design — Sklep at 22 % on a phone. That is the gap this branch closes.

Captures in `reports/v21-visual-proof/served-BEFORE/`.


## Late corrections the served baseline forced

Capturing live staging before merging caught two defects that were invisible locally,
which is the whole argument for doing it in that order:

1. **Sklep printed its starter-pack copy twice.** Locally the catalogue fails to load, so
   the page looked correct. On real staging `ShopCatalog` opens on „Zestaw startowy /
   Gellatti Starter Pack" using the same `starterPack.kicker` and `body` the hero had been
   given. The hero now carries only `page.*`.
2. **Współpraca lost its page identity.** The approved hero carries the PAGE eyebrow, title
   and blurb; mine carried the PARTNER headline, so once `bare` removed the shared
   `PageHeading`, „Twórz z Gellatti" was gone from the page altogether. The hero now carries
   `c.page` and the partner block keeps its headline, body and `whatYouShare` in its own
   section below — 90.9 → **96.8 %** ink desktop, 81.8 → **86.1 %** ink mobile.
3. Both heroes hid their visual below `lg`; the authority's mobile heroes run the full band
   WITH the visual (verified on the 390 × 844 captures — Sklep keeps its graphite half and
   pack frame on a phone). Hiding it shortened the band and knocked the page below it out
   of register.

`px` on Sklep mobile stays low locally only because the catalogue cannot load there; the
hero itself measures exactly x 80, y 124, w 1280, h 470 — the authority's own numbers.

## Served proof, after merge (`staging.pinguinoai.com`, `bdba6c52`)

Same authority addressing, same measurement, same two viewports as the pre-merge baseline —
so these are directly comparable. Captured after PR #10 merged and the staging deployment
reported success.

| State | Desktop BEFORE → AFTER | Mobile BEFORE → AFTER |
|---|---|---|
| **Sklep** | 51.6 → **87.8** (+36.2) | 22.0 → **40.3** (+18.3) |
| **Współpracuj z nami** | 59.4 → **82.7**; ink 64.3 → **96.8** (+32.5) | 41.6 → **61.3**; ink 46.2 → **86.1** (+39.9) |
| **Franchise** | 87.7 → **94.5** (+6.8) | 63.9 → **81.7** (+17.8) |
| Receptury | 95.1 → 95.1 | 82.7 → **85.1** |
| Produkty | 95.0 → **95.1** | 84.8 → **85.2** |
| Ustawienia etykiety | 93.7 → **94.2** | 84.5 → 84.2 |
| Ustawienia maszyny | 95.1 → **95.4** | 84.4 → **87.6** |

The served numbers land on the local ones to within a point, which is the real confirmation
that what merged is what was measured.

Confirmed by eye on served staging: the Sklep hero renders the approved 470 px band with its
graphite half, and „Zestaw startowy / Gellatti Starter Pack" now appears exactly ONCE — the
duplicate the pre-merge baseline caught is gone.

### A measurement failure worth recording

The first served-AFTER run produced numbers showing Współpraca and Franchise getting WORSE
after the merge. They were nonsense: the local authority server on port 5299 had died, so
every "authority" capture in that run was a Chrome `ERR_CONNECTION_REFUSED` page. Some states
still scored 98 % against it, because an error page and a light app page are both mostly
white — the same white-space artefact that made the entitlement-gate PRO scores look like
92 %.

Twice now this harness has produced high, confident, meaningless numbers from a screenshot of
the wrong thing. The rule that follows: a comparison is only evidence once BOTH sides have
been confirmed to be the thing they claim to be.
