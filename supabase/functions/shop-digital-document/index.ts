/**
 * shop-digital-document — Edge Function (Deno).
 *
 * The free "Gellatti — Składniki bazy lodów / Gelato Base Ingredients" PDF: a 0 € shop
 * order of type DIGITAL_DOCUMENT, then a download from the order.
 *
 *  - The caller is authenticated from the JWT. The user id and e-mail are never read from
 *    the body, and the anon key alone is not a user.
 *  - The client names a document key from a closed list. Price (0), entitlement,
 *    availability (OFF / TEST_ACCOUNTS_ONLY / ON), document version and file are resolved
 *    by `gellatti_shop_document_order_v1`, which only the service role may call.
 *  - Idempotent: the database allows one active order per account per document version,
 *    so a double click, a parallel request or a retry returns the same order.
 *  - A download is a short-lived signed URL for the file pinned in THAT order, issued only
 *    to its owner (or a finance admin) by `gellatti_shop_document_download_v1`. Nothing
 *    stores the URL; the account asks again when it expires.
 *  - The order is confirmed only together with a working link. A missing file never looks
 *    like a ready download.
 *  - Mail is a notification, never the way to the file. It is queued only after the order
 *    is saved, through the one transactional mail path, with a per-order idempotency key.
 *    Test accounts are never mailed at their own addresses: their notice goes to the
 *    registry's controlled QA recipient.
 *  - No payment provider, no address, no shipping, no stock, no country gate, no partner
 *    attribution.
 *
 * Required env: the auto-injected SUPABASE_* values only.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const DOCUMENT_KEYS: ReadonlySet<string> = new Set(['GELATO_BASE_INGREDIENTS']);
const SIGNED_URL_TTL_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The app origins a notification may link back to, from a closed list, so a request can
 * never choose where a mail points. Staging and production share this function and its
 * database; the origin the customer ordered from decides which app the link opens.
 */
const APP_ORIGINS: Readonly<
  Record<string, { environment: 'production' | 'staging'; base: string }>
> = {
  'https://staging.pinguinoai.com': {
    environment: 'staging',
    base: 'https://staging.pinguinoai.com',
  },
  'https://www.gellatti.com': { environment: 'production', base: 'https://www.gellatti.com' },
  'https://gellatti.com': { environment: 'production', base: 'https://www.gellatti.com' },
};

const DOWNLOAD_ERRORS: Readonly<Record<string, number>> = {
  unauthorized: 401,
  order_not_found: 404,
  document_file_missing: 503,
};

interface OrderResult {
  orderId: string;
  orderNumber: string;
  created: boolean;
  documentKey: string;
  documentVersion: string;
  emailJobId: string | null;
  qaAccount: boolean;
  qaRecipient: string | null;
  error?: string;
}

interface DownloadResult {
  orderId: string;
  orderNumber: string;
  bucket: string;
  path: string;
  fileName: string;
  documentVersion: string;
  error?: string;
}

type ServiceClient = ReturnType<typeof createClient>;

async function signedDownload(
  admin: ServiceClient,
  userId: string,
  orderId: string,
): Promise<
  | { error: string }
  | { download: Record<string, unknown>; orderNumber: string; documentVersion: string }
> {
  const { data, error } = await admin.rpc('gellatti_shop_document_download_v1', {
    p_user_id: userId,
    p_order_id: orderId,
  });
  if (error) return { error: 'download_failed' };
  const row = data as DownloadResult | null;
  if (!row || row.error) return { error: row?.error ?? 'download_failed' };
  /* The storage location comes from the order's pinned registry row, never the request. */
  const { data: signed, error: signError } = await admin.storage
    .from(row.bucket)
    .createSignedUrl(row.path, SIGNED_URL_TTL_SECONDS, { download: row.fileName });
  if (signError || !signed?.signedUrl) return { error: 'document_file_missing' };
  return {
    orderNumber: row.orderNumber,
    documentVersion: row.documentVersion,
    download: {
      url: signed.signedUrl,
      fileName: row.fileName,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    },
  };
}

async function queueNotification(
  admin: ServiceClient,
  order: OrderResult,
  customerEmail: string,
  origin: string,
): Promise<{ queued: boolean; reason?: string }> {
  const app = APP_ORIGINS[origin];
  if (!app) return { queued: false, reason: 'unknown_app_origin' };
  const recipient = order.qaAccount ? order.qaRecipient : customerEmail;
  if (!recipient) {
    return {
      queued: false,
      reason: order.qaAccount ? 'qa_recipient_not_configured' : 'no_recipient',
    };
  }
  const accountUrl = `${app.base}/account?section=orders&order=${order.orderId}`;
  const marker = `${app.environment === 'production' ? '' : '[STAGING] '}${order.qaAccount ? '[QA] ' : ''}`;
  const qaLine = order.qaAccount
    ? `Powiadomienie testowe dla konta QA ${customerEmail} (tryb TEST_ACCOUNTS_ONLY).`
    : null;
  const { data, error } = await admin.rpc('gellatti_enqueue_email_v1', {
    p_idempotency_key: `digital-document:${app.environment}:${order.orderId}`,
    p_subject_key: 'shop.digitalDocument.ready',
    p_subject: `${marker}Twój infopak Gellatti — Składniki bazy lodów`,
    p_recipient: recipient,
    p_body_html:
      `<p>Zamówienie ${order.orderNumber} przyjęte. Twój infopak „Gellatti — Składniki bazy lodów” ` +
      `(PDF w języku angielskim) jest gotowy.</p>` +
      `<p><a href="${accountUrl}">Pobierz PDF w koncie</a></p>` +
      `<p>Plik zawsze znajdziesz w: Konto → Zamówienia.</p>` +
      (qaLine ? `<p>${qaLine}</p>` : '') +
      `<p><a href="https://www.gellatti.com">www.gellatti.com</a></p>`,
    p_body_text:
      `Zamówienie ${order.orderNumber} przyjęte. Twój infopak „Gellatti — Składniki bazy lodów” ` +
      `(PDF w języku angielskim) jest gotowy.\n\nPobierz PDF w koncie: ${accountUrl}\n\n` +
      `Plik zawsze znajdziesz w: Konto → Zamówienia.\n\n` +
      (qaLine ? `${qaLine}\n\n` : '') +
      `www.gellatti.com\n`,
    p_environment: app.environment,
    p_metadata: { area: 'SHOP', event: 'digital_document_ready', order_id: order.orderId },
    p_max_attempts: 5,
  });
  const job = data as { id?: string } | null;
  if (error || !job?.id) {
    console.error('digital-document mail queue failed', order.orderId, error?.message ?? 'no job');
    return { queued: false, reason: 'queue_failed' };
  }
  const { error: linkError } = await admin
    .from('shop_orders')
    .update({ document_email_job_id: job.id })
    .eq('id', order.orderId);
  if (linkError)
    console.error('digital-document mail job link failed', order.orderId, linkError.message);
  return { queued: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const user = userData.user;

  let body: { action?: unknown; documentKey?: unknown; orderId?: unknown; origin?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  if (body.action === 'order') {
    const documentKey = String(body.documentKey ?? '');
    if (!DOCUMENT_KEYS.has(documentKey)) return json(400, { error: 'unknown_document' });

    const { data, error } = await admin.rpc('gellatti_shop_document_order_v1', {
      p_user_id: user.id,
      p_email: user.email ?? '',
      p_document_key: documentKey,
    });
    if (error) return json(500, { error: 'order_failed' });
    const order = data as OrderResult | null;
    if (!order || order.error) {
      const code = order?.error ?? 'order_failed';
      const status =
        code === 'document_not_available'
          ? 403
          : code === 'document_file_missing'
            ? 503
            : code === 'unauthorized'
              ? 401
              : 500;
      return json(status, { error: code });
    }

    const mail = order.created
      ? await queueNotification(admin, order, user.email ?? '', String(body.origin ?? ''))
      : { queued: Boolean(order.emailJobId), reason: 'existing_order' };

    const link = await signedDownload(admin, user.id, order.orderId);
    if ('error' in link) {
      /* The order exists, but there is no file to hand over: say so, never "ready". */
      return json(DOWNLOAD_ERRORS[link.error] ?? 500, {
        error: link.error,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
      });
    }
    return json(200, {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      created: order.created,
      documentVersion: order.documentVersion,
      download: link.download,
      emailQueued: mail.queued,
      emailReason: mail.reason ?? null,
    });
  }

  if (body.action === 'download') {
    const orderId = String(body.orderId ?? '');
    if (!UUID.test(orderId)) return json(400, { error: 'invalid_order' });
    const link = await signedDownload(admin, user.id, orderId);
    if ('error' in link) return json(DOWNLOAD_ERRORS[link.error] ?? 500, { error: link.error });
    return json(200, {
      orderId,
      orderNumber: link.orderNumber,
      documentVersion: link.documentVersion,
      download: link.download,
    });
  }

  return json(400, { error: 'unknown_action' });
});
