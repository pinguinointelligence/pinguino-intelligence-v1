# GELLATTI v2.2 — overnight session, 2026-09-10

> **2026-09-11 — integrated into staging.** See `reports/SAFE_V22_FINAL_INTEGRATION_2026-09-11.md`. **Correction:** PKG E's claim that the tutorial stays inert wherever its anchors are absent was false — the optional HOME|PRO opener made it start on every page. Fixed during integration (§3.4 of that report). §9 below records the PARKED state as it was on 2026-09-10; §25 (`WAITING_FOR_PHOTO`) was deliberately not integrated and still waits for owner DB approval.

**Branch** `claude/gellatti-v22-safe` · **Worktree** `~/Developer/pinguino-v22-safe`
**Base** `origin/staging` @ `b3baf256` · **HEAD** see §9 · local only. **PARKED.**
**No push. No PR. No merge. No production deploy. No migration applied.**

---

## 1. REPO STATE BEFORE WORK

| | |
| --- | --- |
| `origin/staging` | `b3baf256` — "Checklist: record the collaboration IA, and two defects it exposed (#217)" |
| Main checkout | `~/Developer/pinguino-intelligence-v1`, branch `codex/live-product-scanner`, HEAD `c39f6e87` (2026-08-25), **156 dirty files last touched 2026-09-04** → a stale abandoned tree, 16 days behind staging, **not an active session** |
| Worktrees | 140+ registered; only two touched in the last 24 h |
| My worktree | created fresh from `b3baf256`; `node_modules` APFS-cloned (`cp -Rc`) from a sibling, never symlinked |

### Active sessions detected, and what they own

| Session | Branch | State | Files I must not touch |
| --- | --- | --- | --- |
| **PARKED / FROZEN** | `claude/home-package-1` @ `a841d573` | clean, **not pushed anywhere** | `homeDefaultProducts*`, `homeIdentityResolution.ts`, `homeIntentParsing*`, `homeIntentResolutionService.ts`, `homeScannedChip.test.tsx`, `matching/homeMatchEntry.test.ts`, `useHomeIntentIngredients.ts` |
| **LIVE — PACKAGE 2A** | `claude/package-2a-priority-crowns` @ `3ba05cde` | committed 04:15, **7 files still dirty and edited after 04:00 → still working** | `recipeStore.ts`, **`HomeCreatorPage.tsx`**, `useHomeIntentIngredients.ts`, `HomeRecipeSection.tsx`, `HomeRecalculate.tsx`, `recipe-priority/*`, `homeAutoRecalculation*`, `crownAutoSeed*`, `toppingAmountAuthority*`, `recipeCompositionPersistence.ts`, owner-locked contracts, the rescue bundle |

**Consequences I accepted rather than worked around**
- The AI-Vision camera is mounted from `HomeIntentSection`, not from `HomeCreatorPage`, because 2A owns that page. This turned out to be the better architecture anyway — the recognised fruit re-enters through the same `ingest` voice already uses.
- The tutorial lives on `AppShell`, not on the HOME page, for the same reason — and again ends up better: it finds anchors in the live DOM, so no page can forget to mount it.
- §16, §17, §26 (ROBIMY, actual grams, HOME final save) live in `HomeRecipeSection.tsx` — 2A's file. Not started.
- `homeCreatorCopy.ts` was edited in the `intent` block ONLY; 2A's hunks are in the `recipe` block, ~90 lines away. `git merge-tree` confirms no conflict.

### Conflict proof

```
git merge-tree $(git merge-base HEAD a841d573) HEAD a841d573   → 0 conflicts
git merge-tree $(git merge-base HEAD 3ba05cde) HEAD 3ba05cde   → 0 conflicts
```

**`origin/staging` moved during the session** — from `b3baf256` to `496266f7` (#247, another session's landing), and PACKAGE 2A advanced from `3ba05cde` to `0c0c79b9`. Re-checked at close: **zero conflicts against the new staging head, against 2A's new head, and against the parked branch.** This branch still needs a rebase before it lands.

**Parked Package 1 confirmed untouched:** still `a841d573`, working tree clean, and `git branch -r --contains a841d573` is empty — `1914dfad` / `a841d573` were not pushed, merged or cherry-picked.

---

## 2. WORK COMPLETED

### PKG A — HOME composer + focus bug + AI Vision · `71f85278`

**§41 — the black rectangle. Root cause found by measurement, not by reading.**

`theme-pro-light.css` owns ONE focus authority for the whole shell, and `AppShell` puts HOME inside it:

```css
html[data-gellatti-input-modality='keyboard'] .theme-pro-light
  :where(button, a, input, select, textarea, summary, [tabindex]):focus {
    outline: 2px solid #4b4d52 !important;
    outline-offset: 2px !important;
  }
```

The composer's field is a **482 px wide textarea with `border-radius: 0`**, and `installInputModalityAuthority` flips the modality to `keyboard` on **any non-modifier keydown** — which is exactly why typing, Tab and Shift+Tab all reproduced the owner's screenshot and a pure mouse click did not. Tailwind's `outline-none` never had a chance against `!important`.

**Counterfactual, measured live in the browser:**

| | computed `outline` on the field |
| --- | --- |
| with the new exemption class | `none` |
| class removed at runtime | `solid 2px rgb(75, 77, 82)` on a 482 × 0-radius box |

The fix is **not** a blind `outline: none`. The indicator MOVES to the whole rounded composer — a border + halo on the wrapper, which follows `border-radius`. Keyboard focus stays plainly visible in the shell's own graphite (#4b4d52, 7.6:1 on white). The shell authority is untouched, and a contract test asserts it still exists **and** that the exemption's specificity (0,4,1) beats it (0,3,1).

**A second instance of the same class of bug, self-inflicted and caught in the browser:** the wrapper's resting `border-color` was an INLINE style, which beats any stylesheet rule without `!important` — so the `:focus-within` treatment was written, shipped and never painted. Both colours now live in the stylesheet.

**§27/§V** — `Powiedz` / `Zeskanuj` stop being large pills and become icons INSIDE the field, joined by AI ✨ and a send arrow. Enter and the arrow are the same ADD. Placeholder `Wpisz składnik lub smak…` → `Coś jeszcze dodajemy?`. Desktop tooltips on all four.

**§28** — the CTA does not exist before the first BASE idea; neither does the hint that explained why it was greyed out. A topping alone is not a recipe.

**§30/§31** — AI Vision v1 on the REAL backend. `product-identify-live` / `identifyLiveFrame` already existed **with no caller anywhere in `src/`**. The pure gate requires all three: it must BE fresh produce, the CATALOGUE (never the model) must have named it, and the recogniser must have been sure. The camera is full-screen: one sentence, a reticle, every control in the bottom thumb zone, no top-left X, no second "AI" tap — the shutter IS the question.

Files: `HomeIntentSection.tsx`, `HomeVisionCapture.tsx` (new), `homeComposerGate.ts` (new), `homeVisionRecognition.ts` (new), `homeCreatorCopy.ts` (intent block), `homeDraftStore.ts` (+`'vision'` source), `styles/home-composer.css` (new), `styles/index.css`.

**Served (dev server, desktop 1280 + mobile 375×812):** no inner rectangle under keyboard modality; composer height 128 px unchanged across focus / type / Tab / Shift+Tab / blur; CTA absent then present; no horizontal overflow.

### PKG B — PRO Production save + POWTÓRZ · `4baffd53`

**§19** — `saved_version_required` was told like a real blocker: amber „Wymaga receptury wykonawczej", „Zapisz wersję wykonawczą", and a button that ejected the user into Receptura to do one thing and walk back. But the recipe is ready; it just has no name.

Produkcja now mounts **`<ProWorkbar variant="panel" />` itself** — not a lookalike. Proved rather than asserted: the test renders the workbar standalone and inside the cockpit and compares the two subtrees **byte for byte** (React `useId` values normalised), and reads the cockpit source for a second `<input` or a second ZAPISZ label. There is none. Heading: „Zapisz nazwę receptury". Every other prerequisite keeps its technical card, held by a test.

**§21** — the premise was verified before the word changed: on a finished run the control calls `startNewSession()`, which starts from `production.source` — the same recipe version. So it IS a repeat. „Chcesz powtórzyć?" + **POWTÓRZ**; „partia" leaves this CTA. The FIRST run's start control answers a different question and is untouched.

### PKG C — share image authority + branded assets · `358708dd`

**§23** — one module (`community/domain/recipeImageAuthority`) owns the whole order of preference and the only place in the application allowed to name the four files. Four TEMPORARY generated placeholders at `public/brand/profile/{gelato,sorbet,vegan,protein}.jpg`; replacing them is a change to four files on disk and to no code.

Honest reach today: `SharePreview` carries no photograph field and `saved_recipes` has no image column, so every own recipe resolves to rule 3 — the branded card — which IS the owner's common case. Rules 1 and 2 are wired and tested and light up the moment the payload carries the field.

**§24** — `communityPhotoAccepted` states the rule as code: our branded cards, our `/recipes/` library renders and an absent photograph are all refused. **Deliberately not wired into the publish dialog yet** — see §4 below.

### PKG D — labels · `b8055814`

**§36** rectangular only; the round RENDERERS stay, because a label saved as round is an immutable record and deleting its renderer would corrupt the archive, not remove the option. **§40** „Historia etykiet" with one field matching full/partial LOT and full/partial name, case- and accent-insensitive, purely local. **§37/§38** audited and pinned rather than rebuilt — both already held.

### PKG E — first-run tutorial · `af4d6162`

Spotlight + dim + coachmark + Pomiń/Wstecz/Dalej + step counter + auto-scroll, Escape and ← →. A step is an anchor plus a sentence, and **a step whose element is not on screen is dropped** — so it never spotlights an empty rectangle and never narrates a screen that does not exist yet. On today's empty HOME that is three real steps; the rest join automatically as their sections appear.

**Two defects found by measuring, not reading:**
1. the settle counter was mutated **inside a `setRect` updater** — React may invoke an updater more than once per commit, double-counting the settle and abandoning the element mid-scroll;
2. measurement ran on `requestAnimationFrame` alone. **A hidden tab throttles or stops rAF**, so the tutorial showed a fully dimmed screen with NO lit element — reproduced in the Browser pane while it was hidden. A timer now runs beside the frame.

### PKG F — the fruit camera must not be a second camera · `4b045865`

Found by the repo's own guard on the full suite, not by review. `scanFlow.boundary.test.ts`
asserts that exactly ONE file in the application acquires a camera stream, and
`HomeVisionCapture` had just become a second one with a raw `getUserMedia`. That is the owner's
§32 rule — one Camera layer for the whole app — and the guard was right.

The screen now drives the same `CameraSession` the canonical scan flow drives, which is also
strictly better than what it replaced: it inherits that session's three-rung open (exact request
→ facing only → anything), so a device that cannot honour 1920×1080 still gets a viewfinder
instead of a refusal. Pinned twice — the app-wide contract passes again, and
`homeVisionRecognition.test.ts` holds the rule for this one screen.

---

## 3. TEST MATRIX

| Gate | Result |
| --- | --- |
| New targeted tests | **112** across 12 new files, all passing |
| HOME + pages/home + copy | 55 files / **567** passed |
| production-workspace + pro-core + pro-workbench + copy | 103 files / **1402** passed |
| community + pages/community | 23 files / **311** passed |
| master-label + destinations + production-workspace | 72 files / **1132** passed, 1 skipped |
| shell + tutorial + home-creator | 53 files / **603** passed |
| Full suite, run 1 | 1090 files / **13473 passed, 1 FAILED** — `scanFlow.boundary.test.ts`, the ONE-camera rule, broken by my own `HomeVisionCapture`. Fixed in `4b045865`. |
| Full suite, run 2 | **1090 files: 1065 passed, 25 skipped · 13476 passed, 129 skipped, 0 FAILED** (605 s). |
| Full suite, run 3 (owner gate) | 1092 files / **13501 passed, 1 FAILED** — `studioBoundary.test.ts`: a doc comment in `publicationDraft.ts` named the data client. Fixed in `4f7a2740`. |
| **Full suite, FINAL** | **1092 files: 1067 passed, 25 skipped · 13631 tests: 13502 passed, 129 skipped, 0 FAILED** (601 s). The lone stderr line `failed to load ./ita.special-words` is pre-existing OCR-fixture noise on a fully passing run. |
| `npm run typecheck` (`tsc -b`) | clean |
| `npx eslint .` | **0 errors**, 8 warnings — all pre-existing, none in a file I touched |
| `npm run build` | built in 5.37 s |
| `npm run guard:owner-locked` | OK — no accepted contract modified |
| `npm run guard:protected-paths` | OK — no protected functional path touched |
| `git diff --check` | clean |

**These are unit and jsdom runtime tests. None of them is an E2E test, and none is called one.** The served checks below were run by hand against a local dev server, not by an automated browser suite.

## 4. FINAL COMPOSER VISUAL MATRIX (owner gate §6) — real browser, local dev server

Driven in the Browser pane against `http://localhost:5231`, reading computed styles and the live
DOM after each step. **These are hand-driven browser checks, not an E2E suite** — the repo has no
E2E infrastructure and nothing here is called one.

| | Check | Result |
| --- | --- | --- |
| **A** | empty state | placeholder `Wpisz składnik lub smak…` ✓ · CTA absent ✓ · hint absent ✓ · no `Powiedz` / `Zeskanuj` text anywhere in the body ✓ · microphone, scanner, AI ✨ and send arrow all `contains()`-verified INSIDE `home-composer` ✓ |
| **B** | desktop tooltips | mic `Powiedz, co chcesz zrobić` · scanner `Zeskanuj produkt` · AI ✨ `Rozpoznaj owoc ze zdjęcia` · arrow `Dodaj` — all four read back from the rendered `title` attributes, each with its own `aria-label`. *The native tooltip bubble is browser chrome and cannot be captured in a screenshot; the attribute that produces it is verified.* |
| **C** | `banan` + Enter | exactly **1** chip (`TWÓJ POMYSŁ \| banan`) ✓ · field cleared ✓ · placeholder → `Coś jeszcze dodajemy?` ✓ · `Zamień pomysł w recepturę` appears ✓ |
| **D** | second ingredient + arrow | identical to Enter: **2** chips (`banan \| czekolada`) ✓ · field cleared ✓ · CTA still present ✓ · arrow returns to disabled on an empty field ✓ |
| **E** | remove all base chips | after the first removal CTA stays (one base chip left) ✓ · after all removed: chip block gone, **CTA gone**, placeholder back to `Wpisz składnik lub smak…`, no hint ✓ |
| **F** | focus matrix | click · type · Tab · Shift+Tab · Shift alone · select-all · mouse selection · blur → refocus · delete all — in **every** state the field computes `outline-style: none` and `box-shadow: none`, and the composer stays **506 × 128 px**. Keyboard focus paints on the rounded wrapper: `border-color rgb(75,77,82)` + `box-shadow rgba(75,77,82,.22) 0 0 0 3px`. **No black rectangular outline in any state.** |

Two harness artefacts, recorded so they are not mistaken for product defects:
- the pane's `Return` key sends `key: "" , code: ""` — an unnamed event no real keyboard produces. `Enter` is sent correctly and commits. The handler already tolerates a missing `key` by reading `code`; here both were empty.
- one D attempt appeared to fail until a screenshot showed my click had landed below the field after the layout grew — the text never reached the input. Re-run against the element reference: passes.

Also verified in the browser this round:
- **§20 swap icon** — the app's `swap` glyph rendered at 8× is unmistakably **two opposite arrows**, not a refresh. **No change made.**
- **AI Vision entry** — opens full-screen, drives the shared `CameraSession`, and degrades honestly to „Nie mamy dostępu do aparatu…" when the pane blocks the camera. Close / shutter / reticle present. **Success path not exercised — no real camera.**
- **Not served-checked:** PRO save box, Labels, Share. Unit and contract tests only.

## 5. FULL MASTER CHECKLIST — 1 → 41 (+ §P)

Statuses, per the owner's 2026-09-10 rule: **a green test is not Owner Verified.**
✅ DONE · 🎨 IMPLEMENTED + VISUAL QA (I looked at it rendered) · 🧪 IMPLEMENTED / WAITING OWNER QA (tests only, screen never viewed) · 🟨 IN PROGRESS (another session) · ⏸ DEFERRED / WAITING · ⛔ BLOCKED · ⬜ TODO · 👁 OWNER VERIFIED

**👁 OWNER VERIFIED count: 0. The owner has seen nothing on served UI in this session.**

| ID | Status | Name | Current state / note |
| --- | --- | --- | --- |
| 1 | ⏸ | Central Search / Concept Resolver | **Decision, not an implementation.** Waiting on final MAPPER / SEARCH (D-01). No local morphology built; `compoundStem` untouched. |
| 2 | ⏸ | HOME automatic product choice | **Decision, not an implementation.** `homeDefaultProducts.ts` not developed; `HomeIdentityChoice` untouched. Waiting on the shared ranking (D-03). |
| 3 | 🟨 | HOME AUTO priority | PACKAGE 2A, live elsewhere. Not duplicated. |
| 4 | 🟨 | AUTO → MANUAL | PACKAGE 2A. Not duplicated. |
| 5 | 🟨 | Multiple crowns | PACKAGE 2A. Not duplicated. |
| 6 | 🟨 | PRO uncrown residue bug | PACKAGE 2A. Not duplicated. |
| 7 | 🟨 | Crown never creates 1 g | PACKAGE 2A. Not duplicated. |
| 8 | 🟨 | HOME auto recalc | PACKAGE 2A. Not duplicated. |
| 9 | 🟨 | Grams without crown | PACKAGE 2A. Not duplicated. |
| 10 | 🟨 | TOPPING outside the base, 5 %, MANUAL amount | PACKAGE 2A. Not duplicated. |
| 11 | ⏸ | Chosen product never changes itself | Decision recorded. End-to-end enforcement needs the final resolver (D-01/D-03). The Vision path already obeys it: the CATALOGUE names the product, never the model. |
| 12 | ⏸ | Scan → chip survives generation | Parked Package 1. Not ported, per instruction. |
| 13 | ⏸ | Matching full-screen UX | Waiting on resolver + recipe library (D-05). |
| 14 | ⏸ | 177 recipes + country PI | Waiting on final Mapper / recipe data (D-06, D-07). |
| 15 | ⏸ | 10/10 across the library | Waiting on D-06/D-07 (D-08). No displayed score touched. |
| 16 | ⬜ | `ROBIMY` = a real Production session | Not started — the control lives in `HomeRecipeSection.tsx`, PACKAGE 2A's live file. Audit: reuse `useProductionWorkspace` / `productionSession`; no second engine exists to delete. |
| 17 | ⬜ | Actual grams `247 g +7 g` + orange | Not started — same file conflict. PRO already has `ProductionActualControl` and the planned/actual/delta split; this is presentation reuse, not new data. |
| 18 | ⬜ | Rescue dead end (`Dokończ tak, jak jest`) | Not started. `leave_as_is` EXISTS and is already evaluated, so the defect is reachability/presentation. Needs a reproduction before code. |
| 19 | 🧪 | Unsaved recipe in Produkcja | Implemented; `ProWorkbar variant="panel"` reused and proved **byte-identical** to the Receptura tab's. **Screen never viewed rendered → WAITING OWNER QA.** |
| 20 | ⛔ | PRO swap icon | **WAITING SERVED QA / NO CHANGE — CURRENT RENDER IS CORRECT.** The app's `swap` glyph rendered at 8× in the browser is two opposite arrows, not a refresh. No circular-arrow icon exists on any swap action. Nothing changed; needs the owner's screenshot to identify another place. |
| 21 | 🧪 | After production — `Chcesz powtórzyć?` / `POWTÓRZ` | Implemented; premise verified first (it restarts the SAME source). The FIRST-run `Rozpocznij partię` is a different context and is **deliberately untouched**, held by a test. **Screen never viewed → WAITING OWNER QA.** |
| 22 | 🧪 | Private share visible to a logged-out recipient | Already held; audited, not rebuilt or re-tested. No hard login wall; Demo projection has no gram field; token survives sign-in. **WAITING OWNER QA.** |
| 23 | 🧪 | Photo in a private share | Authority + four branded assets done; the share page always renders a picture. Rules 1–2 need a photo field on the payload (D-14). **Screen never viewed → WAITING OWNER QA.** |
| 24 | ⏸ | Community requires the maker's OWN photo | **Decision closed by owner.** Rule implemented twice — pure (`communityPhotoAccepted`, `canPublishDraft`) and in SQL (`gellatti_community_photo_is_own_v1`). **Not enforced in the live dialog**, per the owner's instruction not to turn the working path into a dead end. Waiting on D-15. |
| 25 | ⏸ | `Opublikuj później` / `WAITING_FOR_PHOTO` | **Migration, data model, code and tests PREPARED.** `20260910060000_community_waiting_for_photo.sql` is additive, transactional, with a rollback, and **has not been run anywhere**. Nothing is wired — a test asserts `services/community.ts` calls neither new RPC. Waiting on D-16. |
| 26 | ⬜ | HOME autosave + name at the end | Not started — conflict. The draft store already persists; the closing „Jak nazwiesz swoją recepturę?" lives in 2A's file. |
| 27 | 🎨 | One central composer field | **Implemented + VISUAL QA** — gate A, B, C, D above. |
| 28 | 🎨 | Main CTA appears only after a base idea | **Implemented + VISUAL QA** — gate A, C, E above. |
| 29 | 🎨 | Interactive first-run tutorial | **Implemented + VISUAL QA** — auto-start, 3 live steps each spotlighting the measured anchor, „Gotowe", menu restart. Steps E–H appear as their sections render. §29G ingredient-settings anchor: **DEFERRED UNTIL PACKAGE 2A INTEGRATION.** |
| 30 | 🎨 | AI ✨ = fruit only | **Implemented + VISUAL QA** for the entry and copy; the recogniser is real (`product-identify-live`) but **not exercised** — see §31. |
| 31 | 🎨 / ⏸ | Full-screen AI Vision | **UI + canonical `CameraSession` + integration boundary = IMPLEMENTED + VISUAL QA** (opens, reticle, thumb-zone controls, honest refusal when the camera is blocked). **Recognition round-trip = DEFERRED/BLOCKED on a real device** — no camera and no paid call exercised. No fake backend was written. |
| 32 | ⏸ | ONE shared scanner | Deferred (D-12). Related: the fruit camera was corrected to drive the ONE canonical `CameraSession` after the repo's own boundary guard caught it. |
| 33 | ⏸ | Full-screen scanner UX | Deferred with §32. |
| 34 | ⏸ | Desktop scanner root-cause fix | Deferred with §32. |
| 35 | ⏸ | Processing HOT / COLD | Waiting on `GELLATTI_PROCESSING_RULES_v1.xlsx` (D-09). Nothing hardcoded. |
| 36 | 🧪 | Rectangular labels only | Implemented; the choice is gone everywhere a customer reaches, the round renderers stay so the archive still draws. **Screen never viewed → WAITING OWNER QA.** |
| 37 | 🧪 | Label main screen = preview + two actions | Already held; audited and pinned. The „auto-fills everything it knows" half is **not** verified (D-17). **WAITING OWNER QA.** |
| 38 | 🧪 | Expiry date never blocks the preview | Verified in code and pinned: the missing-data list is consulted in exactly ONE place, and the small window collects „Data trwałości" and prints from there. **Screen never viewed → WAITING OWNER QA.** |
| 39 | ⏸ | Label layout / market compliance engine | Waiting on a verified compliance dataset (D-10). No law guessed. |
| 40 | 🧪 | „Historia etykiet" + LOT/name search | Implemented. **Screen never viewed → WAITING OWNER QA.** |
| 41 | 🎨 | Composer must not draw an inner black frame | **Implemented + VISUAL QA** — gate F, nine states, plus the counterfactual that proved the root cause. |
| P-1…P-7 | ⏸ | Unreviewed client-test items (§P) | Untouched by design. Awaiting owner review (D-13). |

### Totals

| | |
| --- | --- |
| Points tracked | **48** (41 numbered + 7 §P) |
| 🎨 IMPLEMENTED + VISUAL QA | **6** — 27, 28, 29, 30, 31 (UI half), 41 |
| 🧪 IMPLEMENTED / WAITING OWNER QA | **8** — 19, 21, 22, 23, 36, 37, 38, 40 |
| 🟨 IN PROGRESS (PACKAGE 2A) | **8** — 3–10 |
| ⏸ DEFERRED / WAITING | **19** — 1, 2, 11, 12, 13, 14, 15, 24, 25, 31 (backend half), 32, 33, 34, 35, 39, P-1…P-7 |
| ⛔ BLOCKED | **1** — 20 (no change made; current render correct) |
| ⬜ TODO | **4** — 16, 17, 18, 26 |
| 👁 OWNER VERIFIED | **0** |

## 6. DEFERRED / WAITING

| ID | What is missing | Exact dependency | What to do once unblocked |
| --- | --- | --- | --- |
| D-01 | Central Search / Concept Resolver | final MAPPER / SEARCH workstream | Route HOME + PRO through it; run `bananowo-czekoladowy sorbet` and `bananowe z czekoladą` as acceptance |
| D-02 | Remove local HOME morphology | D-01 | Delete `compoundStem` and the HOME-local dictionary; keep the tests |
| D-03 | Ranking picks candidate #1, no `HomeIdentityChoice` | D-01 ranking | Make `Zmień` the only way to see candidates |
| D-04 | Role/intent vocabulary (topping / posypka / polewa) | final SEARCH | Move `detectStatedRole` behind the shared vocabulary |
| D-05 | Matching runtime | D-01 + recipe library | Build the full-screen swipe experience; profile stays a hard filter |
| D-06 | 177-recipe reconciliation | final Mapper + recipe data | Re-run the whole library |
| D-07 | 75-country PI routing | country dataset | Country mapping outranks generic ranking |
| D-08 | Whole-library 10/10 matrix | D-06 + D-07 | Find real causes; never adjust a displayed score |
| D-09 | Hot/cold process plan | `GELLATTI_PROCESSING_RULES_v1.xlsx` | Build the runtime plan + the right-hand pictorial steps |
| D-10 | Market label compliance + layout engine | verified compliance dataset | Block a format that cannot fit legally; never shrink the font |
| D-11 | AI Vision backend | **RESOLVED** — `product-identify-live` is real and now has a caller | — |
| D-12 | Scanner work | another branch owns those paths | Re-check ownership, then §32–§34 together |
| D-13 | §P client-test items | owner review | — |
| **D-14** | Own photo on a private share | `saved_recipes` has no image column **and staging shares its Supabase with production** | Migration + `SharePreview.image_url`; the authority module already handles it |
| **D-15** | Community photo upload | no storage bucket for community photos; same shared-Supabase constraint | Bucket + upload, then wire `communityPhotoAccepted` into the publish dialog |
| **D-16** | `Opublikuj później` | `community_publications` has no `WAITING_FOR_PHOTO` status | Additive migration + „Moje receptury" surface |
| **D-17** | „Label auto-fills everything it knows" | a per-market data-completeness audit | Audit which required fields are genuinely derivable per market before claiming §37 |

## 7. OWNER DECISIONS REQUIRED

**CLOSED BY OWNER 2026-09-10** — decisions 1, 2, 3 and 4 below were answered; the resolutions are
recorded inline. Only decision 5 is still open.

**1 — Migrations against a Supabase shared with production.** → **ANSWERED: prepare, do not apply.**
The `WAITING_FOR_PHOTO` migration, model, code and tests are written and committed; the migration has
been run nowhere. Original framing: §23 (photo field), §24 (photo bucket) and §25 (`Opublikuj później`) all need schema. Memory records that staging and production share one Supabase.
· A: I write the additive migrations and someone applies them after review. · B: I write and apply them on staging myself. · C: they wait for a separate staging database.
**Recommendation: A.** Additive and forward-only is low risk, but "staging-only" is not true here, and applying schema to production data is not a call I should make unattended. **Impact:** §23 rules 1–2, §24 enforcement and all of §25 stay blocked until this is answered.

**2 — Community publishing is currently in the state §24 forbids.** → **ANSWERED: leave the working
path alone (option A).** The rule is now stated in two places that cannot be bypassed once the
migration lands — the pure model and the SQL predicate — and the live dialog is untouched. Original
framing: The publish dialog defaults to and offers OUR library renders as the community photo. I did not remove it, because with no upload path that turns a wrong picture into a dead end.
· A: leave it until the upload exists (today's state). · B: block publishing now, honouring §24 immediately, and accept that nobody can publish until D-15 lands.
**Recommendation: A**, with D-15 prioritised. **Impact:** B stops Community publication outright.

**3 — §20 swap icon.** → **ANSWERED: no change if the current render is correct.** Verified in the
browser at 8×: the glyph is two opposite arrows. **Nothing was changed.** Status
`WAITING SERVED QA / NO CHANGE IF CURRENT RENDER CORRECT`. Original framing: The only swap action in the app already draws two opposite arrows; there is no circular/refresh icon on any swap action anywhere.
· A: send the screenshot and the screen it is on. · B: I change nothing.
**Recommendation: A.** **Impact:** §20 stays ⛔ until then.

**4 — §29G ingredient-settings tutorial step has no anchor.** → **ANSWERED: do not touch PACKAGE 2A
files.** Status `DEFERRED UNTIL PACKAGE 2A INTEGRATION`; the step drops itself cleanly until then.
Original framing: The step is authored and drops itself cleanly, but the panel it should spotlight carries no `data-testid`, and adding one means editing `HomeRecipeSection.tsx` — PACKAGE 2A's live file.
· A: I add the anchor after 2A lands. · B: 2A adds it as part of its own work.
**Recommendation: A.** **Impact:** the tutorial teaches the crown only when this lands.

**5 — §21 first-run start control.** → **STILL OPEN**, and the owner has confirmed the first run is a
different context, so `Rozpocznij partię` stays there for now. Original framing: „Rozpocznij partię" still names the FIRST production run (only the repeat CTA changed). §21 says „partia" should leave the customer's language generally, but gave replacement wording only for the repeat.
· A: leave it. · B: rename it to owner-supplied wording.
**Recommendation: A** until the owner supplies the words — inventing them would be guessing.

## 8. REGRESSIONS / RISKS

- **Not served-checked:** every PRO, label and share change. They carry unit + contract tests only, including the byte-identical §19 proof, but nobody has looked at those screens rendered.
- **The camera was never opened.** `HomeVisionCapture` and its `getUserMedia` / `identifyLiveFrame` round trip are untested against real hardware and against a real paid call. Permission-denied and unsupported-browser paths are code-reviewed, not exercised.
- **Vision → chip goes through text, not through an id.** The recognised product enters as the catalogue's display NAME and is resolved again by HOME. Until D-01/D-03, HOME's resolver could in principle land on a different product — the same gap parked Package 1 exists to close for scanning (§12).
- **§29 step coverage is partial by design.** Four of eight steps have no anchor on today's empty HOME. That is the anti-fake-spotlight rule working, but it means the tutorial is shorter than §29 describes until those sections render.
- **`homeCreatorCopy.ts` is shared with PACKAGE 2A.** No conflict today (`git merge-tree` clean), but both branches touch the file; whichever lands second should re-run the HOME suite.
- **Frozen-copy contract changed.** `homeEntryFrozen.contract.test.ts` was updated to the new §27 placeholder. That is the owner's own re-freeze, recorded in the file, but it is a frozen contract that moved.
- **`data-tutorial-measured`** was added to the overlay for served verification. It is deliberate and documented, not debug residue.
- **I broke two architectural boundaries and the repo caught both, not me.** The ONE-camera rule (`scanFlow.boundary`) and the data-client-name rule (`studioBoundary`) each survived several commits and only surfaced on a full-suite run. Anything I built that has no such guard has not had that check.
- **The `WAITING_FOR_PHOTO` migration has never been executed** — not on staging, not anywhere. Its only verification is a static scan of its own SQL. Applying it will need a real dry run.

## 9. GIT — PARKED

```
branch  claude/gellatti-v22-safe          PARKED — no further development
base    b3baf256  (origin/staging at session start; staging has since moved to 496266f7)
head    4f7a2740

4f7a2740 fix(community): keep a data-client name out of feature prose (studioBoundary)
6df97715 feat(community): „Opublikuj później" prepared — migration, model and tests, NOT applied (§24/§25)
4c16c0fe docs: session report — GELLATTI v2.2 overnight, 2026-09-10
4b045865 fix(home): the fruit camera must not be a second camera (§32)
af4d6162 feat(tutorial): a first-run tutorial that teaches at the real component (§29)
b8055814 feat(labels): rectangular only, history you can search, and the expiry asked at print (§36/§38/§40)
358708dd feat(share): one image authority, four branded profile cards (§23/§24/SAFE-5)
4baffd53 feat(pro): save the recipe where you are standing, and ask to repeat in words (§19/§21)
71f85278 feat(home): one composer, four doors, and one focus indicator (§27/§28/§30/§41)

43 files changed, 3821 insertions(+), 130 deletions(-)
git status: clean
```

**0 push · 0 PR · 0 merge · 0 production deploy · 0 migration executed.**
`git branch -r --contains HEAD` is empty — nothing from this branch exists on any remote.
Parked Package 1 (`a841d573`) untouched and still on no remote. `origin/main` untouched.
Zero merge conflicts against current `origin/staging`, against PACKAGE 2A's head, and against the
parked branch. This branch needs a rebase before it lands.
