# Production + Monitor Owner QA

Date: 2026-08-19

Branch: `codex/production-monitor-recovery`

Base HEAD: `91e83ae6c1763fda1253ce884b7309afa0148099`

## Verdict

**READY FOR STAGING INTEGRATION** — local implementation and independent reviews have no open P0/P1/P2. Trusted Rescue authority now runs the exact shared Engine in the staging Edge runtime; the browser sends only the stable option and revision/idempotency basis, and direct candidate submission is revoked.

At this checkpoint no migration, commit, push, Vercel deployment, Supabase function deployment or production write had occurred. Staging execution evidence is recorded separately after deployment.

## Completed locally

- Production no longer renders a blank/dual prerequisite state. The recipe remains visible, one readable action is shown, internal IDs are hidden and start is explicit.
- The exact immutable RecipeVersion UUID is retained. Reload/lost-response recovery hydrates the server run; missing or stale durable state fails closed.
- Atomic run start/completion, active-Pro enforcement, owner/version authority, recipe history `RESTRICT`, full actual vectors, append-only events, cumulative Rescue snapshots and actual/Rescue CAS are implemented in the forward migration.
- CAS uses the caller session's actual and Rescue revisions, rejects null/stale bases, and prevents cross-device lost updates.
- Kiwi Main requested at 8000 g reaches the certified 706 g maximum for a 1000 g batch in one proof attempt; 707 g is rejected. A 15 s ProductBehavior deadline prevents permanent `WORKING` state and ignores late responses.
- Fructose (`PI-ING-000496`) is only suggested as a manual ingredient search when the closest safe sweetness Preview remains below target. It is never auto-added and is hidden when unnecessary or already present.
- Monitor uses Engine bands and one shared Current/Preview ruler. `lactose_sandiness_risk` is direction-aware: below is safe/no red, accepted is green, above is risky/red. Unknown values fail closed and endpoints remain hidden.
- Apply → Undo restores the exact Preview score/presentation only when its fingerprints still match.
- Header/logo/tabs/responsive/accessibility checks pass at 1920, 1600, 1440, 1366, 1280, 1024 and 390 CSS px.
- The canonical generated Edge bundle is deterministic, uses an exact 43-file allowlist and contains no external/dynamic imports. Bundle SHA-256: `1072f345fc5dbe24de6a2ef1e340db831192bf049b4e8a890a3a559488b8e1e7`.
- Browser Rescue Preview contains no recipe candidate. It is server-authorized, expiry/revision bound, focus-announced and consumed through a one-time proof.
- Operator edits are blocked during authorize/consume. Late responses cannot resurrect stale Preview; latest compatible pending drafts survive server hydration.
- Authorized pending-plan reductions update the visible target, operator control and delta consistently (for example 400 → 350 g shows Plan 350 g and difference 0).

## Gate ledger

| Exact command                                                                                                                    | Result                                                                                |  Duration |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------: |
| `npm ci`                                                                                                                         | PASS; 273 packages, 0 vulnerabilities; deprecation + 2 allow-scripts notices recorded |    4.04 s |
| `npm test`                                                                                                                       | PASS; 521/521 files, 6591/6591 tests                                                  |  146.35 s |
| `npm run typecheck`                                                                                                              | PASS                                                                                  |   10.78 s |
| `npm run lint`                                                                                                                   | PASS; 0 errors, exactly 2 Fast Refresh warnings                                       |   17.62 s |
| `npm run build`                                                                                                                  | PASS; 1137 modules                                                                    |   12.05 s |
| `npm run recipes:validate`                                                                                                       | PASS; 2500/2500                                                                       |    0.34 s |
| `npm run process:validate`                                                                                                       | PASS; 2088 rows, 0 alignment differences                                              |    0.29 s |
| `npm run products:audit`                                                                                                         | PASS; 2088 Mapper rows                                                                |    0.25 s |
| `npm audit --audit-level=high`                                                                                                   | PASS; 0 vulnerabilities                                                               |    0.70 s |
| `npm run production-rescue:bundle-check`                                                                                         | PASS; SHA `1072f345…b8e1e7`, 43 source files                                          |    0.26 s |
| `npx --yes deno check --frozen --lock=deno.lock --node-modules-dir=auto supabase/functions/production-rescue-authorize/index.ts` | PASS                                                                                  |    0.86 s |
| `git diff --check`                                                                                                               | PASS                                                                                  |    0.04 s |
| `npx supabase db push --dry-run --linked`                                                                                        | PASS; exactly two forward migrations; no seeds/roles                                  | preflight |

Final focused scopes include Edge bundle/authorization, both Production migrations, Production recovery/runtime races, Kiwi, PI timeout, Fructose, Apply→Undo and Monitor parity. Independent reviewers reported 74/74, 97/97 and 306/306 tests in their respective scopes with P0=0/P1=0/P2=0.

Warnings retained and disclosed:

- Fast Refresh: `src/app/router.tsx:52`.
- Fast Refresh: `src/features/pro-core/RecipeVersionsSection.tsx:24`.
- Vite chunk larger than 500 kB.
- non-fatal Vitest line: `failed to load ./ita.special-words`.
- `npm ci`: deprecated `whatwg-encoding@3.1.1`; `fsevents` and `tesseract.js` install scripts are not covered by `allowScripts`.

## Staging identity and write ledger

| Item                       | Exact identity/result                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Supabase staging           | `pinguino-staging`, ref `tunabqqrwabacxjcxxkz`, linked; dry-run green, apply pending            |
| Supabase public production | `pinguino-intelligence-v1`, ref `riwipywgqobrulyzrzad`, untouched                               |
| Vercel staging             | `pinguino-staging`, project `prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`, domain `staging.pinguinoai.com` |
| Vercel public production   | `pinguino-intelligence`, `www.pinguinoai.com`, untouched                                        |
| Migration applied          | Pending staging integration                                                                     |
| Database/production write  | No                                                                                              |
| Commit/push/deploy         | Pending staging integration                                                                     |

## Integrity

- Official logo SHA-256: `b1c85e5a47fb25ab296668e17a04f33df56d6701aba4525d2fd9ee6fd72b7721`.
- Mapper migration working/HEAD SHA-256: `3c59e5a23a30b9d209e584d5cc8f2085c40a1888808d3182b2f3092ecb7ba4df`.
- Product audit Mapper SHA-256: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`.
- No Engine formula, Mapper Basement, secret, billing or environment file changed.
- Owner file `reports/MAC_MAIN_STATE_STAGING_RELEASE.md` remains untracked and excluded.
