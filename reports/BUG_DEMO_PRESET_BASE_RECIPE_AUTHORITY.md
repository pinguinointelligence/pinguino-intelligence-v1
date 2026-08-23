# BUG (pre-existing, open) — the demo preset cannot be edited: BASE_RECIPE authority refuses every gram change

**Recorded:** 2026-08-24, out of the "global UI unification + mobile Pro UX" workstream by owner decision.
**Status:** OPEN. **Owner ruling:** out of scope for the UI ticket — do NOT modify solver or business authority there.
**Severity:** blocks local/acceptance testing of any gram or percent interaction without a live authenticated account.

## Symptom

On the default DEV demo preset, every gram (and percent) edit is refused and the
editor shows:

```
Brak zatwierdzonego uprawnienia BASE_RECIPE dla: milk-base:milk_3_5.
```

The value does not change (670 g stays 670 g).

## Reproduction (100 %, no authentication required)

1. In any worktree on `origin/staging`, `npm run dev`.
2. Open `/pro/recipe` and set the DEV persona select
   (`[data-testid="pro-persona-switch"]`) to `pro`.
3. Press `+` on the grams stepper of the first row (`Milk 3.5 %`).

## Proof that it is NOT a UI regression

Reproduced on a clean, `git stash`-ed tree at `origin/staging` `aa56e8d`
**before** any change of the UI branch, and identically afterwards:

```
{"v":"670","notice":true}   // value unchanged, authority notice present
```

## Where the message comes from

`src/features/product-intelligence/productBehaviorAccess.ts`:

```
reason: `Brak zatwierdzonego uprawnienia ${module} dla: ${blockedLineIds.join(', ')}.`
```

reached through `recipeBehaviorModuleGate(authority, 'BASE_RECIPE')`. The demo
preset lines (`src/data/demoPresets.ts`, ids such as `milk-base:milk_3_5`) appear
to carry no approved `productBehaviorSnapshots` entry, so the module gate blocks
them. The open decision is whether the demo preset should ship approved
snapshots, or whether the BASE_RECIPE gate should not apply to preset-seeded
lines at all. That is a product-authority decision, not a UI one.

## Consequence for the UI workstream

The mobile ingredient sheet's gram / percent path could not be proven locally on
the demo preset. It was proven instead on served staging with a real
authenticated Pro recipe — see
`reports/GLOBAL_UI_UNIFICATION_MOBILE_PRO_2026-08-24.md`.
