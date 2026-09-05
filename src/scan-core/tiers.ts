/**
 * Scan Core — device tiers (owner requirement 2026-09-04 §14–15): one architecture, one policy, different
 * budgets. The tier is derived from measured facts at start (form factor, source resolution, decode cost
 * sample, core count), never from marketing names.
 */
import type { CameraProfile } from './profile';

export type DeviceTier =
  | 'phone_fast'
  | 'phone_baseline'
  | 'phone_weak'
  | 'desktop_webcam'
  | 'desktop_strong';

export interface TierBudget {
  tier: DeviceTier;
  /** target processed fps for the locate/track lane */
  targetFps: number;
  /** ROI decodes allowed per second before the ladder slows down */
  nativeRoiPerSecond: number;
  /** rescue full-frame cadence in frames */
  rescueEveryN: number;
  /** allow the harder (tryHarder/rotate/invert/downscale) pass on crops */
  harderAllowed: boolean;
  /** analysis long-edge cap for the LOW/MEDIUM planes; native ROI always reads the source */
  analysisLongEdge: number;
  /** worker duty (0..1) above which the ladder degrades */
  dutyBudget: number;
}

export interface TierEvidence {
  /** measured full-frame cheap decode on a MEDIUM plane, ms (from the warm-up probe frame) */
  mediumDecodeMs: number | null;
  hardwareConcurrency: number | null;
}

/** Phase 0 anchors: A17 Pro 3–4 ms full-frame cheap at 2 MP; Note10+/Realme 20–44 ms; weak = worse. */
export function classifyTier(profile: CameraProfile, ev: TierEvidence): DeviceTier {
  const long = Math.max(profile.sourceW, profile.sourceH);
  if (profile.formFactor === 'desktop')
    return long >= 1920 || (ev.mediumDecodeMs !== null && ev.mediumDecodeMs <= 6)
      ? 'desktop_strong'
      : 'desktop_webcam';
  const ms = ev.mediumDecodeMs;
  if (ms !== null && ms <= 8) return 'phone_fast';
  if (ms !== null && ms > 40) return 'phone_weak';
  if (ms === null && (ev.hardwareConcurrency ?? 0) <= 4 && long < 1280) return 'phone_weak';
  return 'phone_baseline';
}

export const TIER_BUDGETS: Record<DeviceTier, TierBudget> = {
  phone_fast: {
    tier: 'phone_fast',
    targetFps: 30,
    nativeRoiPerSecond: 30,
    rescueEveryN: 10,
    harderAllowed: true,
    analysisLongEdge: 1920,
    dutyBudget: 0.5,
  },
  phone_baseline: {
    tier: 'phone_baseline',
    targetFps: 15,
    nativeRoiPerSecond: 15,
    rescueEveryN: 10,
    harderAllowed: true,
    analysisLongEdge: 1920,
    dutyBudget: 0.5,
  },
  phone_weak: {
    tier: 'phone_weak',
    targetFps: 10,
    nativeRoiPerSecond: 8,
    rescueEveryN: 20,
    harderAllowed: false,
    analysisLongEdge: 1280,
    dutyBudget: 0.4,
  },
  desktop_webcam: {
    tier: 'desktop_webcam',
    targetFps: 20,
    nativeRoiPerSecond: 20,
    rescueEveryN: 10,
    harderAllowed: true,
    analysisLongEdge: 1920,
    dutyBudget: 0.6,
  },
  desktop_strong: {
    tier: 'desktop_strong',
    targetFps: 30,
    nativeRoiPerSecond: 30,
    rescueEveryN: 5,
    harderAllowed: true,
    analysisLongEdge: 3840,
    dutyBudget: 0.7,
  },
};

export function budgetFor(profile: CameraProfile, ev: TierEvidence): TierBudget {
  return TIER_BUDGETS[classifyTier(profile, ev)];
}
