import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { classifySourceAuthority } from '../_shared/sourceAuthority.ts';
import { sha256Text, stableJson } from '../_shared/productScanner.ts';
import {
  PRODUCT_RECOGNITION_MODEL_SCHEMA,
  PRODUCT_RECOGNITION_CACHE_REVISION,
  PRODUCT_RECOGNITION_VERSION,
  canonicalizeProductSemanticEvidence,
  classifyProductSemantics,
  validateProductSemanticModelOutput,
  type ProductSemanticEvidence,
} from '../../../src/features/product-intelligence/productRecognition.ts';

/**
 * INTIMPORT targeted web enrichment — the real external provider.
 *
 * SCOPED DELIBERATELY. This function reads its OWN flags
 * (`INTIMPORT_WEB_ENRICHMENT_*`) and never the Scanner's. That separation is
 * load-bearing: the Scanner client sends `allowWeb: true` on every analyze call
 * and is held back purely by `PRODUCT_SCANNER_WEB_SEARCH_ENABLED=false`, so
 * enabling INTIMPORT research through the Scanner flags would silently turn on
 * web search for every ordinary scan.
 *
 * It researches ONLY the fields the caller says are missing, for ONE product,
 * with a hard per-request tool-call ceiling. It returns structured, field-level
 * evidence with real source provenance — it never returns a confidence number.
 * Scoring stays with the deterministic Product Intelligence engine.
 */

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

const numberEnv = (name: string, fallback: number): number => {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

/** Fields the caller may ask about. Anything else is refused. */
/**
 * The provider does not honour `max_tool_calls`: a single response was observed
 * making 3 searches with the ceiling set to 2. Every admission decision therefore
 * reserves this many searches up front, so the cap can never be exceeded rather
 * than merely detected afterwards.
 */
const WORST_CASE_SEARCHES_PER_CALL = 3;

const RESEARCHABLE = new Set([
  'ingredients',
  'allergens',
  // The Scanner's exact-GTIN lookup asks for the basis explicitly: nutrition numbers
  // without one are not a measurement, and per-100 ml never silently becomes per-100 g.
  'nutritionBasis',
  'energyKj',
  'energyKcal',
  'fat',
  'saturatedFat',
  'carbohydrate',
  'sugars',
  'fiber',
  'protein',
  'salt',
  'barcode',
  'manufacturer',
  'netQuantity',
  'countryOfOrigin',
  'dosage',
  'technicalParameters',
  'technicalSource',
]);

/**
 * Strict provider schema. The model reports what it FOUND and where; it never
 * reports how sure it is, and it never sees or sets a confidence score.
 */
const ENRICHMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sources', 'facts', 'notFound'],
  properties: {
    sources: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'title', 'kind'],
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['manufacturer', 'brand', 'technical_pdf', 'retailer', 'database', 'other'],
          },
        },
      },
    },
    facts: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value', 'sourceUrl'],
        properties: {
          field: { type: 'string' },
          /** Verbatim from the source. Never inferred, never paraphrased into a claim. */
          value: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
      },
    },
    /** Fields the model looked for and genuinely could not find. */
    notFound: { type: 'array', maxItems: 20, items: { type: 'string' } },
  },
} as const;

const SYSTEM_PROMPT = `You research PUBLIC product information for Gellatti's catalogue.

You will be given a product's known identity and a short list of MISSING fields.

Rules:
- Research ONLY the listed missing fields. Never re-research facts already given.
- Prefer, in order: the manufacturer's official site, an official technical/specification PDF,
  the official brand site, a structured GTIN/product database, a major retailer showing the
  exact labelled product. Use a general web page only if nothing better exists.
- Report values VERBATIM from the source. Never estimate, never average, never infer a
  nutrition value from a similar product, never reconstruct an EAN.
- Every fact must cite the exact sourceUrl it came from, and that URL must be one you
  actually consulted.
- If you cannot find a field from a source you trust, put it in notFound. An honest
  "not found" is always better than a plausible guess.
- Never state how confident you are. Confidence is computed elsewhere from the evidence.`;

const SEMANTIC_SYSTEM_PROMPT = `You classify product semantics for Gellatti. You do not create nutrition or chemistry.

Use only the exact evidence object provided. Determine what the product is, its physical form,
its intended BASE/TOPPING role, whether it is genuinely technical or dosage-dependent, and what
the stated dosage means. "professional" is market context, never by itself technical. q.b./quanto
basta/as desired is not a missing fixed dose and is not automatically topping: combine it with
manufacturer category, description, form and intended use. A genuine stabilizer, emulsifier,
integrator or dosage-critical base remains technical.

Never invent fat, protein, water, solids, sugars, POD, PAC, density, dosage values or dosage units.
If evidence is insufficient, use UNKNOWN or NEITHER_REVIEW. evidenceRefs may contain only exact
top-level evidence field names. reasonCodes are concise uppercase audit facts, not hidden reasoning.`;

const semanticEvidenceFromRequest = (value: unknown): ProductSemanticEvidence | null => {
  const raw = objectValue(value);
  const allowed = new Set([
    'name',
    'brand',
    'manufacturer',
    'manufacturerCode',
    'gtin',
    'productType',
    'category',
    'subcategory',
    'variant',
    'ingredients',
    'nutrition',
    'description',
    'dosage',
    'technicalParameters',
    'sourceUrls',
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) return null;
  const textOrNull = (entry: unknown): string | null => (typeof entry === 'string' ? entry : null);
  return canonicalizeProductSemanticEvidence({
    name: textOrNull(raw.name),
    brand: textOrNull(raw.brand),
    manufacturer: textOrNull(raw.manufacturer),
    manufacturerCode: textOrNull(raw.manufacturerCode),
    gtin: textOrNull(raw.gtin),
    productType: textOrNull(raw.productType),
    category: textOrNull(raw.category),
    subcategory: textOrNull(raw.subcategory),
    variant: textOrNull(raw.variant),
    ingredients: textOrNull(raw.ingredients),
    nutrition: textOrNull(raw.nutrition),
    description: textOrNull(raw.description),
    dosage: textOrNull(raw.dosage),
    technicalParameters: textOrNull(raw.technicalParameters),
    sourceUrls: Array.isArray(raw.sourceUrls)
      ? raw.sourceUrls.filter((url): url is string => typeof url === 'string')
      : [],
  });
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  const projectId = Deno.env.get('OPENAI_PROJECT_ID');
  if (!url || !anonKey || !serviceKey || !openAiKey || !projectId) {
    return json({ error: 'intimport_enrichment_not_configured' }, 503);
  }

  // Own flag. Scanner flags are deliberately NOT read here.
  if (Deno.env.get('INTIMPORT_WEB_ENRICHMENT_ENABLED') !== 'true') {
    return json({ error: 'intimport_web_enrichment_disabled' }, 403);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const authed = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth } = await authed.auth.getUser();
  if (!auth?.user) return json({ error: 'unauthorized' }, 401);
  const service = createClient(url, serviceKey);

  let body: Record<string, unknown>;
  try {
    body = objectValue(await request.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const importId = typeof body.importId === 'string' ? body.importId.slice(0, 64) : null;
  if (body.action === 'semantic_classification') {
    const evidence = semanticEvidenceFromRequest(body.evidence);
    if (!importId || !evidence) return json({ error: 'invalid_semantic_request' }, 400);
    const deterministic = classifyProductSemantics(evidence);
    if (!deterministic.modelRequired) {
      return json({
        classification: deterministic,
        evidenceReceipt: null,
        cacheHit: true,
        calls: 0,
        model: null,
        deterministicOnly: true,
      });
    }

    const semanticModel = Deno.env.get('INTIMPORT_ENRICHMENT_MODEL') || 'gpt-5.6-luna';
    // Semantic classification does not perform web search and must not inherit
    // the much smaller web-enrichment budget. It has its own optional setting,
    // with an absolute server ceiling of 40 classifications per import.
    const semanticCap = Math.min(40, numberEnv('INTIMPORT_MAX_SEMANTIC_CALLS_PER_IMPORT', 40));
    const idempotencyKey = await sha256Text(
      stableJson({
        action: 'semantic_classification',
        classifierVersion: PRODUCT_RECOGNITION_VERSION,
        cacheRevision: PRODUCT_RECOGNITION_CACHE_REVISION,
        evidence,
      }),
    );
    const { data: cachedSemantic, error: cacheError } = await service
      .from('intimport_semantic_classification_usage')
      .select('result_json')
      .eq('user_id', auth.user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (cacheError) return json({ error: 'semantic_cache_unavailable' }, 503);
    if (cachedSemantic?.result_json) {
      const cachedResult = objectValue(cachedSemantic.result_json);
      const cachedClassification = objectValue(cachedResult.classification);
      if (
        cachedClassification.authority === PRODUCT_RECOGNITION_VERSION &&
        cachedClassification.classificationSource === 'SERVER_MODEL' &&
        cachedClassification.evidenceFingerprint === deterministic.evidenceFingerprint
      ) {
        return json({
          ...cachedResult,
          evidenceReceipt: idempotencyKey,
          cacheHit: true,
          calls: 0,
        });
      }
      return json({
        classification: deterministic,
        evidenceReceipt: null,
        cacheHit: true,
        calls: 0,
        model: semanticModel,
        error:
          typeof cachedResult.error === 'string'
            ? cachedResult.error
            : 'semantic_attempt_not_repeated',
      });
    }

    const { data: reservation, error: semanticReservationError } = await service.rpc(
      'reserve_intimport_semantic_classification',
      {
        p_user_id: auth.user.id,
        p_import_id: importId,
        p_idempotency_key: idempotencyKey,
        p_classifier_version: PRODUCT_RECOGNITION_VERSION,
        p_model: semanticModel,
        p_evidence_fingerprint: deterministic.evidenceFingerprint,
        p_cap: semanticCap,
      },
    );
    if (semanticReservationError) return json({ error: 'semantic_usage_unavailable' }, 503);
    if (reservation === 'CAP_REACHED') {
      return json(
        {
          error: 'intimport_semantic_call_cap_reached',
          cap: semanticCap,
        },
        429,
      );
    }
    if (reservation !== 'RESERVED') {
      return json({
        classification: deterministic,
        evidenceReceipt: null,
        cacheHit: true,
        calls: 0,
        model: semanticModel,
        error: 'semantic_attempt_not_repeated',
      });
    }

    const finalizeSemanticAttempt = async (result: Record<string, unknown>) =>
      service
        .from('intimport_semantic_classification_usage')
        .update({
          input_tokens: Number(result.inputTokens ?? 0),
          output_tokens: Number(result.outputTokens ?? 0),
          latency_ms: Number(result.latencyMs ?? 0),
          result_json: result,
        })
        .eq('user_id', auth.user.id)
        .eq('idempotency_key', idempotencyKey);

    const prompt =
      `Exact product evidence (the only allowed source):\n${JSON.stringify(evidence)}\n` +
      `Deterministic unresolved dimensions: ${deterministic.modelReasonCodes.join(', ') || 'none'}.`;
    const startedAt = Date.now();
    let semanticPayload: Record<string, unknown>;
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Project': projectId,
        },
        body: JSON.stringify({
          model: semanticModel,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: SEMANTIC_SYSTEM_PROMPT }] },
            { role: 'user', content: [{ type: 'input_text', text: prompt }] },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'gellatti_product_recognition_v2',
              strict: true,
              schema: PRODUCT_RECOGNITION_MODEL_SCHEMA,
            },
          },
        }),
      });
      semanticPayload = objectValue(await response.json());
      if (!response.ok) throw new Error('provider_request_failed');
    } catch {
      const errorResult = {
        status: 'ERROR',
        calls: 1,
        model: semanticModel,
        latencyMs: Date.now() - startedAt,
        error: 'semantic_provider_unavailable',
      };
      await finalizeSemanticAttempt(errorResult);
      return json({
        classification: deterministic,
        evidenceReceipt: null,
        cacheHit: false,
        calls: 1,
        model: semanticModel,
        error: 'semantic_provider_unavailable',
      });
    }
    const outputText = Array.isArray(semanticPayload.output)
      ? semanticPayload.output
          .flatMap((item) => {
            const row = objectValue(item);
            return Array.isArray(row.content) ? row.content : [];
          })
          .map((part) => objectValue(part).text)
          .filter((text): text is string => typeof text === 'string')
          .join('')
      : null;
    const modelOutput: unknown = (() => {
      try {
        return outputText ? JSON.parse(outputText) : null;
      } catch {
        return null;
      }
    })();
    const classification = validateProductSemanticModelOutput(evidence, modelOutput);
    if (!classification) {
      const rejectedResult = {
        status: 'ERROR',
        calls: 1,
        model: semanticModel,
        latencyMs: Date.now() - startedAt,
        inputTokens: Number(objectValue(semanticPayload.usage).input_tokens ?? 0),
        outputTokens: Number(objectValue(semanticPayload.usage).output_tokens ?? 0),
        error: 'semantic_output_rejected',
      };
      await finalizeSemanticAttempt(rejectedResult);
      return json({
        classification: deterministic,
        evidenceReceipt: null,
        cacheHit: false,
        calls: 1,
        model: semanticModel,
        error: 'semantic_output_rejected',
      });
    }
    const usage = objectValue(semanticPayload.usage);
    const semanticResult = {
      status: 'CLASSIFIED',
      classification,
      calls: 1,
      model: semanticModel,
      latencyMs: Date.now() - startedAt,
      inputTokens: Number(usage.input_tokens ?? 0),
      outputTokens: Number(usage.output_tokens ?? 0),
    };
    const { error: semanticUpdateError } = await finalizeSemanticAttempt(semanticResult);
    if (semanticUpdateError) {
      return json({
        classification: deterministic,
        evidenceReceipt: null,
        cacheHit: false,
        calls: 1,
        model: semanticModel,
        error: 'semantic_ledger_write_failed',
      });
    }
    return json({
      ...semanticResult,
      evidenceReceipt: idempotencyKey,
      cacheHit: false,
    });
  }

  const product = objectValue(body.product);
  const requestedFields = Array.isArray(body.fields)
    ? body.fields.filter((f): f is string => typeof f === 'string' && RESEARCHABLE.has(f))
    : [];
  if (!importId || requestedFields.length === 0) {
    return json({ error: 'invalid_enrichment_request' }, 400);
  }

  const maxPerProduct = Math.min(2, numberEnv('INTIMPORT_MAX_CALLS_PER_PRODUCT', 2));
  const maxPerImport = numberEnv('INTIMPORT_MAX_EXTERNAL_CALLS_PER_IMPORT', 40);
  const model = Deno.env.get('INTIMPORT_ENRICHMENT_MODEL') || 'gpt-5.6-luna';

  // Import-wide cap, counted SERVER-SIDE on ACTUAL provider web searches.
  //
  // Counting rows here would have been wrong: the first live run showed the
  // provider ignoring `max_tool_calls` and making up to 3 searches for a single
  // job (25 searches across 10 jobs). A row count would therefore have allowed
  // roughly three times the ceiling it advertises. A client-supplied counter
  // would be worthless as a spend control either way.
  const { data: usageRows, error: countError } = await service
    .from('intimport_enrichment_usage')
    .select('web_calls')
    .eq('user_id', auth.user.id)
    .eq('import_id', importId);
  if (countError) return json({ error: 'enrichment_usage_unavailable' }, 503);
  const usedSoFar = (usageRows ?? []).reduce(
    (sum, row) => sum + Number((row as { web_calls: number }).web_calls ?? 0),
    0,
  );
  // Reserve conservatively BEFORE spending. One response can invoke several
  // searches (3 observed live despite max_tool_calls: 2), so admitting a call
  // whenever `used < cap` would overshoot. Refuse unless the WORST case still
  // fits under the ceiling.
  if (usedSoFar + WORST_CASE_SEARCHES_PER_CALL > maxPerImport) {
    return json(
      {
        error: 'intimport_import_call_cap_reached',
        callsUsed: usedSoFar,
        cap: maxPerImport,
        worstCaseReserve: WORST_CASE_SEARCHES_PER_CALL,
      },
      429,
    );
  }

  // Only public product identity leaves the system — never recipes, never
  // account data (§38).
  const identity = {
    brand: typeof product.brand === 'string' ? product.brand.slice(0, 120) : null,
    manufacturer:
      typeof product.manufacturer === 'string' ? product.manufacturer.slice(0, 160) : null,
    name: typeof product.name === 'string' ? product.name.slice(0, 200) : null,
    variant: typeof product.variant === 'string' ? product.variant.slice(0, 160) : null,
    barcode: typeof product.barcode === 'string' ? product.barcode.slice(0, 20) : null,
    netQuantity: typeof product.netQuantity === 'string' ? product.netQuantity.slice(0, 60) : null,
    knownSourceUrl:
      typeof product.knownSourceUrl === 'string' ? product.knownSourceUrl.slice(0, 400) : null,
    technicalPdfUrl:
      typeof product.technicalPdfUrl === 'string' ? product.technicalPdfUrl.slice(0, 400) : null,
  };

  // The caller's deterministic source order (§4). The FIRST step decides where
  // this call may look; without it the model just searches, and search rankings
  // hand back SEO aggregators — which is exactly what the first paid run got.
  const planStep = objectValue(body.researchStep);
  const stepKind = typeof planStep.kind === 'string' ? planStep.kind : 'OPEN_WEB_SEARCH';
  const stepUrl = typeof planStep.url === 'string' ? planStep.url.slice(0, 400) : null;
  const allowedDomains = Array.isArray(planStep.allowedDomains)
    ? planStep.allowedDomains
        .filter((d): d is string => typeof d === 'string' && /^[a-z0-9.-]+$/i.test(d))
        .slice(0, 8)
    : [];

  // Cache key deliberately EXCLUDES importId: one canonical product is one
  // research job, however many imports or rows ask for it. Including the import
  // id meant a second run re-researched everything at full price — observed live
  // as 25 fresh searches and zero cache hits on an identical subset.
  const idempotencyKey = await sha256Text(
    stableJson({ identity, fields: [...requestedFields].sort() }),
  );

  const { data: cached } = await service
    .from('intimport_enrichment_usage')
    .select('result_json')
    .eq('user_id', auth.user.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (cached?.result_json) {
    return json({
      ...(cached.result_json as Record<string, unknown>),
      evidenceReceipt: idempotencyKey,
      cacheHit: true,
      calls: 0,
    });
  }

  const askedFor = requestedFields.join(', ');
  const directive =
    stepKind === 'OWNER_TECHNICAL_PDF' && stepUrl
      ? `OPEN THIS EXACT DOCUMENT FIRST and read the missing fields from it: ${stepUrl}\n` +
        `It is the manufacturer's own technical/specification document. Do not search elsewhere unless it genuinely lacks the field.\n`
      : stepKind === 'OWNER_OFFICIAL_URL' && stepUrl
        ? `OPEN THIS EXACT PAGE FIRST and read the missing fields from it: ${stepUrl}\n` +
          `It is the manufacturer's/brand's own page. Do not search elsewhere unless it genuinely lacks the field.\n`
        : stepKind === 'OFFICIAL_DOMAIN_SEARCH'
          ? `Search ONLY the official domain(s) ${allowedDomains.join(', ')} for this exact product.\n`
          : stepKind === 'GTIN_LOOKUP'
            ? `Look the exact GTIN up in the structured product databases available to you.\n`
            : stepKind === 'RETAILER_SEARCH'
              ? `No official source carried the missing fields. A recognized retailer listing for the exact product is acceptable now.\n`
              : `No stronger source is available. Open search is a last resort; prefer the most authoritative page you can find.\n`;

  const prompt =
    `Known identity: ${JSON.stringify(identity)}\n` +
    `MISSING fields to research (and nothing else): ${askedFor}\n` +
    directive +
    (identity.barcode
      ? `A validated GTIN is known — use it to pin the exact product before any name search.\n`
      : `No GTIN is known — identify the exact product by brand, name, variant and net quantity.\n`);

  const startedAt = Date.now();
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
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
        // A HARD restriction, not a preference: when an official domain is known
        // the provider is not permitted to return anything else, so a retailer or
        // SEO page cannot win on ranking.
        tools: [
          allowedDomains.length > 0
            ? { type: 'web_search', filters: { allowed_domains: allowedDomains } }
            : { type: 'web_search' },
        ],
        max_tool_calls: maxPerProduct,
        text: {
          format: {
            type: 'json_schema',
            name: 'gellatti_intimport_enrichment',
            strict: true,
            schema: ENRICHMENT_SCHEMA,
          },
        },
      }),
    });
    payload = objectValue(await response.json());
    if (!response.ok) throw new Error('provider_request_failed');
  } catch {
    // A single product's failure must never fail the batch (§26).
    return json(
      {
        facts: [],
        sources: [],
        notFound: requestedFields,
        calls: 0,
        error: 'provider_unavailable',
      },
      200,
    );
  }

  const latencyMs = Date.now() - startedAt;
  const outputText = Array.isArray(payload.output)
    ? payload.output
        .flatMap((item) => {
          const row = objectValue(item);
          return Array.isArray(row.content) ? row.content : [];
        })
        .map((part) => objectValue(part).text)
        .filter((text): text is string => typeof text === 'string')
        .join('')
    : null;

  // A malformed provider response is ignored, never partially trusted.
  const parsed: Record<string, unknown> = (() => {
    try {
      return outputText ? objectValue(JSON.parse(outputText)) : {};
    } catch {
      return {};
    }
  })();

  const declaredSources = Array.isArray(parsed.sources) ? parsed.sources : [];
  const sourceByUrl = new Map<string, { url: string; title: string }>();
  for (const item of declaredSources) {
    const row = objectValue(item);
    if (typeof row.url === 'string') {
      sourceByUrl.set(row.url, { url: row.url, title: String(row.title ?? '') });
    }
  }

  // Authority is decided HERE, from the actual URL — never from the model's own
  // claim about what kind of source it used.
  const facts = (Array.isArray(parsed.facts) ? parsed.facts : []).flatMap((item) => {
    const row = objectValue(item);
    const field = String(row.field ?? '');
    const value = typeof row.value === 'string' ? row.value.trim() : '';
    const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl : '';
    if (!RESEARCHABLE.has(field) || value === '' || !requestedFields.includes(field)) return [];
    const authority = classifySourceAuthority({
      url: sourceUrl,
      brand: identity.brand,
      manufacturer: identity.manufacturer,
      ownerProvided: false,
    });
    if (authority.authority === 'UNKNOWN') return [];
    return [
      {
        field,
        value,
        sourceUrl,
        sourceDomain: authority.domain,
        sourceTitle: sourceByUrl.get(sourceUrl)?.title ?? null,
        sourceAuthorityClass: authority.authority,
        evidenceSource: authority.evidenceSource,
        retrievedAt: new Date().toISOString(),
      },
    ];
  });

  const webCalls = Array.isArray(payload.output)
    ? payload.output.filter((item) => String(objectValue(item).type ?? '').includes('web_search'))
        .length
    : 0;
  const usage = objectValue(payload.usage);
  const result = {
    requestIdentity: identity,
    requestedFields,
    facts,
    sources: [...sourceByUrl.values()],
    notFound: Array.isArray(parsed.notFound) ? parsed.notFound.map(String) : [],
    // Report what the provider ACTUALLY did. Clamping this to the intended
    // per-product ceiling under-reported real usage by 28% on the first live
    // run (18 reported vs 25 actual) and would quietly understate spend.
    calls: Math.max(1, webCalls),
    webCalls,
    latencyMs,
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    model,
  };

  await service.from('intimport_enrichment_usage').insert({
    user_id: auth.user.id,
    import_id: importId,
    idempotency_key: idempotencyKey,
    model,
    web_calls: webCalls,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    latency_ms: latencyMs,
    fields_requested: requestedFields,
    result_json: result,
  });

  return json({ ...result, evidenceReceipt: idempotencyKey, cacheHit: false });
});
