# GELLATTI HOME — ROUTE / STATE INVENTORY (§117)

Branch `claude/home-creator-v1` · base `origin/staging` @ `4611d9e7`.
`NEW` = introduced by this work. `CHANGED` = existing route whose behaviour moved.
`EXISTING` = untouched, listed because HOME reaches it.

## 1. Public / creator routes

| Route | Status | Element | States |
| --- | --- | --- | --- |
| `/` | **CHANGED** | `RoleAwareEntryRoute entry="root"` → `HomeCreatorPage` | anon → creator · free → creator · HOME → creator · PRO → `/pro/recipe` unless the §12 setting says HOME · Admin → `/admin/overview` · authed-but-access-unresolved → renders nothing (no flash) |
| `/start` | EXISTING | `CustomerShellV1` | unchanged — the earlier customer shell, kept so old links keep meaning |
| `/home` | **CHANGED** | `RoleAwareEntryRoute entry="home"` → `HomeCreatorPage` | same as `/` |
| `/#intent` | **NEW** | HOME stage anchor | empty · chips present · voice listening · voice unavailable · resolving |
| `/#profile` | **NEW** | HOME stage anchor | shown ONLY when the profile is unknown (§31); 4 choices, always-visible hints (no hover dependency) |
| `/#machine` | **NEW** | HOME stage anchor | needs-choice (9 Home machines + Other) · known-machine summary + Change · container stepper · manual amount · capacity guidance |
| `/#recipe` | **NEW** | HOME stage anchor | masked grams (demo/free) · exact grams (paid) · score present/no-data · sweetness less/balanced/sweeter · row menu open |
| `/#preparation` | **NEW** (anchor only) | HOME stage anchor | reached after `Let's make it`; the preparation surface itself is NOT built yet |

## 2. PRO routes

| Route | Status | Element | States |
| --- | --- | --- | --- |
| `/pro` | **CHANGED** | `HomeSubscriberProRedirect` → `ProWorkspacePage` | HOME subscriber → `/#recipe` · PRO → workspace · demo → workspace (view-only, §73) |
| `/pro/:section` | **CHANGED** | `HomeSubscriberProRedirect` → `ProWorkspacePage` | `production` → `/#preparation`; `settings` → `/account`; `machine` → `/#machine`; everything else → `/#recipe` |
| `/studio`, `/calculator` | EXISTING | redirects into `/pro/recipe` | unchanged |

## 3. Community / creator routes

| Route | Status | Notes |
| --- | --- | --- |
| `/community`, `/top100` | EXISTING | Top 100 is the ONLY Community source HOME matching may read (§34) |
| `/@handle`, `/@handle/:slug` | EXISTING (behaviour **CHANGED**) | the public card's `based_on` now names the ORIGINAL creator, not the parent (§38) |
| `/creator`, `/partner` | EXISTING | publishing does not require Partner (§87) |
| `/share/:token`, `/received/:shareLinkId` | EXISTING | unlisted, `noindex` at the edge |
| liked-by modal | **NOT BUILT** | backed by `gellatti_publication_likers_v1`, which exists and is granted |

## 4. Account / billing / admin

| Route | Status | Notes |
| --- | --- | --- |
| `/account` | EXISTING | the §12 "Default experience after login" control is **NOT BUILT**; the column, service and resolver exist |
| `/subscription` | EXISTING | the §72 HOME-or-PRO plan choice is **NOT BUILT** |
| `/admin`, `/admin/:section` | EXISTING | §98 Community/DNA/likes/seed-marker inspection is **NOT BUILT** |
| `/machine` | EXISTING | account-default machine; HOME's per-recipe choice deliberately does not write here (§47) |

## 5. Client state

| Store | Key | Persisted | Holds |
| --- | --- | --- | --- |
| `useHomeViewStore` | `gellatti.home.view.v1` | view + lastProModule | which presentation is on screen; the PRO module to return to (§15). **Holds no recipe state and imports no recipe store** — that is what makes a view switch structurally unable to touch the recipe (§14) |
| `useHomeDraftStore` | `gellatti.home.draft.v1` | all | the single anonymous draft: chips, profile, presented stages, derivation source (§76–§80) |
| `useRecipeStore` | `pinguino-recipe` | existing | THE recipe. HOME and PRO both read and write this one store |
| `useProCoreAccessStore` | — | no | server-derived `EffectiveAccess`; the only entitlement authority (§11) |

## 6. Server state added

| Object | Kind | Purpose |
| --- | --- | --- |
| `account_profiles.default_experience` | column | §12 login default (`home`\|`pro`, default `pro`) |
| `publication_likes` | table | §90; PK (publication_id, user_id) makes duplicates impossible |
| `publication_favorites` | table | §90 |
| `gellatti_publication_is_published_v1` | fn | SECURITY DEFINER RLS predicate (caller-visibility trap) |
| `gellatti_publication_social_v1` | fn | §90/§93 counts + viewer state; granted to `anon` |
| `gellatti_publication_likers_v1` | fn | §91 liked-by; public profiles only, self-capped page size |
| `gellatti_publication_card_v1` | fn (replaced) | §38 `based_on` now resolves the lineage ROOT |

## 7. Error / empty / loading states present

- access unresolved → render nothing rather than flash the wrong product
- voice unavailable / permission denied → honest text, button disabled
- catalogue unavailable vs product not found → deliberately distinct outcomes
- score no-data → `—` and the honest no-data label, never a fabricated number
- masked grams → digit-free placeholder with a screen-reader label
- machine with no per-container authority → plain amount, never an invented container count
