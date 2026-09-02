import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
});
const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const hmac = async (value: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const pepper = Deno.env.get('INVITE_CODE_PEPPER');
  if (!pepper) return json(500, { error: 'invite_code_pepper_missing' });
  let body: { code?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const code = typeof body.code === 'string' ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (!/^PIH[A-Z0-9]{8}$/.test(code)) return json(400, { error: 'invalid_invite_code' });
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });
  const codeHash = await hmac(code, pepper);
  const { data, error } = await client.rpc('gellatti_redeem_home_invite_v1', { p_code_hash: codeHash });
  if (error) return json(400, { error: error.message });
  return json(200, data as Record<string, unknown>);
});

