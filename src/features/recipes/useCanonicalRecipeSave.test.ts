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
import { describe, expect, it, vi } from 'vitest';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { recipeVersionBehaviorGate } from '@/features/product-intelligence';
import { resolveRecipeProposalBehaviorSnapshots } from '@/services/productIntelligence';
import {
  canonicalRecipeSaveErrorMessage,
  prepareExplicitRecipeSaveComposition,
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

describe('HOME explicit-payload canonical save authority', () => {
  const homeStarter = () => {
    let flow = createCustomerFlow({ text: 'lody waniliowe' });
    flow = setProductType(flow, 'gelato');
    flow = selectServingMode(flow, 'ninja_gelato');
    flow = setBatchGrams(flow, 450);
    const recipeInput = buildCustomerResult(flow).recipeInput;
    if (!recipeInput) throw new Error('expected the real HOME starter input');
    return recipeInput;
  };

  it('resolves every canonical starter line and freezes the server snapshots in v1 metadata', async () => {
    const recipeInput = homeStarter();
    expect(recipeInput.items.every((item) => item.id.startsWith('starter:'))).toBe(true);

    const resolveSnapshots = vi.fn(
      async (input: Parameters<typeof resolveRecipeProposalBehaviorSnapshots>[0]) => ({
        snapshots: productBehaviorTestSnapshots(input.recipe),
        unresolvedLineIds: [],
      }),
    );
    const validate = vi.fn().mockResolvedValue({
      ready: true,
      module: 'RECIPE_VERSION',
      lines: [],
      staleLineIds: [],
    });

    const composition = await prepareExplicitRecipeSaveComposition({
      recipeInput,
      accountId: 'home-owner',
      resolveSnapshots,
      validate,
    });

    expect(resolveSnapshots).toHaveBeenCalledWith({
      recipe: recipeInput,
      snapshots: {},
      accountId: 'home-owner',
      module: 'RECIPE_VERSION',
    });
    expect(composition.baseOrder).toEqual(recipeInput.items.map((item) => item.id));
    expect(Object.keys(composition.behaviorSnapshots ?? {}).sort()).toEqual(
      recipeInput.items.map((item) => item.id).sort(),
    );
    expect(recipeVersionBehaviorGate(recipeInput, composition, 'RECIPE_VERSION').ready).toBe(true);
    expect(validate).toHaveBeenCalledWith({
      recipe: recipeInput,
      toppings: [],
      snapshots: composition.behaviorSnapshots,
      module: 'RECIPE_VERSION',
      accountId: 'home-owner',
    });
  });

  it('fails closed before persistence when any HOME starter line cannot resolve', async () => {
    const recipeInput = homeStarter();
    const resolveSnapshots = vi.fn().mockResolvedValue({
      snapshots: productBehaviorTestSnapshots(recipeInput),
      unresolvedLineIds: [recipeInput.items[0]!.id],
    });
    const validate = vi.fn();

    await expect(
      prepareExplicitRecipeSaveComposition({
        recipeInput,
        accountId: 'home-owner',
        resolveSnapshots,
        validate,
      }),
    ).rejects.toThrow(/potwierdzić aktualnych danych produktów/i);
    expect(validate).not.toHaveBeenCalled();
  });
});
