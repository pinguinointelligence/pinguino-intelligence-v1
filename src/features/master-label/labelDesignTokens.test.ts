/**
 * The Label workspace draws from the product's palette.
 *
 * It carried a warm family that existed nowhere else in Gellatti: four
 * near-white tints, a brown/gold accent set, and an attention colour
 * (`#fffaf4`) sitting ONE hex digit from `--g-attention-surface` (`#fffaf3`).
 * Mapping them onto the tokens also improved the attention contrast, from
 * 5.62:1 to 6.09:1.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const workspace = () =>
  readFileSync(join(SRC, 'features', 'master-label', 'LabelWorkspace.tsx'), 'utf8');

describe('label workspace palette', () => {
  it('keeps no private warm palette beside the tokens', () => {
    const source = workspace();
    for (const stale of [
      '#fffaf4', // one digit from --g-attention-surface
      '#fff7ed',
      '#8a5b23', // one shade from --g-attention-ink
      '#a96832',
      '#7a4a25',
      '#b58b32', // a gold where the product has --g-orange
      '#fffdf8', // three more near-whites beside --g-ivory
      '#fbf8f1',
      '#f7f5f0',
      '#d8bb8d',
    ]) {
      expect(source).not.toContain(stale);
    }
  });

  it('uses the attention tokens for the missing-field state', () => {
    const source = workspace();
    expect(source).toContain('var(--g-attention-surface)');
    expect(source).toContain('var(--g-attention-ink)');
  });

  it('carries no legacy stone or greige palette classes', () => {
    const source = workspace();
    expect(source).not.toMatch(/text-stone-\d/);
    expect(source).not.toContain('bg-stone-50');
    // `border-ink/35` stays: that is the product's own ink at 35 %, a focus
    // alpha rather than a muted-palette colour.
    expect(source).not.toMatch(/border-ink\/(?:8|10|12|15|20)\b/);
  });

  /* The error family (#7e4037 on #fff7f5) is DELIBERATELY left. Mapping its
     text to `status-error` would drop an error message from 7.43:1 to 4.77:1.
     The product has no dark error ink token yet; that gap is worth closing
     before this colour moves. */
  it('does not trade error legibility for tidiness', () => {
    expect(workspace()).toContain('#7e4037');
  });
});
