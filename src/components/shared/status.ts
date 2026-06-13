import { copy } from '@/copy/en';

/**
 * PI status vocabulary. Indicator statuses use the engine's snake_case keys
 * verbatim (so an engine `Indicator.status` is assignable directly — no lossy
 * mapping), plus the three UI-only chip states `locked | pro | demo`.
 * Colors are the muted laboratory tones from the Design Lock — never candy.
 */
export type IndicatorStatus =
  // engine indicator statuses (spec §12.7)
  | 'ideal'
  | 'good'
  | 'risky'
  | 'too_soft'
  | 'too_hard'
  | 'too_sweet'
  | 'too_weak'
  | 'too_expensive'
  | 'premium'
  | 'needs_correction'
  // UI-only chip states
  | 'locked'
  | 'pro'
  | 'demo';

export const STATUS_LABELS: Record<IndicatorStatus, string> = {
  ideal: copy.status.ideal,
  good: copy.status.good,
  risky: copy.status.risky,
  too_soft: copy.status.tooSoft,
  too_hard: copy.status.tooHard,
  too_sweet: copy.status.tooSweet,
  too_weak: copy.status.tooWeak,
  too_expensive: copy.status.tooExpensive,
  premium: copy.status.premium,
  needs_correction: copy.status.needsCorrection,
  locked: copy.status.locked,
  pro: copy.status.pro,
  demo: copy.status.demo,
};

const IDEAL = 'border-status-ideal/30 bg-status-ideal/10 text-status-ideal';
const NEUTRAL = 'border-ink/15 bg-paper text-stone-600';
const RISKY = 'border-status-risky/35 bg-status-risky/10 text-status-risky';
const ERROR = 'border-status-error/30 bg-status-error/10 text-status-error';

/** Chip surface treatment per status. */
export const STATUS_CHIP_CLASSES: Record<IndicatorStatus, string> = {
  ideal: IDEAL,
  good: NEUTRAL,
  risky: RISKY,
  too_soft: ERROR,
  too_hard: ERROR,
  too_sweet: ERROR,
  too_weak: ERROR,
  too_expensive: RISKY,
  premium: 'border-ink/15 bg-ivory text-ink',
  needs_correction: ERROR,
  locked: 'border-ink/10 bg-ink/5 text-stone-500',
  pro: 'border-ink bg-ink text-ivory',
  demo: 'border-ink/15 bg-ivory text-ink',
};

const M_IDEAL = 'bg-status-ideal';
const M_RISKY = 'bg-status-risky';
const M_ERROR = 'bg-status-error';
const M_INK = 'bg-ink';

/** Marker color per status for IndicatorBar ticks. */
export const STATUS_MARKER_CLASSES: Record<IndicatorStatus, string> = {
  ideal: M_IDEAL,
  good: M_INK,
  risky: M_RISKY,
  too_soft: M_ERROR,
  too_hard: M_ERROR,
  too_sweet: M_ERROR,
  too_weak: M_ERROR,
  too_expensive: M_RISKY,
  premium: M_IDEAL,
  needs_correction: M_ERROR,
  locked: 'bg-stone-400',
  pro: M_INK,
  demo: M_INK,
};
