/**
 * CRITICAL LOGO LOCK (Masterpiece UX/UI — owner-binding).
 *
 * The canonical PINGÜINO logo artwork must NEVER be redrawn, regenerated, replaced, recolored,
 * modified, stretched, cropped, effected, simplified, AI-substituted or animated. Design work may
 * only PLACE the asset, scale it proportionally and give it safe whitespace.
 *
 * This test freezes the exact bytes of both brand assets (sha256 recorded in
 * docs/design/PINGUINO_UI_INVENTORY.md §6). If either hash changes, the logo artwork was
 * modified — that is a design-system violation, not a test to update casually.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BRAND_DIR = resolve(__dirname, '../../../public/brand');

const sha256 = (relative: string): string =>
  createHash('sha256').update(readFileSync(resolve(BRAND_DIR, relative))).digest('hex');

describe('canonical logo asset lock (public/brand)', () => {
  it('favicon.svg is byte-identical to the locked artwork', () => {
    expect(sha256('favicon.svg')).toBe(
      '66557d73e74ec13458fbc0f81433578197d2e6b143ccf9e5b6441560ff8453b4',
    );
  });

  it('logo_reference.jpeg (1000×1000, 1:1) is byte-identical to the locked artwork', () => {
    expect(sha256('logo_reference.jpeg')).toBe(
      '8d28d57b5eb0708881a3b11a291f3c3092dd7e4108da6ed36aeed2083ce67dd7',
    );
  });
});
