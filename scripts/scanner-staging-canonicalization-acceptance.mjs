import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const EAN = '4001686322536';
const PRODUCT_ID = '363ff5b6-0b7b-41a9-acbb-394daa26b4d2';
const RECIPE_NAME = 'P0 Scanner HARIBO one-photo proof';
const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=') || true];
  }),
);
if (args.get('--project-ref') !== STAGING_REF) {
  throw new Error('Refusing: exact staging project ref confirmation is required.');
}
if (!args.has('--canonicalize')) {
  throw new Error('Refusing: explicit --canonicalize is required for the staging mutation.');
}

const apiKeys = JSON.parse(
  execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ),
);
const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
if (typeof anonKey !== 'string' || anonKey.length < 100) {
  throw new Error('The staging anonymous API key could not be resolved.');
}
const fixtureSource = readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8');
const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
if (!fixturePassword) throw new Error('Repository staging fixture password is missing.');

const signIn = async (email) => {
  const client = createClient(STAGING_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: fixturePassword,
  });
  if (error || !data.session?.access_token || !data.user) {
    throw new Error(`Staging QA authentication failed for ${email}.`);
  }
  return { client, user: data.user, accessToken: data.session.access_token };
};

const exactLookup = async (accessToken) => {
  const response = await fetch(`${STAGING_URL}/functions/v1/product-scan-analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: randomUUID(),
      mode: 'ean_lookup',
      images: [],
      barcode: { kind: 'EAN_13', value: EAN, lookupValue: EAN },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Exact lookup failed: ${body.error ?? response.status}`);
  if (body.kind !== 'existing_product' || body.product?.id !== PRODUCT_ID) {
    throw new Error('Future exact EAN did not resolve to the canonical UUID.');
  }
  if (body.usage?.visionCalls !== 0 || body.usage?.webCalls !== 0) {
    throw new Error('Future exact EAN did not use the zero-cost internal short circuit.');
  }
  return body;
};

const admin = await signIn('admin@admin.com');
const { data: pendingRows, error: pendingError } = await admin.client.rpc(
  'gellatti_admin_customer_added_products_v1',
  { p_status: 'PENDING', p_limit: 500 },
);
if (pendingError) throw new Error(`Admin pending lookup failed: ${pendingError.message}`);
const pending = (pendingRows ?? []).find(
  (row) => row.ean === EAN && row.productId === PRODUCT_ID,
);
let canonicalized;
if (pending) {
  if (pending.distinctCustomerCount !== 2) {
    throw new Error('The exact-EAN central pending row does not have two distinct customers.');
  }
  const response = await admin.client.rpc('gellatti_admin_canonicalize_customer_added_v1', {
    p_customer_added_product_id: pending.id,
  });
  if (response.error) {
    throw new Error(`Admin canonicalization failed: ${response.error.message}`);
  }
  canonicalized = response.data;
} else {
  const { data: canonicalRows, error: canonicalRowsError } = await admin.client.rpc(
    'gellatti_admin_customer_added_products_v1',
    { p_status: 'CANONICALIZED', p_limit: 500 },
  );
  if (canonicalRowsError) {
    throw new Error(`Admin canonical post-state lookup failed: ${canonicalRowsError.message}`);
  }
  const canonical = (canonicalRows ?? []).find(
    (row) => row.ean === EAN && row.productId === PRODUCT_ID,
  );
  if (!canonical || canonical.distinctCustomerCount !== 2) {
    throw new Error('Neither a valid pending nor canonical exact-EAN row exists.');
  }
  canonicalized = {
    productId: canonical.productId,
    productCode: canonical.productCode,
    status: 'CANONICALIZED',
  };
}
if (canonicalized?.productId !== PRODUCT_ID || !/^PR-ING-\d{6}$/.test(canonicalized?.productCode)) {
  throw new Error('Canonicalization changed the UUID or failed to assign a PR identity.');
}
const { data: adminProduct, error: adminProductError } = await admin.client.rpc(
  'get_canonical_product_for_account_v1',
  { p_product_id: PRODUCT_ID },
);
if (adminProductError) throw new Error(`Canonical Admin read failed: ${adminProductError.message}`);
if (
  adminProduct.product_kind !== 'commercial_product' ||
  adminProduct.visibility !== 'shared' ||
  adminProduct.canonical_verification_status !== 'verified'
) {
  throw new Error('Canonical PR is not PUBLISHED / verified.');
}
const { data: pendingAfter, error: pendingAfterError } = await admin.client.rpc(
  'gellatti_admin_customer_added_products_v1',
  { p_status: 'PENDING', p_limit: 500 },
);
if (pendingAfterError) throw new Error(`Admin post-state lookup failed: ${pendingAfterError.message}`);
if ((pendingAfter ?? []).some((row) => row.ean === EAN)) {
  throw new Error('Canonicalized EAN remained in the Admin pending queue.');
}
await admin.client.auth.signOut();

const pro = await signIn('pro@pro.com');
const proLookup = await exactLookup(pro.accessToken);
const { data: proRelation, error: proRelationError } = await pro.client
  .from('user_product_relations')
  .select('private_price,currency')
  .eq('user_id', pro.user.id)
  .eq('product_id', PRODUCT_ID)
  .single();
if (proRelationError) throw new Error(`Pro price reopen failed: ${proRelationError.message}`);
if (Number(proRelation.private_price) !== 12.34 || proRelation.currency !== 'EUR') {
  throw new Error('Canonicalization did not preserve the Pro My Price authority.');
}
const { data: recipeRows, error: recipeError } = await pro.client
  .from('saved_recipes')
  .select('id,product_composition')
  .eq('name', RECIPE_NAME)
  .order('updated_at', { ascending: false })
  .limit(1);
if (recipeError || !recipeRows?.[0]) throw new Error('Canonical recipe reopen failed.');
const recipeTopping = recipeRows[0].product_composition?.toppings?.find(
  (item) => item?.ingredient?.catalog_product_id === PRODUCT_ID,
);
if (!recipeTopping) throw new Error('Canonicalization broke the saved recipe product reference.');
const { data: runs, error: runError } = await pro.client
  .from('production_runs')
  .select('id,status,recipe_id,recipe_version_id')
  .eq('recipe_id', recipeRows[0].id)
  .eq('status', 'in_progress')
  .limit(1);
if (runError || !runs?.[0]) throw new Error('Production proof did not survive canonicalization.');
await pro.client.auth.signOut();

const home = await signIn('home@home.com');
const homeLookup = await exactLookup(home.accessToken);
await home.client.auth.signOut();

const verification = await signIn('admin@admin.com');
const { data: exactProducts, error: exactProductsError } = await verification.client.rpc(
  'search_products_v1',
  {
    p_query: EAN,
    p_context: 'TOPPING',
    p_market_scope: 'global',
    p_selected_markets: [],
    p_favorites_only: false,
    p_product_profile: null,
    p_entity_kind: 'commercial_product',
    p_limit: 100,
    p_cursor: 0,
    p_token_groups: [],
  },
);
if (exactProductsError) throw new Error(`Exact identity audit failed: ${exactProductsError.message}`);
const roots = exactProducts ?? [];
if (
  roots.length !== 1 ||
  roots[0].id !== PRODUCT_ID ||
  roots[0].entity_kind !== 'commercial_product' ||
  roots.some((row) => row.public_data?.productCode?.startsWith('PM-ING-'))
) {
  throw new Error('Exact-EAN identity is duplicated or a PM was created.');
}
await verification.client.auth.signOut();

console.log(
  JSON.stringify({
    ok: true,
    ean: EAN,
    canonical: {
      productId: PRODUCT_ID,
      productCode: canonicalized.productCode,
      status: adminProduct.canonical_verification_status,
      productKind: adminProduct.product_kind,
      visibility: adminProduct.visibility,
      currentVersionId: adminProduct.current_version_id,
      behaviorBindingId: adminProduct.current_behavior_binding_id,
    },
    pending: { beforeDistinctCustomers: 2, afterPresent: false },
    pro: {
      exactPath: proLookup.kind,
      productCode: proLookup.product.productCode,
      myPrice: { pricePerKg: Number(proRelation.private_price), currency: proRelation.currency },
      recipeId: recipeRows[0].id,
      productionRunId: runs[0].id,
      productionStatus: runs[0].status,
    },
    home: {
      exactPath: homeLookup.kind,
      productCode: homeLookup.product.productCode,
    },
    identity: { activeRoots: roots.length, pmCreated: false },
  }),
);
