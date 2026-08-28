import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { normalizeValidatedBarcode, validateServerResult } from '../_shared/productScanner.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) {
    return json({ error: 'textimport_unavailable' }, 503);
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    return json({ error: 'textimport_row_too_large' }, 413);
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json({ error: 'authentication_required' }, 401);

  let body: Record<string, unknown>;
  try {
    body = objectValue(await request.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const sessionId =
    typeof body.sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(body.sessionId)
      ? body.sessionId
      : null;
  const adapter = objectValue(body.adapter);
  if (
    !sessionId ||
    adapter.version !== 'gellatti_textimport_adapter_v1' ||
    !Number.isInteger(adapter.rowIndex) ||
    Number(adapter.rowIndex) < 1
  ) {
    return json({ error: 'invalid_textimport_request' }, 400);
  }

  const result = objectValue(body.result);
  const validation = validateServerResult(result, []);
  const firstBarcode = Array.isArray(result.barcodes)
    ? objectValue(result.barcodes[0]).value
    : null;
  const barcode = normalizeValidatedBarcode(firstBarcode);
  const validationSnapshot = {
    ok: validation.ok,
    missingCriticalFields: validation.missingCriticalFields,
    highRiskAuthorityRequired: validation.highRiskAuthorityRequired,
    intake: {
      kind: 'TEXTIMPORT',
      adapterVersion: adapter.version,
      sourceRowId: typeof adapter.sourceRowId === 'string' ? adapter.sourceRowId : null,
      rowIndex: adapter.rowIndex,
    },
  };

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await service.rpc('create_product_textimport_session_v1', {
    p_actor_user_id: auth.user.id,
    p_session_id: sessionId,
    p_result: result,
    p_validation: validationSnapshot,
    p_overlay_state: validation.overlayState,
    p_barcode: barcode,
  });
  if (error) return json({ error: 'textimport_session_persistence_failed' }, 503);

  return json({
    sessionId,
    result,
    overlayState: validation.overlayState,
    missingCriticalFields: validation.missingCriticalFields,
    validation: validationSnapshot,
    usage: { visionCalls: 0, webCalls: 0, estimatedCostUsd: 0 },
  });
});
