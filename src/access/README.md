# src/access — plan gating

Single source of gating truth: `plans.ts` capability matrix (`demo | basic | pro` + `isAdmin`)
and the `useAccess()` hook (Masterplan §5). All gating UI flows through these + `PlanGate`.
