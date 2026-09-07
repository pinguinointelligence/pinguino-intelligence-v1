# `+ Nowa receptura` can inherit a persisted Sorbet profile, and the product-type control will not leave it

**Status:** OPEN — evidence only, deliberately NOT fixed here (owner instruction,
2026-09-02 §10). Do not mix into the Crown-OFF patch.
**Severity:** P2 — it silently produces the wrong product type, and the UI offers
no way back.

## Observed

`staging.pinguinoai.com` → `dpl_ETuKeHNxYpQQqVMfyuerT2NymGNG`
(`meta.githubCommitSha 2389e242`), PRO `pro@pro.com`, 2026-09-02, viewport
1440×900, while setting up Crown-OFF served QA.

1. `+ Nowa receptura` → confirm → machine `Ninja CREAMi Deluxe` → confirm
   produced a **sorbet** recipe: `workbench-product-type` read `sorbet`, and the
   starter lines were WATER 107.5 / SUCROSE 60.1 / DEXTROSE 60.1 / INULIN 36.7 /
   TARA GUM 3 — no dairy. The intended Gelato was never offered.
2. Setting the control back to Gelato **did not take**, three ways:
   - native value setter + `change` event (the same technique that DOES move
     `workbench-machine` in the same panel, so the mechanism works);
   - the automation driver's `form_input`, which fires proper React events;
   - both followed by `Potwierdź ustawienia`.
   After each attempt `workbench-product-type` read `sorbet` again, and
   `settings-grid-status` stayed `✓ Ustawienia potwierdzone` — i.e. the change
   never even registered as a pending edit. All four options were present and
   `disabled: false`.
3. The recipe then behaved as a sorbet: a 400 g STRAWBERRIES anchor was answered
   with a sorbet correction that RAISED it to 402 g (score 8), with WATER and
   INULIN in the change list.

## The unblock

Removing the persisted keys and reloading restored Gelato immediately:

```
localStorage.removeItem('pinguino-profile-preferences-v1');
localStorage.removeItem('pinguino-recipe');
localStorage.removeItem('pinguino-constraints');
```

After the reload `workbench-product-type` read `gelato`, and a fresh
`+ Nowa receptura` produced the expected milk starter (MILK 3.5% 450.2 / CREAM
30% 87.1 / SMP 23.5 / SUCROSE 87.1 / DEXTROSE 20.1 / TARA GUM 2).

`pinguino-profile-preferences-v1` carries `defaultsByOwner` keyed
`<ownerId>:<productType>` plus a `visibleProductType`, which is the likely
carrier of the pin — not verified.

## Why it matters

A customer whose stored preference has drifted to Sorbet gets a sorbet starter
for every new recipe and cannot switch back from the workbench. It also
invalidates QA silently: my first Crown-OFF Case 1 run was measured against a
sorbet recipe and had to be discarded.

## Not investigated

Whether the revert is the profile router reacting to recipe content, a
controlled-select guard, or the persisted default being re-applied after the
change. That is the first thing to determine.
