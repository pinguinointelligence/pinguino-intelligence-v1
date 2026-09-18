/**
 * DESIGN V3.0 HOME (XII): the compact bottom layer rises above the on-screen keyboard by
 * exactly the keyboard's height and returns to the bottom when it goes away.
 */
import { describe, expect, it } from 'vitest';
import { keyboardInsetFor } from './useKeyboardInset';

describe('keyboardInsetFor', () => {
  it('is the part of the layout viewport the keyboard covers', () => {
    expect(keyboardInsetFor({ innerHeight: 844, visualHeight: 508, visualOffsetTop: 0 })).toBe(336);
  });

  it('follows a visual viewport the browser scrolled to keep the field in view', () => {
    expect(keyboardInsetFor({ innerHeight: 844, visualHeight: 508, visualOffsetTop: 120 })).toBe(
      216,
    );
  });

  it('reads a collapsing URL bar as no keyboard, so the layer never jitters', () => {
    expect(keyboardInsetFor({ innerHeight: 844, visualHeight: 790, visualOffsetTop: 0 })).toBe(0);
    expect(keyboardInsetFor({ innerHeight: 844, visualHeight: 844, visualOffsetTop: 0 })).toBe(0);
  });
});
