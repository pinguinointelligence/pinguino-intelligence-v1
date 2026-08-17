export interface MobilePickerViewport {
  innerWidth: number;
  innerHeight: number;
  visualWidth?: number;
  visualHeight: number;
  visualOffsetLeft?: number;
  visualOffsetTop: number;
}

export interface MobilePickerRect {
  left: number;
  top: number;
  width: number;
  height: number;
  bottom: number;
}

/**
 * Keep the product picker inside the visual viewport when a mobile software
 * keyboard shrinks and offsets it without changing the layout viewport.
 */
export function mobileProductPickerRect(viewport: MobilePickerViewport): MobilePickerRect {
  const gutter = 8;
  const visualWidth = Math.max(0, viewport.visualWidth ?? viewport.innerWidth);
  const visualHeight = Math.max(0, viewport.visualHeight);
  return {
    left: (viewport.visualOffsetLeft ?? 0) + gutter,
    top: viewport.visualOffsetTop + gutter,
    width: Math.max(0, visualWidth - gutter * 2),
    height: Math.max(0, visualHeight - gutter * 2),
    bottom: Math.max(
      0,
      viewport.innerHeight - (viewport.visualOffsetTop + viewport.visualHeight) + gutter,
    ),
  };
}
