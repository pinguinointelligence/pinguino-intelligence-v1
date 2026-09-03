/**
 * LIVE PRODUCT IDENTIFICATION — the cheap boundary the live sweep needs.
 *
 * It answers exactly ONE question: "what product or ingredient is visible in this one
 * selected frame?" It does not profile. No nutrition, no allergens, no composition, no
 * recipe physics, no ingredient creation, no contribution. `product-scan-analyze` remains
 * the only place any of that happens, and this function must never grow into it.
 *
 * THE DIVISION OF AUTHORITY, which is the whole point:
 *
 *   the model IDENTIFIES — it may return a name, a brand, a variant and a confidence
 *   the CATALOGUE DECIDES — canonical identity comes only from `search_products_v1`
 *
 * The model is never shown, never asked for and never trusted with a product id. Its
 * answer is a string that then has to survive a catalogue lookup; if the catalogue does
 * not know it, the response is UNRESOLVED and the sweep hands the product to the existing
 * deep flow. That is what makes a wrong guess harmless.
 *
 * COST. Cheap evidence is tried FIRST and short-circuits the model entirely: a barcode or
 * label text that the catalogue can resolve costs zero vision calls. The model runs only
 * when local evidence resolved nothing, and then exactly once per request on ONE frame.
 * Never video, never a stream, never a batch.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const IDENTIFY_MODEL = 'gpt-5.6-luna';
const MODEL_PRICING_USD_PER_MILLION = { input: 0.2, output: 1.2 };
/** One frame, one call. A live sweep must never batch or retry its way into a bill. */
const MAX_VISION_CALLS_PER_REQUEST = 1;
/** Bigger than this is not a "selected best frame" — it is someone sending video. */
const MAX_FRAME_BYTES = 1_500_000;
const CATALOG_LIMIT = 5;

/**
 * Identification only. The schema is the enforcement: there is no field in which the
 * model could return an id, a nutrient or an ingredient, so it cannot invent one.
 */
const IDENTIFY_SCHEMA = {
  type: 'json_schema',
  name: 'gellatti_live_identity_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'brand', 'variant', 'confidence', 'kind'],
    properties: {
      name: {
        type: ['string', 'null'],
        description: 'The everyday name of the single most prominent food item, or null.',
      },
      brand: { type: ['string', 'null'] },
      variant: { type: ['string', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      kind: { type: 'string', enum: ['FRESH_PRODUCE', 'PACKAGED', 'UNCLEAR'] },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'You identify ONE food item held in front of a phone camera for Gellatti.',
  'Name the single most prominent item in the everyday word a shopper would use.',
  'Fresh produce is normal and expected: a banana is "banan", an apple is "jabłko".',
  'For packaged goods give the brand exactly as printed, and the variant if it is legible.',
  'Prefer the language of any text visible on the packaging; otherwise use Polish.',
  'Never guess a brand that is not visible. Never describe nutrition, ingredients or weight.',
  'If you cannot tell what the item is, return name null, kind UNCLEAR and a low confidence.',
].join(' ');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, 200);
};

type CatalogHit = { productId: string; displayName: string; brand: string | null };

/** Read the model's JSON answer out of the Responses payload. */
function parseIdentity(payload: Record<string, unknown>): {
  name: string | null;
  brand: string | null;
  variant: string | null;
  confidence: number;
  kind: string;
} | null {
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = (item as Record<string, unknown>)?.content;
    for (const part of Array.isArray(content) ? content : []) {
      const value = (part as Record<string, unknown>)?.text;
      if (typeof value !== 'string') continue;
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        return {
          name: text(parsed.name),
          brand: text(parsed.brand),
          variant: text(parsed.variant),
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
          kind: typeof parsed.kind === 'string' ? parsed.kind : 'UNCLEAR',
        };
      } catch {
        // A model that did not honour the schema identified nothing.
      }
    }
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !authorization) return json({ error: 'identify_unavailable' }, 503);

  // The caller's own token: every catalogue read below is subject to their RLS, exactly
  // as it would be from the client. This function grants no extra reach.
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user) return json({ error: 'identify_requires_sign_in' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'identify_bad_request' }, 400);
  }

  const evidence = (body.evidence ?? {}) as Record<string, unknown>;
  const barcode = text(evidence.barcode);
  const ocrText = text(evidence.ocrText);
  const brandText = text(evidence.brandText);
  const frame = (body.frame ?? null) as Record<string, unknown> | null;
  const base64 = typeof frame?.base64 === 'string' ? frame.base64 : null;
  const mime = typeof frame?.mime === 'string' ? frame.mime : 'image/jpeg';

  if (base64 && base64.length > MAX_FRAME_BYTES) {
    // A live sweep sends ONE selected still. Anything this size is not that.
    return json({ error: 'identify_frame_too_large' }, 413);
  }

  /** The catalogue is the only source of a canonical id, for every route below. */
  const resolve = async (query: string): Promise<CatalogHit | null> => {
    const { data, error } = await client.rpc('search_products_v1', {
      p_query: query,
      p_context: 'TOPPING',
      p_market_scope: 'global',
      p_selected_markets: [],
      p_favorites_only: false,
      p_product_profile: null,
      p_entity_kind: null,
      p_limit: CATALOG_LIMIT,
      p_cursor: 0,
      p_token_groups: [],
    });
    if (error) return null;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    // One unambiguous answer, or none. Picking the first of several would be the quiet
    // wrong match this whole design exists to prevent.
    const hit = rows.length === 1 ? rows[0] : null;
    if (!hit) return null;
    return {
      productId: String(hit.id ?? ''),
      displayName: String(hit.display_name ?? hit.displayName ?? ''),
      brand: (hit.brand as string | null) ?? null,
    };
  };

  const answer = (
    identity: { name: string | null; brand: string | null; variant: string | null } | null,
    confidence: number,
    evidenceType: string,
    hit: CatalogHit | null,
    visionCalls: number,
    cost = 0,
  ) =>
    json({
      status: hit ? 'RESOLVED' : 'UNRESOLVED',
      identity,
      confidence,
      evidenceType,
      resolution: hit,
      usage: { visionCalls, estimatedCostUsd: cost },
    });

  // ── 1. Local evidence first. Both of these cost nothing. ──────────────────────
  if (barcode) {
    const hit = await resolve(barcode);
    if (hit) return answer({ name: hit.displayName, brand: hit.brand, variant: null }, 1, 'BARCODE', hit, 0);
  }
  const localText = ocrText ?? brandText;
  if (localText) {
    const hit = await resolve(localText);
    if (hit)
      return answer({ name: hit.displayName, brand: hit.brand, variant: null }, 0.85, 'OCR', hit, 0);
  }

  // ── 2. Only now is the model worth paying for. ────────────────────────────────
  if (!base64) return answer(null, 0, 'NONE', null, 0);

  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  const projectId = Deno.env.get('OPENAI_PROJECT_ID');
  if (!openAiKey || !projectId) return json({ error: 'identify_unavailable' }, 503);

  const hints = [
    ocrText ? `Text read from the label: ${ocrText}` : null,
    brandText ? `Brand text read from the label: ${brandText}` : null,
  ].filter(Boolean);

  let payload: Record<string, unknown>;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Project': projectId,
      },
      body: JSON.stringify({
        model: IDENTIFY_MODEL,
        instructions: SYSTEM_PROMPT,
        max_output_tokens: 200,
        // No tools at all: identification never browses, never calls anything.
        input: [
          {
            role: 'user',
            content: [
              ...(hints.length > 0 ? [{ type: 'input_text', text: hints.join('\n') }] : []),
              { type: 'input_image', image_url: `data:${mime};base64,${base64}` },
            ],
          },
        ],
        text: { format: IDENTIFY_SCHEMA },
      }),
    });
    if (!response.ok) throw new Error('provider_request_failed');
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // A provider hiccup mid-sweep is not an error the customer should ever see; the
    // scanner simply keeps looking.
    return answer(null, 0, 'VISION_UNAVAILABLE', null, 0);
  }

  const usage = (payload.usage ?? {}) as Record<string, unknown>;
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const cost =
    (inputTokens * MODEL_PRICING_USD_PER_MILLION.input) / 1_000_000 +
    (outputTokens * MODEL_PRICING_USD_PER_MILLION.output) / 1_000_000;

  const identified = parseIdentity(payload);
  if (!identified?.name) {
    return answer(null, identified?.confidence ?? 0, 'VISUAL', null, MAX_VISION_CALLS_PER_REQUEST, cost);
  }

  // The model named something. The CATALOGUE decides whether that is a Gellatti product.
  const query = [identified.brand, identified.name].filter(Boolean).join(' ');
  const hit = (await resolve(query)) ?? (await resolve(identified.name));
  return answer(
    { name: identified.name, brand: identified.brand, variant: identified.variant },
    identified.confidence,
    localText ? 'VISUAL_PLUS_TEXT' : 'VISUAL',
    hit,
    MAX_VISION_CALLS_PER_REQUEST,
    cost,
  );
});
