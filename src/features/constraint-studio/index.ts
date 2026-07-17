/**
 * Constraint Studio (SPEC §17–§20, §23.2) — lock UI, Preview/Apply through the
 * verify-gated pipeline, §18 feasibility honesty, §20 history/Undo/Explain.
 * Built ON src/features/recipe-constraints (locks map to the engine's existing
 * lock_type 'grams'); Save reuses the pro-core save→version path.
 */
export {
  buildBatchRescalePreview,
  buildLineDiffs,
  buildOptimizePreview,
  buildSuggestedFixPreview,
  commitPreview,
  ensureUniqueLineIds,
  VerifiedApply,
  workingStateFingerprint,
  type AppliedChangeRecord,
  type BlockedApply,
  type BuildPreviewResult,
  type CommitPreviewResult,
  type ConstraintPreview,
  type PreviewKind,
  type PreviewLineDiff,
  type SuggestedBoundFix,
} from './applyPipeline';

export {
  isUndoAvailable,
  reconcileConstraints,
  useConstraintStudioStore,
  type ConstraintStudioState,
  type PreviewIssue,
} from './constraintStudioStore';

export { constraintStudioFlags, setRangeConstraintUiFlag } from './constraintStudioFlags';
export {
  constraintStudioCopy,
  formatGramsDeltaPl,
  formatGramsPl,
  formatTemperaturePl,
} from './constraintStudioCopy';
export { renderConstraintExplanationPl } from './explainPl';
export { useLineLockControls, type LineLockControls, type LineLockView } from './useLineLockControls';

export { resolveSaveGateView, type SaveGateView } from './saveGate';

export { ConstraintStudioSection, LockedSumConflictBanner } from './ui/ConstraintStudioSection';
export { ConstraintPreviewCard } from './ui/ConstraintPreviewCard';
export { FeasibilityNotice, type FeasibilityNoticeActions } from './ui/FeasibilityNotice';
export { ConstraintHistoryPanel } from './ui/ConstraintHistoryPanel';
export { BlockedApplyNotice } from './ui/BlockedApplyNotice';
export { RangeConstraintEditor } from './ui/RangeConstraintEditor';
export { SaveVersionControl } from './ui/SaveVersionControl';
