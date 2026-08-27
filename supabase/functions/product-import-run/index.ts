import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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

const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization)
    return json({ error: 'product_import_run_unavailable' }, 503);
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json({ error: 'authentication_required' }, 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let rpc: { data: unknown; error: { message: string } | null };
  if (action === 'preflight') {
    rpc = await service.rpc('product_import_clean_preflight_v1', {
      p_actor_user_id: auth.user.id,
    });
  } else if (action === 'start') {
    const fingerprint = typeof body.sourceFingerprint === 'string' ? body.sourceFingerprint : '';
    const totalRows = Number(body.totalRows);
    if (!/^[0-9a-f]{64}$/.test(fingerprint) || !Number.isInteger(totalRows) || totalRows < 1)
      return json({ error: 'invalid_import_identity' }, 400);
    const mode = body.mode === 'STANDARD' ? 'STANDARD' : 'CLEAN_OWNER_REIMPORT';
    rpc = await service.rpc('start_product_import_run_v1', {
      p_actor_user_id: auth.user.id,
      p_source: 'INTIMPORT',
      p_mode: mode,
      p_label:
        typeof body.label === 'string' && body.label.trim()
          ? body.label.trim().slice(0, 160)
          : 'INTIMPORT clean owner reimport',
      p_source_file_name:
        typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 240) : null,
      p_source_fingerprint: fingerprint,
      p_total_rows: totalRows,
    });
  } else {
    const runId = body.runId;
    if (!uuid(runId)) return json({ error: 'invalid_import_run_id' }, 400);
    if (action === 'state') {
      rpc = await service.rpc('product_import_run_state_v1', {
        p_actor_user_id: auth.user.id,
        p_import_run_id: runId,
      });
    } else if (action === 'cancel') {
      rpc = await service.rpc('request_product_import_cancel_v1', {
        p_actor_user_id: auth.user.id,
        p_import_run_id: runId,
      });
    } else if (action === 'finish') {
      const status = body.status;
      if (status !== 'CANCELLED' && status !== 'COMPLETED' && status !== 'FAILED')
        return json({ error: 'invalid_import_terminal_status' }, 400);
      rpc = await service.rpc('finish_product_import_run_v1', {
        p_actor_user_id: auth.user.id,
        p_import_run_id: runId,
        p_status: status,
      });
    } else if (action === 'recordOutcome') {
      const rowIndex = Number(body.rowIndex);
      const outcome = body.outcome;
      if (
        !Number.isInteger(rowIndex) ||
        rowIndex < 0 ||
        !['REUSED', 'REVIEW', 'SKIPPED', 'FAILED'].includes(String(outcome))
      )
        return json({ error: 'invalid_import_row_outcome' }, 400);
      rpc = await service.rpc('record_product_import_row_outcome_v1', {
        p_actor_user_id: auth.user.id,
        p_import_run_id: runId,
        p_row_index: rowIndex,
        p_source_row_id: typeof body.sourceRowId === 'string' ? body.sourceRowId : null,
        p_display_name: typeof body.displayName === 'string' ? body.displayName : null,
        p_outcome: outcome,
        p_error: typeof body.error === 'string' ? body.error.slice(0, 4000) : null,
        p_result: typeof body.result === 'object' && body.result !== null ? body.result : {},
      });
    } else if (action === 'rollbackBatch') {
      const batchSize = Number(body.batchSize ?? 8);
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20)
        return json({ error: 'invalid_rollback_batch_size' }, 400);
      rpc = await service.rpc('rollback_product_import_run_batch_v1', {
        p_actor_user_id: auth.user.id,
        p_import_run_id: runId,
        p_batch_size: batchSize,
      });
    } else return json({ error: 'unknown_action' }, 400);
  }
  if (rpc.error) {
    const message = rpc.error.message;
    const status = /authorization|required/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : /PI=2088|PR=0|blocked|eligible|conflict|drift/i.test(message)
          ? 409
          : 400;
    return json({ error: message }, status);
  }
  return json(rpc.data);
});
