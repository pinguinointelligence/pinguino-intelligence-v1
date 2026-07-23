/**
 * PINGÜINO Pro sticky workbar contract (owner binding decision: primary actions always at top).
 *
 * Static-render with the store + canonical-save hook mocked (so states are deterministic). Proves:
 * a NEW recipe shows the inline name field + „Zapisz recepturę" beside it; a SAVED recipe shows the
 * name + `DD.MM.YYYY · vN` + „Zapisz nową wersję (vN+1)"; clean/dirty status; and that „Przelicz z PI"
 * + „Monitor PI" are ALWAYS rendered in the workbar (not only at the page bottom).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';

interface MockRecipeState {
  savedRecipeId: string | null;
  savedRecipeName: string | null;
  currentVersionNumber: number | null;
  currentVersionDate: string | null;
  dirty: boolean;
  category: string;
  visibleProductType: string;
  mode: string;
  target_temperature_c: number;
  target_batch_grams: number;
  machineKind: 'professional' | 'home' | null;
  servingModeId: string | null;
  machineLabel: string | null;
}

let mockState: MockRecipeState = {
  savedRecipeId: null, savedRecipeName: null, currentVersionNumber: null, currentVersionDate: null,
  dirty: false, category: 'milk_gelato', visibleProductType: 'gelato', mode: 'premium', target_temperature_c: -12, target_batch_grams: 1000,
  machineKind: null, servingModeId: null, machineLabel: null,
};
const mockSave = {
  blocked: null, busy: false, error: null, clearError: () => {},
  createNew: async () => true, saveVersion: async () => true, rename: async () => true, archive: async () => true,
};

vi.mock('@/stores/recipeStore', () => ({
  useRecipeStore: (sel: (s: MockRecipeState) => unknown) => sel(mockState),
}));
vi.mock('@/features/recipes/useCanonicalRecipeSave', () => ({ useCanonicalRecipeSave: () => mockSave }));

const { ProWorkbar } = await import('./ProWorkbar');
const w = copy.proWorkbar;

const render = (state: Partial<MockRecipeState>) => {
  mockState = { ...mockState, ...state };
  return renderToStaticMarkup(<ProWorkbar onMonitor={() => {}} onRecalc={() => {}} />);
};

describe('ProWorkbar (sticky top workbar)', () => {
  it('NEW recipe: inline name field + „Zapisz recepturę" beside it + „nowa, niezapisana" status', () => {
    const html = render({ savedRecipeId: null, savedRecipeName: null, currentVersionNumber: null });
    expect(html).toContain('data-testid="pro-workbar-name"');
    expect(html).toContain('data-testid="pro-workbar-save"');
    expect(html).toContain(w.saveNew); // Zapisz recepturę
    expect(html).toContain(w.status.newUnsaved);
  });

  it('SAVED recipe: name + `DD.MM.YYYY · vN` + „Zapisz nową wersję (vN+1)" + no name field', () => {
    const html = render({ savedRecipeId: 'r1', savedRecipeName: 'Pistacja Premium', currentVersionNumber: 3, currentVersionDate: '2026-07-22T10:00:00.000Z', dirty: false });
    expect(html).toContain('Pistacja Premium');
    expect(html).toContain('22.07.2026 · v3');
    expect(html).toContain(w.saveVersion(4)); // Zapisz nową wersję (v4)
    expect(html).toContain(w.status.clean); // Wszystkie zmiany zapisane
    expect(html).not.toContain('data-testid="pro-workbar-name"'); // no inline name field when saved
  });

  it('dirty saved recipe shows „Niezapisane zmiany"', () => {
    const html = render({ savedRecipeId: 'r1', savedRecipeName: 'X', currentVersionNumber: 2, currentVersionDate: '2026-07-21T10:00:00.000Z', dirty: true });
    expect(html).toContain(w.status.dirty);
  });

  it('ALWAYS renders „Przelicz z PI" (dark primary) + „Monitor PI" in the workbar', () => {
    for (const state of [{ savedRecipeId: null }, { savedRecipeId: 'r1', savedRecipeName: 'X', currentVersionNumber: 1, currentVersionDate: '2026-07-21T10:00:00.000Z' }]) {
      const html = render(state);
      expect(html).toContain('data-testid="pro-workbar-recalc"');
      expect(html).toContain(w.recalc); // Przelicz z PI
      expect(html).toContain('data-testid="pro-workbar-monitor"');
      expect(html).toContain(w.monitor); // Monitor PI
    }
  });

  it('shows the compact recipe context (product · tier · serving · batch)', () => {
    const html = render({ savedRecipeId: 'r1', savedRecipeName: 'X', currentVersionNumber: 1, currentVersionDate: '2026-07-21T10:00:00.000Z', category: 'milk_gelato', mode: 'premium', target_temperature_c: -12, target_batch_grams: 1000 });
    expect(html).toContain('Gelato · Premium · -12 °C · 1000 g');
  });
});

describe('ProWorkbar machine-aware context (S4)', () => {
  const pm = copy.proMachine;
  const contextOf = (html: string) =>
    html.match(/data-testid="pro-workbar-context">([^<]*)</)?.[1] ?? '';

  it('a professional selection shows the visible serving temperature', () => {
    const ctx = contextOf(
      render({ machineKind: 'professional', servingModeId: 'fresh', machineLabel: pm.professionalLabel, target_batch_grams: 1000 }),
    );
    expect(ctx).toContain(pm.professionalLabel);
    expect(ctx).toContain(pm.serving.fresh); // Świeże
    expect(ctx).toContain('1000 g');
  });

  it('a professional −12 selection shows −12°C', () => {
    const ctx = contextOf(
      render({ machineKind: 'professional', servingModeId: 'temp_minus_12', machineLabel: pm.professionalLabel, target_batch_grams: 1000 }),
    );
    expect(ctx).toContain(pm.serving.minus12); // −12°C
  });

  it('a home routing shows machine + batch ONLY — no false professional temperature', () => {
    const ctx = contextOf(
      render({ machineKind: 'home', servingModeId: 'ninja_gelato', machineLabel: 'Ninja CREAMi', target_temperature_c: -13, target_batch_grams: 450 }),
    );
    expect(ctx).toContain('Ninja CREAMi');
    expect(ctx).toContain('450 g');
    expect(ctx).not.toContain('°C');
    expect(ctx).not.toContain('-13');
  });
});

describe('ProWorkbar wiring (no duplicate save; workbar mounted in /pro Receptura)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

  it('the /pro Receptura tab mounts the ProWorkbar (sticky) above the lab', () => {
    const pro = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(pro).toContain('ProWorkbar');
    expect(pro).toContain('MonitorDrawer');
  });

  it('the workbar delegates to the ONE canonical save handler (no second handler)', () => {
    const bar = read('features', 'pro-core', 'ProWorkbar.tsx');
    expect(bar).toContain('useCanonicalRecipeSave');
    // it must NOT call the repository/create directly (that lives only in the shared hook)
    expect(/\.createRecipe\(/.test(bar)).toBe(false);
    expect(/\.saveNewVersion\(/.test(bar)).toBe(false);
  });
});
