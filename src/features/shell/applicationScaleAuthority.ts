import { useLayoutEffect, useRef, type RefObject } from 'react';
import {
  PRO_DESKTOP_MIN_WIDTH_PX,
  PRO_FRAME_INLINE_GUTTER_PX,
  PRO_FRAME_MAX_WIDTH_PX,
} from './proFrameGeometry';

/** Accepted desktop composition reference. Wider screens gain canvas at 100%. */
export const APPLICATION_SCALE_REFERENCE_WIDTH_PX = 1440;

/**
 * OWNER 2026-09-12 — RESPONSIVE TRIGGER LOCK. The desktop composition is never
 * painted below two thirds of its accepted size. The handoff
 * (`PRO_DESKTOP_MIN_WIDTH_PX`) is derived so this floor is reached only there,
 * with the account at its compact minimum; the floor below is a guard.
 */
export const APPLICATION_MIN_DESKTOP_SCALE = 2 / 3;

/** The account control's ceiling. Beyond it a name ends in an ellipsis (tooltip). */
export const HEADER_ACCOUNT_MAX_WIDTH_PX = 208;

/**
 * OWNER 2026-09-12 — RESPONSIVE HANDOFF CORRECTION. The account YIELDS before the
 * layout changes mode, down to this compact minimum. 112 px is the bottom of the
 * owner's 112–120 px range and still shows „pro@pro.com" (109.2 px) whole.
 */
export const HEADER_ACCOUNT_MIN_WIDTH_PX = 112;

/**
 * OWNER 2026-09-12 — FINAL RESPONSIVE TRIGGER. The hard minimum clearance, in
 * application px, between the end of the PRO navigation and the account
 * control. The navigation ends with the display column, i.e. at the frame's
 * right edge; `--pro-header-account-gap` stands the account exactly this far
 * past it, and the scale below keeps that lane on the page.
 */
export const HEADER_ACCOUNT_SAFE_GAP_PX = 40;

/**
 * Hysteresis. A reduction happens at once — the account may never stand closer
 * than the safe gap — but a reduced scale grows back only while the account
 * would still clear the navigation by this much, so a window resized across the
 * threshold cannot oscillate.
 */
export const HEADER_ACCOUNT_RELEASE_GAP_PX = 48;

/** Differences below this are sub-pixel noise, never a new scale. */
const SCALE_EPSILON = 1e-4;

export interface ApplicationScaleGeometry {
  mode: 'desktop' | 'mobile';
  scale: number;
  layoutWidth: number;
  layoutHeight: number;
}

export interface HeaderAccountLane {
  /** The account control's rendered width, in application px; 0 when none is shown. */
  accountWidth: number;
  /** Clearance between the navigation end and the account, in application px. */
  gap: number;
}

/**
 * The layout width at which the header's account lane fits: the centred frame
 * and, on each side of it, the frame gutter, the clearance and the account. The
 * frame stays centred, so the lane on the right is mirrored on the left.
 */
export function headerAccountLaneLayoutWidth({ accountWidth, gap }: HeaderAccountLane): number {
  return PRO_FRAME_MAX_WIDTH_PX + 2 * (PRO_FRAME_INLINE_GUTTER_PX + gap + accountWidth);
}

/** The window width at which the widest account still fits its lane at 100 %. */
export const HEADER_ACCOUNT_FULL_WIDTH_VIEWPORT_PX = headerAccountLaneLayoutWidth({
  accountWidth: HEADER_ACCOUNT_MAX_WIDTH_PX,
  gap: HEADER_ACCOUNT_SAFE_GAP_PX,
});

/**
 * OWNER 2026-09-12 — RESPONSIVE HANDOFF CORRECTION. The account's width budget
 * at a real window width, in application px. It falls evenly from the ceiling
 * (208 px), at the width where the widest account fits its lane at 100 %, to the
 * compact minimum (112 px) at the handoff, where that minimum fits at exactly the
 * 2/3 floor. So as a window narrows the application scales AND a long name
 * yields, together; the floor arrives only at the handoff, and the handoff never
 * depends on who is signed in. A name shorter than the budget is never touched.
 */
export function headerAccountWidthBudget(viewportWidth: number): number {
  const progress =
    (viewportWidth - PRO_DESKTOP_MIN_WIDTH_PX) /
    (HEADER_ACCOUNT_FULL_WIDTH_VIEWPORT_PX - PRO_DESKTOP_MIN_WIDTH_PX);
  const budget =
    HEADER_ACCOUNT_MIN_WIDTH_PX +
    progress * (HEADER_ACCOUNT_MAX_WIDTH_PX - HEADER_ACCOUNT_MIN_WIDTH_PX);
  return Math.min(HEADER_ACCOUNT_MAX_WIDTH_PX, Math.max(HEADER_ACCOUNT_MIN_WIDTH_PX, budget));
}

function desktopGeometry(
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): ApplicationScaleGeometry {
  return {
    mode: 'desktop',
    scale,
    layoutWidth: viewportWidth / scale,
    layoutHeight: viewportHeight / scale,
  };
}

/**
 * The one application scale. Two real-layout constraints; the smaller scale
 * wins, and it never goes below the 2/3 desktop floor:
 *
 *   1. viewport / frame fit — the accepted 1440 px composition, unchanged;
 *   2. header clearance — the account lane must fit beside the frame at `gap`,
 *      with the account at its RENDERED width (its budget already applied).
 *
 * Below `PRO_DESKTOP_MIN_WIDTH_PX` the existing mobile composition takes over.
 */
export function applicationScaleGeometry(
  viewportWidth: number,
  viewportHeight: number,
  lane?: HeaderAccountLane | null,
): ApplicationScaleGeometry {
  if (viewportWidth < PRO_DESKTOP_MIN_WIDTH_PX) {
    return {
      mode: 'mobile',
      scale: 1,
      layoutWidth: viewportWidth,
      layoutHeight: viewportHeight,
    };
  }
  const viewportScale = Math.min(1, viewportWidth / APPLICATION_SCALE_REFERENCE_WIDTH_PX);
  const clearanceScale =
    lane && lane.accountWidth > 0
      ? Math.min(1, viewportWidth / headerAccountLaneLayoutWidth(lane))
      : 1;
  return desktopGeometry(
    Math.max(APPLICATION_MIN_DESKTOP_SCALE, Math.min(viewportScale, clearanceScale)),
    viewportWidth,
    viewportHeight,
  );
}

/**
 * One step of the scale, with the owner's hysteresis: reduce at once to keep the
 * safe gap (40 px); grow back only as far as the release gap (48 px) allows;
 * otherwise hold. With no previous scale — the first paint — the safe gap decides.
 */
export function nextApplicationScaleGeometry(
  previousScale: number | null,
  viewportWidth: number,
  viewportHeight: number,
  accountWidth: number,
): ApplicationScaleGeometry {
  const safe = applicationScaleGeometry(viewportWidth, viewportHeight, {
    accountWidth,
    gap: HEADER_ACCOUNT_SAFE_GAP_PX,
  });
  if (safe.mode === 'mobile' || previousScale === null) return safe;
  if (safe.scale < previousScale - SCALE_EPSILON) return safe;
  const release = applicationScaleGeometry(viewportWidth, viewportHeight, {
    accountWidth,
    gap: HEADER_ACCOUNT_RELEASE_GAP_PX,
  });
  if (release.scale > previousScale + SCALE_EPSILON) return release;
  return desktopGeometry(previousScale, viewportWidth, viewportHeight);
}

const SCALE_PROPERTY = '--gellatti-ui-scale';
const LAYOUT_WIDTH_PROPERTY = '--gellatti-layout-viewport-width';
const LAYOUT_HEIGHT_PROPERTY = '--gellatti-layout-viewport-height';
/** The account's width budget; `AppHeaderAccountSlot` reads it in its max-width. */
const ACCOUNT_BUDGET_PROPERTY = '--gellatti-account-max-width';

/* The last desktop scale any shell applied. Module-level, so the hysteresis band
   survives a route change that remounts `AppShell` — HOME, PRO, the Shop and
   every other shell route share one scale and never jump between them. */
let lastAppliedScale: number | null = null;

/**
 * AppShell is the one owner of desktop magnification. BODY deliberately owns
 * the factor so React portals share the header/workbench scale space.
 *
 * Returns the ref for the header's account lane. The authority measures it,
 * so the clearance constraint follows the account's ACTUAL rendered width.
 */
export function useApplicationScaleAuthority(): RefObject<HTMLDivElement | null> {
  const accountLaneRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = document.body;
    const previousMode = body.getAttribute('data-gellatti-scale-mode');
    const previous = [
      SCALE_PROPERTY,
      LAYOUT_WIDTH_PROPERTY,
      LAYOUT_HEIGHT_PROPERTY,
      ACCOUNT_BUDGET_PROPERTY,
    ].map((property) => [property, body.style.getPropertyValue(property)] as const);
    let frame = 0;

    /* The lane's width in application px: painted px divided by the scale that
       painted them, rounded up to a whole pixel (sub-pixel noise ignored) so
       text metrics at a new zoom cannot move the answer back and forth. */
    const accountWidth = () => {
      const width = accountLaneRef.current?.getBoundingClientRect().width ?? 0;
      return width > 0 ? Math.ceil(width / currentApplicationScale() - 0.05) : 0;
    };

    const sync = () => {
      /* The budget first: the account re-lays out at its new maximum before it
         is measured, so the scale always answers to the width actually drawn. */
      if (window.innerWidth >= PRO_DESKTOP_MIN_WIDTH_PX) {
        body.style.setProperty(
          ACCOUNT_BUDGET_PROPERTY,
          `${headerAccountWidthBudget(window.innerWidth)}px`,
        );
      } else {
        body.style.removeProperty(ACCOUNT_BUDGET_PROPERTY);
      }
      const geometry = nextApplicationScaleGeometry(
        lastAppliedScale,
        window.innerWidth,
        window.innerHeight,
        accountWidth(),
      );
      lastAppliedScale = geometry.mode === 'desktop' ? geometry.scale : null;
      body.dataset.gellattiScaleMode = geometry.mode;
      body.style.setProperty(SCALE_PROPERTY, String(geometry.scale));
      body.style.setProperty(LAYOUT_WIDTH_PROPERTY, `${geometry.layoutWidth}px`);
      body.style.setProperty(LAYOUT_HEIGHT_PROPERTY, `${geometry.layoutHeight}px`);
    };

    /* The lane changes size when the account does (sign-in, another address)
       or when its font arrives. Re-measure on the next frame — never inside the
       observer callback — so a new zoom cannot re-enter this observer. */
    const scheduleSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    const lane = accountLaneRef.current;
    const observer =
      lane && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null;
    if (lane) observer?.observe(lane);

    sync();
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      if (previousMode === null) delete body.dataset.gellattiScaleMode;
      else body.setAttribute('data-gellatti-scale-mode', previousMode);
      for (const [property, value] of previous) {
        if (value === '') body.style.removeProperty(property);
        else body.style.setProperty(property, value);
      }
    };
  }, []);
  return accountLaneRef;
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
