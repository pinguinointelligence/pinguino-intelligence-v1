/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  APPLICATION_SCALE_REFERENCE_WIDTH_PX,
  applicationScaleGeometry,
  applicationViewportGeometry,
} from './applicationScaleAuthority';

describe('one continuous application scale authority', () => {
  it('keeps the accepted 1440 px composition at 100%', () => {
    expect(APPLICATION_SCALE_REFERENCE_WIDTH_PX).toBe(1440);
    expect(applicationScaleGeometry(1440, 900)).toEqual({
      mode: 'desktop',
      scale: 1,
      layoutWidth: 1440,
      layoutHeight: 900,
    });
  });

  it.each([
    [1366, 0.948611],
    [1280, 0.888889],
    [1200, 0.833333],
    [1100, 0.763889],
    [1024, 0.711111],
    [960, 0.666667],
  ])('scales every desktop width continuously at %i px', (width, expected) => {
    const geometry = applicationScaleGeometry(width, 900);
    expect(geometry.mode).toBe('desktop');
    expect(geometry.scale).toBeCloseTo(expected, 6);
    expect(geometry.layoutWidth).toBeCloseTo(1440, 6);
    expect(geometry.layoutHeight * geometry.scale).toBeCloseTo(900, 6);
  });

  it('keeps wide screens at 100% and uses only their extra canvas', () => {
    expect(applicationScaleGeometry(1920, 1080)).toEqual({
      mode: 'desktop',
      scale: 1,
      layoutWidth: 1920,
      layoutHeight: 1080,
    });
  });

  it('switches to the existing intentional mobile composition below 960 px', () => {
    expect(applicationScaleGeometry(959, 900)).toEqual({
      mode: 'mobile',
      scale: 1,
      layoutWidth: 959,
      layoutHeight: 900,
    });
  });

  it('maps painted viewport coordinates back into the zoomed application space', () => {
    expect(
      applicationViewportGeometry(
        { left: 320, top: 80, right: 640, bottom: 160, width: 320, height: 80 },
        0.8,
      ),
    ).toEqual({ left: 400, top: 100, right: 800, bottom: 200, width: 400, height: 100 });
  });
});
