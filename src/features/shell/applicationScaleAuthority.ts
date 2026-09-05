import { useLayoutEffect } from 'react';
import { PRO_DESKTOP_MIN_WIDTH_PX } from './proFrameGeometry';

/** Accepted desktop composition reference. Wider screens gain canvas at 100%. */
export const APPLICATION_SCALE_REFERENCE_WIDTH_PX = 1440;

/**
 * Bounded desktop header regions at the accepted reference composition.
 * `center` includes HOME / PRO and the complete route-navigation reservation;
 * `right` is intentionally the bounded Zaloguj / Wyloguj control, never user
 * identity. The two separation lanes and both outer gutters are load-bearing.
 */
export const APPLICATION_HEADER_GEOMETRY_REGIONS_PX = Object.freeze({
  left: 224,
  center: 976,
  right: 96,
  separation: 28,
  outerGutters: 57.6,
});

export const APPLICATION_HEADER_GEOMETRY_MIN_WIDTH_PX =
  APPLICATION_HEADER_GEOMETRY_REGIONS_PX.left +
  APPLICATION_HEADER_GEOMETRY_REGIONS_PX.center +
  APPLICATION_HEADER_GEOMETRY_REGIONS_PX.right +
  APPLICATION_HEADER_GEOMETRY_REGIONS_PX.separation * 2 +
  APPLICATION_HEADER_GEOMETRY_REGIONS_PX.outerGutters;

/** One trigger for both the accepted workbench and the full three-region header. */
export const APPLICATION_SCALE_TRIGGER_WIDTH_PX = Math.max(
  APPLICATION_SCALE_REFERENCE_WIDTH_PX,
  APPLICATION_HEADER_GEOMETRY_MIN_WIDTH_PX,
);

export interface ApplicationScaleGeometry {
  mode: 'desktop' | 'mobile';
  scale: number;
  layoutWidth: number;
  layoutHeight: number;
}

export function applicationScaleGeometry(
  viewportWidth: number,
  viewportHeight: number,
): ApplicationScaleGeometry {
  if (viewportWidth < PRO_DESKTOP_MIN_WIDTH_PX) {
    return {
      mode: 'mobile',
      scale: 1,
      layoutWidth: viewportWidth,
      layoutHeight: viewportHeight,
    };
  }
  const scale = Math.min(1, viewportWidth / APPLICATION_SCALE_TRIGGER_WIDTH_PX);
  return {
    mode: 'desktop',
    scale,
    layoutWidth: viewportWidth / scale,
    layoutHeight: viewportHeight / scale,
  };
}

const SCALE_PROPERTY = '--gellatti-ui-scale';
const LAYOUT_WIDTH_PROPERTY = '--gellatti-layout-viewport-width';
const LAYOUT_HEIGHT_PROPERTY = '--gellatti-layout-viewport-height';
const VIEWPORT_FIXED_INSET_PROPERTY = '--gellatti-viewport-fixed-inset';
const APPLICATION_VIEWPORT_FIXED_INSET_PX = 28.8;

/**
 * CSS fixed offsets live inside the zoomed coordinate space. Inverting the
 * scale keeps their painted distance from the real viewport edge invariant.
 */
export function applicationViewportFixedInset(paintedInsetPx: number, scale: number): number {
  return scale > 0 && Number.isFinite(scale) ? paintedInsetPx / scale : paintedInsetPx;
}

/**
 * AppShell is the one owner of desktop magnification. BODY deliberately owns
 * the factor so React portals share the header/workbench scale space.
 */
export function useApplicationScaleAuthority(): void {
  useLayoutEffect(() => {
    const body = document.body;
    const previousMode = body.getAttribute('data-gellatti-scale-mode');
    const previousScale = body.style.getPropertyValue(SCALE_PROPERTY);
    const previousWidth = body.style.getPropertyValue(LAYOUT_WIDTH_PROPERTY);
    const previousHeight = body.style.getPropertyValue(LAYOUT_HEIGHT_PROPERTY);
    const previousViewportFixedInset = body.style.getPropertyValue(VIEWPORT_FIXED_INSET_PROPERTY);

    const sync = () => {
      const geometry = applicationScaleGeometry(window.innerWidth, window.innerHeight);
      body.dataset.gellattiScaleMode = geometry.mode;
      body.style.setProperty(SCALE_PROPERTY, String(geometry.scale));
      body.style.setProperty(LAYOUT_WIDTH_PROPERTY, `${geometry.layoutWidth}px`);
      body.style.setProperty(LAYOUT_HEIGHT_PROPERTY, `${geometry.layoutHeight}px`);
      body.style.setProperty(
        VIEWPORT_FIXED_INSET_PROPERTY,
        `${applicationViewportFixedInset(APPLICATION_VIEWPORT_FIXED_INSET_PX, geometry.scale)}px`,
      );
    };

    sync();
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      if (previousMode === null) delete body.dataset.gellattiScaleMode;
      else body.setAttribute('data-gellatti-scale-mode', previousMode);
      for (const [property, value] of [
        [SCALE_PROPERTY, previousScale],
        [LAYOUT_WIDTH_PROPERTY, previousWidth],
        [LAYOUT_HEIGHT_PROPERTY, previousHeight],
        [VIEWPORT_FIXED_INSET_PROPERTY, previousViewportFixedInset],
      ] as const) {
        if (value === '') body.style.removeProperty(property);
        else body.style.setProperty(property, value);
      }
    };
  }, []);
}

export function currentApplicationScale(): number {
  if (typeof document === 'undefined') return 1;
  const value = Number.parseFloat(document.body.style.getPropertyValue(SCALE_PROPERTY));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function applicationViewportSize(scale = currentApplicationScale()): {
  width: number;
  height: number;
} {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth / scale, height: window.innerHeight / scale };
}

export interface ApplicationViewportGeometry {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Convert painted viewport pixels back to the zoomed application's CSS space. */
export function applicationViewportGeometry(
  rect: ApplicationViewportGeometry,
  scale = currentApplicationScale(),
): ApplicationViewportGeometry {
  return {
    left: rect.left / scale,
    top: rect.top / scale,
    right: rect.right / scale,
    bottom: rect.bottom / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}
