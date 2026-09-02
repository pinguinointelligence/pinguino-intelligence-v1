# Master Label — superseded architecture snapshot

This 2026-08-09 snapshot is retained for history. Current canonical requirements are in [GELLATTI_GLOBAL_LABEL_COMPLIANCE_AUDIT_2026-08-25.md](./GELLATTI_GLOBAL_LABEL_COMPLIANCE_AUDIT_2026-08-25.md) and [FINAL_LABEL_SYSTEM_ACCEPTANCE.md](./FINAL_LABEL_SYSTEM_ACCEPTANCE.md). Statements below about `PARTIAL`, missing PDF, and one generic renderer are no longer current.

Checked: 2026-08-09

## One model, many renderers

PINGÜINO uses one `MasterLabelData` model:

`completed actual batch → MasterLabelData → market profile → rendered label`

There is not a separate recipe or nutrition calculation engine for EU, USA, Canada, UK or Australia/New Zealand. Market profiles choose required fields and presentation. The source nutrition remains the final Engine result.

## Required source

Only `ProductionCompletionSnapshot.finalActualInput/finalResult` may initialize a production label. Planned recipe values, a prior recipe version and the old fixed `/label` sample are not valid production sources.

The model records:

- source session/completion time;
- market profile code/version;
- UI language separately from label languages;
- multilingual product/legal names;
- canonical ingredient IDs, actual grams and actual share;
- ingredient-level allergen evidence status/revision;
- Engine nutrition source and formatted declaration;
- package net quantity (never copied from batch mass);
- production date and review state;
- date-mark type/date/basis/review state;
- multilingual storage/use/origin/customer note;
- operator/facility snapshot;
- LOT;
- rectangle/round format, millimetre size, copies and system printer adapter;
- preflight acknowledgement.

Internal production notes are not part of `MasterLabelData` and are never printed automatically.

## Allergen fail-closed rule

Allergen data is rehydrated by canonical ingredient ID outside Engine. Every actual line needs evidence status `verified`. Missing, unknown or unreviewed data makes label allergen state `incomplete` and blocks print readiness. Empty source text is not interpreted as “allergen-free”.

Current repository mapping drops allergen metadata before `EngineIngredient`, so the live editor truthfully shows `WYMAGA WERYFIKACJI` until the rehydration repository is implemented.

## Date safety

Production date is prefilled from run completion but marked unreviewed. Best-before/use-by begins as:

```text
kind: unresolved
date: null
basis: none
reviewedByUser: false
```

PINGÜINO never computes `production date + N days` without a validated stored product/process rule. A manually entered date records `basis: manual` and still requires review.

## Preflight

Preflight combines:

- market-required fields;
- data availability;
- canonical identity;
- allergen completeness and user review;
- operator/address;
- package net quantity;
- date/storage/LOT;
- explicit user acknowledgement.

Required field removal returns: `To pole jest wymagane dla wybranego rynku.` Optional fields can be added/removed independently.

No currently implemented profile is labelled legally `VERIFIED`; all five researched profiles are `PARTIAL`, and Custom is `RESEARCH_REQUIRED`.

## Print

Initial adapter: `Drukarka: Systemowa` using isolated HTML + system print dialog.

- copies render identical label articles;
- rectangle and round formats share one model;
- no cost or internal production note is included;
- print is disabled until preflight is complete and acknowledged;
- direct model-specific printers remain a future adapter, not a fake integration.

The existing production-sheet/CSV utilities remain untouched. No PDF function was removed; the repository did not contain a real production PDF generator to integrate.
