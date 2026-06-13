/**
 * Pure view model for the correction panel. Reshapes the engine's
 * `CorrectionResult` discriminated union into render-ready rows.
 *
 * The demo branch carries NO numbers and NO ingredient names — it only relabels
 * the already-redacted proposal. The pro branch surfaces the exact actions the
 * engine computed. The redaction guarantee lives in the engine; this view never
 * un-redacts.
 */
import { copy } from '@/copy/en';
import type { CorrectionResult } from '@/engine';
import { metricLabel, metricUnit } from '@/features/pi-panel/indicatorView';

const c = copy.studio.corrections;

export interface DemoProposalView {
  id: string;
  kind: 'correction' | 'tradeoff' | 'impossible';
  confidenceLabel: string;
  areaLabels: string[];
  directionText: string;
}

export interface ProActionView {
  verb: string;
  name: string;
  grams: number;
}

export interface ProPredictionView {
  label: string;
  unit: string;
  before: number | null;
  after: number | null;
}

export interface ProProposalView {
  id: string;
  kind: 'correction' | 'tradeoff' | 'impossible';
  confidenceLabel: string;
  severity: 'info' | 'warning' | 'critical';
  actions: ProActionView[];
  predicted: ProPredictionView[];
  blockingMessage?: string;
}

export type CorrectionView =
  | { mode: 'demo'; proposals: DemoProposalView[] }
  | { mode: 'pro'; proposals: ProProposalView[] };

export function buildCorrectionView(result: CorrectionResult): CorrectionView {
  if (result.redacted) {
    return {
      mode: 'demo',
      proposals: result.proposals.map((proposal) => ({
        id: proposal.id,
        kind: proposal.kind,
        confidenceLabel: c.confidence[proposal.confidence],
        areaLabels: proposal.affected_metrics.map(metricLabel),
        directionText: c.demoDirections[proposal.direction],
      })),
    };
  }

  return {
    mode: 'pro',
    proposals: result.proposals.map((proposal) => ({
      id: proposal.id,
      kind: proposal.kind,
      confidenceLabel: c.confidence[proposal.confidence],
      severity: proposal.severity,
      actions: proposal.actions.map((action) => ({
        verb: action.type === 'add' ? c.add : c.reduce,
        name: action.ingredient_name,
        grams: action.grams,
      })),
      predicted: proposal.predicted.map((prediction) => ({
        label: metricLabel(prediction.metric),
        unit: metricUnit(prediction.metric),
        before: prediction.before,
        after: prediction.after,
      })),
      blockingMessage: proposal.blocking ? c.blocking[proposal.blocking.constraint] : undefined,
    })),
  };
}
