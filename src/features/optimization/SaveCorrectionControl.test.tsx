/**
 * SaveCorrectionControl gating tests (Spine Slice 24) — the first write
 * control is signed-in Pro only, explicit-click only, and honest when nothing
 * is saveable. Stores + service mocked; views are REAL runner output.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  access: { exactCorrectionGrams: true, saveRecipes: true },
  auth: { status: 'authed', user: { id: 'user-123' } as { id: string } | null },
  savedRecipeId: null as string | null,
  createCalls: 0,
}));

vi.mock('@/access/useAccess', () => ({ useAccess: () => h.access }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof h.auth) => unknown) => sel(h.auth),
}));
vi.mock('@/stores/recipeStore', () => ({
  useRecipeStore: (sel: (s: { savedRecipeId: string | null }) => unknown) =>
    sel({ savedRecipeId: h.savedRecipeId }),
}));
vi.mock('@/services/acceptedCorrections', () => ({
  createAcceptedCorrection: () => {
    h.createCalls += 1;
    return Promise.resolve({ id: 'rec-1' });
  },
}));

import { SaveCorrectionControl } from './SaveCorrectionControl';
import { findOptimizationPreviewFixture } from './optimizationPreviewFixtures';
import { runOptimizationPreview } from './optimizationPreviewRunner';

const tradeoffFixture = findOptimizationPreviewFixture('gelato-tradeoff')!;
const saveableView = runOptimizationPreview(tradeoffFixture);
const readyFixture = findOptimizationPreviewFixture('sorbet-ready')!;
const nothingToSaveView = runOptimizationPreview(readyFixture);

const render = (view = saveableView, recipe = tradeoffFixture.recipe) =>
  renderToStaticMarkup(<SaveCorrectionControl view={view} recipe={recipe} />);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ');

beforeEach(() => {
  h.access = { exactCorrectionGrams: true, saveRecipes: true };
  h.auth = { status: 'authed', user: { id: 'user-123' } };
  h.savedRecipeId = null;
  h.createCalls = 0;
});

describe('SaveCorrectionControl — visibility gating', () => {
  it('signed-in Pro with a saveable solve gets the real control (both modes offered)', () => {
    const html = render();
    const text = visibleText(html);
    expect(text).toContain('Save accepted correction');
    expect(text).toContain('Save correction');
    expect(text).toContain('Engine-seeded solve');
    expect(text).toContain('Regulator-shadow solve');
    // honesty line: the recipe itself is never mutated by a save
    expect(text).toContain('never changed');
    expect(html).toContain('<button');
  });

  it('defaults to the engine-seeded solve (decision H)', () => {
    const html = render();
    const radios = html.match(/<input[^>]*type="radio"[^>]*\/?>/g) ?? [];
    expect(radios).toHaveLength(2);
    expect(radios[0]).toContain('checked');
    expect(radios[1]).not.toContain('checked');
  });

  it('unsigned sessions (incl. demo) see only the sign-in note — never a button', () => {
    h.auth = { status: 'anon', user: null };
    h.access = { exactCorrectionGrams: false, saveRecipes: false };
    const html = render();
    expect(visibleText(html)).toContain('Sign in to save corrections');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('radio');
  });

  it('signed-in Free renders NOTHING — no dead control, no upsell', () => {
    h.access = { exactCorrectionGrams: false, saveRecipes: true };
    expect(render()).toBe('');
  });

  it('signed-in Pro with nothing saveable gets one honest line — no button, no fake save', () => {
    const html = render(nothingToSaveView, readyFixture.recipe);
    expect(visibleText(html)).toContain('nothing to save');
    expect(html).not.toContain('<button');
  });
});

describe('SaveCorrectionControl — no auto-save', () => {
  it('rendering never calls the write service (saving is an explicit click)', () => {
    render();
    render(nothingToSaveView, readyFixture.recipe);
    h.auth = { status: 'anon', user: null };
    render();
    expect(h.createCalls).toBe(0);
  });
});
