import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const safeSlug = (value: unknown): string | null => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{2,39}$/.test(value)
  ? value : null;
const hex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes), (part) => part.toString(16).padStart(2, '0')).join('');
const sha256 = async (value: string): Promise<string> => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const action = body.action === 'CLAIM' ? 'CLAIM' : 'RESOLVE';
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  if (action === 'CLAIM') {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(401, { error: 'unauthorized' });
    if (typeof body.clickId !== 'string') return json(400, { error: 'click_id_required' });
    const { data, error } = await userClient.rpc('gellatti_claim_partner_click_v1', { p_click_id: body.clickId });
    if (error) return json(error.message.includes('self_referral') ? 403 : 409, { error: error.message });
    return json(200, data as Record<string, unknown>);
  }

  const partnerSlug = safeSlug(body.partnerSlug);
  const codeSlug = safeSlug(body.code);
  const linkSlug = typeof body.linkSlug === 'string' && /^[a-z0-9][a-z0-9-]{5,79}$/.test(body.linkSlug)
    ? body.linkSlug : null;
  if (!partnerSlug || !codeSlug) return json(404, { error: 'partner_link_not_found' });
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: profile, error: profileError } = await admin.from('partner_public_profiles')
    .select('partner_id,slug,display_name,logo_path,short_description,website_url,social_links,default_destination_path,moderation_status')
    .eq('slug', partnerSlug).maybeSingle();
  if (profileError || !profile) return json(404, { error: 'partner_link_not_found' });
  if (profile.moderation_status !== 'APPROVED') return json(404, { error: 'partner_profile_not_approved' });
  const [{ data: partner }, { data: code }] = await Promise.all([
    admin.from('partners').select('id,status').eq('id', profile.partner_id).eq('status', 'active').maybeSingle(),
    admin.from('partner_codes').select('id,partner_id,status,slug').eq('partner_id', profile.partner_id)
      .eq('slug', codeSlug).eq('status', 'active').maybeSingle(),
  ]);
  if (!partner || !code) return json(404, { error: 'partner_link_not_found' });
  let destinationPath = profile.default_destination_path as string;
  let contentLinkId: string | null = null;
  if (linkSlug) {
    const { data: link } = await admin.from('partner_content_links')
      .select('id,destination_path').eq('partner_id', partner.id).eq('partner_code_id', code.id)
      .eq('link_slug', linkSlug).eq('status', 'ACTIVE').maybeSingle();
    if (!link) return json(404, { error: 'partner_content_link_not_found' });
    destinationPath = link.destination_path;
    contentLinkId = link.id;
  }
  if (typeof destinationPath !== 'string' || !destinationPath.startsWith('/') || destinationPath.startsWith('//')) {
    return json(409, { error: 'partner_destination_invalid' });
  }
  const day = new Date().toISOString().slice(0, 10);
  const forwarded = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim();
  const userAgent = req.headers.get('user-agent') ?? '';
  const secret = Deno.env.get('REFERRAL_HASH_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const visitorHash = await sha256(`${secret}|${forwarded}|${userAgent}|${day}`);
  const dedupeKey = await sha256(`${code.id}|${visitorHash}|${day}|${contentLinkId ?? 'base'}`);
  const context = { source: 'partner_public_route_v1', partnerSlug, code: codeSlug, contentLinkId };
  const { data: inserted, error: insertError } = await admin.from('referral_clicks').upsert({
    partner_code_id: code.id, partner_id: partner.id, landing_path: destinationPath,
    visitor_hash: visitorHash, dedupe_key: dedupeKey, context,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id').maybeSingle();
  if (insertError) return json(500, { error: 'referral_click_write_failed' });
  let clickId = inserted?.id as string | undefined;
  if (!clickId) {
    const { data: existing } = await admin.from('referral_clicks').select('id').eq('dedupe_key', dedupeKey).maybeSingle();
    clickId = existing?.id;
  }
  if (!clickId) return json(500, { error: 'referral_click_not_resolved' });
  const { data: signedLogo } = profile.logo_path
    ? await admin.storage.from('partner-public-assets').createSignedUrl(profile.logo_path, 3600)
    : { data: null };
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return json(200, {
    ok: true, clickId, expiresAt, destinationPath, contentLink: Boolean(linkSlug),
    profile: {
      slug: profile.slug, displayName: profile.display_name,
      shortDescription: profile.short_description, websiteUrl: profile.website_url,
      socialLinks: profile.social_links,
      logoUrl: signedLogo?.signedUrl ?? null,
    },
  });
});
