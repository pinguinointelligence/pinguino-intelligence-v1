/**
 * PINGÜINO Machine Onboarding — public surface (UI/UX master spec §7.3, §8,
 * §8.6, §23.1; Slice B).
 *
 * Self-contained: pure contracts + view models, the device-local preference
 * adapter, the §8 onboarding flow component, the §7.3 context bar and the
 * §8.6 profile section. The backend preference adapter lives under
 * `src/services/machinePreference/**` (launch-gated); routing/shell wiring is
 * specified in ./INTEGRATION.md and belongs to the orchestrator.
 */
export * from './machineOnboardingCopy';
export * from './preferenceContracts';
export * from './localStorageMachinePreferenceStore';
export * from './machineViews';
export * from './useMachinePreference';
export { MachineOnboarding, type MachineOnboardingCompletion } from './ui/MachineOnboarding';
export { MachineTileGrid } from './ui/MachineTileGrid';
export { MachineBehaviorQuestion } from './ui/MachineBehaviorQuestion';
export { CustomMachineForm, type CustomMachineFormValues } from './ui/CustomMachineForm';
export { AutoConfigTransition } from './ui/AutoConfigTransition';
export { MachineContextBar } from './ui/MachineContextBar';
export { MachineProfileSection } from './ui/MachineProfileSection';
