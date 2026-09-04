import { describe, expect, it } from 'vitest';
import { budgetFor, classifyTier } from '../tiers';
import type { CameraProfile } from '../profile';

const phone = (over: Partial<CameraProfile> = {}): CameraProfile => ({
  formFactor: 'mobile',
  sourceW: 1080,
  sourceH: 1920,
  fps: 30,
  autofocus: true,
  zoomMax: 8,
  torch: true,
  startSharpness: 2000,
  ...over,
});

describe('tiers from measured facts', () => {
  it('iPhone-class (3–4 ms medium decode) → phone_fast; Note10+/Realme-class (20–44 ms) → baseline; > 40 ms → weak', () => {
    expect(classifyTier(phone(), { mediumDecodeMs: 3.5, hardwareConcurrency: 6 })).toBe(
      'phone_fast',
    );
    expect(classifyTier(phone(), { mediumDecodeMs: 21, hardwareConcurrency: 8 })).toBe(
      'phone_baseline',
    );
    expect(classifyTier(phone(), { mediumDecodeMs: 60, hardwareConcurrency: 4 })).toBe(
      'phone_weak',
    );
  });
  it('desktop: 720p webcam vs strong/USB', () => {
    expect(
      classifyTier(phone({ formFactor: 'desktop', sourceW: 1280, sourceH: 720 }), {
        mediumDecodeMs: 12,
        hardwareConcurrency: 8,
      }),
    ).toBe('desktop_webcam');
    expect(
      classifyTier(phone({ formFactor: 'desktop', sourceW: 1920, sourceH: 1080 }), {
        mediumDecodeMs: 12,
        hardwareConcurrency: 8,
      }),
    ).toBe('desktop_strong');
    expect(
      classifyTier(phone({ formFactor: 'desktop', sourceW: 1280, sourceH: 720 }), {
        mediumDecodeMs: 4,
        hardwareConcurrency: 10,
      }),
    ).toBe('desktop_strong');
  });
  it('a weak phone is not asked to behave like a desktop and a desktop is not limited to a weak-phone pipeline', () => {
    const weak = budgetFor(phone(), { mediumDecodeMs: 60, hardwareConcurrency: 4 });
    const strong = budgetFor(phone({ formFactor: 'desktop', sourceW: 1920, sourceH: 1080 }), {
      mediumDecodeMs: 5,
      hardwareConcurrency: 12,
    });
    expect(weak.harderAllowed).toBe(false);
    expect(weak.analysisLongEdge).toBe(1280);
    expect(strong.nativeRoiPerSecond).toBeGreaterThan(weak.nativeRoiPerSecond * 3);
    expect(strong.analysisLongEdge).toBeGreaterThan(1920);
  });
});
