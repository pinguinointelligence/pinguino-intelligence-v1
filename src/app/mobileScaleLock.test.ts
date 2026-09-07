/** @vitest-environment jsdom */
/**
 * The phone layout stays at 1:1 — owner request.
 *
 * The browser does the work: the viewport meta pins the scale everywhere except iOS
 * Safari, which has ignored `user-scalable=no` since iOS 10, and there Safari's own
 * gesture events are the documented opt-out. These assert that BOTH halves are present,
 * because either one alone leaves a platform able to zoom.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { lockMobileScale } from './mobileScaleLock';

const html = readFileSync('index.html', 'utf8');

describe('the viewport pins the scale', () => {
  it('refuses zooming out below 1 and zooming in past 1', () => {
    const meta = html.slice(html.indexOf('name="viewport"'), html.indexOf('name="description"'));
    expect(meta).toContain('minimum-scale=1');
    expect(meta).toContain('maximum-scale=1');
    expect(meta).toContain('user-scalable=no');
    // The page must still size to the device; a fixed width would break the layout.
    expect(meta).toContain('width=device-width');
    expect(meta).toContain('initial-scale=1');
  });
});

describe('iOS Safari, which ignores that meta, is handled too', () => {
  it('refuses all three Safari gesture events with preventDefault available', () => {
    const added: Array<{ name: string; options: unknown }> = [];
    const spy = vi
      .spyOn(document, 'addEventListener')
      .mockImplementation((name: string, _fn: unknown, options: unknown) => {
        added.push({ name, options });
      });
    lockMobileScale();
    spy.mockRestore();

    expect(added.map((a) => a.name)).toEqual(['gesturestart', 'gesturechange', 'gestureend']);
    // Without passive:false the browser ignores preventDefault, so the lock would be inert.
    for (const a of added) expect(a.options).toMatchObject({ passive: false });
  });

  it('kills double-tap zoom without disabling panning', () => {
    lockMobileScale();
    expect(document.documentElement.style.touchAction).toBe('manipulation');
  });
});

describe('it does not touch scroll or layout', () => {
  it('reads and writes nothing about position or geometry', () => {
    const src = readFileSync('src/app/mobileScaleLock.ts', 'utf8');
    for (const forbidden of [
      'scrollTo',
      'scrollTop',
      'scrollLeft',
      'scrollIntoView',
      'style.zoom',
      'transform',
    ]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});
