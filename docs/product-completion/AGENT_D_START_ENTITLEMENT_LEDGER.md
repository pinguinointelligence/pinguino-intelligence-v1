# AGENT D — `/start` ENTITLEMENT P0 LEDGER (2026-07-24)

Scope owned: customer `/start` persona/capability resolution (CustomerShellV1 + its
access-resolution seam), customer-shell capability tests, plan-aware customer-flow
presentation logic. Nothing outside that scope was edited.

---

## 1. Proof of the hardcode (the audit-proven BROKEN surface)

The defect was introduced with the customer shell itself and is provable from git:

| | |
|---|---|
| Introduced | `54d58b1` (2026-07-13, "feat(customer-shell): customer-v1 preview…") |
| File:line (before) | `54d58b1:src/features/customer-shell/CustomerShellV1.tsx:211` |
| The line | `const [persona, setPersona] = useState<CustomerPersona>('demo');` |
| Consumers of the dead state | line 285/514 `<DevPersonaSelect persona={persona} onChange={setPersona} />`, line 337 `const capability = gramVisibilityForPersona(persona);` |

`persona` was **component-local state initialised to `'demo'`** and mutated only by the
DEV-only persona `<select>`. No session, no entitlement, no store — so in production a
signed-in paying Home/Pro user was **permanently `demo`** at `/start`: grams always
redacted, the Demo paywall always shown. (Pickaxe proof:
`git log -S "useState<CustomerPersona>('demo')"` → added `54d58b1`, removed `577e9c8`.)

The hardcode itself was removed on main by `577e9c8` (2026-07-19, "feat(access): wire the
real Home/Pro entitlement chain into persona"), which is in this worktree's base
(`4dfb097`). **What was still missing — and what this ledger's commit delivers — is the
`/start`-side of that fix being (a) concentrated in one pure, testable seam instead of
inline ternaries, and (b) covered by the required persona/entitlement test matrix, which
did not exist for `/start` at all** (the only shell tests were static smoke tests of the
anonymous home screen).

## 2. The resolution chain (after)

```
auth session (src/stores/authStore.ts)                      user id, never email-authz
  → AppProviders effect (src/app/providers.tsx:61-69)       every auth change, sign-out → null
    → syncEffectiveAccess (src/services/accountAccess/liveEffectiveAccess.ts)
        RLS-scoped public.entitlements rows (migration 0015; SELECT own rows only)
        → billing entitlement resolver → resolveAccountAccess → EffectiveAccess
        (any failure → null → honest demo, never a guessed paid scope)
      → proCoreAccessStore.setEffectiveAccess (src/features/pro-core/proCoreAccessStore.ts)
        → useProCorePersona (src/features/pro-core/useProCorePersona.ts)
            resolveProCorePersona: DEV override only when import.meta.env.DEV;
            canPro → 'pro', canHome → 'home', else 'demo'
          → CustomerShellV1 (src/features/customer-shell/CustomerShellV1.tsx:236)
            → customerShellAccessFor(persona)                ← NEW pure seam
              (src/features/customer-shell/customerShellAccess.ts)
              → gram visibility  → buildCustomerRecipeView (redact-at-source)
              → Demo paywall     → demoPaywallVisible (result phase ∧ ¬gramsVisible)
              → machine flow     → resolveCustomerMachineGate ('pro' → 'off')
              → save capability  → recipeCapabilitiesFor (HOME_MAX_SAVED_RECIPES = 1)
              → technical details→ showTechnicalDetails ('pro' only)
```

New in this commit (all inside owned scope):

- `src/features/customer-shell/customerShellAccess.ts` — the pure seam. It only
  **projects** the canonical sources (`gramVisibilityForPersona`,
  `recipeCapabilitiesFor`, `showTechnicalDetails`, the owner machine-flow rule); it
  invents no rule of its own, and it replaced the equivalent inline expressions in
  CustomerShellV1 one-for-one (machine gate ternary, `showStickyUpgrade`, capability,
  `showTechnical`).
- `data-persona="<demo|home|pro>"` on the shell root — a machine-checkable trace of the
  entitlement-derived persona for tests and for owner QA (visible in DevTools; exposes
  no number and no PII).

## 3. Persona projection matrix (as now pinned by tests)

| Surface at `/start` | demo (anon / unentitled) | home (Home entitlement) | pro (Pro entitlement) |
|---|---|---|---|
| Exact grams in the result payload | **NO — no `grams` key at all** (redact-at-source) | YES | YES |
| Demo paywall (sticky upgrade) | YES, on result phase only | NO | NO |
| Save capability (canonical) | none (`canSaveRecipe: false`, max 0) | `HOME_MAX_SAVED_RECIPES = 1` | unlimited (`null`) |
| Machine flow | machine-first (onboarding/saved gate) | machine-first | temperature-first (gate `'off'`, −11/−12/−13 only) |
| „Dane techniczne” | NO | NO | YES |
| Monitor correction grams (`recalculateWithPi`) | **never** (`proposedAdjustments` absent, snapshot null) | exact grams | exact grams |

The Demo column is the FROZEN product rule — proven unchanged: demo lines carry no gram
key, the demo home screen matches today's markup byte-for-byte modulo the persona trace,
and the engine-side `redact: true` twin remains pinned by the pre-existing
`src/engine/goldenRecipes.test.ts` (all archetypes: redacted corrections carry no
numbers, no ingredient names).

## 4. Tests added (all green)

`src/features/customer-shell/customerShellAccess.test.ts` — 8 tests
- persona projection matrix demo/home/pro (grams visibility, paywall, save availability
  incl. the canonical limits, machine flow, technical details);
- machine gate: `'off'` for pro regardless of saved machine; loading/onboarding/saved +
  „Zmień maszynę” transitions for demo/home;
- paywall: only result phase ∧ only when grams withheld;
- FROZEN redaction (recipe view): demo has **no grams key** and no digit in the payload;
  home/pro get the exact grams from the same recipe;
- FROZEN redaction (correction grams): a solver run that PRODUCED
  `proposedAdjustments`/`correctedRecipeSnapshot` — demo receives neither (nor the `41.2`
  / ingredient string anywhere in the view); home/pro receive both; plus the same
  assertion through the **real** runner (`realPiRecalculationRunner`) on a **real**
  `/start`-produced `recipeInput`.

`src/features/customer-shell/startEntitlementChain.test.tsx` — 8 tests (REAL store,
production semantics `isDev: false`)
- anonymous → demo (and the rendered shell traces `data-persona="demo"`);
- login transition demo → home: `setEffectiveAccess(HOME_ACCESS)` (exactly what
  AppProviders does) flips the persona, and the store change notifies subscribers — the
  same `useSyncExternalStore` mechanism React re-renders through, i.e. no reload
  artifact;
- logout: persona back to demo with **every** capability flag off (looped over the whole
  capability object — nothing paid survives);
- pro login after home logout: demo in between (no stale home persona), then exactly the
  pro capabilities (`maxSavedRecipes` null, never home's 1) — no cross-session leak;
- per-account device machine keys (`userScopedMachineKey`) are distinct for anonymous /
  home-user / pro-user — one account never reads another's machine;
- frozen demo home screen: no digit bound to a grams unit.

`src/features/customer-shell/startPersonaProjection.test.tsx` — 4 tests (the persona →
rendered shell joint, hook mocked per the repo's ProWorkspacePage.test.tsx pattern,
because zustand v5 serves `getInitialState()` to static-markup renders)
- `data-persona` traces demo/home/pro; home/pro are never rendered as demo (the exact
  audit defect);
- no gram digit and no upgrade paywall on the opening screen for ANY persona;
- the demo opening screen is byte-identical across personas modulo the persona trace +
  DEV selector state — persona plumbing alone cannot alter the redacted Demo surface.

## 5. Gates (this worktree, base `4dfb097`)

| Gate | Result |
|---|---|
| `npm run build` | PASS (tsc -b + vite build) |
| `npx tsc -b` | PASS (exit 0) |
| `npx eslint .` | PASS — 0 errors (2 pre-existing warnings in files I do not own) |
| `npx vitest run` (full) | 4,778 passed, 14 failed — the 14 failures are **pre-existing on the clean frozen base** (verified by `git stash -u` → same 5 files / 14 tests fail without my change): `src/features/ingredients/*.migration.test.ts` content assertions. Zero failures in owned areas; `studioBoundary.test.ts` green. |
| `npx vitest run src/features/customer-shell` | PASS — 13 files, 87 tests |

## 6. What still needs OWNER-authenticated staging verification

I cannot log in anywhere (credential entry forbidden) and per the baseline the
production bundle is older (`BLOCKED_EXTERNAL`). Owner QA on
`https://staging.pinguinoai.com` with the QA accounts (home@home.com / pro@pro.com —
owner enters the credentials, never the agent):

1. **Demo (fresh incognito, not signed in)** → open `/start`. Expect: machine
   onboarding first; after building a recipe the ingredient list shows the locked
   stand-in (no gram numbers), the sticky paywall with Home/Pro prices, no „Dane
   techniczne”. DevTools: the page root div has `data-persona="demo"`.
2. **Home** → sign in as home@home.com, open `/start`. DevTools: `data-persona="home"`.
   Type „lody waniliowe” → Dalej → complete machine/batch. Expect: EXACT grams on the
   base lines, NO sticky paywall, no „Dane techniczne”, and after „Przelicz” in the
   Monitor the proposed adjustments show gram numbers.
3. **Logout** → return to `/start`. DevTools: `data-persona="demo"`; grams locked again;
   paywall back.
4. **Pro** → sign in as pro@pro.com, open `/start`. DevTools: `data-persona="pro"`.
   Expect: serving TEMPERATURE cards (−11/−12/−13), never machine onboarding; „Dane
   techniczne” visible; exact grams; no paywall.
5. **Cross-session** (in the same browser, after steps 2–4 in order): confirm the pro
   session does not show the home account's machine context bar or default batch.
6. **Data precondition** (staging SQL editor, read-only): confirm the QA accounts hold
   ACTIVE entitlement rows —
   `select user_id, scope, status from public.entitlements where status = 'active';`
   — expect a `home`-scope row for home@home.com's user id and a `pro`-scope row for
   pro@pro.com's. **If these rows are missing, both accounts will honestly resolve to
   demo — that is the fail-safe working, and seeding the rows is the fix** (Billing
   ownership, not `/start`).

Residual notes (out of my scope, flagged only): production serves an older bundle
(baseline `BLOCKED_EXTERNAL`); the account-machine SERVER store (migration 0030) remains
launch-gated, so machines are device-local per account key.
