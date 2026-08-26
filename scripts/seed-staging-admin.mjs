import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const EMAIL = 'admin@admin.com';

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

const password = required('STAGING_ADMIN_PASSWORD');
if (password.length < 6) throw new Error('Refusing: staging QA password must contain at least 6 characters.');
const client = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let page = 1;
let user = null;
while (!user) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === EMAIL);
  if (user || data.users.length < 1000) break;
  page += 1;
}

if (!user) {
  const { data, error } = await client.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: { fixture: 'gellatti_staging_super_admin_v1' },
  });
  if (error || !data.user) throw error ?? new Error('Staging Admin creation returned no user.');
  user = data.user;
} else {
  const { data, error } = await client.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { ...user.user_metadata, fixture: 'gellatti_staging_super_admin_v1' },
  });
  if (error || !data.user) throw error ?? new Error('Staging Admin update returned no user.');
  user = data.user;
}

const { error: adminError } = await client.from('admin_users').upsert({
  user_id: user.id,
  role: 'super_admin',
  granted_by: user.id,
  granted_at: new Date().toISOString(),
  revoked_at: null,
}, { onConflict: 'user_id' });
if (adminError) throw adminError;

const { data: currentState, error: stateReadError } = await client
  .from('account_states')
  .select('state')
  .eq('user_id', user.id)
  .order('changed_at', { ascending: false })
  .limit(1)
  .maybeSingle();
if (stateReadError) throw stateReadError;
if (!currentState || !['active', 'restored'].includes(currentState.state)) {
  const { error } = await client.from('account_states').insert({
    user_id: user.id,
    state: 'active',
    reason: 'Idempotent staging Admin fixture seed',
    changed_by: user.id,
  });
  if (error) throw error;
}

const correlationId = `staging-admin-seed:${user.id}`;
const { data: priorAudit, error: auditReadError } = await client.from('audit_log')
  .select('id').eq('correlation_id', correlationId).limit(1).maybeSingle();
if (auditReadError) throw auditReadError;
if (!priorAudit) {
  const { error: auditError } = await client.from('audit_log').insert({
    actor_type: 'system',
    actor_id: 'seed-staging-admin-v1',
    action: 'admin.seed_staging_fixture',
    entity_type: 'admin_users',
    entity_id: user.id,
    diff: { email: EMAIL, role: 'super_admin', environment: 'staging' },
    reason: 'Requested staging-only Admin QA account',
    correlation_id: correlationId,
  });
  if (auditError) throw auditError;
}

console.log(JSON.stringify({ ok: true, environment: 'staging', email: EMAIL, role: 'super_admin', userId: user.id }));
