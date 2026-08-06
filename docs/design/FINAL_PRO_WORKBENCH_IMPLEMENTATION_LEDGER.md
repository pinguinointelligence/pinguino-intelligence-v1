# Final Pro Workbench implementation ledger

## Starting state and safety

- Starting branch: `nightly/integration`.
- Starting commit: `5f00436f14b79ae53ef464c0b0ff4cfd3ae0f948`.
- Isolated branch: `codex/final-pro-workbench`.
- The repository was dirty before work began.
- Initial tracked diff: `docs/design/PRE_DESIGN_WORKTREE_STATE.patch` (191407 bytes).
- No destructive reset, checkout, stash drop or branch deletion was used.
- Existing overlapping UI/save work was deliberately preserved.

## Requested scope

Final monochrome one-screen Pro workbench; 62/38 recipe/cockpit split; four contextual views; complete Monitor parity; recipe/production table transformation; canonical pink readiness; locked canonical logo; preserved routes/functions; tests, visual QA and staging deployment.

## Completed implementation

- Consolidated the header into logo, change state, Recalculate, live score, plan and one hamburger.
- Kept all global destinations in the hamburger, including Work with us, Create Ingredient, API, product import and advanced tools.
- Built compact recipe and production table modes with price/kg, working gram lock and disabled/pink percentage lock.
- Built Profile, educational score cockpit, full Monitor, Production and Summary views.
- Moved owner-review tools to the reachable `/pro/tools` route.
- Added canonical `ReadinessBadge`/`ReadinessFrame` and semantic pink token.
- Added mobile cockpit trigger and bottom sheet.
- Reused the exact canonical logo file everywhere.
- Did not modify `src/engine/**` or mapper datasets.

## Claude reviews

Claude Design review (read-only) identified duplicate top/bottom controls, four top bands, three lock/status systems, route/context duplication, dark historical surfaces and unusable mobile table behavior. The implementation consolidated those systems, kept one global menu, used local cockpit tabs, converted mobile to cards/sheet and preserved one scroll per pane.

Claude Visual QA final verdicts:

| Proof | Verdict |
|---|---|
| 1366×768 Profile | APPROVE |
| 1366×768 unavailable/replacement | APPROVE |
| 1366×768 educational cockpit | APPROVE |
| 1366×768 Monitor | APPROVE |
| 1366×768 Production | APPROVE |
| 1366×768 Summary | APPROVE |
| 1366×768 hamburger | APPROVE |
| 1366×768 Recalculate overlay | APPROVE |
| 1440×900 Profile | APPROVE |
| 1920×1080 Profile screenshot | REJECT — in-app capture clips the logical viewport under Windows display scaling; DOM geometry proves the real 62/38 layout is complete |
| 390×844 ingredient workflow | APPROVE after the mobile workbar was repaired into two deliberate rows |
| 390×844 Monitor bottom sheet | APPROVE |

Claude's first mobile pass exposed a real header collision. `AppShell` now gives the locked Pro workspace a two-row mobile workbar (brand first, compact action row second), with no horizontal overflow. Claude's 1920 rejection remains recorded rather than hidden: the browser reports `innerWidth=1920`, editor `1190.4 px`, cockpit `729.6 px`, document `1920 px`, and all visible controls ending at or before `x=1920`, but its exported bitmap clips part of that logical viewport because of the host display scale.

## Local screenshot proof

- `docs/design/screenshots/final-pro-local-profile.jpg`
- `docs/design/screenshots/final-pro-local-unavailable.jpg`
- `docs/design/screenshots/final-pro-local-education.jpg`
- `docs/design/screenshots/final-pro-local-monitor.jpg`
- `docs/design/screenshots/final-pro-local-production-full.jpg`
- `docs/design/screenshots/final-pro-local-summary.jpg`
- `docs/design/screenshots/final-pro-local-hamburger.jpg`
- `docs/design/screenshots/final-pro-local-recalculate.jpg`
- `docs/design/screenshots/final-pro-1366x768-profile.png`
- `docs/design/screenshots/final-pro-1366x768-unavailable.png`
- `docs/design/screenshots/final-pro-1366x768-education.png`
- `docs/design/screenshots/final-pro-1366x768-monitor.png`
- `docs/design/screenshots/final-pro-1366x768-production.png`
- `docs/design/screenshots/final-pro-1366x768-summary.png`
- `docs/design/screenshots/final-pro-1366x768-hamburger.png`
- `docs/design/screenshots/final-pro-1366x768-preview.png`
- `docs/design/screenshots/final-pro-1440x900-profile.png`
- `docs/design/screenshots/final-pro-1920x1080-profile.png`
- `docs/design/screenshots/final-pro-390x844-ingredients.png`
- `docs/design/screenshots/final-pro-390x844-monitor-sheet.png`
- `docs/design/screenshots/final-pro-staging-1366x768-auth-gate.png`

Measured compact desktop proof: viewport 1280×720; document height 720; `window.scrollY=0`; header 0–76; fixed recipe bar 649–720. Educational cockpit uses the allowed internal scroll (866 over client height 572) while the document remains fixed.

Responsive measurements: 1366×768 → document 768, 1440×900 → document 900, 1920×1080 → document 1080; all three have `window.scrollY=0` and horizontal overflow 0. At 390×844, the long ingredient card list scrolls vertically by design and horizontal overflow is 0; the same Monitor opens in a bounded bottom sheet. The bitmap backend exports the mobile image at 375×811 and clips the 1920 logical viewport under Windows display scaling; the requested logical viewport values and DOM geometry were measured directly.

## Tests added or changed

- Added `finalProWorkbenchDesign.test.tsx`.
- Updated one-screen, navigation, Monitor parity, temperature presentation, lock accessibility and workbar tests.
- Restored Polish gram-lock aria names and locked-state screen-reader text after the full suite exposed the regression.
- Logo hash remains pinned by `logoAssetLock.test.ts`.

## Commands and current results

- `npm run typecheck` — PASS (exit 0).
- `npm run lint` — PASS with zero errors and two existing Fast Refresh warnings (`router.tsx`, `RecipeVersionsSection.tsx`).
- Focused Pro suite — PASS, 51/51.
- Updated regression group — PASS, 139/139.
- `npm test -- --run src/pages/pro/finalProWorkbenchDesign.test.tsx` — PASS, 15/15.
- Final full `npm test -- --run` — PASS, 392 files and 5355/5355 tests. Vitest still prints the pre-existing non-fatal `failed to load ./ita.special-words` diagnostic while returning exit 0.
- Final `npm run build` after mobile QA repair — PASS; output `dist/assets/index-CJUx-q8_.js` and `dist/assets/index-Dgqh7y5c.css`. Vite reports only the existing large-chunk advisory.

## Deployment record

- Existing Vercel project linkage: GitHub `origin/staging` → separate Vercel project `pinguino-staging` (`prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`) → `https://staging.pinguinoai.com`.
- No local `.vercel/project.json` exists and none will be created; the established branch integration is reused.
- First implementation commit: `a1e9f54` (`feat(pro): finalize one-screen workbench design`).
- Staging URL: `https://staging.pinguinoai.com`.
- First served implementation bundle: `assets/index-D-UqAVlE.js` + `assets/index-PYj8hKlH.css`; verified to contain the new Profile, Production copy and `--color-nonproduction-pink`.
- Served canonical logo SHA-256: `6A0738ACAFDFBCAF970F51384A14A8DD670BD68E0D7A6254017F4F2DDA3BAC58`, exact match.
- The staging `/pro/recipe` route correctly returns the Pro access gate for an anonymous session. Authenticated owner screenshots cannot be produced without the owner's login; the browser did not bypass that gate.
- Final mobile-QA repair commit and resulting served bundle: pending this ledger commit and redeployment.

## Remaining incomplete items

Product/readiness items are listed in `FINAL_PRO_WORKBENCH_PINK_INVENTORY.md`. Authenticated screenshots of the served Pro workspace remain an owner action. The exact 1920 bitmap is also not accepted by Claude because of the in-app browser capture defect; direct DOM geometry is recorded above. No product logic was invented to close either external proof gap.

## Git status

Implementation commit `a1e9f54` was pushed to `origin/staging` and deployed successfully. The mobile-QA repair and responsive proofs are pending their final documentation commit and staging push.
