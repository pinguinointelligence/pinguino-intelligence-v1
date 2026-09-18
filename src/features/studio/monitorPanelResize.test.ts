import { describe, expect, it } from 'vitest';
import {
  clampMonitorHeight,
  monitorHeightForEditor,
  monitorHeightForKey,
  MONITOR_KEY_STEP_PX,
  MONITOR_MIN_HEIGHT_PX,
  MONITOR_RECIPE_STRIP_PX,
} from './monitorPanelResize';

/*
 * DESIGN V3.0 Version 9 §12 — the arithmetic behind the Monitor grip.
 *
 * The frozen reference measured a phone: Monitor full at 700 px, dragged to 320 px,
 * and — with an ingredient panel and the keyboard up — Monitor 139 px over a 57 px
 * strip of the recipe. Those numbers appear below as SCENARIOS, never as constants:
 * the only figures the product owns are the 132 px floor and the 56 px strip.
 */
const PHONE_FULL = 700;

describe('MONITOR-RESIZE — §12 height rules', () => {
  it('MONITOR-RESIZE-01 starts from what the grip is dragged to, inside its own room', () => {
    expect(clampMonitorHeight(320, PHONE_FULL)).toBe(320);
    expect(clampMonitorHeight(PHONE_FULL, PHONE_FULL)).toBe(PHONE_FULL);
  });

  it('MONITOR-RESIZE-02 never goes below the 132 px minimum, however far the finger drags', () => {
    expect(MONITOR_MIN_HEIGHT_PX).toBe(132);
    expect(clampMonitorHeight(131, PHONE_FULL)).toBe(132);
    expect(clampMonitorHeight(-4000, PHONE_FULL)).toBe(132);
  });

  it('MONITOR-RESIZE-03 never grows past the room between the header and the bottom bar', () => {
    expect(clampMonitorHeight(PHONE_FULL + 500, PHONE_FULL)).toBe(PHONE_FULL);
  });

  it('MONITOR-RESIZE-04 arrows move the same edge the finger does; Home/End are the two ends', () => {
    expect(monitorHeightForKey('ArrowUp', 320, PHONE_FULL)).toBe(320 - MONITOR_KEY_STEP_PX);
    expect(monitorHeightForKey('ArrowDown', 320, PHONE_FULL)).toBe(320 + MONITOR_KEY_STEP_PX);
    expect(monitorHeightForKey('Home', 320, PHONE_FULL)).toBe(MONITOR_MIN_HEIGHT_PX);
    expect(monitorHeightForKey('End', 320, PHONE_FULL)).toBe(PHONE_FULL);
  });

  it('MONITOR-RESIZE-05 arrows obey the same two limits as the drag', () => {
    expect(monitorHeightForKey('ArrowUp', MONITOR_MIN_HEIGHT_PX + 8, PHONE_FULL)).toBe(
      MONITOR_MIN_HEIGHT_PX,
    );
    expect(monitorHeightForKey('ArrowDown', PHONE_FULL - 8, PHONE_FULL)).toBe(PHONE_FULL);
  });

  it('MONITOR-RESIZE-06 leaves a key the grip does not own alone', () => {
    for (const key of ['Tab', 'Enter', ' ', 'ArrowLeft', 'ArrowRight', 'Escape']) {
      expect(monitorHeightForKey(key, 320, PHONE_FULL)).toBeNull();
    }
  });

  it('MONITOR-RESIZE-07 an open ingredient panel leaves exactly a 56 px strip of the recipe', () => {
    expect(MONITOR_RECIPE_STRIP_PX).toBe(56);
    // Panel top at 65 (below the header), editor opening at 465: 400 of room, minus the strip.
    const fitted = monitorHeightForEditor({
      panelTop: 65,
      editorTop: 465,
      current: PHONE_FULL,
      available: PHONE_FULL,
    });
    expect(fitted).toBe(400 - MONITOR_RECIPE_STRIP_PX);
    expect(465 - (65 + fitted!)).toBe(MONITOR_RECIPE_STRIP_PX);
  });

  it('MONITOR-RESIZE-08 the keyboard case is the same rule, not its own numbers (≈139 px over ≈57 px)', () => {
    // Phone with the keyboard up: the editor is pushed to 260 measured from the host's top.
    const fitted = monitorHeightForEditor({
      panelTop: 65,
      editorTop: 65 + 196,
      current: PHONE_FULL,
      available: PHONE_FULL,
    });
    expect(fitted).toBe(196 - MONITOR_RECIPE_STRIP_PX);
    expect(fitted).toBe(140);
    expect(fitted).toBeGreaterThanOrEqual(MONITOR_MIN_HEIGHT_PX);
  });

  it('MONITOR-RESIZE-09 gives way only as far as needed — a Monitor that already fits is left alone', () => {
    expect(
      monitorHeightForEditor({ panelTop: 0, editorTop: 400, current: 200, available: PHONE_FULL }),
    ).toBeNull();
  });

  it('MONITOR-RESIZE-10 the 132 px floor outranks the strip when the editor is very tall', () => {
    expect(
      monitorHeightForEditor({
        panelTop: 0,
        editorTop: 90,
        current: PHONE_FULL,
        available: PHONE_FULL,
      }),
    ).toBe(MONITOR_MIN_HEIGHT_PX);
  });

  it('MONITOR-RESIZE-11 an unmeasurable layout changes nothing', () => {
    expect(
      monitorHeightForEditor({
        panelTop: Number.NaN,
        editorTop: 400,
        current: 200,
        available: PHONE_FULL,
      }),
    ).toBeNull();
  });
});
