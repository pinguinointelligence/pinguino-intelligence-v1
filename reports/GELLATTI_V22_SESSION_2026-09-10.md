# GELLATTI v2.2 — overnight session, 2026-09-10

**Branch** `claude/gellatti-v22-safe` · **Worktree** `~/Developer/pinguino-v22-safe`
**Base** `origin/staging` @ `b3baf256` · **HEAD** `4b045865` · 6 commits, local only.
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
| New targeted tests | **88** across 10 new files, all passing |
| HOME + pages/home + copy | 55 files / **567** passed |
| production-workspace + pro-core + pro-workbench + copy | 103 files / **1402** passed |
| community + pages/community | 23 files / **311** passed |
| master-label + destinations + production-workspace | 72 files / **1132** passed, 1 skipped |
| shell + tutorial + home-creator | 53 files / **603** passed |
| Full suite (first run) | 1090 files / **13473 passed, 1 FAILED** — `scanFlow.boundary.test.ts`, the ONE-camera rule, broken by my own `HomeVisionCapture`. Fixed in `4b045865`. |
| Full suite (after the fix) | **1090 files: 1065 passed, 25 skipped · 13605 tests: 13476 passed, 129 skipped, 0 FAILED** (605 s). One benign stderr line, `failed to load ./ita.special-words`, is pre-existing OCR-fixture noise on a passing run. |
| `npm run typecheck` (`tsc -b`) | clean |
| `npx eslint .` | **0 errors**, 8 warnings — all pre-existing, none in a file I touched |
| `npm run build` | built in 5.37 s |
| `npm run guard:owner-locked` | OK — no accepted contract modified |
| `npm run guard:protected-paths` | OK — no protected functional path touched |
| `git diff --check` | clean |

**These are unit and jsdom runtime tests. None of them is an E2E test, and none is called one.** The served checks below were run by hand against a local dev server, not by an automated browser suite.

## 4. VISUAL / UX QA — actually rendered, not read

| Check | Evidence |
| --- | --- |
| Composer, resting | one field, four icons inside, `Wpisz składnik lub smak…`, no CTA, no hint |
| Composer, keyboard focus | `modality=keyboard`, field `outline-style: none`, wrapper `box-shadow: rgba(75,77,82,.22) 0 0 0 3px`, border `#4b4d52` |
| Layout stability | composer 128 px before and after focus / type / Tab / Shift+Tab / blur / refocus |
| CTA | absent with text unparsed in the field; present after the first chip; label „Zamień pomysł w recepturę" |
| Mobile 375 × 812 | composer, chips and CTA all fit; no horizontal overflow |
| Tutorial | auto-start on first visit; 3 steps; each spotlight measured equal to its anchor's box + 8 px; „Gotowe" on the last; menu entry restarts a seen tutorial |
| AI Vision entry | opens full-screen, drives the shared `CameraSession`, and degrades honestly to „Nie mamy dostępu do aparatu…" when the pane blocks the camera. Close / shutter / reticle all present. **The success path was NOT exercised — no real camera.** |
| Label / PRO surfaces | **not** served-checked this session — covered by unit + contract tests only |

## 5. FULL MASTER CHECKLIST — 1 → 41

Statuses: ✅ DONE · 🧪 IMPLEMENTED / WAITING OWNER QA · 🟨 IN PROGRESS · ⏸ DEFERRED / WAITING · ⛔ BLOCKED · ⬜ TODO · 👁 OWNER VERIFIED · ⏭ SUPERSEDED
**Nothing is marked 👁 OWNER VERIFIED. The owner has verified nothing in this session.**

| ID | Status | Name | Current state / note |
| --- | --- | --- | --- |
| 1 | ⏸ | Central Search / Concept Resolver | **Decision, not an implementation.** Waiting on final MAPPER / SEARCH (D-01). No local morphology built; `compoundStem` untouched; no second HOME dictionary created. |
| 2 | ⏸ | HOME automatic product choice | **Decision, not an implementation.** `homeDefaultProducts.ts` not developed further; `HomeIdentityChoice` left exactly as it was. Waiting on the shared ranking (D-03). |
| 3 | 🟨 | HOME AUTO priority | **Owned by PACKAGE 2A, another live session.** Implemented there on `claude/package-2a-priority-crowns` (`recipe-priority/priorityMode.ts`). Not duplicated here. |
| 4 | 🟨 | AUTO → MANUAL | PACKAGE 2A (`pressCrown` one-way transition). Not duplicated. |
| 5 | 🟨 | Multiple crowns | PACKAGE 2A. Not duplicated. |
| 6 | 🟨 | PRO uncrown residue bug | PACKAGE 2A — root cause is `setStandardIngredient` writing `user_intent_anchor_grams` on crown-off. Not duplicated. |
| 7 | 🟨 | Crown never creates 1 g | PACKAGE 2A — `crownAutoSeed.ts` deleted there. Not duplicated. |
| 8 | 🟨 | HOME auto recalc | PACKAGE 2A (`useHomeAutoRecalculation`). Not duplicated. |
| 9 | 🟨 | Grams without crown | PACKAGE 2A. Not duplicated. |
| 10 | 🟨 | TOPPING outside the base, 5 %, MANUAL amount | PACKAGE 2A (`toppingAmountAuthority.ts`). Not duplicated. |
| 11 | ⏸ | Chosen product never changes itself | **Decision recorded.** Enforcing it end-to-end needs the final resolver (D-01/D-03). The Vision path already obeys it: the CATALOGUE names the product, never the model. |
| 12 | ⏸ | Scan → chip survives generation | Belongs to the **parked** Package 1. Not ported, per instruction. |
| 13 | ⏸ | Matching full-screen UX | Waiting on resolver + recipe library (D-05). Nothing built. |
| 14 | ⏸ | 177 recipes + country PI | Waiting on final Mapper / recipe data (D-06, D-07). |
| 15 | ⏸ | 10/10 across the library | Waiting on D-06/D-07 (D-08). No display score was touched. |
| 16 | ⬜ | `ROBIMY` = a real Production session | **Not started — conflict.** The control lives in `HomeRecipeSection.tsx`, which PACKAGE 2A is editing right now. Audit note: PRO's Production authority (`useProductionWorkspace`, `productionSession`) is the one to reuse; no second engine exists to delete. |
| 17 | ⬜ | Actual grams UI `247 g +7 g` + orange | **Not started — same file conflict as §16.** PRO already has `ProductionActualControl` and the planned/actual/delta split in `productionSession`; this is a presentation reuse, not new data. |
| 18 | ⬜ | Rescue dead end (`Dokończ tak, jak jest`) | **Not started.** `leave_as_is` EXISTS (`productionSession.ts:92`, `useProductionWorkspace.ts:205`) and is already evaluated as an option, so the bug is in reachability/presentation, not in a missing strategy. Needs a reproduction before code. |
| 19 | ✅ | Unsaved recipe in Produkcja | **Done** — `<ProWorkbar variant="panel" />` reused 1:1, proved byte-identical. `4baffd53`. |
| 20 | ⛔ | PRO swap icon | **Blocked — the premise does not reproduce.** The only swap/exchange action in the app (`ArticleActionIcon.swap`, `ingredient-builder/IngredientRow.tsx:107`) is ALREADY two opposite arrows, not a refresh. No circular-arrow icon exists on any swap action. Needs the owner's screenshot. See Owner Decision 3. |
| 21 | ✅ | After production — `Chcesz powtórzyć?` / `POWTÓRZ` | **Done**, premise verified first. `4baffd53`. |
| 22 | 🧪 | Private share visible to a logged-out recipient | **Already held; audited, not re-built.** `SharedRecipePage` resolves the share for an anonymous visitor, shows the Demo projection (grams absent by construction), and carries the token through sign-in via `withContinuation`. No hard login wall exists. Not re-tested this session. |
| 23 | 🧪 | Photo in a private share | **Authority + assets done** (`358708dd`); the share page now always renders a picture. Rules 1–2 cannot fire until the payload carries a photo field — needs a DB column (D-14). |
| 24 | ⏸ | Community requires the user's OWN photo | **Rule implemented and tested** (`communityPhotoAccepted`); **deliberately not enforced yet.** The publish dialog today offers our own `/recipes/FL-*.webp` renders as the picture, which is exactly what §24 forbids — but enforcing the rule with no upload path would replace a wrong picture with a dead end. Needs a storage bucket (D-15). |
| 25 | ⏸ | `Opublikuj później` / `WAITING_FOR_PHOTO` | **Not started — needs a migration** on a Supabase shared with production (D-16 / Owner Decision 1). |
| 26 | ⬜ | HOME autosave + name at the end | **Not started — conflict.** The draft store already persists (`homeDraftStore.ts:105`), so autosave largely exists; the closing „Jak nazwiesz swoją recepturę?" screen lives in 2A's file. |
| 27 | ✅ | One central composer field | **Done.** `71f85278`. Served. |
| 28 | ✅ | Main CTA appears only after a base idea | **Done.** `71f85278`. Served. |
| 29 | ✅ | Interactive first-run tutorial | **Infrastructure done and served** (`af4d6162`): spotlight, dim, Dalej/Wstecz/Pomiń, counter, auto-scroll, „Uruchom samouczek ponownie". Steps A–D live today; E–H are authored and appear automatically as their sections render. §29G's ingredient-settings step has no anchor yet — see Owner Decision 4. |
| 30 | ✅ | AI ✨ = fruit only | **Done** on the real `product-identify-live` backend. Tooltip and copy promise fruit and nothing wider; a test asserts it. `71f85278`. |
| 31 | ✅ | Full-screen AI Vision | **Done** — viewfinder, reticle, thumb-zone controls, shutter-triggers-recognition, one honest refusal. `71f85278`. Camera hardware not exercised in this session. |
| 32 | ⏸ | ONE shared scanner | **Deferred (D-12).** Scanner routes landed on staging on 2026-09-08 (`#243`) and scanner artefacts sit in the main checkout; not touched. |
| 33 | ⏸ | Full-screen scanner UX | Deferred with §32. |
| 34 | ⏸ | Desktop scanner root-cause fix | Deferred with §32. Prior evidence exists in `reports/` and in the scan-core worktrees; no new audit run. |
| 35 | ⏸ | Processing HOT / COLD | Waiting on `GELLATTI_PROCESSING_RULES_v1.xlsx` (D-09). Nothing hardcoded. |
| 36 | ✅ | Rectangular labels only | **Done** — choice removed everywhere a customer can reach; round renderers kept so the archive still draws. `b8055814`. |
| 37 | 🧪 | Label main screen = preview + two actions | **Already held; audited and pinned.** Drukuj + Zmień ustawienia, preview-first. The „auto-fill everything we know" half is NOT verified — that is a data-completeness claim across markets (D-17). |
| 38 | ✅ | Expiry date never blocks the preview | **Verified and pinned.** The missing-data list is consulted in exactly ONE place — `requestPrint` — and `PrintMissingDataDialog` collects „Data trwałości" and prints from there without routing to settings. `b8055814`. |
| 39 | ⏸ | Label layout / market compliance engine | Waiting on a verified compliance dataset (D-10). No law guessed. |
| 40 | ✅ | „Historia etykiet" + LOT/name search | **Done.** `b8055814`. Not served-checked. |
| 41 | ✅ | Composer must not draw an inner black frame | **Done, root cause proven by counterfactual in the browser.** `71f85278`. |
| P-1…P-7 | ⏸ | Unreviewed client-test items (§P) | Untouched by design: tutorial „Mniej lodu" art, „Cukier robi dwie rzeczy", SHOP order, annual plans, Affinity grouping, sticky full header, AI language-intent layer. Awaiting owner review (D-13). |

### Totals

| | |
| --- | --- |
| Points tracked | **48** (41 numbered + 7 §P items) |
| ✅ DONE | **10** — 19, 21, 27, 28, 29, 30, 31, 36, 38, 40, 41 *(11 rows; §29 counted once)* |
| 🧪 IMPLEMENTED / WAITING OWNER QA | **3** — 22, 23, 37 |
| 🟨 IN PROGRESS (another session) | **8** — 3, 4, 5, 6, 7, 8, 9, 10 |
| ⏸ DEFERRED / WAITING | **19** — 1, 2, 11, 12, 13, 14, 15, 24, 25, 32, 33, 34, 35, 39, P-1…P-7 |
| ⛔ BLOCKED | **1** — 20 |
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

**1 — Migrations against a Supabase shared with production.** §23 (photo field), §24 (photo bucket) and §25 (`Opublikuj później`) all need schema. Memory records that staging and production share one Supabase.
· A: I write the additive migrations and someone applies them after review. · B: I write and apply them on staging myself. · C: they wait for a separate staging database.
**Recommendation: A.** Additive and forward-only is low risk, but "staging-only" is not true here, and applying schema to production data is not a call I should make unattended. **Impact:** §23 rules 1–2, §24 enforcement and all of §25 stay blocked until this is answered.

**2 — Community publishing is currently in the state §24 forbids.** The publish dialog defaults to and offers OUR library renders as the community photo. I did not remove it, because with no upload path that turns a wrong picture into a dead end.
· A: leave it until the upload exists (today's state). · B: block publishing now, honouring §24 immediately, and accept that nobody can publish until D-15 lands.
**Recommendation: A**, with D-15 prioritised. **Impact:** B stops Community publication outright.

**3 — §20 swap icon: I cannot find the icon described.** The only swap action in the app already draws two opposite arrows; there is no circular/refresh icon on any swap action anywhere.
· A: send the screenshot and the screen it is on. · B: I change nothing.
**Recommendation: A.** **Impact:** §20 stays ⛔ until then.

**4 — §29G ingredient-settings tutorial step has no anchor.** The step is authored and drops itself cleanly, but the panel it should spotlight carries no `data-testid`, and adding one means editing `HomeRecipeSection.tsx` — PACKAGE 2A's live file.
· A: I add the anchor after 2A lands. · B: 2A adds it as part of its own work.
**Recommendation: A.** **Impact:** the tutorial teaches the crown only when this lands.

**5 — §21 first-run start control.** „Rozpocznij partię" still names the FIRST production run (only the repeat CTA changed). §21 says „partia" should leave the customer's language generally, but gave replacement wording only for the repeat.
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
- **I broke an architectural boundary and the repo caught it, not me.** The one-camera rule was violated for five commits and only surfaced on the full suite. Anything I built tonight that has no such guard has not had that check.

## 9. GIT

```
branch  claude/gellatti-v22-safe
base    b3baf256  (origin/staging)
head    4b045865

4b045865  fix(home): the fruit camera must not be a second camera (§32)
af4d6162  feat(tutorial): a first-run tutorial that teaches at the real component (§29)
b8055814  feat(labels): rectangular only, history you can search, and the expiry asked at print (§36/§38/§40)
358708dd  feat(share): one image authority, four branded profile cards (§23/§24/SAFE-5)
4baffd53  feat(pro): save the recipe where you are standing, and ask to repeat in words (§19/§21)
71f85278  feat(home): one composer, four doors, and one focus indicator (§27/§28/§30/§41)

38 files changed, 2949 insertions(+), 130 deletions(-)
git status: clean
```

**Not pushed. No PR. Not merged. Not deployed. No migration written or applied.**
