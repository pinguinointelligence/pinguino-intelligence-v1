import { copy } from '@/copy/en';

/**
 * Shared status vocabulary for PI instruments (Masterplan §12.7 subset for the
 * design system; the full engine status set arrives with the engine).
 * Colors are the muted laboratory tones from the Design Lock — never candy.
 */
export type IndicatorStatus =
  | 'ideal'
  | 'good'
  | 'risky'
  | 'too-soft'
  | 'too-hard'
  | 'locked'
  | 'pro'
  | 'demo';

export const STATUS_LABELS: Record<IndicatorStatus, string> = {
  ideal: copy.status.ideal,
  good: copy.status.good,
  risky: copy.status.risky,
  'too-soft': copy.status.tooSoft,
  'too-hard': copy.status.tooHard,
  locked: copy.status.locked,
  pro: copy.status.pro,
  demo: copy.status.demo,
};

/** Chip surface treatment per status. */
export const STATUS_CHIP_CLASSES: Record<IndicatorStatus, string> = {
  ideal: 'border-status-ideal/30 bg-status-ideal/10 text-status-ideal',
  good: 'border-ink/15 bg-paper text-stone-600',
  risky: 'border-status-risky/35 bg-status-risky/10 text-status-risky',
  'too-soft': 'border-status-error/30 bg-status-error/10 text-status-error',
  'too-hard': 'border-status-error/30 bg-status-error/10 text-status-error',
  locked: 'border-ink/10 bg-ink/5 text-stone-500',
  pro: 'border-ink bg-ink text-ivory',
  demo: 'border-ink/15 bg-ivory text-ink',
};

/** Marker color per status for IndicatorBar ticks. */
export const STATUS_MARKER_CLASSES: Record<IndicatorStatus, string> = {
  ideal: 'bg-status-ideal',
  good: 'bg-ink',
  risky: 'bg-status-risky',
  'too-soft': 'bg-status-error',
  'too-hard': 'bg-status-error',
  locked: 'bg-stone-400',
  pro: 'bg-ink',
  demo: 'bg-ink',
};
