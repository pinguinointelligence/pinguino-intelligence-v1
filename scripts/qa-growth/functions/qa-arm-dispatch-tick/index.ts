/**
 * QA ONLY — arm the EXISTING server path for the mail queue on the QA branch.
 *
 * `gellatti_dispatch_email_queue_tick_v1()` (pg_cron, every 5 minutes) calls
 * email-dispatch with the dispatch key from Vault, and email-dispatch now
 * authorises that caller against its own SUPABASE_SERVICE_ROLE_KEY. Nobody
 * outside the platform can read that key, so this function moves it from the
 * function environment into the branch's Vault WITHOUT returning it: the value
 * never leaves Supabase, and the answer carries only names, lengths and a short
 * sha256 prefix for correlation.
 *
 * Refuses outside the QA project and without a one-time nonce
 * (qa_harness.invocation_nonces, purpose 'arm_dispatch').
 */
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const QA_REF = 'ncmsonfwbgsqedgnzofg';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 1), { status, headers: { 'Content-Type': 'application/json' } });

const sha256Prefix = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
};

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  if (!url.startsWith(`https://${QA_REF}.supabase.co`)) return json(403, { error: 'not_the_qa_project' });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const nonce = req.headers.get('x-qa-nonce') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(nonce)) return json(401, { error: 'nonce_required' });

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceRoleKey) return json(500, { error: 'no_service_role_key_in_environment' });
  const baseUrl = `${url.replace(/\/+$/, '')}/functions/v1`;

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 1 });
  try {
    const used = await sql`
      update qa_harness.invocation_nonces set used_at = now()
      where nonce = ${nonce}::uuid and purpose = 'arm_dispatch' and used_at is null and expires_at > now()
      returning nonce`;
    if (used.length !== 1) return json(401, { error: 'nonce_invalid_or_used' });

    for (const [name, secret] of [
      ['gellatti_edge_functions_base_url', baseUrl],
      ['gellatti_edge_dispatch_key', serviceRoleKey],
    ] as const) {
      const existing = await sql`select id from vault.secrets where name = ${name}`;
      if (existing.length > 0) {
        await sql`select vault.update_secret(${existing[0].id}::uuid, ${secret}, ${name})`;
      } else {
        await sql`select vault.create_secret(${secret}, ${name}, ${'QA ONLY: arms gellatti_dispatch_email_queue_tick_v1 on the QA branch'})`;
      }
    }

    const names = await sql`select name, created_at, updated_at from vault.secrets order by name`;
    return json(200, {
      armed: true,
      baseUrl,
      dispatchKeySha256Prefix: await sha256Prefix(serviceRoleKey),
      dispatchKeyLength: serviceRoleKey.length,
      vault: names.map((row: Record<string, unknown>) => ({ name: row.name, createdAt: row.created_at, updatedAt: row.updated_at })),
    });
  } finally {
    await sql.end();
  }
});
