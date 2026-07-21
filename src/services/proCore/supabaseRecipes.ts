/**
 * PINGÜINO PRO CORE — Supabase adapter for the RecipesRepository port (Track A).
 *
 * The staging/prod implementation of `RecipesRepository`, backed by migration 0027:
 *   • public.saved_recipes      — the mutable recipe row (legacy source of truth, migration 0001);
 *   • public.saved_recipe_meta  — 1:1 aggregate extension (archive flag + latest-version pointer);
 *   • public.recipe_versions    — the APPEND-ONLY immutable edit history (SELECT + INSERT only).
 *
 * HONEST rules, enforced here and by the DB:
 *   • Every query is RLS-scoped to the signed-in user (`auth.uid() = owner_user_id` / `user_id`);
 *     on INSERT the owner id is read from `supabase.auth.getUser()` — never trusted from the caller.
 *   • IMMUTABILITY: a version snapshot, once written, is NEVER updated or deleted. Editing appends a
 *     new version; "restore" appends a NEW latest version derived from an old snapshot (history is
 *     preserved). The DB grants only SELECT+INSERT on recipe_versions, so a bug cannot rewrite it.
 *   • HONEST FAILURE: any Supabase error is thrown as an Error the caller surfaces — this adapter
 *     NEVER resolves a failed write as success, and never returns a false "saved".
 *
 * The SupabaseClient is injected (constructor/factory param) so a fake client unit-tests the adapter
 * with no live DB. Mirrors the existing service style (src/services/recipes.ts,
 * src/services/acceptedCorrections.ts): `.from(table)`, owner-scoped `.eq(...)`, typed results,
 * throw on DB error — never swallow.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { RecipeInput } from '@/engine';
import {
  buildRecipeVersion,
  canCreateNewRecipe,
  compareVersions,
  restoreVersion,
} from '@/features/pro-core/recipeVersioning';
import type {
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionSource,
  SavedRecipe,
} from '@/features/pro-core/recipeContracts';
import type {
  CreateRecipeArgs,
  RecipesRepository,
  SaveVersionOpts,
} from './recipesRepository';

const SAVED_RECIPES = 'saved_recipes';
const SAVED_RECIPE_META = 'saved_recipe_meta';
const RECIPE_VERSIONS = 'recipe_versions';

/* ── row shapes (map 1:1 to the migration-0027 columns; invent no columns) ── */

interface SavedRecipeRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  recipe_input: unknown;
  product_type: string | null;
  serving_profile: string | null;
  engine_version: string;
  config_version: string;
  batch_grams: number;
  created_at: string;
  updated_at: string;
}

interface SavedRecipeMetaRow {
  recipe_id: string;
  owner_user_id: string;
  workspace_id: string | null;
  archived: boolean;
  latest_version_number: number;
  created_at: string;
  updated_at: string;
}

interface RecipeVersionRow {
  id: string;
  recipe_id: string;
  owner_user_id: string;
  version_number: number;
  recipe_input: unknown;
  total_batch_g: number | string;
  product_profile: string | null;
  temperature_c: number | string | null;
  engine_version: string;
  config_version: string;
  mapper_dataset_version: string | null;
  source: string;
  created_by: string;
  created_at: string;
  restored_from_version: number | null;
  note: string | null;
}

/** The append-only INSERT payload for a version — `id`/`created_at` are DB defaults, never sent. */
interface RecipeVersionInsert {
  recipe_id: string;
  owner_user_id: string;
  version_number: number;
  recipe_input: RecipeInput;
  total_batch_g: number;
  product_profile: string | null;
  temperature_c: number | null;
  engine_version: string;
  config_version: string;
  mapper_dataset_version: string | null;
  source: RecipeVersionSource;
  created_by: string;
  restored_from_version: number | null;
  note: string | null;
}

/* ── pure mappers (DB row ↔ domain type) ── */

function num(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function tempFromInput(input: unknown): number | null {
  const t = (input as { target_temperature_c?: unknown } | null | undefined)?.target_temperature_c;
  return typeof t === 'number' ? t : null;
}

function batchFromInput(input: RecipeInput): number {
  const b = (input as unknown as { target_batch_grams?: unknown }).target_batch_grams;
  return typeof b === 'number' ? Math.round(b) : 0;
}

function rowToVersion(row: RecipeVersionRow): RecipeVersion {
  return {
    versionId: row.id,
    recipeId: row.recipe_id,
    ownerUserId: row.owner_user_id,
    versionNumber: row.version_number,
    recipeInput: row.recipe_input as RecipeInput,
    totalBatchG: num(row.total_batch_g),
    productProfile: row.product_profile ?? null,
    temperatureC: row.temperature_c == null ? null : num(row.temperature_c),
    engineVersion: row.engine_version,
    configVersion: row.config_version,
    mapperDatasetVersion: row.mapper_dataset_version ?? null,
    source: row.source as RecipeVersionSource,
    createdBy: row.created_by,
    createdAt: row.created_at,
    restoredFromVersion: row.restored_from_version ?? null,
    note: row.note ?? null,
  };
}

function versionToInsert(version: RecipeVersion): RecipeVersionInsert {
  return {
    recipe_id: version.recipeId,
    owner_user_id: version.ownerUserId,
    version_number: version.versionNumber,
    recipe_input: version.recipeInput,
    total_batch_g: version.totalBatchG,
    product_profile: version.productProfile,
    temperature_c: version.temperatureC,
    engine_version: version.engineVersion,
    config_version: version.configVersion,
    mapper_dataset_version: version.mapperDatasetVersion,
    source: version.source,
    created_by: version.createdBy,
    restored_from_version: version.restoredFromVersion,
    note: version.note,
  };
}

/** Hydrate the SavedRecipe aggregate by joining a saved_recipes row with its 1:1 meta row. */
function hydrateRecipe(sr: SavedRecipeRow, meta: SavedRecipeMetaRow): SavedRecipe {
  return {
    recipeId: sr.id,
    ownerUserId: meta.owner_user_id,
    workspaceId: meta.workspace_id ?? null,
    title: sr.name,
    notes: sr.description ?? null,
    productProfile: sr.product_type ?? null,
    temperatureC: tempFromInput(sr.recipe_input),
    latestVersionNumber: meta.latest_version_number,
    archived: meta.archived,
    createdAt: sr.created_at,
    updatedAt: sr.updated_at,
    createdBy: meta.owner_user_id,
  };
}

/* ── adapter ── */

export class SupabaseRecipes {
  constructor(private readonly client: SupabaseClient) {}

  /** The signed-in user id — the ONLY authorization key. Never trusted from the caller. */
  private async requireUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error) throw new Error(error.message);
    const id = data?.user?.id;
    if (!id) throw new Error('You must be signed in to save recipes.');
    return id;
  }

  private async fetchMeta(recipeId: string): Promise<SavedRecipeMetaRow | null> {
    const { data, error } = await this.client
      .from(SAVED_RECIPE_META)
      .select('*')
      .eq('recipe_id', recipeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SavedRecipeMetaRow | null) ?? null;
  }

  private async fetchRecipeRow(recipeId: string): Promise<SavedRecipeRow | null> {
    const { data, error } = await this.client
      .from(SAVED_RECIPES)
      .select('*')
      .eq('id', recipeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SavedRecipeRow | null) ?? null;
  }

  /** Insert one append-only version row and return the stored snapshot (authoritative id/created_at). */
  private async insertVersion(version: RecipeVersion): Promise<RecipeVersion> {
    const { data, error } = await this.client
      .from(RECIPE_VERSIONS)
      .insert(versionToInsert(version))
      .select()
      .single();
    if (error) throw new Error(error.message);
    return rowToVersion(data as RecipeVersionRow);
  }

  /** Advance the MUTABLE aggregate to a newly-appended latest version (never touches history). */
  private async advanceAggregate(recipeId: string, version: RecipeVersion): Promise<void> {
    const recipePatch: Record<string, unknown> = {
      recipe_input: version.recipeInput,
      batch_grams: Math.round(version.totalBatchG),
      engine_version: version.engineVersion,
      config_version: version.configVersion,
      updated_at: new Date().toISOString(),
    };
    if (version.productProfile != null) recipePatch.product_type = version.productProfile;

    const { error: srErr } = await this.client
      .from(SAVED_RECIPES)
      .update(recipePatch)
      .eq('id', recipeId);
    if (srErr) throw new Error(srErr.message);

    const { error: metaErr } = await this.client
      .from(SAVED_RECIPE_META)
      .update({ latest_version_number: version.versionNumber, updated_at: new Date().toISOString() })
      .eq('recipe_id', recipeId);
    if (metaErr) throw new Error(metaErr.message);
  }

  async createRecipe(
    args: CreateRecipeArgs,
  ): Promise<{ recipe: SavedRecipe; version: RecipeVersion }> {
    const uid = await this.requireUserId();

    // Capability gate — count active recipe aggregates owned by this user (versions never count).
    const { data: metas, error: countErr } = await this.client
      .from(SAVED_RECIPE_META)
      .select('recipe_id')
      .eq('owner_user_id', uid)
      .eq('archived', false);
    if (countErr) throw new Error(countErr.message);
    const gate = canCreateNewRecipe((metas ?? []).length, args.capabilities);
    if (!gate.allowed) throw new Error(gate.reason);
    if (!args.capabilities.canViewExactGrams) {
      throw new Error('This plan cannot save exact-grams recipes.');
    }

    // 1) the mutable recipe row (legacy source of truth) → yields the recipe id.
    const { data: srData, error: srErr } = await this.client
      .from(SAVED_RECIPES)
      .insert({
        user_id: uid,
        name: args.title,
        description: args.notes ?? null,
        recipe_input: args.recipeInput,
        product_type: null,
        engine_version: args.trace.engineVersion,
        config_version: args.trace.configVersion,
        batch_grams: batchFromInput(args.recipeInput),
      })
      .select()
      .single();
    if (srErr) throw new Error(srErr.message);
    const srRow = srData as SavedRecipeRow;

    // 2) the 1:1 aggregate meta (archive flag + latest pointer).
    const { data: metaData, error: metaErr } = await this.client
      .from(SAVED_RECIPE_META)
      .insert({
        recipe_id: srRow.id,
        owner_user_id: uid,
        workspace_id: null,
        archived: false,
        latest_version_number: 1,
      })
      .select()
      .single();
    if (metaErr) throw new Error(metaErr.message);
    const metaRow = metaData as SavedRecipeMetaRow;

    // 3) the first immutable version.
    const draft = buildRecipeVersion(
      {
        recipeId: srRow.id,
        ownerUserId: uid,
        versionNumber: 1,
        recipeInput: args.recipeInput,
        trace: args.trace,
        source: args.source ?? 'manual',
        createdBy: args.by,
        createdAt: new Date().toISOString(),
      },
      '',
    );
    const version = await this.insertVersion(draft);

    return { recipe: hydrateRecipe(srRow, metaRow), version };
  }

  async saveNewVersion(
    recipeId: string,
    recipeInput: RecipeInput,
    trace: { engineVersion: string; configVersion: string; mapperDatasetVersion?: string | null },
    by: string,
    opts: SaveVersionOpts = {},
  ): Promise<RecipeVersion> {
    await this.requireUserId();
    const meta = await this.fetchMeta(recipeId);
    if (!meta) throw new Error(`unknown recipe ${recipeId}`);

    const draft = buildRecipeVersion(
      {
        recipeId,
        ownerUserId: meta.owner_user_id,
        versionNumber: meta.latest_version_number + 1,
        recipeInput,
        trace,
        source: opts.source ?? 'manual',
        createdBy: by,
        createdAt: new Date().toISOString(),
        note: opts.note ?? null,
      },
      '',
    );
    const version = await this.insertVersion(draft);
    await this.advanceAggregate(recipeId, version);
    return version;
  }

  async renameRecipe(recipeId: string, title: string): Promise<SavedRecipe> {
    const trimmed = title.trim();
    if (trimmed === '') throw new Error('recipe title cannot be empty');
    await this.requireUserId();
    const { data, error } = await this.client
      .from(SAVED_RECIPES)
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', recipeId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`unknown recipe ${recipeId}`);
    const meta = await this.fetchMeta(recipeId);
    if (!meta) throw new Error(`unknown recipe ${recipeId}`);
    return hydrateRecipe(data as SavedRecipeRow, meta);
  }

  async archiveRecipe(recipeId: string, archived: boolean): Promise<SavedRecipe> {
    await this.requireUserId();
    const { data, error } = await this.client
      .from(SAVED_RECIPE_META)
      .update({ archived, updated_at: new Date().toISOString() })
      .eq('recipe_id', recipeId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`unknown recipe ${recipeId}`);
    const sr = await this.fetchRecipeRow(recipeId);
    if (!sr) throw new Error(`unknown recipe ${recipeId}`);
    return hydrateRecipe(sr, data as SavedRecipeMetaRow);
  }

  async restore(
    recipeId: string,
    targetVersionNumber: number,
    by: string,
    caps: { canRestoreRecipeVersion: boolean },
  ): Promise<RecipeVersion> {
    if (!caps.canRestoreRecipeVersion) throw new Error('This plan cannot restore recipe versions.');
    await this.requireUserId();
    const meta = await this.fetchMeta(recipeId);
    if (!meta) throw new Error(`unknown recipe ${recipeId}`);

    // Restore = a NEW version derived from the target snapshot. History is read, never rewritten.
    const history = await this.getVersions(recipeId);
    const draft = restoreVersion(history, targetVersionNumber, by, new Date().toISOString(), '');
    const version = await this.insertVersion(draft);
    await this.advanceAggregate(recipeId, version);
    return version;
  }

  async compare(
    recipeId: string,
    versionA: number,
    versionB: number,
  ): Promise<RecipeVersionComparison> {
    const [a, b] = await Promise.all([
      this.getVersion(recipeId, versionA),
      this.getVersion(recipeId, versionB),
    ]);
    if (!a || !b) throw new Error('version not found for comparison');
    return compareVersions(a, b);
  }

  async listRecipes(
    ownerUserId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<SavedRecipe[]> {
    let query = this.client
      .from(SAVED_RECIPE_META)
      .select('*')
      .eq('owner_user_id', ownerUserId);
    if (!opts.includeArchived) query = query.eq('archived', false);
    const { data: metas, error } = await query;
    if (error) throw new Error(error.message);
    const metaRows = (metas ?? []) as SavedRecipeMetaRow[];
    if (metaRows.length === 0) return [];

    const ids = metaRows.map((m) => m.recipe_id);
    const { data: srs, error: srErr } = await this.client
      .from(SAVED_RECIPES)
      .select('*')
      .in('id', ids);
    if (srErr) throw new Error(srErr.message);
    const byId = new Map((srs ?? []).map((r) => [(r as SavedRecipeRow).id, r as SavedRecipeRow]));

    const recipes: SavedRecipe[] = [];
    for (const meta of metaRows) {
      const sr = byId.get(meta.recipe_id);
      if (sr) recipes.push(hydrateRecipe(sr, meta));
    }
    recipes.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return recipes;
  }

  async getRecipe(recipeId: string): Promise<SavedRecipe | null> {
    const sr = await this.fetchRecipeRow(recipeId);
    if (!sr) return null;
    const meta = await this.fetchMeta(recipeId);
    if (!meta) return null;
    return hydrateRecipe(sr, meta);
  }

  async getVersions(recipeId: string): Promise<readonly RecipeVersion[]> {
    const { data, error } = await this.client
      .from(RECIPE_VERSIONS)
      .select('*')
      .eq('recipe_id', recipeId)
      .order('version_number', { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as RecipeVersionRow[]).map(rowToVersion);
  }

  async getVersion(recipeId: string, versionNumber: number): Promise<RecipeVersion | null> {
    const { data, error } = await this.client
      .from(RECIPE_VERSIONS)
      .select('*')
      .eq('recipe_id', recipeId)
      .eq('version_number', versionNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToVersion(data as RecipeVersionRow) : null;
  }
}

/** Adapt the Supabase-backed store to the async RecipesRepository port (injectable client). */
/**
 * Default backend factory for the selector: the Supabase repository when the client is configured,
 * else undefined (the selector then uses in-memory in DEV or reports unavailable — never a silent
 * fallback). Lives in the services layer so no feature file imports the vendor client directly.
 */
export function supabaseRecipesBackendFactory(): (() => RecipesRepository) | undefined {
  const client = supabase;
  if (!client) return undefined;
  return () => supabaseRecipesRepository(client);
}

export function supabaseRecipesRepository(client: SupabaseClient): RecipesRepository {
  const svc = new SupabaseRecipes(client);
  return {
    createRecipe: (args) => svc.createRecipe(args),
    saveNewVersion: (recipeId, recipeInput, trace, by, opts) =>
      svc.saveNewVersion(recipeId, recipeInput, trace, by, opts),
    renameRecipe: (recipeId, title) => svc.renameRecipe(recipeId, title),
    archiveRecipe: (recipeId, archived) => svc.archiveRecipe(recipeId, archived),
    restore: (recipeId, targetVersionNumber, by, caps) =>
      svc.restore(recipeId, targetVersionNumber, by, caps),
    compare: (recipeId, versionA, versionB) => svc.compare(recipeId, versionA, versionB),
    listRecipes: (ownerUserId, opts) => svc.listRecipes(ownerUserId, opts),
    getRecipe: (recipeId) => svc.getRecipe(recipeId),
    getVersions: (recipeId) => svc.getVersions(recipeId),
    getVersion: (recipeId, versionNumber) => svc.getVersion(recipeId, versionNumber),
  };
}
