/**
 * HOME SAVE — regression suite for the repaired `/start` save path (2026-07-26).
 *
 * THE DEFECT (proven before this repair): `customerShellAccessFor(persona).save` resolved the
 * canonical Home capability (ONE saved recipe) but nothing consumed it — `/start` rendered no save
 * affordance and `/pro` (the only mounted save UI) gates a `home` persona behind the Pro upgrade
 * prompt. A paying Home subscriber could not save a recipe anywhere in the product.
 *
 * These tests pin the repaired behaviour AND the accepted plan rules it must never break:
 *  - Demo: saving blocked (nothing rendered);
 *  - Home: exactly ONE saved recipe — versions of that recipe do NOT count and stay available;
 *  - Pro:  unlimited;
 *  - never a fake save (signed out / no backend / no engine payload are honest states).
 *
 * The integration block drives the REAL canonical repository port, so it proves the persistence
 * this UI decision leads to — not just the decision.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { HOME_MAX_SAVED_RECIPES, recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { InMemoryRecipes } from '@/services/proCore/inMemoryRecipes';
import { inMemoryRecipesRepository, type RecipesRepository } from '@/services/proCore/recipesRepository';
import { customerShellAccessFor } from './customerShellAccess';
import { activeRecipes, resolveHomeSaveState, type HomeSaveRecipe } from './homeRecipeSave';

const DEMO = recipeCapabilitiesFor('demo');
const HOME = recipeCapabilitiesFor('home');
const PRO = recipeCapabilitiesFor('pro');

const recipe = (over: Partial<HomeSaveRecipe> = {}): HomeSaveRecipe => ({
  recipeId: 'r1',
  title: 'Gelato waniliowe',
  latestVersionNumber: 1,
  archived: false,
  updatedAt: '2026-07-26T10:00:00.000Z',
  ...over,
});

/** Everything present and savable — each test flips exactly one condition. */
const ok = (over: Partial<Parameters<typeof resolveHomeSaveState>[0]> = {}) =>
  resolveHomeSaveState({
    caps: HOME,
    authed: true,
    repositoryAvailable: true,
    hasCalculatedRecipe: true,
    recipesLoading: false,
    recipes: [],
    ...over,
  });

describe('resolveHomeSaveState — the plan rule, honestly', () => {
  it('Demo cannot save: the section renders nothing (accepted rule — saving blocked)', () => {
    expect(ok({ caps: DEMO }).kind).toBe('hidden');
    // and it stays hidden regardless of everything else being ready
    expect(ok({ caps: DEMO, recipes: [recipe()] }).kind).toBe('hidden');
  });

  it('Home with no saved recipe yet → the create affordance (THE repaired path)', () => {
    expect(ok().kind).toBe('create');
  });

  it('Home at its ONE-recipe limit → save a new VERSION of that recipe, never a dead end', () => {
    const state = ok({ recipes: [recipe({ latestVersionNumber: 3 })] });
    expect(state).toEqual({
      kind: 'version',
      recipeId: 'r1',
      title: 'Gelato waniliowe',
      nextVersion: 4,
    });
  });

  it('Home versions into the MOST RECENTLY updated recipe when several exist', () => {
    const state = ok({
      recipes: [
        recipe({ recipeId: 'old', updatedAt: '2026-07-01T10:00:00.000Z' }),
        recipe({ recipeId: 'new', title: 'Nowsza', updatedAt: '2026-07-20T10:00:00.000Z' }),
      ],
    });
    expect(state.kind === 'version' && state.recipeId).toBe('new');
  });

  it('archived recipes never count toward the Home limit (create stays available)', () => {
    expect(ok({ recipes: [recipe({ archived: true })] }).kind).toBe('create');
    expect(activeRecipes([recipe(), recipe({ recipeId: 'r2', archived: true })])).toHaveLength(1);
  });

  it('Pro is unlimited — always the create affordance', () => {
    expect(ok({ caps: PRO, recipes: [recipe(), recipe({ recipeId: 'r2' }), recipe({ recipeId: 'r3' })] }).kind).toBe('create');
  });

  it('honest blocked states — never a save button that cannot work', () => {
    expect(ok({ authed: false }).kind).toBe('signin');
    expect(ok({ repositoryAvailable: false }).kind).toBe('unavailable');
    expect(ok({ hasCalculatedRecipe: false }).kind).toBe('not_calculated');
    expect(ok({ recipesLoading: true }).kind).toBe('loading');
    expect(ok({ recipes: null }).kind).toBe('loading');
  });

  it('the checks are ordered so the most actionable honest state wins', () => {
    // signed out AND no backend → sign in first (the user can act on it)
    expect(ok({ authed: false, repositoryAvailable: false }).kind).toBe('signin');
    // a structure-only preview is never presented as savable, even with a backend + session
    expect(ok({ hasCalculatedRecipe: false, recipes: [recipe()] }).kind).toBe('not_calculated');
  });

  it('a limit with no recipe to version reports the CANONICAL reason (defensive)', () => {
    const caps: RecipeCapabilities = { ...HOME, maxSavedRecipes: 0 };
    const state = resolveHomeSaveState({
      caps,
      authed: true,
      repositoryAvailable: true,
      hasCalculatedRecipe: true,
      recipesLoading: false,
      recipes: [],
    });
    expect(state.kind).toBe('blocked');
    expect(state.kind === 'blocked' && state.reason).toContain('limit');
  });

  it('reads the SAME canonical capability the shell gates everything else on', () => {
    expect(customerShellAccessFor('home').save.maxSavedRecipes).toBe(HOME_MAX_SAVED_RECIPES);
    expect(customerShellAccessFor('demo').save.canSaveRecipe).toBe(false);
    expect(customerShellAccessFor('pro').save.maxSavedRecipes).toBeNull();
  });
});

/* ------------------------------------------------------------------------- *
 * Integration: the decision drives the REAL canonical repository port.       *
 * ------------------------------------------------------------------------- */

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const NOW = '2026-07-26T10:00:00.000Z';
const input = (batch: number): RecipeInput =>
  ({
    items: [{ id: 'a', ingredient: { name: 'Mleko 3,5%' }, planned_grams: batch * 0.6 }, { id: 'b', ingredient: { name: 'Cukier' }, planned_grams: batch * 0.4 }],
    mode: 'gelato',
    category: 'gelato',
    target_temperature_c: -11,
    target_batch_grams: batch,
    machine_capacity_grams: null,
  }) as unknown as RecipeInput;

const listFor = async (repo: RecipesRepository, owner: string): Promise<HomeSaveRecipe[]> =>
  (await repo.listRecipes(owner, { includeArchived: true })).map((r) => ({
    recipeId: r.recipeId,
    title: r.title,
    latestVersionNumber: r.latestVersionNumber,
    archived: r.archived,
    updatedAt: r.updatedAt,
  }));

describe('Home save end-to-end through the canonical repository', () => {
  let repo: RecipesRepository;
  beforeEach(() => {
    let k = 0;
    repo = inMemoryRecipesRepository(new InMemoryRecipes(() => NOW, () => `rc-${(k += 1)}`));
  });

  const state = async (owner = 'home-user') =>
    resolveHomeSaveState({
      caps: HOME,
      authed: true,
      repositoryAvailable: true,
      hasCalculatedRecipe: true,
      recipesLoading: false,
      recipes: await listFor(repo, owner),
    });

  it('a Home customer saves their FIRST recipe: aggregate + immutable v1', async () => {
    expect((await state()).kind).toBe('create');

    const { recipe: saved, version } = await repo.createRecipe({
      ownerUserId: 'home-user',
      title: 'Gelato waniliowe',
      recipeInput: input(1000),
      trace: TRACE,
      by: 'home-user',
      capabilities: HOME,
    });
    expect(version.versionNumber).toBe(1);
    expect(saved.title).toBe('Gelato waniliowe');
    expect((await listFor(repo, 'home-user'))).toHaveLength(1);
  });

  it('at the limit the offered VERSION save really appends v2 to the same recipe', async () => {
    await repo.createRecipe({ ownerUserId: 'home-user', title: 'Gelato waniliowe', recipeInput: input(1000), trace: TRACE, by: 'home-user', capabilities: HOME });

    const next = await state();
    expect(next.kind).toBe('version');
    if (next.kind !== 'version') throw new Error('expected the version affordance');
    expect(next.nextVersion).toBe(2);

    const v2 = await repo.saveNewVersion(next.recipeId, input(1500), TRACE, 'home-user', { note: 'większa porcja' });
    expect(v2.versionNumber).toBe(2);

    // ONE aggregate, TWO versions — the canonical Home rule, intact.
    expect(await listFor(repo, 'home-user')).toHaveLength(1);
    expect(await repo.getVersions(next.recipeId)).toHaveLength(2);
    // The offered affordance stays a version save (never a second recipe).
    expect((await state()).kind).toBe('version');
  });

  it('a SECOND separate Home aggregate is refused by the canonical gate (honest reason)', async () => {
    await repo.createRecipe({ ownerUserId: 'home-user', title: 'Gelato waniliowe', recipeInput: input(1000), trace: TRACE, by: 'home-user', capabilities: HOME });
    await expect(
      repo.createRecipe({ ownerUserId: 'home-user', title: 'Sorbet', recipeInput: input(800), trace: TRACE, by: 'home-user', capabilities: HOME }),
    ).rejects.toThrow(/limit/i);
    expect(await listFor(repo, 'home-user')).toHaveLength(1);
  });

  it('Pro keeps saving separate recipes (the repair never narrows Pro)', async () => {
    await repo.createRecipe({ ownerUserId: 'pro-user', title: 'A', recipeInput: input(1000), trace: TRACE, by: 'pro-user', capabilities: PRO });
    await repo.createRecipe({ ownerUserId: 'pro-user', title: 'B', recipeInput: input(1000), trace: TRACE, by: 'pro-user', capabilities: PRO });
    expect(await listFor(repo, 'pro-user')).toHaveLength(2);
    expect(
      resolveHomeSaveState({
        caps: PRO,
        authed: true,
        repositoryAvailable: true,
        hasCalculatedRecipe: true,
        recipesLoading: false,
        recipes: await listFor(repo, 'pro-user'),
      }).kind,
    ).toBe('create');
  });

  it('Demo is refused by the repository too — the UI gate is not the only guard', async () => {
    await expect(
      repo.createRecipe({ ownerUserId: 'demo-user', title: 'X', recipeInput: input(1000), trace: TRACE, by: 'demo-user', capabilities: DEMO }),
    ).rejects.toThrow();
    expect(await listFor(repo, 'demo-user')).toHaveLength(0);
  });
});
