import { copy } from '@/copy/en';

export type ConfidenceLevel =
  | 'verified'
  | 'very-high'
  | 'high'
  | 'estimated'
  | 'needs-verification';

/** Score → level mapping per Masterplan §16. */
export const confidenceLevel = (score: number): ConfidenceLevel => {
  if (score >= 100) return 'verified';
  if (score >= 95) return 'very-high';
  if (score >= 90) return 'high';
  if (score >= 80) return 'estimated';
  return 'needs-verification';
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  verified: copy.confidence.verified,
  'very-high': copy.confidence.veryHigh,
  high: copy.confidence.high,
  estimated: copy.confidence.estimated,
  'needs-verification': copy.confidence.needsVerification,
};

export const CONFIDENCE_DOT_CLASSES: Record<ConfidenceLevel, string> = {
  verified: 'bg-status-ideal',
  'very-high': 'bg-status-ideal/70',
  high: 'bg-stone-400',
  estimated: 'bg-status-risky',
  'needs-verification': 'bg-status-error',
};
