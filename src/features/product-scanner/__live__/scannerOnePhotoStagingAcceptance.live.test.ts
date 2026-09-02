import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import {
  readRecipeCompositionMetadata,
  type RecipeCompositionMetadata,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorModuleGate,
  recipeVersionBehaviorGate,
} from '@/features/product-intelligence';
import { productionCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import type { RecipeVersion } from '@/features/pro-core/recipeContracts';
import { supabaseProductionRepository } from '@/services/proCore/supabaseProduction';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const PRODUCT_ID = '363ff5b6-0b7b-41a9-acbb-394daa26b4d2';
const RECIPE_NAME = 'P0 Scanner HARIBO one-photo proof';
const runLive = process.env.SCANNER_STAGING_LIVE === '1';

describe.runIf(runLive)('one-photo Scanner served staging acceptance', () => {
  it('reopens the real recipe and proves Engine, ProductBehavior, Label and cost usability', async () => {
    expect(process.env.SCANNER_STAGING_PROJECT_REF).toBe(STAGING_REF);
    const apiKeys = JSON.parse(
      execFileSync(
        'supabase',
        ['projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ),
    ) as Array<{ name?: string; type?: string; api_key?: string }>;
    const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
    expect(anonKey).toBeTruthy();
    const fixtureSource = readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8');
    const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
    expect(fixturePassword).toBeTruthy();
    const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
      email: 'pro@pro.com',
      password: fixturePassword!,
    });
    expect(signInError).toBeNull();
    expect(signedIn.user).toBeTruthy();

    const { data: recipes, error: recipeError } = await client
      .from('saved_recipes')
      .select('*')
      .eq('name', RECIPE_NAME)
      .order('updated_at', { ascending: false })
      .limit(1);
    expect(recipeError).toBeNull();
    const recipe = recipes?.[0];
    expect(recipe).toBeTruthy();
    const { data: versions, error: versionError } = await client
      .from('recipe_versions')
      .select('*')
      .eq('recipe_id', recipe!.id)
      .order('version_number', { ascending: false })
      .limit(1);
    expect(versionError).toBeNull();
    const version = versions?.[0];
    expect(version).toBeTruthy();

    const input = version!.recipe_input as RecipeInput;
    const composition = readRecipeCompositionMetadata(
      version!.product_composition,
      input.items.map((item) => item.id),
      input.items.filter((item) => item.lock_type === 'main').map((item) => item.id),
    ) as RecipeCompositionMetadata | null;
    expect(composition).not.toBeNull();
    expect(composition!.migrationAmbiguities).toEqual([]);
    const topping = composition!.toppings.find(
      (item) =>
        'catalog_product_id' in item.ingredient && item.ingredient.catalog_product_id === PRODUCT_ID,
    );
    expect(topping).toBeTruthy();
    expect(topping!.planned_grams).toBe(80);
    expect(topping!.ingredient.cost_per_kg).toBe(12.34);
    expect(topping!.ingredient.cost_currency).toBe('EUR');

    const engine = calculateRecipe(input);
    expect(engine.total_batch_g).toBe(input.target_batch_grams);
    expect(engine.items).toHaveLength(input.items.length);
    expect(detectViolations(engine)).toEqual([]);
    const finalProduct = calculateFinalProduct(input, composition!.toppings);
    expect(finalProduct.toppingCount).toBeGreaterThanOrEqual(1);
    expect(finalProduct.toppingMassG).toBeGreaterThanOrEqual(80);
    expect(finalProduct.finalMassG).toBe(engine.total_batch_g + finalProduct.toppingMassG);
    expect(finalProduct.finalLabelNutritionPer100g).not.toBeNull();
    expect(finalProduct.finalItems.some((item) => item.id === topping!.id)).toBe(true);

    const recipeGate = recipeVersionBehaviorGate(input, composition, 'RECIPE_VERSION');
    expect(recipeGate.ready).toBe(true);
    const authority = buildRecipeBehaviorAuthority({
      items: input.items,
      toppings: composition!.toppings,
      snapshots: composition!.behaviorSnapshots ?? {},
    });
    expect(authority.missingLineIds).toEqual([]);
    expect(recipeBehaviorModuleGate(authority, 'PRODUCTION').ready).toBe(true);
    expect(recipeBehaviorModuleGate(authority, 'LABEL').ready).toBe(true);
    expect(recipeBehaviorModuleGate(authority, 'MASTER_LABEL').ready).toBe(true);
    // The recipe was created by the real transactional create_recipe_with_v1
    // RPC, whose server-side write guard calls the private terminal assertion.
    // The assertion itself is deliberately not executable by authenticated
    // clients, so the persisted immutable version is the external proof.
    expect(version!.version_number).toBe(1);

    const { data: pending, error: pendingError } = await client
      .from('customer_added_products')
      .select('status,distinct_customer_count,product_id')
      .eq('product_id', PRODUCT_ID)
      .single();
    expect(pendingError).toBeNull();
    expect(pending).toMatchObject({
      status: 'CANONICALIZED',
      distinct_customer_count: 2,
      product_id: PRODUCT_ID,
    });
    const { data: relation, error: relationError } = await client
      .from('user_product_relations')
      .select('private_price,currency')
      .eq('product_id', PRODUCT_ID)
      .eq('user_id', signedIn.user!.id)
      .single();
    expect(relationError).toBeNull();
    expect(Number(relation!.private_price)).toBe(12.34);
    expect(relation!.currency).toBe('EUR');

    const production = supabaseProductionRepository(client);
    const immutableVersion: RecipeVersion = {
      versionId: version!.id,
      recipeId: version!.recipe_id,
      ownerUserId: version!.owner_user_id,
      versionNumber: version!.version_number,
      recipeInput: input,
      productComposition: composition,
      totalBatchG: Number(version!.total_batch_g),
      productProfile: version!.product_profile,
      temperatureC:
        version!.temperature_c === null ? null : Number(version!.temperature_c),
      engineVersion: version!.engine_version,
      configVersion: version!.config_version,
      mapperDatasetVersion: version!.mapper_dataset_version,
      source: version!.source,
      createdBy: version!.created_by,
      createdAt: version!.created_at,
      restoredFromVersion: version!.restored_from_version,
      note: version!.note,
    };
    const run = await production.startRun({
      ownerUserId: signedIn.user!.id,
      version: immutableVersion,
      target: { kind: 'weight_g', grams: immutableVersion.totalBatchG },
      capabilities: productionCapabilitiesFor('pro'),
      meta: {
        thermalMode: 'COLD_ONLY',
        batchReference: 'SCANNER-HARIBO-ONE-PHOTO',
        notes: 'Autonomous Scanner staging acceptance',
      },
      by: signedIn.user!.id,
    });
    expect(run.status).toBe('in_progress');
    expect(run.recipeVersionId).toBe(version!.id);
    expect(run.plannedItems.some((item) =>
      item.id === topping!.id &&
      item.processScope === 'POST_PROCESS_ADDON' &&
      item.plannedGrams === 80,
    )).toBe(true);
    expect(run.processReadiness === 'READY' || run.processReadiness === 'READY_WITH_INFO').toBe(true);
    await client.auth.signOut();
  }, 60_000);
});
