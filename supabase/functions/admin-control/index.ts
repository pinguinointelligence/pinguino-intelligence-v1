import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/* Accounts v2 lives on its own API version; the rest of this project's Stripe
   calls stay on STRIPE_API_VERSION. */
const CONNECT_ACCOUNTS_API_VERSION = '2026-08-26.dahlia';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const text = (value: unknown, max = 500): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256 = async (value: string): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));

const hmac = async (value: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
};

const randomCode = (): string => {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `PIH-${body.slice(0, 4)}-${body.slice(4)}`;
};

type AdminRole =
  | 'super_admin'
  | 'catalog_admin'
  | 'support_admin'
  | 'partner_admin'
  | 'finance_admin'
  | 'content_moderator';

const roleAllows = (role: AdminRole, permission: 'CATALOG' | 'SUPPORT' | 'PARTNER'): boolean =>
  role === 'super_admin' ||
  (permission === 'CATALOG' && role === 'catalog_admin') ||
  (permission === 'SUPPORT' && role === 'support_admin') ||
  (permission === 'PARTNER' && role === 'partner_admin');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'unauthorized' });
  const actorId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const action = text(body.action, 80).toUpperCase();
  const permission: 'CATALOG' | 'SUPPORT' | 'PARTNER' = action === 'SIGNED_REQUEST_EVIDENCE'
    ? 'CATALOG'
    : action.includes('PARTNER') || action === 'PROVISION_CONNECT'
      ? 'PARTNER'
      : 'SUPPORT';
  const { data: adminRow, error: adminError } = await service
    .from('admin_users')
    .select('role, revoked_at')
    .eq('user_id', actorId)
    .maybeSingle();
  const role = adminRow?.role as AdminRole | undefined;
  if (adminError || adminRow?.revoked_at || !role || !roleAllows(role, permission)) {
    return json(403, { error: 'administrator_permission_required', permission });
  }

  if (action === 'SIGNED_REQUEST_EVIDENCE') {
    const requestId = text(body.requestId, 64);
    const { data: request } = await service.from('product_add_requests').select('id').eq('id', requestId).maybeSingle();
    if (!request) return json(404, { error: 'request_not_found' });
    const { data: evidence, error } = await service
      .from('product_add_request_evidence')
      .select('id, evidence_kind, storage_path, source_url, mime_type, byte_size, created_at')
      .eq('request_id', requestId)
      .order('created_at');
    if (error) return json(500, { error: 'evidence_lookup_failed' });
    const rows = await Promise.all((evidence ?? []).map(async (item) => {
      if (!item.storage_path) return { ...item, signedUrl: null };
      const { data: signed } = await service.storage
        .from('product-request-evidence')
        .createSignedUrl(item.storage_path, 300);
      return { ...item, signedUrl: signed?.signedUrl ?? null };
    }));
    return json(200, { evidence: rows, expiresInSeconds: 300 });
  }

  if (action === 'INVITE_PARTNER') {
    const email = text(body.email, 320).toLowerCase();
    const displayName = text(body.displayName, 100);
    const slug = text(body.slug, 40).toLowerCase();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: invitationId, error } = await userClient.rpc('gellatti_admin_create_partner_invitation_v1', {
      p_email: email,
      p_display_name: displayName,
      p_slug: slug,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    });
    if (error) return json(400, { error: error.message });
    const redirectBase = Deno.env.get('PUBLIC_APP_URL') ?? 'https://staging.pinguinoai.com';
    const invite = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${redirectBase.replace(/\/$/, '')}/login`,
      data: { gellatti_partner_invitation_id: invitationId },
    });
    const delivery = invite.error ? 'existing_user_in_app_or_delivery_failed' : 'email_sent';
    if (invite.error) {
      await service.from('user_notifications').insert({
        recipient_user_id: actorId,
        notification_type: 'PARTNER_INVITATION_DELIVERY_ATTENTION',
        entity_type: 'partner_invitations',
        entity_id: String(invitationId),
        title: 'Zaproszenie Partner wymaga uwagi',
        body: `Zaproszenie ${email} istnieje, ale wiadomość auth nie została wysłana. Istniejący użytkownik otrzyma powiadomienie w aplikacji.`,
        deep_link: '/admin/partners',
        dedupe_key: `partner-invite-delivery:${String(invitationId)}`,
      });
    }
    return json(200, { invitationId, expiresAt, delivery });
  }

  if (action === 'RESEND_PARTNER_INVITE') {
    const invitationId = text(body.invitationId, 64);
    const { data: invitation, error: invitationError } = await service
      .from('partner_invitations')
      .select('id,email,status,expires_at')
      .eq('id', invitationId)
      .maybeSingle();
    if (invitationError || !invitation || invitation.status !== 'PENDING') {
      return json(404, { error: 'pending_partner_invitation_not_found' });
    }
    if (Date.parse(invitation.expires_at) <= Date.now()) return json(409, { error: 'partner_invitation_expired' });
    const redirectBase = Deno.env.get('PUBLIC_APP_URL') ?? 'https://staging.pinguinoai.com';
    const result = await service.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo: `${redirectBase.replace(/\/$/, '')}/login`,
      data: { gellatti_partner_invitation_id: invitation.id },
    });
    if (result.error) return json(409, { error: 'invitation_email_not_resent', inAppInvitationStillActive: true });
    await service.from('audit_log').insert({
      actor_type: 'admin', actor_id: actorId, action: 'partner.invitation_resend',
      entity_type: 'partner_invitations', entity_id: invitation.id,
      diff: { email: invitation.email, environment: 'staging' },
      reason: 'Admin requested invitation resend', correlation_id: invitation.id,
    });
    return json(200, { invitationId: invitation.id, delivery: 'email_resent' });
  }

  if (action === 'MINT_HOME_INVITE') {
    const pepper = Deno.env.get('INVITE_CODE_PEPPER');
    if (!pepper) return json(500, { error: 'invite_code_pepper_missing' });
    const email = text(body.email, 320).toLowerCase();
    const days = Math.min(Math.max(Number(body.expiresInDays ?? 30), 1), 90);
    const code = randomCode();
    const codeHash = await hmac(code.replace(/[^A-Z0-9]/g, ''), pepper);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const { data: inviteId, error } = await userClient.rpc('gellatti_admin_mint_home_invite_v1', {
      p_email: email,
      p_code_hash: codeHash,
      p_expires_at: expiresAt,
    });
    if (error) return json(400, { error: error.message });
    return json(200, { inviteId, code, email, expiresAt, plaintextReturnedOnce: true });
  }

  if (action === 'PROVISION_CONNECT') {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json(500, { error: 'billing_not_configured' });
    const partnerId = text(body.partnerId, 64);
    const { data: partner, error: partnerError } = await service
      .from('partners')
      .select('id,user_id,status,stripe_connect_account_id')
      .eq('id', partnerId)
      .maybeSingle();
    if (partnerError || !partner) return json(404, { error: 'partner_not_found' });
    if (partner.status !== 'active') return json(409, { error: 'active_partner_required' });
    if (partner.stripe_connect_account_id) {
      return json(200, { accountId: partner.stripe_connect_account_id, idempotent: true });
    }
    const { data: authUser } = await service.auth.admin.getUserById(partner.user_id);
    const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
    const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
    /* Accounts v2. Measured on the sandbox (2026-09-18): `/v1/accounts` is
       refused outright — "Stripe no longer recommends Accounts v1 for new
       Connect integrations. Create connected accounts with POST
       /v2/core/accounts instead." The v1 call also asked for NO capabilities,
       which let Express defaults decide; this asks for exactly one.

       A Partner receives commission and nothing else, so the account gets the
       Recipient configuration with `stripe_balance.stripe_transfers` — the
       capability that lets it receive /v1/transfers — and no Merchant
       configuration at all, so it can never take a payment. `dashboard:
       express` keeps the hosted dashboard the onboarding link already uses, and
       Stripe requires application/application responsibilities with it.

       Everything after this line is unchanged: the same admin RPC binds the
       account, the same onboarding link function sends the Partner to Stripe,
       the same `accounts.retrieve` reads it back and the same
       `transfers.create` pays it. Only the create call moved. */
    const country = /^[A-Za-z]{2}$/.test(String(body.country ?? ''))
      ? String(body.country).toLowerCase()
      : (Deno.env.get('GELLATTI_CONNECT_DEFAULT_COUNTRY') ?? 'es').toLowerCase();
    let account: { id: string };
    try {
      account = await stripe.rawRequest('POST', '/v2/core/accounts', {
        contact_email: authUser.user?.email,
        identity: { country, entity_type: 'individual' },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        dashboard: 'express',
        defaults: {
          currency: 'eur',
          responsibilities: { fees_collector: 'application', losses_collector: 'application' },
        },
        metadata: { gellatti_partner_id: partnerId, environment: 'staging' },
        include: ['configuration.recipient'],
      }, {
        apiVersion: CONNECT_ACCOUNTS_API_VERSION,
        idempotencyKey: `gellatti-partner-connect-${partnerId}`,
      }) as unknown as { id: string };
    } catch {
      return json(502, { error: 'stripe_connect_provision_failed' });
    }
    const { error: registerError } = await userClient.rpc('gellatti_admin_register_partner_connect_v1', {
      p_partner_id: partnerId,
      p_connect_account_id: account.id,
    });
    if (registerError) return json(500, { error: registerError.message, accountCreated: true });
    await service.from('user_notifications').insert({
      recipient_user_id: partner.user_id,
      notification_type: 'PARTNER_CONNECT_ACTION_REQUIRED',
      entity_type: 'partners',
      entity_id: partnerId,
      // The Partner configures no payout: the only thing they can do is confirm
      // identity and payout data with the payment operator. Same wording as the
      // panel (#406), including no vendor name.
      title: 'Potwierdź dane do wypłat',
      body: 'Gellatti przygotowało Twoje konto wypłat. Otwórz Partner → Wypłaty i potwierdź tożsamość oraz dane u naszego operatora płatności.',
      deep_link: '/partner?section=payouts',
      dedupe_key: `partner-connect-ready:${partnerId}`,
    });
    return json(200, { accountId: account.id, idempotent: false });
  }

  return json(400, { error: 'unsupported_admin_control_action' });
});
