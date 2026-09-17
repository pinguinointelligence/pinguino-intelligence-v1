/**
 * QA ONLY — the capture sink for the app mail lane (isolation A).
 *
 * email-dispatch on the QA branch has EMAIL_PROVIDER_ENDPOINT pointed here, so
 * the whole lane runs for real — claim, provider answer, settle, retry, backoff,
 * dedup — and no message ever reaches a person. It answers in the provider's
 * shape (`{ id }` on success), because a `sent` row without a provider message
 * id is refused by the database.
 *
 * It refuses outside the QA project and without the QA sink key. Two addresses
 * drive the failure ladders instead of a capture:
 *   *@retry.invalid      → 500 (retryable: attempts + backoff)
 *   *@permanent.invalid  → 422 (permanent: abandoned, no further attempt)
 */
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const QA_REF = 'ncmsonfwbgsqedgnzofg';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const secretEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (req) => {
  if (!(Deno.env.get('SUPABASE_URL') ?? '').startsWith(`https://${QA_REF}.supabase.co`)) {
    return json(403, { error: 'not_the_qa_project' });
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const expected = Deno.env.get('EMAIL_SINK_KEY') ?? '';
  if (!secretEquals(presented, expected)) return json(403, { error: 'forbidden' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const to = Array.isArray(body.to) ? body.to.map(String) : [String(body.to ?? '')];
  const outcome = to.some((r) => r.endsWith('@retry.invalid'))
    ? 'retryable'
    : to.some((r) => r.endsWith('@permanent.invalid'))
      ? 'permanent'
      : 'captured';
  const id = `qa_${crypto.randomUUID()}`;

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 1 });
  try {
    await sql`
      insert into qa_harness.email_sink_capture (provider_message_id, outcome, recipients, sender, subject, body_html, body_text, headers, idempotency_key, raw)
      values (${outcome === 'captured' ? id : null}, ${outcome}, ${to}, ${String(body.from ?? '')},
              ${String(body.subject ?? '')}, ${String(body.html ?? '')}, ${String(body.text ?? '')},
              ${sql.json((body.headers ?? {}) as Record<string, unknown>)},
              ${req.headers.get('Idempotency-Key') ?? req.headers.get('idempotency-key')},
              ${sql.json(body)})`;
  } finally {
    await sql.end();
  }

  if (outcome === 'retryable') return json(500, { error: 'qa_sink_forced_retryable' });
  if (outcome === 'permanent') return json(422, { error: 'qa_sink_forced_permanent' });
  return json(200, { id });
});
