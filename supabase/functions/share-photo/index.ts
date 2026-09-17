import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CORS_HEADERS,
  PRIVATE_HEADERS,
  linkRefusalAt,
  parseSharePhotoRequest,
  photoTypeOf,
  refusalOf,
  refusalStatus,
  type SharePhotoDecision,
} from './protocol.ts';

/**
 * share-photo — the sharer's own photograph for a direct share, as BYTES.
 *
 * POST { token } — anyone holding a valid share token, a logged-out guest included.
 * POST { shareLinkId } — only the signed-in sharer, recipe owner or a recipient.
 *
 * Every request asks the database first (gellatti_share_photo_v1) with the
 * CALLER's own credentials, so auth.uid() is the real caller and a revoked or
 * expired link is refused on the very next request. Only after a positive
 * decision is the private object read — with the service role, for that link
 * only, re-checking the link at read time. The token travels in the body, never
 * in a URL. Nothing is logged: not the token, not the path, not the image.
 */
const BUCKET = 'recipe-share-photos';

const refuse = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...CORS_HEADERS, ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
  });
const noPhoto = () =>
  new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...PRIVATE_HEADERS } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return refuse(405, 'method_not_allowed');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return refuse(400, 'invalid_request');
  }
  const access = parseSharePhotoRequest(body);
  if (!access) return refuse(400, 'invalid_request');

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await caller.rpc(
    'gellatti_share_photo_v1',
    access.by === 'token' ? { p_token: access.token } : { p_share_link_id: access.shareLinkId },
  );
  if (error || !data) return refuse(503, 'share_photo_unavailable');
  const decision = data as SharePhotoDecision;
  if (!decision.ok) {
    const refusal = refusalOf(decision);
    return refuse(refusalStatus(refusal), refusal);
  }
  if (!decision.has_own_photo) return noPhoto();

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row, error: rowError } = await admin
    .from('recipe_share_link_photos')
    .select('storage_path, recipe_share_links!inner(status, expires_at)')
    .eq('share_link_id', decision.share_link_id)
    .maybeSingle();
  if (rowError) return refuse(503, 'share_photo_unavailable');
  if (!row) return noPhoto(); // detached between the decision and the read
  const lateRefusal = linkRefusalAt(
    row.recipe_share_links as { status?: string; expires_at?: string | null },
    new Date(),
  );
  if (lateRefusal) return refuse(refusalStatus(lateRefusal), lateRefusal);

  const { data: file, error: fileError } = await admin.storage
    .from(BUCKET)
    .download(row.storage_path);
  if (fileError || !file) return refuse(502, 'share_photo_read_failed');
  return new Response(file, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      ...PRIVATE_HEADERS,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'inline',
      'X-Share-Photo-Type': photoTypeOf(file.type),
    },
  });
});
