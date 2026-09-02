import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const FIXED_PASSWORD = '123456';
const FIXTURE_VERSION = 'gellatti_staging_owner_qa_v1';
const FIXTURES = [
  {
    email: 'home@home.com',
    displayName: 'Gellatti Home QA',
    accountType: 'home',
    scope: 'home',
    sourceId: '6b309512-0b42-4aa0-b4f7-000000000001',
    adminRole: null,
  },
  {
    email: 'pro@pro.com',
    displayName: 'Gellatti Pro QA',
    accountType: 'pro',
    scope: 'pro',
    sourceId: '6b309512-0b42-4aa0-b4f7-000000000002',
    adminRole: null,
  },
  {
    email: 'admin@admin.com',
    displayName: 'Gellatti Admin QA',
    accountType: 'internal',
    scope: null,
    sourceId: null,
    adminRole: 'super_admin',
  },
];

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const projectRef = process.argv.find((value) => value.startsWith('--project-ref='))?.split('=')[1];
if (projectRef !== STAGING_REF) throw new Error('Refusing: exact staging project ref confirmation is required.');

const url = required('SUPABASE_URL');
if (new URL(url).hostname !== `${STAGING_REF}.supabase.co`) {
  throw new Error('Refusing: SUPABASE_URL is not the approved staging project.');
}

const client = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listFixtureUsers() {
  const wanted = new Set(FIXTURES.map(({ email }) => email));
  const found = new Map();
  let page = 1;
  let consecutiveEmptyPages = 0;
  while (found.size < wanted.size && page <= 200 && consecutiveEmptyPages < 3) {
    // Two historical staging Auth rows make a multi-row GoTrue Admin listing
    // fail. A one-row page preserves the supported Admin API and lets this
    // staging-only seed skip only those unreadable historical pages.
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1 });
    page += 1;
    if (error) continue;
    consecutiveEmptyPages = data.users.length === 0 ? consecutiveEmptyPages + 1 : 0;
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && wanted.has(email)) found.set(email, user);
    }
  }
  return found;
}

async function ensureAuthUser(fixture, existing) {
  const metadata = { ...(existing?.user_metadata ?? {}), fixture: FIXTURE_VERSION };
  if (!existing) {
    const { data, error } = await client.auth.admin.createUser({
      email: fixture.email,
      password: FIXED_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw error ?? new Error(`No Auth user returned for ${fixture.email}.`);
    return data.user;
  }
  const { data, error } = await client.auth.admin.updateUserById(existing.id, {
    password: FIXED_PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw error ?? new Error(`No updated Auth user returned for ${fixture.email}.`);
  return data.user;
}

async function ensureProfiles(fixture, userId) {
  const { error: profileError } = await client.from('profiles').upsert({
    id: userId,
    display_name: fixture.displayName,
  }, { onConflict: 'id' });
  if (profileError) throw profileError;

  const { error: accountProfileError } = await client.from('account_profiles').upsert({
    user_id: userId,
    display_name: fixture.displayName,
    account_type: fixture.accountType,
  }, { onConflict: 'user_id' });
  if (accountProfileError) throw accountProfileError;
}

async function ensureActiveState(userId) {
  const { data, error } = await client.from('account_states')
    .select('state').eq('user_id', userId)
    .order('changed_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || !['active', 'restored'].includes(data.state)) {
    const { error: insertError } = await client.from('account_states').insert({
      user_id: userId,
      state: 'active',
      reason: 'Idempotent fixed staging owner-QA fixture seed',
      changed_by: userId,
    });
    if (insertError) throw insertError;
  }
}

async function ensureAdminRole(fixture, userId) {
  if (fixture.adminRole) {
    const { error } = await client.from('admin_users').upsert({
      user_id: userId,
      role: fixture.adminRole,
      granted_by: userId,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return;
  }
  const { error } = await client.from('admin_users')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId).is('revoked_at', null);
  if (error) throw error;
}

async function ensureFixtureEntitlement(fixture, userId) {
  const { data, error } = await client.from('entitlements')
    .select('id,scope,source_type,source_id,status')
    .eq('user_id', userId).eq('status', 'active');
  if (error) throw error;
  const active = data ?? [];
  const unexpected = active.filter((row) => row.scope !== fixture.scope);
  const billingOwned = unexpected.filter((row) => row.source_type !== 'admin_grant');
  if (billingOwned.length > 0) {
    throw new Error(`Refusing to rewrite Billing-owned access for fixed fixture ${fixture.email}.`);
  }
  if (unexpected.length > 0) {
    const { error: revokeError } = await client.from('entitlements').update({
      status: 'revoked',
      revoked_by: 'system:staging-owner-qa-seed',
      revoke_reason: 'Fixed staging owner-QA access isolation',
    }).in('id', unexpected.map(({ id }) => id));
    if (revokeError) throw revokeError;
  }
  if (!fixture.scope) return;
  const alreadyGranted = active.some((row) => row.scope === fixture.scope);
  if (alreadyGranted) return;
  const { error: entitlementError } = await client.from('entitlements').insert({
    user_id: userId,
    scope: fixture.scope,
    source_type: 'admin_grant',
    source_id: fixture.sourceId,
    starts_at: new Date().toISOString(),
    ends_at: null,
    status: 'active',
    granted_by: 'system:staging-owner-qa-seed',
    metadata: { fixture: FIXTURE_VERSION, stablePassword: true },
  });
  if (entitlementError) throw entitlementError;
}

async function writeAudit(fixture, userId) {
  const correlationId = `staging-owner-qa-seed:${fixture.email}:${FIXTURE_VERSION}`;
  const { data, error } = await client.from('audit_log')
    .select('id').eq('correlation_id', correlationId).limit(1).maybeSingle();
  if (error) throw error;
  if (data) return;
  const { error: auditError } = await client.from('audit_log').insert({
    actor_type: 'system',
    actor_id: 'seed-staging-owner-qa-v1',
    action: 'account.seed_staging_owner_qa_fixture',
    entity_type: 'auth.users',
    entity_id: userId,
    diff: {
      email: fixture.email,
      accountType: fixture.accountType,
      scope: fixture.scope,
      adminRole: fixture.adminRole,
      environment: 'staging',
      stablePassword: true,
    },
    reason: 'Requested fixed staging owner QA accounts',
    correlation_id: correlationId,
  });
  if (auditError) throw auditError;
}

const existingUsers = await listFixtureUsers();
const results = [];
for (const fixture of FIXTURES) {
  const user = await ensureAuthUser(fixture, existingUsers.get(fixture.email));
  await ensureProfiles(fixture, user.id);
  await ensureActiveState(user.id);
  await ensureAdminRole(fixture, user.id);
  await ensureFixtureEntitlement(fixture, user.id);
  await writeAudit(fixture, user.id);
  results.push({
    email: fixture.email,
    userId: user.id,
    accountType: fixture.accountType,
    scope: fixture.scope,
    adminRole: fixture.adminRole,
    passwordPolicy: 'fixed-owner-qa',
  });
}

console.log(JSON.stringify({
  ok: true,
  environment: 'staging',
  projectRef: STAGING_REF,
  fixtureVersion: FIXTURE_VERSION,
  accounts: results,
}));
