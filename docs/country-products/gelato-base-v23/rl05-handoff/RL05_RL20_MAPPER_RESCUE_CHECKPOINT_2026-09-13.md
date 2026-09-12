# RL-05 / RL-20 Mapper Rescue — shutdown checkpoint

> **Resumed and superseded:** execution continued on 2026-09-13. Two CREAM identities were rescued and all remaining cases were rerun fail-closed. The authoritative result is `reports/GELLATTI_RL05_RL20_MAPPER_RESCUE_CLOSEOUT_2026-09-13.md`.

Saved: 2026-09-13 (Europe/Madrid)

## Repository position

- Worktree: `/private/tmp/pinguino-rl05-rl20-20260912`
- Branch: `codex/rl05-rl20-closure`
- Starting HEAD for this rescue pass: `d05bbd7438f8bf6e4cc4f30933c0d3e5c8913a3a`
- Shared project ref inspected: `tunabqqrwabacxjcxxkz`
- Draft PR: <https://github.com/pinguinointelligence/pinguino-intelligence-v1/pull/328>

## Scope and safety state

- Existing Mapper Rescue / evidence rescue pipeline only.
- No `mapper_basement`, FINAL-2541, canonical PI, product, approval, route, or production application changes were made in this preview pass.
- Unresolved products remained fail-closed.
- RL-36 was not started.
- Scanner sessions/traces and enrichment usage audit rows were written by the existing rescue pipeline.

## Command completed

```sh
node scripts/countryProducts/rescueGelatoBaseV23.mjs \
  --project-ref=tunabqqrwabacxjcxxkz \
  --concurrency=3 \
  --output=/private/tmp/rl05-rl20-rescue-preview.json
```

The new runner defaults to `PREVIEW_ONLY`. Applying ready cases requires both `--apply-ready` and the existing shared-write guard.

## Preview result

- Selected: 88 identities.
- Starting statuses: 87 `approval_not_ready` and 1 previously blocked identity.
- Strict publication-ready previews: 3. They were not applied.
- Still blocked after rescue: 74.
- Blocked because no valid GTIN remained after evidence rescue: 9.
- Preview validation errors: 2.
- Unexpected errors: 0.

Strict ready candidates:

1. `V23:SMP:GTIN-06426309006538` — request `ac735494-ce44-45fb-82fc-55b3696c1438`, session `128a088b-a973-496e-a9c5-ac12bc84efc3`, RO, score 90, water 1.1, total solids 98.9, no Mapper-estimated fields.
2. `V23:CREAM:GTIN-07038010041914` — request `ce4eb611-06a6-4255-ae50-f977ae59cf8f`, session `7bdb3437-3d20-4eaf-aa0d-25a78fb10eff`, NO, score 86, water 57, total solids 43, no Mapper-estimated fields.
3. `V23:CREAM:GTIN-07613269880585` — request `7e1c463c-a1cc-4c73-85a6-33158c9d38e5`, session `75b0c0d4-f423-4cc1-af27-2241b4d70b80`, CH, score 90, water 59.5, total solids 40.5, no Mapper-estimated fields.

Two additional SMP previews were `BASE_READY` with no gaps but scored 84.8, below the strict `>85` publication threshold, so they remain fail-closed:

- `V23:SMP:GTIN-03831040010028`
- `V23:SMP:GTIN-04008230010901`

Validation errors retained as blocked:

- `V23:MILK:GTIN-06001299016158` — request `3460a42f-e455-4e8f-a006-46da93836d2a` — source/workbook nutrition contradiction (`sugars 5.3 > carbohydrate 5`).
- `V23:CREAM:GTIN-06001299012082` — request `986f0775-3446-42ea-8f3d-d5d0410c55f0` — source/workbook nutrition contradiction (`sugars 5.3 > carbohydrate 5`).

The runner's `byRole.ready` field counts raw `ready: true` previews. It reports SMP 3 and CREAM 2. The strict publication-ready count is SMP 1 and CREAM 2 because the two 84.8 SMP cases do not clear the publication threshold.

## Durable evidence

- Full 88-identity ledger: `mapper-rescue-preview-2026-09-13.json`
- Strict ready subset: `mapper-rescue-ready-preview-2026-09-13.json`
- Re-runnable rescue runner: `scripts/countryProducts/rescueGelatoBaseV23.mjs`

## Resume steps

1. Re-open this worktree and branch; read this checkpoint and the two JSON ledgers.
2. Re-verify the three strict-ready session evidence records.
3. Apply only those three candidates, one at a time, with guarded `--apply-ready --only=<productKey>` runs.
4. Rerun approval/readiness idempotently and recompute the exact role/market coverage and blockers.
5. Run RL-05/RL-20 acceptance only if the resulting evidence supports it.
6. Confirm Mapper and FINAL-2541 hashes remain unchanged.
7. Keep RL-36 stopped unless both RL-05 and RL-20 are DONE.

At this checkpoint RL-05 and RL-20 remain **NOT DONE** because the three ready previews have not been applied and post-rescue acceptance has not been rerun.
