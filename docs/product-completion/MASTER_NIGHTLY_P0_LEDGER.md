# MASTER NIGHTLY P0 LEDGER — 2026-07-24 (Integration Owner)

## Starting baseline (Wave 0 — full detail in NIGHTLY_P0_BASELINE.md)

- HEAD = origin/main = origin/staging = `4dfb097`; main FROZEN for this programme (never pushed tonight).
- Staging served `assets/index-DCJH1R2o.js` (content-verified 3316f2b marker). Production served an older backend-less bundle → BLOCKED_EXTERNAL.
- Apply-integrity repair (`e20de43`) present. LIVE FORMULATION TOOLBOX AND FALLBACK: **no repair existed** — both owner failures stood; assigned wholly to Agent A.

## Per-agent results (all isolated worktrees; own branches; zero pushes)

| Agent | Scope | Commit | Status | Headline |
|---|---|---|---|---|
| A — formulation core | Both live failures + A1–A9 + tests 1–20 | `9b9f929` | CODE_COMPLETE | FAILURE B root cause = within-session exclusion leak (no new-draft reset) — NOT missing candidates; FAILURE A = no fallback after local `no_proposal` + fallback-band violations acting hard. Fixes: draft-scoped exclusion lifecycle; canonical toolbox identity (8 staging-verified IDs incl. SMP PI-ING-000270, Inulin PI-ING-000456); Phase-6 template-seeded fallback (same IDs/locks/exclusions); Phase-8 hard-vs-soft by band provenance (`violationBands.ts`, zero band values touched); Phase-7(b) `best_safe_result` explanatory state; A9 QA panel with full role trace. 8×125 g gate untouched. +23 owner tests. |
| B — engine validation | B1–B3 fixtures, 5 audit answers | `902fb07` | CODE_COMPLETE | 15 drift-detector tests pin actual engine output (0.4.0/0.7.0). B1 violates fallback dairy fat band (the owner's live failure mechanism); B3 violates POD/NPAC/ice on native bands while public verdict shows 8/10. Ice = anchor interpolation (not FPD). Mapper dosage %-fields never consumed by the engine (wiring gap). Owner decision requests OD-1…OD-5. |
| C — search finalization | Invariants + presentation + coverage | `0b9f0f2` | CODE_COMPLETE | REAL invariant gap fixed: `.limit` → chunked `.range` windows (silent 1,000-row wall on loadMore). SMP (0→3) and „mleko w proszku" (0→34) alias gaps closed on staging evidence. 48/48 live categories labelled; chilled dairy all `Świeże`. Discoverability 2,070/2,070; 12 core query pairs proven fixture + live SELECT. |
| D — /start entitlement | Persona chain + matrix tests | `7557ea2` | CODE_COMPLETE | Hardcode itself removed earlier on main (`577e9c8`); D delivered the missing pure seam (`customerShellAccess.ts`), 20-test persona matrix (grams/paywall/save/machine × demo/home/pro), login/logout/cross-session leak tests, frozen demo redaction proof through the real runner, `data-persona` QA trace. Precondition: QA accounts need active `entitlements` rows, else demo by design. |
| E — persistence + costs | Transactional save, versions, cost states | `b0698d3` | CODE_COMPLETE | First save was NOT transactional → migration `0036_create_recipe_with_v1.sql` (SECURITY INVOKER, auth.uid-stamped, authenticated-only) **applied to staging tunab after ref confirmation** + post-apply audit; adapter prefers RPC, honest fallback. Version contract proven across 3 adapters. Cost/kg collapse root cause = PR-ING-* vs PI-ING-* identity mismatch in single-key lookup → alias-aware `resolveCostsForLines` + three-state `presentRecipeCost` (complete/partial/no_prices; nothing invented). |
| F — infra forensics (read-only) | Bundles, env, Stripe, products | `0950609` (docs) | CODE_COMPLETE | **Staging products were NEVER populated** (`n_tup_ins=0`; no wipe happened) — all "69 products on staging" reads came through the misconnected default connector (PI-INFRA-002); data survives in 4 local file copies + git blob; schema remains valid. Prod bundle embeds NO Supabase/Sentry/Stripe config → backend-less by construction. Staging bundle clean (anon JWT only). Stripe TEST proven (`livemode:false` checkout). One BLOCKED_EXTERNAL: owner one-line SELECT to confirm the misconnected project's identity. |
| G — Masterpiece design | Tokens, dark-pro theme, review mode | `3690cb0` | CODE_COMPLETE | 7 phases: full UI inventory (18 public + 23 dev routes), wireframes, owner review mode (`DO PRZEGLĄDU`, 15-item registry, pro+staging/dev gated, customers never see it — tested), additive tokens + `.theme-pro-dark` subtree scope (zero component forks), /pro chrome dark professional, canonical 404, 9-viewport DOM-measured responsive proof. Logo artwork untouched (hash-locked). Nothing deleted; nothing hidden by CSS. |

## Integration (order A→C→E→D→B→F-docs→G)

- Branch `nightly/integration` from `4dfb097`. **Zero file-ownership conflicts** across all six code branches (verified by name-only diff intersection before merging) and zero merge conflicts.
- Integration-owner fixes: 1 — Agent G's SVG logo lock pinned a CRLF-checkout byte hash; corrected to eol-normalized artwork hash (artwork itself untouched; JPEG stays byte-locked).
- The "14 pre-existing failures" reported by worktree agents on clean `4dfb097` are a fresh-worktree CRLF checkout artifact of migration text-scan tests; they do not reproduce on the integration tree (all migration tests green here).
- Full gates after P0 merge: 362 files / **4913 passed**, tsc 0, eslint 0 errors, build ✓ → deployed to staging (`be8e815`), bundle content-verified (Agent A best-safe sentence marker found).
- Full gates after G merge + logo-lock fix: 365 files / **4931 passed**, tsc 0, eslint 0 errors, build ✓ → final staging deploy (this commit's push), bundle content-verified.
- No Engine-version drift (0.4.0/0.7.0 pinned in tests), no band/Mapper value drift (science-freeze respected in every diff), no DB write outside tunab (only E's audited 0036).
- All 12 integration fixtures are covered inside the green suite: minimal Gelato, complete Fruit Gelato fallback, inulin-0, milk-500, Apply exact, Undo exact, target-0 blocked, 20-cycle stability, no duplicates, save/reopen contract, core Mapper queries, Demo/Home/Pro projection.

## Owner verification required (credentials/manual — agents cannot do these)

1. **Test 1 — minimal Gelato**: /pro, Gelato Classic −11°C 1000 g, Milk 3.5% 0 g + STRAWBERRIES 0 g, no locks → „Przelicz z PI" → PASS = complete differentiated Preview at 1000 g listing PI additions with reasons; Apply → Undo (restores 0 g draft) → save.
2. **Test 2 — complete Fruit Gelato** (350/380/80/40/110/35/5): → PASS = correction Preview, fallback Preview, or the „najlepszy zweryfikowany wynik" explanatory state — never the old one-line ice-share failure.
3. Sorbet bez inuliny (944.6 g, inulina 0 zablokowana) i Milk dokładnie 500 g — constrained results + Undo.
4. 10 powtórzonych cykli zmień→przelicz→Zastosuj (partia stale 1000 g).
5. Search: milk, ananas, truskawka, banan, bazylia, wanilia, SMP, mleko w proszku — grupy i etykiety.
6. Plany: demo (redakcja gramów), login home@home.com, logout, login pro@pro.com (dokładne gramy, brak paywalla, `data-persona` w DevTools). PRECONDITION: active entitlements rows for both QA accounts (SELECT in Agent D ledger).
7. Persystencja: zapis → refresh → nowa wersja → przywróć → logout/login.
8. Design review mode: ustaw `VITE_DESIGN_REVIEW=1` na staging (Vercel env) aby zobaczyć znaczniki `DO PRZEGLĄDU` jako pro; klienci nigdy ich nie widzą.

## External blockers (exact actions only)

- **Owner/Nicolas — production**: set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (+ VITE_SENTRY_DSN) on the prod Vercel project after deciding the prod Supabase model; prod stays BLOCKED_EXTERNAL.
- **Owner — connector**: re-scope/disconnect the default `mcp__supabase__` connector (PI-INFRA-002); one-line SELECT in Agent F ledger confirms its identity.
- **Owner — science**: OD-1…OD-5 (Agent B ledger) + native fruit_gelato bands/template decision (until then fruit gelato is honestly provisional by contract).
- **Owner/Nicolas — Stripe launch gates**: unchanged from NICOLAS_STRIPE_HANDOFF (secrets, webhook destinations, portal config).
- **Owner — prod migration set**: apply 0027–0029 + 0036 to the production DB when the launch gate opens.

## FINAL STATUSES

- `STAGING FORMULATION CORE — PASS` (automated; both owner fixtures produce useful results; AWAITING_OWNER on served staging)
- `STAGING APPLY/UNDO/PERSISTENCE — PASS` (automated; transactional RPC applied + audited on tunab)
- `STAGING LIVE MAPPER SEARCH — PASS` (automated + live SELECT verification; 2,070/2,070 discoverable)
- `STAGING /START ENTITLEMENTS — PASS` (automated matrix; QA-account entitlement rows are the live precondition)
- `STAGING P0 INTEGRATION — PASS` (4931/4931, zero conflicts, science freeze intact)
- `OWNER AUTHENTICATED ACCEPTANCE — AWAITING_OWNER`
- `PRODUCTION — BLOCKED_EXTERNAL`
- `PINGÜINO MASTERPIECE DESIGN — merged post-P0, gates green; full redesign continues per its own ledger's post-merge dependency list; AWAITING OWNER REVIEW (review mode requires VITE_DESIGN_REVIEW=1)`
