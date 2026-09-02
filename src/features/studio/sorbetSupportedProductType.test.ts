import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISIBLE_PRODUCT_TYPES, isSupportedVisibleType } from './productType';

const SRC = resolve(process.cwd(), 'src');
const GATING = /ReadinessBadge|ReadinessFrame|W PRZYGOTOWANIU|coming ?soon|wkr[oó]tce|disabled/i;
const SORBET_CONDITION = /(?:===|!==|case)\s*'sorbet'/g;
const SORBET_FLAG = /\bsorbet(?:ComingSoon|Disabled|Ready|Gate|Preview|Experimental)\b/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    if (/\.test\.(ts|tsx)$/.test(entry) || path.includes('__fixtures__')) return [];
    return [path];
  });

/**
 * A Sorbet-conditioned gate is a `'sorbet'` condition whose own JSX element /
 * expression (up to the first closing `/>` or `</`) renders a readiness badge,
 * a "coming soon" marker or a disabled state. Conditions that merely sit near an
 * unrelated marker (another product's card, production-mode markers) are not gates.
 */
const sorbetGatedSpans = (text: string): string[] =>
  [...text.matchAll(SORBET_CONDITION)].flatMap((match) => {
    const start = match.index ?? 0;
    const tail = text.slice(start, start + 800);
    const close = tail.search(/\/>|<\//);
    const span = close === -1 ? tail : tail.slice(0, close);
    return GATING.test(span) ? [span.replace(/\s+/g, ' ').slice(0, 160)] : [];
  });

describe('Sorbet is a fully supported product type (no obsolete launch gating)', () => {
  it('is selectable and supported like every other visible product type', () => {
    expect(VISIBLE_PRODUCT_TYPES).toContain('sorbet');
    expect(isSupportedVisibleType('sorbet')).toBe(true);
  });

  it('no source file gates Sorbet behind a readiness badge, coming-soon marker, disabled state or feature flag', () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const relative = file.slice(SRC.length + 1);
      const flagged = SORBET_FLAG.test(text)
        ? [`${relative}: ${text.match(SORBET_FLAG)?.[0]}`]
        : [];
      return [...flagged, ...sorbetGatedSpans(text).map((span) => `${relative}: ${span}`)];
    });
    expect(offenders).toEqual([]);
  });
});
