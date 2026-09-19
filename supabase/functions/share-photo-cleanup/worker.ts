import {
  CLAIM_LIMIT,
  CLEANUP_KEY_HEADER,
  JSON_HEADERS,
  confirmedNames,
  planRemoval,
  removalOutcome,
  secretEquals,
} from './protocol.ts';

/**
 * The worker's decision flow, with its database and Storage calls injected so it
 * can be executed in tests exactly as it runs in production.
 *
 * AUTHORISATION (owner decision 2026-09-17): the caller must present the cleanup
 * call secret in `x-gellatti-cleanup-key`. That secret exists only to invoke this
 * cleanup; the project's service role key is NOT the call credential — it stays
 * inside `deps`, for this worker's own database and Storage calls. A request
 * without the secret, with a wrong secret, with a user token or with the public
 * key is refused BEFORE claim, confirm, remove or settle is called, and the
 * worker refuses everything while its own secret is unset.
 */
export interface CleanupDeps {
  claim(limit: number): Promise<{ data: unknown; error: unknown }>;
  confirm(token: string, names: string[]): Promise<{ data: unknown; error: unknown }>;
  remove(names: string[]): Promise<{ error: unknown }>;
  settle(
    token: string,
    removed: string[],
    error: string | null,
  ): Promise<{ data: unknown; error: unknown }>;
}

export interface CleanupEnvironment {
  /** The configured call secret. Absent or blank ⇒ the worker does nothing at all. */
  cleanupKey?: string | null;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export async function handleCleanupRequest(
  request: Request,
  environment: CleanupEnvironment,
  deps: CleanupDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = (environment.cleanupKey ?? '').trim();
  if (!expected) return json(503, { error: 'not_configured' });

  const presented = (request.headers.get(CLEANUP_KEY_HEADER) ?? '').trim();
  if (!secretEquals(presented, expected)) return json(403, { error: 'forbidden' });

  const claimed = await deps.claim(CLAIM_LIMIT);
  if (claimed.error) return json(503, { error: 'claim_failed' });

  const plan = planRemoval(claimed.data);
  if (!plan.token || plan.names.length === 0) return json(200, { claimed: 0 });

  // The last check before anything is deleted: the database re-reads every file
  // under its lock and returns only what is still safe to remove.
  const confirmation = await deps.confirm(plan.token, plan.names);
  if (confirmation.error) return json(503, { error: 'confirm_failed' });
  const names = confirmedNames(plan, confirmation.data);
  if (names.length === 0) return json(200, { claimed: plan.names.length, confirmed: 0 });

  const { error: removeError } = await deps.remove(names);
  const outcome = removalOutcome(names, removeError);

  const settled = await deps.settle(plan.token, outcome.removed, outcome.error);
  if (settled.error) return json(503, { error: 'settle_failed' });
  return json(200, { claimed: plan.names.length, confirmed: names.length, settled: settled.data });
}
