/**
 * PINGÜINO PI Recipe Monitor — public barrel.
 *
 * Pure domain (contracts + axis mapping + intent mapping + orchestration), the
 * presentational panel, the DEV fixtures, and the REAL runner adapter. The pure
 * core never touches the engine/solver directly — recalculation is delegated
 * through the injected `PiRecalculationRunner` (the real one lives in
 * `piMonitorRunner.ts`, which wraps the sanctioned optimization runner).
 */
export * from './piMonitorContracts';
export * from './piMonitorAxes';
export * from './piMonitorIntent';
export * from './piMonitor';
export * from './piMonitorHomeView';
export { PiMonitorPanel, type PiMonitorPanelProps } from './PiMonitorPanel';
export { realPiRecalculationRunner, piBaseIntentFromRecipe } from './piMonitorRunner';
export { PI_MONITOR_FIXTURES, type PiMonitorFixture } from './piMonitorFixtures';
