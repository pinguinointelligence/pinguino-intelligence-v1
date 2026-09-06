import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260827100000_scanner_customer_added_products.sql');
const recipeReadinessMigration = read(
  'supabase/migrations/20260827101000_customer_added_recipe_readiness.sql',
);
const relationRlsMigration = read(
  'supabase/migrations/20260827102000_customer_added_relation_rls_execute.sql',
);
const finalize = read('supabase/functions/product-scan-finalize/index.ts');
const analyze = read('supabase/functions/product-scan-analyze/index.ts');
const rescueRefreshMigration = read(
  'supabase/migrations/20260905190000_customer_product_rescue_refresh.sql',
);
const service = read('src/services/productScanner.ts');
const ui = read('src/features/product-scanner/LiveProductScanner.tsx');

describe('Scanner customer-added product authority', () => {
  it('requires one valid exact EAN and never allocates PM', () => {
    expect(finalize).toContain('normalizeValidatedBarcode');
    expect(finalize).toContain('customer_product_valid_ean_required');
    expect(migration).toContain('unique(normalized_ean)');
    expect(migration).toContain("then 'CA'");
    expect(migration).toContain("v_origin||'-ING-'");
    expect(migration).not.toContain("'PM-ING-'");
  });

  it('aggregates distinct customer accounts without inflating repeat scans', () => {
    expect(migration).toContain('customer_added_product_accounts');
    expect(migration).toContain('primary key(customer_added_product_id,user_id)');
    expect(migration).toContain('on conflict(customer_added_product_id,user_id) do nothing');
    expect(migration).toContain(
      'select count(*) into v_count from public.customer_added_product_accounts',
    );
  });

  it('keeps provisional products visible only to linked accounts and promotes the same UUID', () => {
    expect(migration).toContain("product_kind='customer_provisional'");
    expect(migration).toContain('customer_added_product_accounts linked');
    expect(migration).toContain('v_code:=public.next_product_code()');
    expect(migration).toContain('product_code=v_code');
    expect(migration).toContain("product_kind='commercial_product'");
    expect(migration).toContain("visibility='shared'");
    expect(migration).not.toMatch(/update\s+public\.saved_recipes/i);
  });

  it('accepts an explicit null runtime Mapper identity and refreshes provisional readiness', () => {
    expect(recipeReadinessMigration).toContain(
      "coalesce(v_public_data#>'{productIntelligence,productBehaviorAuthority,runtimeMapperIngredientId}','null'::jsonb)='null'::jsonb",
    );
    expect(recipeReadinessMigration).toContain("product_kind='customer_provisional'");
    expect(recipeReadinessMigration).toMatch(
      /public\.classify_catalog_product_behavior_v2\(\s*v_version_id,'customer-added-runtime-null-v1'\s*\)/,
    );
    expect(recipeReadinessMigration).not.toMatch(/update\s+public\.mapper_basement/i);
  });

  it('retains the established RLS helper grant required to save My Price', () => {
    expect(relationRlsMigration).toContain(
      'grant execute on function public.can_use_product_relation_v1(uuid,uuid)',
    );
    expect(relationRlsMigration).toContain('to authenticated,service_role');
    expect(relationRlsMigration).not.toMatch(/create\s+or\s+replace\s+function/i);
  });

  it('does not expose another account customer-added pending product as an exact match', () => {
    expect(analyze).toContain('actorUserId: string');
    expect(analyze).toContain(".from('customer_added_product_accounts')");
    expect(analyze).toContain(".eq('user_id', actorUserId)");
    expect(analyze).toContain('if (!linked) return null');
    expect(analyze).toContain('exactProductForBarcode(service, barcode, auth.user.id)');
  });

  it('reopens a linked private-not-ready product for rescue instead of stranding it', () => {
    expect(analyze).toContain('shouldContinueRescue');
    expect(analyze).toContain("product.product_kind === 'customer_provisional'");
    expect(analyze).toContain('product.engine_ready !== true');
    expect(analyze.indexOf('shouldContinueRescue')).toBeLessThan(
      analyze.indexOf("if (mode === 'ean_lookup')"),
    );
  });

  it('refreshes the same provisional UUID with a superseding ready profile after rescue', () => {
    expect(rescueRefreshMigration).toContain(
      "'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'",
    );
    expect(rescueRefreshMigration).toContain('insert into public.product_versions');
    expect(rescueRefreshMigration).toContain('supersedes');
    expect(rescueRefreshMigration).toContain('current_version_id=v_version_id');
    expect(rescueRefreshMigration).toMatch(
      /classify_catalog_product_behavior_v2\(\s*v_version_id,'customer-added-rescue-refresh-v1'\s*\)/,
    );
    expect(rescueRefreshMigration).not.toMatch(
      /(?:insert|update|delete|truncate)\s+(?:table\s+)?public\.mapper_basement/i,
    );
    expect(rescueRefreshMigration).not.toMatch(/next_product_code\(\)/);
  });

  it('supersedes a provisional version only when the rescued profile is better (no version churn)', () => {
    const files = readdirSync(resolve(process.cwd(), 'supabase/migrations')).filter((name) =>
      name.endsWith('_customer_product_rescue_refresh_supersede_when_better.sql'),
    );
    expect(files).toHaveLength(1);
    const supersede = read(`supabase/migrations/${files[0]}`);
    expect(supersede).toContain('rescue-refresh: supersede only when better');
    expect(supersede).toContain("v_prior_facts#>>'{productIntelligence,engineUsable}'");
    expect(supersede).toContain("p_product_profile->>'readiness'");
    expect(supersede).toMatch(/v_new_accuracy>v_prior_accuracy\+0\.5/);
    expect(supersede).toContain('if v_improves then');
    // anchored on the refresh insert, never on the create branch (version 1 stays untouched)
    expect(supersede).toContain('provenance,facts_fingerprint,supersedes');
    expect(supersede).not.toMatch(
      /(?:insert|update|delete|truncate)\s+(?:table\s+)?public\.mapper_basement/i,
    );
    expect(supersede).not.toMatch(/next_product_code\(\)/);
  });

  it('publishes the canonical classification inside the customer save (no minute-long pending)', () => {
    const files = readdirSync(resolve(process.cwd(), 'supabase/migrations')).filter((name) =>
      name.endsWith('_customer_product_final_within_save.sql'),
    );
    expect(files).toHaveLength(1);
    const final = read(`supabase/migrations/${files[0]}`);
    // the ONE canonical worker gains an entity filter — no second classifier, no second queue
    expect(final).toContain(
      'public.process_product_behavior_reclassification_queue_v1(p_limit integer DEFAULT 100, p_entity_kind text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text)',
    );
    expect(final).toContain('and (p_entity_kind is null or q.entity_kind=p_entity_kind)');
    expect(final).toContain('and (p_entity_id is null or q.entity_id=p_entity_id)');
    expect(final).toContain(
      'drop function public.process_product_behavior_reclassification_queue_v1(integer);',
    );
    // the replaced worker keeps its privileges (Supabase default-privileges trap)
    expect(final).toMatch(
      /revoke all on function public\.process_product_behavior_reclassification_queue_v1\(integer,text,text\)\s+from public,anon,authenticated;/,
    );
    // the customer upsert drains ITS product's rows before it returns, after every write
    const drain = final.indexOf("10,'catalog_product_version',");
    expect(drain).toBeGreaterThan(0);
    expect(final.slice(drain)).toContain(
      'select current_version_id::text from public.products where id=v_product_id',
    );
    expect(final.slice(drain)).toContain(
      'select product_code into v_product_code from public.products where id=v_product_id;',
    );
    expect(final).not.toMatch(
      /(?:insert|update|delete|truncate)\s+(?:table\s+)?public\.mapper_basement/i,
    );
    expect(final).not.toMatch(/classify_catalog_product_behavior_v2\(/);
  });

  it('uses native system capture and keeps desktop multi-upload/drop', () => {
    expect(ui).toContain('capture="environment"');
    expect(ui).toContain('accept={PRODUCT_SCAN_ACCEPT}');
    expect(ui).toContain('multiple');
    expect(ui).toContain("addFiles([...event.dataTransfer.files], 'drop')");
    expect(ui).not.toContain('navigator.mediaDevices.getUserMedia');
    expect(ui).not.toContain('<video');
  });

  it('keeps technical declarations in autonomous evidence instead of a customer form', () => {
    expect(ui).toContain('productFieldsFromScanResult');
    expect(ui).not.toContain('Alkohol ABV');
    expect(ui).not.toContain('Masa kakaowa');
    expect(ui).not.toContain('patchReview');
  });

  it('keeps autonomous evidence server-owned instead of relabelling it as customer-confirmed', () => {
    expect(ui).toContain('productFieldsFromScanResult');
    expect(ui).not.toContain('nutritionForConfirmation');
    expect(ui).not.toContain('productionDeclarations: Object.fromEntries');
    expect(finalize).toContain('userConfirmedFields: corrections.confirmedEvidenceFields');
  });

  it('records only bounded provider metadata when Vision rejects the request', () => {
    expect(analyze).toContain('providerStatus: response.status');
    expect(analyze).toContain('providerError.type.slice(0, 100)');
    expect(analyze).toContain('providerError.param.slice(0, 200)');
    expect(analyze).not.toContain('providerError.message');
    expect(service).toContain('failure.providerDiagnostic');
  });

  it('runs family resolution before shared profile/Mapper completion', () => {
    expect(finalize.indexOf('let familyResolution = resolveCustomerProductFamily')).toBeLessThan(
      finalize.indexOf('profile = validateIntimportProductProfileProposal'),
    );
    expect(finalize).toContain('family_confirmation_required');
    expect(finalize).toContain('validateProductBehaviorAuthority');
    expect(finalize).toContain('finalizeProductProductionAccuracy');
  });
});
