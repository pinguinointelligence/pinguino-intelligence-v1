/**
 * `/start` HOME SAVE section — render contract + the architectural invariants it must not break.
 *
 * Static render (the repo's node-env convention) with the persona, auth, repository and the
 * canonical save hook mocked, so every plan state is deterministic. Proves the repaired affordance:
 *  - Demo renders NOTHING (saving blocked — the paywall owns that surface);
 *  - Home with no saved recipe renders name + „Zapisz recepturę";
 *  - Home at its one-recipe limit renders the RULE + „Zapisz jako wersję N" (never a dead end);
 *  - a structure-only preview / missing backend / signed-out session render honest states with no
 *    save button;
 *  - a backend error is shown and nothing claims "saved".
 *
 * The source scans pin what the owner's architecture requires: ONE save handler in the product
 * (this section delegates to `useCanonicalRecipeSave` and never touches a repository itself), the
 * section is really MOUNTED on `/start`, and `/pro` is untouched by this repair.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { customerShellCopy } from './customerShellCopy';
import type { HomeSaveRecipe } from './homeRecipeSave';

type Persona = 'demo' | 'home' | 'pro';

let mockPersona: Persona = 'home';
let mockAuth: { status: string; user: { id: string } | null } = { status: 'authed', user: { id: 'u1' } };
let mockRepo = { repository: {} as unknown, unavailable: false, isLocalDev: false, mode: 'supabase' };
let mockRecipes: { data: HomeSaveRecipe[] | undefined; isLoading: boolean } = { data: [], isLoading: false };
let mockSave = {
  blocked: null as string | null,
  busy: false,
  error: null as string | null,
  clearError: () => {},
  createNew: async () => true,
  saveVersion: async () => true,
  rename: async () => true,
  archive: async () => true,
};

vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => mockPersona }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof mockAuth) => unknown) => sel(mockAuth),
}));
vi.mock('@/features/auth/authModalStore', () => ({
  useAuthModalStore: (sel: (s: { open: () => void }) => unknown) => sel({ open: () => {} }),
}));
vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({ resolveRecipesRepository: () => mockRepo }));
vi.mock('@/features/pro-core/useProCoreRecipes', () => ({ useProCoreRecipes: () => mockRecipes }));
vi.mock('@/features/recipes/useCanonicalRecipeSave', () => ({ useCanonicalRecipeSave: () => mockSave }));

const { HomeSaveSection } = await import('./HomeSaveSection');

const c = customerShellCopy.save;
const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => strip(readFileSync(join(SRC, ...p), 'utf8'));

const INPUT = { items: [], mode: 'gelato', category: 'gelato', target_temperature_c: -11, target_batch_grams: 1000, machine_capacity_grams: null } as unknown as RecipeInput;

const recipe = (over: Partial<HomeSaveRecipe> = {}): HomeSaveRecipe => ({
  recipeId: 'r1',
  title: 'Gelato waniliowe',
  latestVersionNumber: 1,
  archived: false,
  updatedAt: '2026-07-26T10:00:00.000Z',
  ...over,
});

const render = (opts: {
  persona?: Persona;
  auth?: typeof mockAuth;
  repo?: typeof mockRepo;
  recipes?: typeof mockRecipes;
  save?: Partial<typeof mockSave>;
  recipeInput?: RecipeInput | null;
} = {}) => {
  mockPersona = opts.persona ?? 'home';
  mockAuth = opts.auth ?? { status: 'authed', user: { id: 'u1' } };
  mockRepo = opts.repo ?? { repository: {}, unavailable: false, isLocalDev: false, mode: 'supabase' };
  mockRecipes = opts.recipes ?? { data: [], isLoading: false };
  mockSave = { ...mockSave, blocked: null, busy: false, error: null, ...opts.save };
  return renderToStaticMarkup(
    <MemoryRouter>
      <HomeSaveSection
        recipeInput={opts.recipeInput === undefined ? INPUT : opts.recipeInput}
        resultTitle="Gelato waniliowe"
      />
    </MemoryRouter>,
  );
};

describe('HomeSaveSection — the repaired Home save affordance', () => {
  it('Home with no saved recipe: name field + „Zapisz recepturę" (THE defect this repairs)', () => {
    const html = render();
    expect(html).toContain('data-testid="home-save-section"');
    expect(html).toContain('data-testid="home-save-name"');
    expect(html).toContain('data-testid="home-save-create"');
    expect(html).toContain(c.create);
    // the proposed name comes from the result heading
    expect(html).toContain('Gelato waniliowe');
  });

  it('Home at its ONE-recipe limit: the rule + „Zapisz jako wersję 2" — never a dead end', () => {
    const html = render({ recipes: { data: [recipe()], isLoading: false } });
    expect(html).toContain('data-testid="home-save-version"');
    expect(html).toContain(c.versionButton(2));
    expect(html).toContain(c.homeLimitLead);
    // the limit is explained with the recipe's real name, and no create form is offered
    expect(html).toContain('Gelato waniliowe');
    expect(html).not.toContain('data-testid="home-save-create"');
  });

  it('Demo renders NOTHING — saving stays blocked for Demo (accepted rule)', () => {
    expect(render({ persona: 'demo' })).toBe('');
  });

  it('Pro on /start keeps the unlimited create affordance even with recipes saved', () => {
    const html = render({ persona: 'pro', recipes: { data: [recipe(), recipe({ recipeId: 'r2' })], isLoading: false } });
    expect(html).toContain('data-testid="home-save-create"');
    expect(html).not.toContain('data-testid="home-save-version"');
  });

  it('a structure-only preview is honest: no save button, no false promise', () => {
    const html = render({ recipeInput: null });
    expect(html).toContain(c.notCalculated);
    expect(html).not.toContain('data-testid="home-save-create"');
    expect(html).not.toContain('data-testid="home-save-version"');
  });

  it('no configured backend → honest note, never a fake save', () => {
    const html = render({ repo: { repository: null, unavailable: true, isLocalDev: false, mode: 'not_configured' } });
    expect(html).toContain(c.unavailable);
    expect(html).not.toContain('data-testid="home-save-create"');
  });

  it('signed out → an honest sign-in prompt instead of a save button', () => {
    const html = render({ auth: { status: 'anon', user: null } });
    expect(html).toContain(c.signIn);
    expect(html).toContain('data-testid="home-save-signin"');
    expect(html).not.toContain('data-testid="home-save-create"');
  });

  it('DEV local (non-durable) repository says so — never a silent fake persistence', () => {
    const html = render({ repo: { repository: {}, unavailable: false, isLocalDev: true, mode: 'in_memory_dev' } });
    expect(html).toContain(c.localMode);
  });

  it('a backend error is surfaced and NOTHING claims "saved"', () => {
    const html = render({ save: { error: 'insert failed' } });
    expect(html).toContain('data-testid="home-save-error"');
    expect(html).toContain('insert failed');
    expect(html).not.toContain('data-testid="home-save-confirmation"');
    expect(html).not.toContain(c.savedCreated);
  });

  it('while the recipe list loads it says so (no premature create/version claim)', () => {
    const html = render({ recipes: { data: undefined, isLoading: true } });
    expect(html).toContain(c.loading);
    expect(html).not.toContain('data-testid="home-save-create"');
  });
});

describe('the REAL customer payload reaches the save affordance', () => {
  it('a real /start gelato flow → real engine RecipeInput → Home can save THAT recipe', async () => {
    const { buildCustomerResult, createCustomerFlow, setProductType, selectServingMode, setBatchGrams } =
      await import('@/features/customer-flow');

    let flow = createCustomerFlow({ text: 'lody waniliowe' });
    flow = setProductType(flow, 'gelato');
    flow = selectServingMode(flow, 'temp_minus_12');
    flow = setBatchGrams(flow, 1000);
    const result = buildCustomerResult(flow);

    // Precondition: this is a REAL engine result, not a structure-only preview.
    expect(result.calculated).toBe(true);
    expect(result.recipeInput).not.toBeNull();
    expect(result.recipeInput?.target_batch_grams).toBe(1000);

    const html = render({ recipeInput: result.recipeInput });
    expect(html).toContain('data-testid="home-save-create"');
    expect(html).toContain(c.create);
  });

  it('an unsupported profile (no engine template) never offers a save', async () => {
    const { buildCustomerResult, createCustomerFlow, setProductType, selectServingMode, setBatchGrams } =
      await import('@/features/customer-flow');

    let flow = createCustomerFlow({ text: 'sorbet malinowy' });
    flow = setProductType(flow, 'sorbet');
    flow = selectServingMode(flow, 'temp_minus_12');
    flow = setBatchGrams(flow, 1000);
    const result = buildCustomerResult(flow);

    expect(result.recipeInput).toBeNull(); // honest gap — nothing truthful to store
    const html = render({ recipeInput: result.recipeInput });
    expect(html).toContain(c.notCalculated);
    expect(html).not.toContain('data-testid="home-save-create"');
  });
});

describe('architecture invariants (owner: ONE save handler, really mounted)', () => {
  it('delegates to the canonical save hook and calls NO repository itself', () => {
    const src = read('features', 'customer-shell', 'HomeSaveSection.tsx');
    expect(src).toContain('useCanonicalRecipeSave');
    expect(/\.createRecipe\(/.test(src)).toBe(false);
    expect(/\.saveNewVersion\(/.test(src)).toBe(false);
    // it saves ITS OWN payload and never re-links the Pro recipe-store draft
    expect(src).toContain('linkStoreDraft: false');
    expect(src.includes('useRecipeStore')).toBe(false);
  });

  it('is really MOUNTED in the /start result phase (not an orphan component)', () => {
    const shell = read('features', 'customer-shell', 'CustomerShellV1.tsx');
    expect(shell).toContain('HomeSaveSection');
    expect(shell).toContain('<HomeSaveSection');
  });

  it('gates on the canonical capability seam, never on a price id or an email', () => {
    const src = read('features', 'customer-shell', 'HomeSaveSection.tsx');
    expect(src).toContain('customerShellAccessFor');
    expect(src).toContain('resolveHomeSaveState');
    expect(/price[_ ]?id/i.test(src)).toBe(false);
    expect(/@[a-z]+\.(com|pl)/i.test(src)).toBe(false);
  });

  it('the /pro workbar save path is untouched by this repair', () => {
    const bar = read('features', 'pro-core', 'ProWorkbar.tsx');
    expect(bar).toContain('useCanonicalRecipeSave');
    // the workbar still uses the DEFAULT (recipe-store) payload + link — no options passed
    expect(bar).toContain('useCanonicalRecipeSave()');
  });
});
