import { describe, expect, it } from 'vitest';
import { fitLabelPreviewScale } from './labelPreviewGeometry';

describe('fitLabelPreviewScale', () => {
  it('keeps the physical preview at 100% when it fits', () => {
    expect(fitLabelPreviewScale(500, 102)).toBe(1);
  });

  it('scales the full physical document into a narrow mobile column', () => {
    expect(fitLabelPreviewScale(275, 102)).toBeCloseTo(0.713337, 6);
  });

  it('fails open before the host has a measurable width', () => {
    expect(fitLabelPreviewScale(null, 102)).toBe(1);
    expect(fitLabelPreviewScale(0, 102)).toBe(1);
  });
});
