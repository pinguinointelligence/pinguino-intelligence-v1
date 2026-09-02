/**
 * Agent 4 fixture sweep — the pink `TESTOWE / NIEPRODUKCYJNE` marker.
 *
 * Proves:
 *  1. the registry is complete and honest (file/identifier/reason/replacement all
 *     present; every referenced source file actually exists in the repo);
 *  2. the block marker renders the badge, tooltip (source + why + replacement)
 *     and the marked content — nothing hidden;
 *  3. the compact badge carries the same tooltip;
 *  4. the dark tone uses the dark-calibrated `nonprod-soft` classes;
 *  5. an unknown id fails fast.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  NON_PRODUCTION_BADGE_LABEL,
  NonProductionBadge,
  NonProductionMarker,
} from './NonProductionMarker';
import {
  NON_PRODUCTION_ITEMS,
  nonProductionItem,
  nonProductionTooltip,
  type NonProductionItemId,
} from './nonProductionRegistry';

const REPO_ROOT = join(__dirname, '..', '..', '..');

describe('nonProductionRegistry — complete, honest, grounded in real files', () => {
  it('every entry names a source file, identifier, reason and replacement', () => {
    expect(NON_PRODUCTION_ITEMS.length).toBeGreaterThan(0);
    for (const item of NON_PRODUCTION_ITEMS) {
      expect(item.file.length, item.id).toBeGreaterThan(0);
      expect(item.identifier.length, item.id).toBeGreaterThan(0);
      expect(item.reason.length, item.id).toBeGreaterThan(10);
      expect(item.replacement.length, item.id).toBeGreaterThan(10);
    }
  });

  it('every referenced source file exists in the repo (no stale marker claims)', () => {
    for (const item of NON_PRODUCTION_ITEMS) {
      // Multi-file entries are joined with ' + '.
      for (const file of item.file.split(' + ')) {
        expect(existsSync(join(REPO_ROOT, file.trim())), `${item.id}: ${file}`).toBe(true);
      }
    }
  });

  it('ids are unique and lookup returns the exact entry', () => {
    const ids = NON_PRODUCTION_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of NON_PRODUCTION_ITEMS) {
      expect(nonProductionItem(item.id)).toBe(item);
    }
  });

  it('an unknown id throws (a typo can never render an empty marker)', () => {
    expect(() => nonProductionItem('no-such-id' as NonProductionItemId)).toThrow(
      /Unknown non-production item id/,
    );
  });

  it('the tooltip carries source file + identifier + why + replacement', () => {
    for (const item of NON_PRODUCTION_ITEMS) {
      const tooltip = nonProductionTooltip(item);
      expect(tooltip).toContain(item.file);
      expect(tooltip).toContain(item.identifier);
      expect(tooltip).toContain(item.reason);
      expect(tooltip).toContain(item.replacement);
    }
  });
});

describe('NonProductionMarker (block)', () => {
  const html = renderToStaticMarkup(
    <NonProductionMarker itemId="start-ready-catalogue" title="Katalog">
      <p>Zawartość testowa</p>
    </NonProductionMarker>,
  );

  it('renders the pink badge with the canonical label', () => {
    expect(html).toContain(NON_PRODUCTION_BADGE_LABEL);
    expect(html).toContain('data-testid="nonprod-marked-start-ready-catalogue"');
    expect(html).toContain('data-testid="nonprod-badge-start-ready-catalogue"');
    expect(html).toContain('border-l-nonprod');
    expect(html).toContain('text-nonprod');
  });

  it('the tooltip names the source file, identifier, reason and replacement', () => {
    const item = nonProductionItem('start-ready-catalogue');
    expect(html).toContain('src/features/customer-flow/__fixtures__/catalogueFixtures.ts');
    expect(html).toContain('CATALOGUE_FIXTURES');
    // title attribute is HTML-escaped; compare against the escaped tooltip.
    const escaped = nonProductionTooltip(item)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '&#10;');
    expect(html).toContain(escaped.slice(0, 40));
  });

  it('renders the marked content — nothing is removed or hidden', () => {
    expect(html).toContain('Zawartość testowa');
    expect(html).toContain('Katalog');
  });

  it('shows the registry reason as the default honest note', () => {
    const item = nonProductionItem('start-ready-catalogue');
    expect(html).toContain(item.reason.slice(0, 30));
  });
});

describe('NonProductionBadge (compact)', () => {
  it('renders the label + tooltip standalone', () => {
    const html = renderToStaticMarkup(<NonProductionBadge itemId="landing-monitor-example" />);
    expect(html).toContain(NON_PRODUCTION_BADGE_LABEL);
    expect(html).toContain('data-testid="nonprod-badge-landing-monitor-example"');
    expect(html).toContain('src/pages/landing/landingMonitorDemo.ts');
  });

  it('dark tone uses the dark-calibrated nonprod-soft classes', () => {
    const html = renderToStaticMarkup(
      <NonProductionBadge itemId="recipes-hub-tiles" tone="dark" />,
    );
    expect(html).toContain('text-nonprod-soft');
    expect(html).not.toContain('text-nonprod ');
  });
});
