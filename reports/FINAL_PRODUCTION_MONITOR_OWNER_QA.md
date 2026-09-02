# Production + Monitor Owner QA

Date: 2026-08-19

Branch: `codex/production-monitor-recovery`

Verified base before final trigger repair: `01139cb70182625f8cb03edf611192763460730b`

## Outcome

All local gates, independent reviews, Supabase staging migration verification and authenticated served Rescue QA are green. The Production trust chain uses the canonical generated Engine bundle in the staging Edge runtime; the browser never submits candidate recipe data and consumes only a one-time, revision-bound server proof.

## Gate ledger

| Exact command | Result |
|---|---|
| `npm ci` | PASS; 273 packages, 0 vulnerabilities; recorded deprecation/allow-scripts notices |
| `npm test -- --run` | PASS; 523/523 files, 6604/6604 tests; 152.46 s after final test change |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; exactly two pre-existing Fast Refresh warnings |
| `npm run build` | PASS; 1131 modules; chunk-size warning retained |
| `npm run recipes:validate` | PASS; 2500/2500 |
| `npm run process:validate` | PASS; 2088 rows, zero alignment differences |
| `npm run products:audit` | PASS; 2088 Mapper rows |
| `npm audit --audit-level=high` | PASS; zero vulnerabilities |
| `npm run production-rescue:bundle-check` | PASS; SHA `63dad7b13330113b471e502bb72e687c5f2bcda08b9b03a75210eda53e62e7c5` |
| `git diff --check` | PASS |
| `supabase db push --dry-run --linked` | PASS; exactly migration `20260819031000` before apply; up to date after apply |

Non-failing warnings retained: `failed to load ./ita.special-words`; Fast Refresh at `src/app/router.tsx:52` and `src/features/pro-core/RecipeVersionsSection.tsx:24`; Vite chunk >500 kB; `whatwg-encoding` deprecation and two allow-scripts notices from `npm ci`.

## Accepted behavior

- Main/Multi-Main, independent gram/percent locks, positive-presence ProductBehavior, ECO/OPTIMAL, Preview/Apply/Undo and exact whole-gram behavior remain covered by the full suite.
- Kiwi 8000 g no longer strands the UI: the canonical 1000 g fixture proves 706 g maximum, rejects 707 g and needs one proof attempt. A 15 s authority deadline closes never-settling server calls.
- Fructose is a manual, conditional suggestion only; PI does not add it automatically.
- Monitor Current/Preview share Engine-authoritative domains. `lactose_sandiness_risk` is one-sided: below is safe, in-band accepted and only above becomes red.
- Production start is explicit; stale sources fail closed; actual and Rescue writes use caller-basis CAS and hydrate from returned server authority.
- Trusted Rescue preserves confirmed physical mass, cumulative Rescue, exact version/ProductBehavior/Engine identity, TTL, idempotency and one-time consume audit.
- Served QA verified 200 authorize, 200 consume, Rescue revision 1, one `rescue_applied` event, reload/reopen recovery and archival cleanup.

## Integrity

- Mapper migration SHA-256: `3c59e5a23a30b9d209e584d5cc8f2085c40a1888808d3182b2f3092ecb7ba4df`.
- Product-audit Mapper SHA-256: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`.
- No Engine formula, Mapper Basement, secret, billing or environment file changed.
- Owner file `reports/MAC_MAIN_STATE_STAGING_RELEASE.md` remains untracked, unchanged and excluded.
- Supabase public production `riwipywgqobrulyzrzad` and Vercel public production were never targeted.
