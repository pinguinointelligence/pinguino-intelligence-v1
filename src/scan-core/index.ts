export { planeSizes, moduleNativePx, type CameraProfile, type PlaneSpec } from './profile';
export {
  PolicyState,
  THRESHOLDS,
  type Decision,
  type FrameSignals,
  type Candidate,
  type ScanPath,
  type Guidance,
  type Roi,
} from './policy';
export {
  Confirmation,
  CONFIRMATION,
  type Read,
  type ReadSource,
  type ConfirmationState,
  type Lane,
} from './confirmation';
export {
  formatFromDecoder,
  type ScanObservation,
  type ScanNone,
  type BarcodeFormat,
  type BarcodeEvidenceSummary,
} from './observation';
export { mergeCollinear, type RawCandidate, type MergedCandidate } from './candidates';
export {
  Tracker,
  Track,
  TRACK,
  resetTrackIds,
  type EvidenceEntry,
  type EvidenceKind,
  type BestCrop,
  type BestCropKey,
  type Geometry,
  type TrackState,
  type TrackerUpdate,
} from './track';
export {
  TargetStateMachine,
  STATE,
  type ScanState,
  type CameraAction,
  type StateInput,
  type StateOutput,
} from './stateMachine';
export { candidateQuality, candidateBox, type CandidateQuality, type CutEdge } from './quality';
export {
  classifyTier,
  budgetFor,
  TIER_BUDGETS,
  type DeviceTier,
  type TierBudget,
  type TierEvidence,
} from './tiers';
