/**
 * Plany → the comparison must tell the truth, and keep telling it.
 *
 * DESIGN V3.0 §P1: „Porównanie mówi prawdę. Wiersze to rzeczy, które produkt
 * realnie bramkuje … Design nie może sprzedawać czegoś, czego produkt nie robi."
 *
 * These tests are the thing that keeps that promise after the design document
 * is closed. They walk the capability matrix itself, so a future edit that
 * grants Home a Pro capability, or advertises a capability nobody reads, fails
 * here rather than shipping as a false claim on the pricing page.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRO_CORE_CAPABILITIES,
  HOME_MAX_SAVED_RECIPES,
  PRO_MAX_SAVED_RECIPES,
} from '@/features/pro-core/proCoreCapabilities';
import { COMPARISON_COLUMNS, COMPARISON_ROWS, UNADVERTISED } from './planComparison';

const row = (id: string) => {
  const found = COMPARISON_ROWS.find((r) => r.id === id);
  if (!found) throw new Error(`no comparison row "${id}"`);
  return found;
};

describe('the comparison is derived from the capability matrix, not written by hand', () => {
  it('exact grams follow the matrix exactly (preview has none, both paid plans do)', () => {
    expect(PRO_CORE_CAPABILITIES.demo.canViewExactGrams).toBe(false);
    expect(PRO_CORE_CAPABILITIES.home.canViewExactGrams).toBe(true);
    expect(PRO_CORE_CAPABILITIES.pro.canViewExactGrams).toBe(true);
    expect(row('exact-grams').demo.kind).toBe('no');
    expect(row('exact-grams').home.kind).toBe('yes');
    expect(row('exact-grams').pro.kind).toBe('yes');
  });

  it('saving is NOT a plain tick: Home is bounded by the matrix number, Pro is unlimited', () => {
    // The owner rule lives in the matrix; the row repeats it rather than restating it.
    expect(HOME_MAX_SAVED_RECIPES).toBe(1);
    expect(PRO_MAX_SAVED_RECIPES).toBeNull();
    const saved = row('saved-recipes');
    expect(saved.demo.kind).toBe('no');
    expect(saved.home).toEqual({ kind: 'limited', note: 'Jedna receptura' });
    expect(saved.pro.kind).toBe('yes');
  });

  it('Produkcja splits three ways, the way the app branches', () => {
    // `canUseProductionMode` is the real divider: Pro gets the batch tooling,
    // Home only resumes a run, the preview gets an upgrade notice.
    expect(PRO_CORE_CAPABILITIES.home.canUseProductionMode).toBe(false);
    expect(PRO_CORE_CAPABILITIES.pro.canUseProductionMode).toBe(true);
    const production = row('production');
    expect(production.demo.kind).toBe('no');
    expect(production.home).toEqual({ kind: 'limited', note: 'Wznowienie partii' });
    expect(production.pro.kind).toBe('yes');
  });

  it('labels, production history and the Pro space are Pro only', () => {
    for (const id of ['labels', 'production-history', 'pro-space']) {
      expect(row(id).demo.kind, id).toBe('no');
      expect(row(id).home.kind, id).toBe('no');
      expect(row(id).pro.kind, id).toBe('yes');
    }
  });

  it('never grants a plan something the matrix denies it', () => {
    // Walk every row: a `yes`/`limited` on Home must be backed by a Home
    // capability, and the same for the preview.
    const homeGrants = COMPARISON_ROWS.filter((r) => r.home.kind !== 'no').map((r) => r.id);
    expect(homeGrants.sort()).toEqual(
      ['exact-grams', 'production', 'recipe-versions', 'saved-recipes'].sort(),
    );
    const demoGrants = COMPARISON_ROWS.filter((r) => r.demo.kind !== 'no').map((r) => r.id);
    expect(demoGrants).toEqual([]);
  });

  it('keeps the three columns in the design order', () => {
    expect(COMPARISON_COLUMNS.map((c) => c.label)).toEqual(['Podgląd', 'Home', 'Pro']);
  });
});

describe('the comparison never sells what the product does not do', () => {
  /** Every capability key the matrix declares. */
  const ALL_KEYS = Object.keys(PRO_CORE_CAPABILITIES.pro);

  it('records a reason for every capability it deliberately leaves out', () => {
    // A key is either used by a row, or explicitly explained in UNADVERTISED.
    const USED = new Set([
      'canViewExactGrams',
      'canSaveRecipe',
      'maxSavedRecipes',
      'canViewRecipeVersions',
      'canRestoreRecipeVersion',
      'canUseProductionMode',
    ]);
    for (const key of ALL_KEYS) {
      if (USED.has(key)) continue;
      expect(UNADVERTISED[key], `${key} is neither shown nor explained`).toBeTruthy();
    }
  });

  it('the four the design named by name stay out of the table', () => {
    const text = JSON.stringify(COMPARISON_ROWS).toLowerCase();
    // serving temperature, costs, exports, version comparison
    expect(text).not.toMatch(/temperatur/);
    expect(text).not.toMatch(/koszt/);
    expect(text).not.toMatch(/eksport/);
    expect(text).not.toMatch(/porówn/);
    for (const key of [
      'canChooseProfessionalServingMode',
      'canUseCosts',
      'canExport',
      'canCompareRecipeVersions',
    ]) {
      expect(UNADVERTISED[key], key).toBeTruthy();
    }
  });
});

describe('the plans copy stops making claims the runtime does not keep', () => {
  const SRC = resolve('src');
  /* Judge declarations, not prose (the `stickyGlobalHeader.test.tsx` convention):
     the copy file's own comments name the claims they removed, so a raw read
     would fail on the explanation instead of on a live claim. */
  const strip = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const landing = strip(readFileSync(join(SRC, 'pages/landing/landingCopy.ts'), 'utf8'));

  it('the Pro bullets no longer promise the serving-temperature choice', () => {
    // `canChooseProfessionalServingMode` has no reader and Home already picks a
    // machine and temperature, so that bullet was selling a gate that does not exist.
    expect(landing).not.toContain('Wybór temperatury serwowania');
  });

  it('the „Wkrótce" list is gone from the copy and from the page', () => {
    expect(landing).not.toContain('futureLabel');
    expect(landing).not.toContain('Plan dla zespołów i pracowni');
    expect(landing).not.toContain('Zarządzanie subskrypcją i fakturami');
    expect(landing).not.toContain('Zmiana planu w dowolnym momencie');
    const page = strip(readFileSync(join(SRC, 'pages/destinations/SubscriptionPage.tsx'), 'utf8'));
    expect(page).not.toContain('s.future');
    expect(page).not.toContain('futureLabel');
  });

  it('no page hardcodes a price — the catalogue computes them', () => {
    // The design: „Ceny są wyliczane, nie wpisane." A literal €-amount in the
    // page or the copy would drift the moment a promotional flag changes.
    const files = [
      join(SRC, 'pages/destinations/SubscriptionPage.tsx'),
      join(SRC, 'pages/destinations/PlanComparisonTable.tsx'),
      join(SRC, 'pages/landing/landingCopy.ts'),
      join(SRC, 'billing/plans/planComparison.ts'),
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, file).not.toMatch(/\d+[.,]\d{2}\s*€/);
      expect(text, file).not.toMatch(/€\s*\/\s*(mies|rok)/);
    }
  });

  it('the comparison module reads the matrix rather than copying it', () => {
    const module = readFileSync(join(SRC, 'billing/plans/planComparison.ts'), 'utf8');
    expect(module).toContain("from '@/features/pro-core/proCoreCapabilities'");
    // No second source of truth: the rows must not carry literal booleans per plan.
    expect(module).not.toMatch(/home:\s*\{\s*kind:\s*'yes'\s*\}/);
  });

  it('every shipped page that lists plan features goes through this module', () => {
    // Guard against a second comparison growing somewhere else.
    const pages = readdirSync(join(SRC, 'pages/destinations'));
    const comparisons = pages.filter((f) => /comparison/i.test(f));
    expect(comparisons).toEqual(['PlanComparisonTable.tsx']);
  });
});
