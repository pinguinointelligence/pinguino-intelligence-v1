/**
 * Canonical SaveRecipeDialog (S2 repair) — ONE save flow.
 *
 * Render: the initial (unlinked) draft shows "Zapisz recepturę" + a name field (create v1).
 * Source scans pin the STRUCTURAL guarantees the owner requires — the dialog persists ONLY through
 * the pro-core adapter (createRecipe / saveNewVersion), the legacy `services/recipes` create/update
 * path is gone, and no SECOND independent customer save mechanism remains (SaveVersionControl is
 * unmounted; the Wersje section has no save). Behavioural correctness is covered by the adapter tests.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';

vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({
    repository: { createRecipe: async () => ({}), saveNewVersion: async () => ({}) },
    unavailable: false,
    isLocalDev: false,
    mode: 'supabase',
  }),
}));

const { SaveRecipeDialog } = await import('./SaveRecipeDialog');
const d = copy.recipes.dialog;
const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => strip(readFileSync(join(SRC, ...p), 'utf8'));

describe('SaveRecipeDialog — one canonical save (S2)', () => {
  it('the initial (unlinked) draft renders the create flow: "Zapisz recepturę" + a name field', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <SaveRecipeDialog onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(html).toContain(d.createTitle);
    expect(html).toContain('data-testid="save-name"');
    expect(html).toContain('data-testid="save-primary"');
  });

  it('persists ONLY through the pro-core adapter — the legacy services/recipes save path is gone', () => {
    const src = read('features', 'recipes', 'SaveRecipeDialog.tsx');
    expect(src).toContain('resolveRecipesRepository');
    expect(/\.createRecipe\(/.test(src)).toBe(true);
    expect(/\.saveNewVersion\(/.test(src)).toBe(true);
    // the legacy create/update-rename path (the alternation source) must not be used here anymore
    expect(src.includes('useCreateRecipe')).toBe(false);
    expect(src.includes('useUpdateRecipe')).toBe(false);
    expect(src.includes('resolveSaveMode')).toBe(false);
  });

  it('no SECOND independent customer save mechanism remains (SaveVersionControl unmounted; Wersje read-only)', () => {
    const editor = read('features', 'constraint-studio', 'ui', 'ConstraintStudioSection.tsx');
    expect(editor.includes('<SaveVersionControl')).toBe(false);

    const wersje = read('features', 'pro-core', 'RecipeVersionsSection.tsx');
    expect(/\.createRecipe\(/.test(wersje)).toBe(false);
    expect(/\.saveNewVersion\(/.test(wersje)).toBe(false);
    // restore stays (it appends a new version) — that is not an independent "save draft" entry point
    expect(wersje.includes('restore')).toBe(true);
  });
});
