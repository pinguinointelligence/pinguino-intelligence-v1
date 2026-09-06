/**
 * THE ONE canonical save handler — regression suite for the Home-save repair (2026-07-26).
 *
 * The repair let a SECOND surface (`/start`, the Home flow) save through the SAME handler by
 * passing its own payload + target. These tests pin both halves of that contract:
 *
 *  1. the `/pro` DEFAULT is unchanged — no options means the recipe-store draft and the store's
 *     linked aggregate, exactly as before (the accepted workbar behaviour);
 *  2. an explicit `target: null` really means "no linked aggregate" — so a Home save can never
 *     append a version onto whatever recipe the Pro draft happened to be linked to.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalRecipeSaveErrorMessage,
  productBehaviorSaveGateMessage,
  resolveSaveTarget,
} from './useCanonicalRecipeSave';

const LINKED = { savedRecipeId: 'rc-1', savedRecipeName: 'Gelato waniliowe' };
const UNLINKED = { savedRecipeId: null, savedRecipeName: null };
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SRC = strip(readFileSync(new URL('./useCanonicalRecipeSave.ts', import.meta.url), 'utf8'));

describe('resolveSaveTarget — the /pro default is untouched', () => {
  it('no option → the recipe-store link (what the workbar has always saved into)', () => {
    expect(resolveSaveTarget(undefined, LINKED)).toEqual({
      recipeId: 'rc-1',
      title: 'Gelato waniliowe',
    });
  });

  it('no option + an unlinked draft → null (a create, not a version)', () => {
    expect(resolveSaveTarget(undefined, UNLINKED)).toBeNull();
  });

  it('a missing name never blocks a version save (empty title, same as before)', () => {
    expect(resolveSaveTarget(undefined, { savedRecipeId: 'rc-2', savedRecipeName: null })).toEqual({
      recipeId: 'rc-2',
      title: '',
    });
  });
});

describe('resolveSaveTarget — an explicit target isolates the other surface', () => {
  it('explicit null wins over the store link (a Home save can never hijack the Pro draft)', () => {
    expect(resolveSaveTarget(null, LINKED)).toBeNull();
  });

  it('an explicit aggregate wins over the store link', () => {
    expect(resolveSaveTarget({ recipeId: 'home-1', title: 'Moja receptura' }, LINKED)).toEqual({
      recipeId: 'home-1',
      title: 'Moja receptura',
    });
  });
});

describe('handler invariants', () => {
  it('the DEFAULT payload source is still the recipe-store draft through buildRecipeInput', () => {
    expect(SRC).toContain('const state = useRecipeStore.getState();');
    expect(SRC).toContain('const input = buildRecipeInput(state);');
    expect(SRC).toContain('attachRecipeProfileMetadata(');
    expect(SRC).toContain('options.buildInput ?? (() => buildRecipeInputFromStore())');
    expect(SRC).not.toContain('applyEffectiveCustomerPrices');
    expect(SRC).not.toContain('useCustomerPriceStore');
  });

  it('every recipe-store write is gated on linkStoreDraft (default true = /pro behaviour)', () => {
    expect(SRC).toContain('const linkStoreDraft = options.linkStoreDraft ?? true;');
    // no unguarded markSaved / setState remains
    for (const line of SRC.split('\n')) {
      if (line.includes('markSaved(') && !line.includes('const markSaved')) {
        expect(line.trim().startsWith('markSaved(')).toBe(true); // only inside the guarded block
      }
    }
    expect(SRC).toContain(
      'if (linkStoreDraft) useRecipeStore.setState({ savedRecipeName: recipe.title });',
    );
  });

  it('persistence still goes through the ONE pro-core repository port', () => {
    expect(SRC).toContain('resolveRecipesRepository');
    expect(/repository!\.createRecipe\(/.test(SRC)).toBe(true);
    expect(/repository!\.saveNewVersion\(/.test(SRC)).toBe(true);
    expect(SRC.includes('useCreateRecipe')).toBe(false);
    expect(SRC.includes('useUpdateRecipe')).toBe(false);
  });

  it('Save cannot sign out, clear auth storage, reset account state or navigate to guest', () => {
    const adapter = strip(
      readFileSync(new URL('../../services/proCore/supabaseRecipes.ts', import.meta.url), 'utf8'),
    );
    for (const source of [SRC, adapter]) {
      expect(source).not.toMatch(/auth\.signOut|\bsignOut\s*\(/);
      expect(source).not.toMatch(
        /localStorage\.(?:clear|removeItem)|sessionStorage\.(?:clear|removeItem)/,
      );
      expect(source).not.toContain('clearAccountScopedClientState');
      expect(source).not.toMatch(/window\.location\.(?:assign|replace)|navigate\s*\(/);
    }
    // The backend adapter may prove identity; it may not mutate it.
    expect(adapter).toContain('this.client.auth.getUser()');
  });

  it('the owner trace is opt-in and structurally excludes credentials', () => {
    expect(SRC).toContain("get('owner-auth-trace') !== '1'");
    expect(SRC).not.toMatch(/console\.info\([^\n]*(?:access_token|refresh_token|authorization)/i);
  });

  it('reacts when server-authorized no-change PI restores the practical audit', () => {
    expect(SRC).toContain(
      'const practicalRecipeAudit = useRecipeStore((s) => s.practicalRecipeAudit);',
    );
    expect(SRC).toContain('[constraints, draftRevision, options.buildInput, practicalRecipeAudit]');
    expect(SRC).toContain('practicalRecipeAuditMatchesInput(');
    expect(SRC).not.toContain('JSON.stringify(last.after.input)');
    expect(SRC).toContain('productionVersionFingerprint(recipeInput, productComposition)');
  });
});

describe('fresh-native ProductBehavior Save copy', () => {
  it('keeps Save blocked without presenting a native starter as a historical product', () => {
    const fresh = productBehaviorSaveGateMessage(true);
    const existing = productBehaviorSaveGateMessage(false);

    expect(fresh).toMatch(/pierwszego przeliczenia/i);
    expect(fresh).not.toMatch(/ponownej walidacji|historycz/i);
    expect(existing).toMatch(/ponownej walidacji/i);
  });

  it('never renders the raw database scope diagnostic to a customer', () => {
    const raw = 'recipe product behavior scope mismatch for new-recipe-2-PI-ING-000163';
    const customer = canonicalRecipeSaveErrorMessage(new Error(raw));

    expect(customer).toBe('Dane jednego ze składników wymagają ponownej walidacji.');
    expect(customer).not.toContain(raw);
    expect(customer).not.toContain('new-recipe-2-PI-ING-000163');
  });

  it('preserves unrelated actionable repository errors', () => {
    expect(
      canonicalRecipeSaveErrorMessage(new Error('Limit zapisanych receptur osiągnięty.')),
    ).toBe('Limit zapisanych receptur osiągnięty.');
  });
});
