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
 *   • FIRST SAVE IS TRANSACTIONAL when the DB provides it: `createRecipe` prefers the
 *     `create_recipe_with_v1` RPC (migration 0036, SECURITY INVOKER — RLS still applies), where the
 *     three inserts are ONE database transaction. When the function is absent (PGRST202/42883) the
 *     adapter uses the original sequential path with a best-effort compensating delete — explicitly
 *     documented as NON-transactional (a crash between insert and compensation can orphan a row).
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
  buildRefreshedRecipeBehaviorWorkingCopy,
  productBehaviorSnapshotFingerprint,
} from '@/features/product-intelligence';
import {
  readRecipeCompositionMetadata,
  type RecipeCompositionMetadata,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  buildRecipeVersion,
  canCreateNewRecipe,
  compareVersions,
} from '@/features/pro-core/recipeVersioning';
import type {
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionSource,
  SavedRecipe,
} from '@/features/pro-core/recipeContracts';
import {
  readSavedRecipeMetadata,
  savedRecipeColumnsFromInput,
} from '@/features/recipes/savedRecipeMetadata';
import { recipeVersionBehaviorGate } from '@/features/product-intelligence';
import { validateRecipeBehaviorOnServer } from '@/services/productIntelligence';
import type { CreateRecipeArgs, RecipesRepository, SaveVersionOpts } from './recipesRepository';

const SAVED_RECIPES = 'saved_recipes';
const SAVED_RECIPE_META = 'saved_recipe_meta';
const RECIPE_VERSIONS = 'recipe_versions';

type RefreshWorkingCopy = typeof buildRefreshedRecipeBehaviorWorkingCopy;
type ValidateBehavior = typeof validateRecipeBehaviorOnServer;

export interface SupabaseRecipesDependencies {
  refreshWorkingCopy?: RefreshWorkingCopy;
  validateBehavior?: ValidateBehavior;
}

/* ── row shapes (map 1:1 to the migration-0027 columns; invent no columns) ── */

interface SavedRecipeRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  recipe_input: unknown;
  product_composition: unknown | null;
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
  product_composition: unknown | null;
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
  product_composition: RecipeCompositionMetadata | null;
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

/** A Postgres unique-constraint violation (two concurrent version writers claimed the same
 * (recipe_id, version_number)). Detected by SQLSTATE 23505 or the message, so the caller can
 * safely recompute the next number and retry — numbering stays gap-free and duplicate-free. */
function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const m = (error.message ?? '').toLowerCase();
  return (
    m.includes('duplicate key') || m.includes('unique constraint') || m.includes('already exists')
  );
}

/** The transactional first-save RPC (migration 0036) is not present in this database —
 * PostgREST PGRST202 (schema cache: function not found) or Postgres 42883 (undefined_function).
 * ONLY this condition activates the documented non-transactional fallback; any other error is a
 * real failure of the atomic save and is surfaced honestly, never retried down a weaker path. */
function isFunctionMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  const m = (error.message ?? '').toLowerCase();
  return m.includes('could not find the function') || m.includes('does not exist');
}

/** jsonb payload returned by public.create_recipe_with_v1 (migration 0036). */
interface CreateRecipeRpcResult {
  recipe: SavedRecipeRow;
  meta: SavedRecipeMetaRow;
  version: RecipeVersionRow;
}

function tempFromInput(input: unknown): number | null {
  const t = (input as { target_temperature_c?: unknown } | null | undefined)?.target_temperature_c;
  return typeof t === 'number' ? t : null;
}

function batchFromInput(input: RecipeInput): number {
  const b = (input as unknown as { target_batch_grams?: unknown }).target_batch_grams;
  return typeof b === 'number' ? Math.round(b) : 0;
}

/**
 * The identity a version snapshot must carry so it can be read back WITHOUT the current defaults
 * (owner contract v1.4 §4). Both were written as NULL before: `buildRecipeVersion` defaults
 * `productProfile` to null and no caller ever supplied it, so every `recipe_versions.product_profile`
 * on staging is NULL and the library had nothing but the `saved_recipes` column — which the
 * canonical path also never wrote. Derived here from the persisted input, one authority for both.
 */
function versionIdentityFromInput(input: RecipeInput): {
  productProfile: string | null;
  temperatureC: number | null;
} {
  const metadata = readSavedRecipeMetadata(input);
  return {
    productProfile: metadata.productType,
    temperatureC: metadata.temperatureC ?? tempFromInput(input),
  };
}

function rowToVersion(row: RecipeVersionRow): RecipeVersion {
  return {
    versionId: row.id,
    recipeId: row.recipe_id,
    ownerUserId: row.owner_user_id,
    versionNumber: row.version_number,
    recipeInput: row.recipe_input as RecipeInput,
    productComposition: readRecipeCompositionMetadata(
      row.product_composition,
      (row.recipe_input as RecipeInput).items.map((item) => item.id),
      (row.recipe_input as RecipeInput).items
        .filter((item) => item.lock_type === 'main')
        .map((item) => item.id),
    ),
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
    product_composition: version.productComposition,
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
  /**
   * True once this database has proven it lacks the migration-0036 RPC (function-not-found).
   * Memoized per adapter instance so we probe at most once per session — after that, the
   * documented non-transactional path is used without an extra failing round-trip.
   */
  private rpcFirstSaveUnavailable = false;

  /** Same memoization for the migration-20260823 atomic append RPC (see `tryAppendVersionRpc`). */
  private rpcAppendVersionUnavailable = false;

  constructor(
    private readonly client: SupabaseClient,
    private readonly dependencies: SupabaseRecipesDependencies = {},
  ) {}

  /**
   * TRANSACTIONAL version append via public.append_recipe_version_v1 (migration 20260823103000).
   *
   * Before v1.4 an append was three client round-trips — read history, INSERT the version, then two
   * UPDATEs advancing `saved_recipes` + `saved_recipe_meta` — with no transaction around them. Two
   * failure modes followed from that: a crash between the insert and the advance left the immutable
   * history ahead of the aggregate the library reads (a saved version the library never showed),
   * and two concurrent writers could both read the same max and race for `vN` (survivable only
   * because of the UNIQUE retry below). The RPC locks the parent row, derives the next number
   * server-side, and writes version + aggregate in ONE transaction, so neither is reachable.
   *
   * Returns null ONLY when this database does not have the function (PGRST202/42883), which
   * activates the documented non-atomic fallback. Any other error is a real failed save and throws.
   */
  private async tryAppendVersionRpc(args: {
    recipeId: string;
    recipeInput: RecipeInput;
    productComposition: RecipeCompositionMetadata | null;
    trace: { engineVersion: string; configVersion: string; mapperDatasetVersion?: string | null };
    source: RecipeVersionSource;
    note: string | null;
    restoredFromVersion: number | null;
  }): Promise<RecipeVersion | null> {
    if (this.rpcAppendVersionUnavailable) return null;
    const rpc = (this.client as { rpc?: unknown }).rpc;
    if (typeof rpc !== 'function') {
      this.rpcAppendVersionUnavailable = true;
      return null;
    }
    const identity = versionIdentityFromInput(args.recipeInput);
    const columns = savedRecipeColumnsFromInput(args.recipeInput);
    const { data, error } = (await this.client.rpc('append_recipe_version_v1', {
      p_recipe_id: args.recipeId,
      p_recipe_input: args.recipeInput,
      p_product_composition: args.productComposition,
      p_total_batch_g:
        (args.recipeInput as unknown as { target_batch_grams?: number }).target_batch_grams ?? 0,
      p_batch_grams: batchFromInput(args.recipeInput),
      p_product_profile: identity.productProfile,
      p_temperature_c: identity.temperatureC,
      p_engine_version: args.trace.engineVersion,
      p_config_version: args.trace.configVersion,
      p_mapper_dataset_version: args.trace.mapperDatasetVersion ?? null,
      p_source: args.source,
      p_note: args.note,
      p_restored_from_version: args.restoredFromVersion,
      p_serving_profile: columns.serving_profile,
      p_active_engine_label: columns.active_engine_label,
    })) as { data: RecipeVersionRow | null; error: { code?: string; message?: string } | null };
    if (error) {
      if (isFunctionMissing(error)) {
        this.rpcAppendVersionUnavailable = true;
        console.warn(
          '[GELLATTI] supabaseRecipes.saveNewVersion: RPC append_recipe_version_v1 is missing in ' +
            'this database — using the documented NON-ATOMIC append fallback for the rest of this ' +
            'session. Apply migration 20260823103000 to restore the atomic path.',
        );
        return null;
      }
      throw new Error(error.message ?? 'atomic version append failed');
    }
    if (!data?.id) throw new Error('atomic version append returned an incomplete payload');
    return rowToVersion(data);
  }

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

  /** The DB-authoritative next version number for a recipe (max existing + 1; 1 when empty). */
  private async nextVersionNumber(recipeId: string): Promise<number> {
    const history = await this.getVersions(recipeId);
    const max = history.reduce((m, v) => (v.versionNumber > m ? v.versionNumber : m), 0);
    return max + 1;
  }

  /**
   * Append a new immutable version with a DB-derived number, retrying if a concurrent writer
   * claimed the number first (UNIQUE(recipe_id, version_number) → 23505). `build` receives the
   * computed next number; on each retry the number is recomputed so numbering is gap-free and
   * never duplicated — two rapid clicks yield vN and vN+1, not two vN.
   */
  private async appendVersionWithRetry(
    recipeId: string,
    build: (nextNumber: number) => RecipeVersion | Promise<RecipeVersion>,
  ): Promise<RecipeVersion> {
    const MAX_ATTEMPTS = 6;
    let lastMessage = 'unknown error';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const next = await this.nextVersionNumber(recipeId);
      const draft = await build(next);
      const { data, error } = await this.client
        .from(RECIPE_VERSIONS)
        .insert(versionToInsert(draft))
        .select()
        .single();
      if (!error) return rowToVersion(data as RecipeVersionRow);
      lastMessage = error.message;
      if (!isUniqueViolation(error)) throw new Error(error.message);
      // A concurrent writer took this version_number — recompute and try the next one.
    }
    throw new Error(`could not append a new recipe version (last error: ${lastMessage})`);
  }

  /** Advance the MUTABLE aggregate to a newly-appended latest version (never touches history). */
  private async advanceAggregate(recipeId: string, version: RecipeVersion): Promise<void> {
    const recipePatch: Record<string, unknown> = {
      recipe_input: version.recipeInput,
      product_composition: version.productComposition,
      batch_grams: Math.round(version.totalBatchG),
      engine_version: version.engineVersion,
      config_version: version.configVersion,
      updated_at: new Date().toISOString(),
      // The denormalized library columns follow the state we just stored. Before v1.4 only
      // `product_type` was patched here and only when non-null (it never was), so `serving_profile`
      // stayed NULL and `active_engine_label` kept migration 0001's `'−11°C Engine'` default on
      // every recipe — including −12°C ones.
      ...savedRecipeColumnsFromInput(version.recipeInput),
    };
    if (version.productProfile != null) recipePatch.product_type = version.productProfile;

    const { error: srErr } = await this.client
      .from(SAVED_RECIPES)
      .update(recipePatch)
      .eq('id', recipeId);
    if (srErr) throw new Error(srErr.message);

    const { error: metaErr } = await this.client
      .from(SAVED_RECIPE_META)
      .update({
        latest_version_number: version.versionNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('recipe_id', recipeId);
    if (metaErr) throw new Error(metaErr.message);
  }

  /**
   * TRANSACTIONAL first save via public.create_recipe_with_v1 (migration 0036): the three inserts
   * (saved_recipes + saved_recipe_meta + recipe_versions v1) run inside ONE database transaction —
   * a failure anywhere rolls everything back server-side; no orphan is possible and no client-side
   * compensation is needed. Returns null ONLY when this database does not have the function yet
   * (PGRST202/42883), which activates the documented non-transactional fallback below. Any other
   * RPC error is a real failed save and is thrown — never silently retried down the weaker path.
   */
  private async tryCreateRecipeRpc(
    args: CreateRecipeArgs,
  ): Promise<{ recipe: SavedRecipe; version: RecipeVersion } | null> {
    if (this.rpcFirstSaveUnavailable) return null;
    // A client without .rpc (e.g. a minimal test fake) cannot use the transactional path.
    const rpc = (this.client as { rpc?: unknown }).rpc;
    if (typeof rpc !== 'function') {
      this.rpcFirstSaveUnavailable = true;
      return null;
    }
    const identity = versionIdentityFromInput(args.recipeInput);
    const columns = savedRecipeColumnsFromInput(args.recipeInput);
    const { data, error } = (await this.client.rpc('create_recipe_with_v1', {
      p_name: args.title,
      p_description: args.notes ?? null,
      p_recipe_input: args.recipeInput,
      p_product_composition: args.productComposition ?? null,
      p_batch_grams: batchFromInput(args.recipeInput),
      p_total_batch_g:
        (args.recipeInput as unknown as { target_batch_grams?: number }).target_batch_grams ?? 0,
      p_engine_version: args.trace.engineVersion,
      p_config_version: args.trace.configVersion,
      p_mapper_dataset_version: args.trace.mapperDatasetVersion ?? null,
      // v1.4: was hardcoded `null`, which is why every saved v1 on staging has a NULL
      // `product_profile` and every library row read TYP „—".
      p_product_profile: identity.productProfile,
      p_temperature_c: identity.temperatureC,
      p_source: args.source ?? 'manual',
      p_note: null,
      p_serving_profile: columns.serving_profile,
      p_active_engine_label: columns.active_engine_label,
    })) as {
      data: CreateRecipeRpcResult | null;
      error: { code?: string; message?: string } | null;
    };
    if (error) {
      if (isFunctionMissing(error)) {
        this.rpcFirstSaveUnavailable = true;
        // State-contract visibility (Agent 5): the weaker path must never engage silently.
        console.warn(
          '[GELLATTI] supabaseRecipes.createRecipe: migration-0036 RPC create_recipe_with_v1 is ' +
            'missing in this database — using the documented NON-TRANSACTIONAL first-save fallback ' +
            'for the rest of this session. Apply migration 0036 to restore the atomic path.',
        );
        return null;
      }
      throw new Error(error.message ?? 'transactional first save failed');
    }
    if (!data?.recipe || !data.meta || !data.version) {
      throw new Error('transactional first save returned an incomplete payload');
    }
    return {
      recipe: hydrateRecipe(data.recipe, data.meta),
      version: rowToVersion(data.version),
    };
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
    const behaviorGate = recipeVersionBehaviorGate(
      args.recipeInput,
      args.productComposition,
      'RECIPE_VERSION',
    );
    if (!behaviorGate.ready)
      throw new Error(behaviorGate.reason ?? 'Product behavior is incomplete.');

    // Preferred: ONE real DB transaction (migration 0036). Falls through ONLY when the function
    // is not present in this database — the legacy compensating path below is the documented,
    // explicitly non-transactional fallback (owner-run SQL closes the gap on staging).
    const transactional = await this.tryCreateRecipeRpc(args);
    if (transactional) return transactional;

    // 1) the mutable recipe row (legacy source of truth) → yields the recipe id.
    const { data: srData, error: srErr } = await this.client
      .from(SAVED_RECIPES)
      .insert({
        user_id: uid,
        name: args.title,
        description: args.notes ?? null,
        recipe_input: args.recipeInput,
        product_composition: args.productComposition ?? null,
        engine_version: args.trace.engineVersion,
        config_version: args.trace.configVersion,
        batch_grams: batchFromInput(args.recipeInput),
        // v1.4: `product_type: null` used to be written literally here.
        ...savedRecipeColumnsFromInput(args.recipeInput),
      })
      .select()
      .single();
    if (srErr) throw new Error(srErr.message);
    const srRow = srData as SavedRecipeRow;

    // ATOMIC first save: if the meta or the v1 insert fails, the aggregate row must NOT survive
    // (no orphan). All three tables cascade on `saved_recipes` delete, so deleting the row we just
    // created rolls the operation back. We then rethrow the ORIGINAL error — never a false "saved".
    try {
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
          productComposition: args.productComposition ?? null,
          trace: args.trace,
          source: args.source ?? 'manual',
          createdBy: args.by,
          createdAt: new Date().toISOString(),
          ...versionIdentityFromInput(args.recipeInput),
        },
        '',
      );
      const version = await this.insertVersion(draft);

      return { recipe: hydrateRecipe(srRow, metaRow), version };
    } catch (caught) {
      // Compensate: remove the just-created aggregate (cascades meta + any version) so no partial
      // recipe remains. Best-effort — the surfaced error is always the real cause of the failure.
      await this.client.from(SAVED_RECIPES).delete().eq('id', srRow.id);
      throw caught instanceof Error ? caught : new Error(String(caught));
    }
  }

  async saveNewVersion(
    recipeId: string,
    recipeInput: RecipeInput,
    trace: { engineVersion: string; configVersion: string; mapperDatasetVersion?: string | null },
    by: string,
    opts: SaveVersionOpts = {},
    productComposition: RecipeCompositionMetadata | null = null,
  ): Promise<RecipeVersion> {
    await this.requireUserId();
    const behaviorGate = recipeVersionBehaviorGate(
      recipeInput,
      productComposition,
      'RECIPE_VERSION',
    );
    if (!behaviorGate.ready)
      throw new Error(behaviorGate.reason ?? 'Product behavior is incomplete.');
    // Preferred: ONE database transaction (version + aggregate advance together).
    const atomic = await this.tryAppendVersionRpc({
      recipeId,
      recipeInput,
      productComposition,
      trace,
      source: opts.source ?? 'manual',
      note: opts.note ?? null,
      restoredFromVersion: null,
    });
    if (atomic) return atomic;

    const meta = await this.fetchMeta(recipeId);
    if (!meta) throw new Error(`unknown recipe ${recipeId}`);

    // DB-derived, concurrency-safe version number (never local + 1). Two rapid clicks → vN, vN+1.
    const version = await this.appendVersionWithRetry(recipeId, (nextNumber) =>
      buildRecipeVersion(
        {
          recipeId,
          ownerUserId: meta.owner_user_id,
          versionNumber: nextNumber,
          recipeInput,
          productComposition,
          trace,
          source: opts.source ?? 'manual',
          createdBy: by,
          createdAt: new Date().toISOString(),
          note: opts.note ?? null,
          ...versionIdentityFromInput(recipeInput),
        },
        '',
      ),
    );
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
    const accountId = await this.requireUserId();
    const meta = await this.fetchMeta(recipeId);
    if (!meta) throw new Error(`unknown recipe ${recipeId}`);

    // Restore = a NEW version derived from the target snapshot. History is read, never rewritten.
    // The gates below run against the TARGET snapshot and are independent of the new version's
    // number, so they are proven once, before the append.
    const guardRestoredTarget = async (): Promise<{
      source: RecipeVersion;
      recipeInput: RecipeInput;
      productComposition: RecipeCompositionMetadata;
      note: string | null;
    }> => {
      const history = await this.getVersions(recipeId);
      const target = history.find((candidate) => candidate.versionNumber === targetVersionNumber);
      if (!target) throw new Error(`version ${targetVersionNumber} does not exist`);
      const toppings = target.productComposition?.toppings ?? [];
      const snapshots = target.productComposition?.behaviorSnapshots ?? {};
      const behaviorGate = recipeVersionBehaviorGate(
        target.recipeInput,
        target.productComposition,
        'RESTORE',
      );
      const validateBehavior = this.dependencies.validateBehavior ?? validateRecipeBehaviorOnServer;
      const serverGate = behaviorGate.ready
        ? await validateBehavior({
            recipe: target.recipeInput,
            toppings,
            snapshots,
            module: 'RESTORE',
            accountId,
            technicalOnlyMainLineIds:
              target.productComposition?.ownerReviewGate?.technicalOnlyMainLineIds,
            client: this.client,
          })
        : null;
      if (behaviorGate.ready && serverGate?.ready) {
        return {
          source: target,
          recipeInput: target.recipeInput,
          productComposition: target.productComposition ?? {
            schemaVersion: 1,
            baseScope: 'BASE_FORMULATION',
            baseOrder: target.recipeInput.items.map((item) => item.id),
            toppings: [],
            behaviorSnapshots: {},
            migrationAmbiguities: [],
          },
          note: null,
        };
      }

      // A stale historical snapshot is never promoted as current. Build a
      // current-authority copy and append that copy as a NEW restored version;
      // the selected historical row remains byte-for-byte immutable.
      const refreshWorkingCopy =
        this.dependencies.refreshWorkingCopy ?? buildRefreshedRecipeBehaviorWorkingCopy;
      const refreshed = await refreshWorkingCopy({
        recipe: target.recipeInput,
        toppings,
        snapshots,
        accountId,
        technicalOnlyMainLineIds:
          target.productComposition?.ownerReviewGate?.technicalOnlyMainLineIds,
      });
      if (!refreshed.ok) {
        const names = [...new Set(refreshed.issues.map((issue) => issue.lineName))].join(', ');
        throw new Error(
          names
            ? `Nie można odświeżyć danych produktów: ${names}.`
            : 'Nie można odświeżyć danych produktów dla tej wersji receptury.',
        );
      }
      const productComposition: RecipeCompositionMetadata = {
        schemaVersion: 1,
        baseScope: target.productComposition?.baseScope ?? 'BASE_FORMULATION',
        baseOrder:
          target.productComposition?.baseOrder ?? target.recipeInput.items.map((item) => item.id),
        toppings: structuredClone(toppings),
        behaviorSnapshots: structuredClone(refreshed.snapshots),
        ...(target.productComposition?.ownerReviewGate
          ? { ownerReviewGate: structuredClone(target.productComposition.ownerReviewGate) }
          : {}),
        migrationAmbiguities: structuredClone(
          target.productComposition?.migrationAmbiguities ?? [],
        ),
      };
      const refreshedLocalGate = recipeVersionBehaviorGate(
        refreshed.recipe,
        productComposition,
        'RESTORE',
      );
      if (!refreshedLocalGate.ready) {
        throw new Error('Odświeżona wersja nie przeszła lokalnej walidacji danych produktów.');
      }
      const refreshedServerGate = await validateBehavior({
        recipe: refreshed.recipe,
        toppings,
        snapshots: refreshed.snapshots,
        module: 'RESTORE',
        accountId,
        technicalOnlyMainLineIds:
          target.productComposition?.ownerReviewGate?.technicalOnlyMainLineIds,
        client: this.client,
      });
      if (!refreshedServerGate.ready) {
        const names = [
          ...new Set(
            refreshedServerGate.staleLineIds.map(
              (lineId) =>
                refreshed.recipe.items.find((item) => item.id === lineId)?.ingredient.name ??
                toppings.find((item) => item.id === lineId)?.ingredient.name ??
                'produkt',
            ),
          ),
        ].join(', ');
        throw new Error(
          names
            ? `Odświeżone dane produktów nadal wymagają uwagi: ${names}.`
            : 'Odświeżone dane produktów nadal wymagają uwagi.',
        );
      }
      return {
        source: target,
        recipeInput: refreshed.recipe,
        productComposition,
        note: `PB_SNAPSHOT_REFRESH_RESTORE:${target.versionId}:${productBehaviorSnapshotFingerprint(
          refreshed.snapshots,
        )}`,
      };
    };

    const target = await guardRestoredTarget();

    // Preferred: ONE database transaction. The restored snapshot becomes a NEW latest version —
    // v1/v2/v3 stay exactly as written, and the number is derived under the parent row lock.
    const atomic = await this.tryAppendVersionRpc({
      recipeId,
      recipeInput: target.recipeInput,
      productComposition: target.productComposition,
      trace: {
        engineVersion: target.source.engineVersion,
        configVersion: target.source.configVersion,
        mapperDatasetVersion: target.source.mapperDatasetVersion,
      },
      source: 'restored',
      note: target.note,
      restoredFromVersion: targetVersionNumber,
    });
    if (atomic) return atomic;

    const version = await this.appendVersionWithRetry(recipeId, async () => {
      const history = await this.getVersions(recipeId);
      const versionNumber =
        history.reduce((max, candidate) => Math.max(max, candidate.versionNumber), 0) + 1;
      return buildRecipeVersion(
        {
          recipeId,
          ownerUserId: target.source.ownerUserId,
          versionNumber,
          recipeInput: target.recipeInput,
          productComposition: target.productComposition,
          trace: {
            engineVersion: target.source.engineVersion,
            configVersion: target.source.configVersion,
            mapperDatasetVersion: target.source.mapperDatasetVersion,
          },
          source: 'restored',
          createdBy: by,
          createdAt: new Date().toISOString(),
          restoredFromVersion: targetVersionNumber,
          note: target.note,
          ...versionIdentityFromInput(target.recipeInput),
        },
        '',
      );
    });
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
    let query = this.client.from(SAVED_RECIPE_META).select('*').eq('owner_user_id', ownerUserId);
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

export function supabaseRecipesRepository(
  client: SupabaseClient,
  dependencies: SupabaseRecipesDependencies = {},
): RecipesRepository {
  const svc = new SupabaseRecipes(client, dependencies);
  return {
    createRecipe: (args) => svc.createRecipe(args),
    saveNewVersion: (recipeId, recipeInput, trace, by, opts, productComposition) =>
      svc.saveNewVersion(recipeId, recipeInput, trace, by, opts, productComposition ?? null),
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
