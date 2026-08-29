# GELLATTI — PROTECTED CORE BUGS (recorded, NOT modified)

Defects found inside the protected ice/Workbench core (Engine, Solver,
POD/PAC/NPAC, profile bands, Gelato/Sorbet/Vegan/Protein rules,
Crown/Main/Multi-Main, Direction, batch mathematics, Recalculate,
Recipe/Monitor, Production and Label calculations).

**None of these were fixed.** Each entry carries an exact reproducible fixture
so the owner can write a separate surgical prompt.

Reproduction harness: `npm run acceptance:matrix`
(`src/features/acceptance/__campaign__/fullRecipeMatrix.acceptance.test.ts`),
which drives the real starters, the real staging `resolve_product_behavior_v1`
authority for every line, and the real Preview/Apply/Save doors.

---
