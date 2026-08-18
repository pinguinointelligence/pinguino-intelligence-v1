import type { ScorePresentationSource } from '@/features/constraint-studio/applyPipeline';

export function scorePresentationSource(input: {
  previewReady: boolean;
  currentReady: boolean;
  hasAppliedHistory: boolean;
}): ScorePresentationSource | null {
  if (input.previewReady) return 'PREVIEW';
  if (!input.currentReady) return null;
  return input.hasAppliedHistory ? 'APPLIED_RECIPE' : 'CURRENT_RECIPE';
}
