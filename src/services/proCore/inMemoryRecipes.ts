/**
 * In-memory saved-recipe + version adapter — the deterministic reference implementation of
 * Track A (Saved Recipes + Immutable Versions). Composes the pure `recipeVersioning` domain
 * over an in-memory store with injected clock + id generator. No IO, no live DB.
 *
 * Save is always EXPLICIT (there is no auto-save method). Editing = saveNewVersion. Restoring
 * = a new latest version. Earlier versions are never mutated. Demo (no canViewExactGrams / no
 * canSaveRecipe capability) is refused at the gate — it never receives a save-capable payload.
 */
import type { RecipeInput } from '@/engine';
import {
  buildRecipeVersion,
  canCreateNewRecipe,
  compareVersions,
  nextVersionNumber,
  restoreVersion,
  withLatestVersion,
  type VersionTrace,
} from '@/features/pro-core/recipeVersioning';
import type {
  RecipeCapabilities,
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionSource,
  SavedRecipe,
} from '@/features/pro-core/recipeContracts';

export interface CreateRecipeInput {
  ownerUserId: string;
  title: string;
  notes?: string | null;
  recipeInput: RecipeInput;
  trace: VersionTrace;
  source?: RecipeVersionSource;
  by: string;
  capabilities: RecipeCapabilities;
}

let seq = 0;

export class InMemoryRecipes {
  private readonly recipes = new Map<string, SavedRecipe>();
  private readonly versions = new Map<string, RecipeVersion[]>();

  constructor(
    private readonly now: () => string,
    private readonly nextId: () => string = () => `id-${(seq += 1)}`,
  ) {}

  private ownedActiveCount(ownerUserId: string): number {
    let n = 0;
    for (const r of this.recipes.values()) if (r.ownerUserId === ownerUserId && !r.archived) n += 1;
    return n;
  }

  private require(recipeId: string): SavedRecipe {
    const r = this.recipes.get(recipeId);
    if (!r) throw new Error(`unknown recipe ${recipeId}`);
    return r;
  }

  /** Explicit "Save as new recipe" — refused by the capability gate (Demo / over limit). */
  createRecipe(input: CreateRecipeInput): { recipe: SavedRecipe; version: RecipeVersion } {
    const gate = canCreateNewRecipe(this.ownedActiveCount(input.ownerUserId), input.capabilities);
    if (!gate.allowed) throw new Error(gate.reason);
    if (!input.capabilities.canViewExactGrams) throw new Error('This plan cannot save exact-grams recipes.');
    const now = this.now();
    const recipeId = this.nextId();
    const version = buildRecipeVersion({
      recipeId, ownerUserId: input.ownerUserId, versionNumber: 1,
      recipeInput: input.recipeInput, trace: input.trace, source: input.source ?? 'manual',
      createdBy: input.by, createdAt: now,
    }, this.nextId());
    const recipe: SavedRecipe = {
      recipeId, ownerUserId: input.ownerUserId, workspaceId: null,
      title: input.title, notes: input.notes ?? null,
      productProfile: version.productProfile, temperatureC: version.temperatureC,
      latestVersionNumber: 1, archived: false, createdAt: now, updatedAt: now, createdBy: input.by,
    };
    this.recipes.set(recipeId, recipe);
    this.versions.set(recipeId, [version]);
    return { recipe, version };
  }

  /** Explicit "Save new version" — editing produces a NEW immutable version. */
  saveNewVersion(recipeId: string, recipeInput: RecipeInput, trace: VersionTrace, by: string, opts: { source?: RecipeVersionSource; note?: string } = {}): RecipeVersion {
    const recipe = this.require(recipeId);
    const list = this.versions.get(recipeId) ?? [];
    const version = buildRecipeVersion({
      recipeId, ownerUserId: recipe.ownerUserId, versionNumber: nextVersionNumber(list),
      recipeInput, trace, source: opts.source ?? 'manual', createdBy: by, createdAt: this.now(), note: opts.note ?? null,
    }, this.nextId());
    list.push(version);
    this.versions.set(recipeId, list);
    this.recipes.set(recipeId, withLatestVersion(recipe, version, this.now()));
    return version;
  }

  renameRecipe(recipeId: string, title: string): SavedRecipe {
    const trimmed = title.trim();
    if (trimmed === '') throw new Error('recipe title cannot be empty');
    const recipe = { ...this.require(recipeId), title: trimmed, updatedAt: this.now() };
    this.recipes.set(recipeId, recipe);
    return recipe;
  }

  archiveRecipe(recipeId: string, archived: boolean): SavedRecipe {
    const recipe = { ...this.require(recipeId), archived, updatedAt: this.now() };
    this.recipes.set(recipeId, recipe);
    return recipe;
  }

  /** Restore an earlier version → a NEW latest version (history preserved). */
  restore(recipeId: string, targetVersionNumber: number, by: string, caps: RecipeCapabilities): RecipeVersion {
    if (!caps.canRestoreRecipeVersion) throw new Error('This plan cannot restore recipe versions.');
    const recipe = this.require(recipeId);
    const list = this.versions.get(recipeId) ?? [];
    const version = restoreVersion(list, targetVersionNumber, by, this.now(), this.nextId());
    list.push(version);
    this.versions.set(recipeId, list);
    this.recipes.set(recipeId, withLatestVersion(recipe, version, this.now()));
    return version;
  }

  compare(recipeId: string, versionA: number, versionB: number): RecipeVersionComparison {
    const list = this.versions.get(recipeId) ?? [];
    const a = list.find((v) => v.versionNumber === versionA);
    const b = list.find((v) => v.versionNumber === versionB);
    if (!a || !b) throw new Error('version not found for comparison');
    return compareVersions(a, b);
  }

  /* ── reads (owner-scoped) ── */
  listRecipes(ownerUserId: string, opts: { includeArchived?: boolean } = {}): SavedRecipe[] {
    return [...this.recipes.values()].filter((r) => r.ownerUserId === ownerUserId && (opts.includeArchived || !r.archived));
  }
  getRecipe(recipeId: string): SavedRecipe | null { return this.recipes.get(recipeId) ?? null; }
  getVersions(recipeId: string): readonly RecipeVersion[] { return this.versions.get(recipeId) ?? []; }
  getVersion(recipeId: string, versionNumber: number): RecipeVersion | null {
    return (this.versions.get(recipeId) ?? []).find((v) => v.versionNumber === versionNumber) ?? null;
  }
}
