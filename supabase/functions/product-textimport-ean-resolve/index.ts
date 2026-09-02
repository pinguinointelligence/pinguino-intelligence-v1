import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TEXTIMPORT_EAN_RESOLVER_VERSION = 'gellatti_textimport_ean_resolver_v1' as const;
const ROW_WEB_CALL_CAP = 6;
const RUN_WEB_CALL_CAP = 18;
const WORST_CASE_WEB_CALLS_PER_REQUEST = 3;

type AcceptedAuthority =
  | 'OFFICIAL_MANUFACTURER'
  | 'OFFICIAL_BRAND'
  | 'OFFICIAL_TECHNICAL_PDF'
  | 'OFFICIAL_PRIVATE_LABEL'
  | 'AUTHORITATIVE_RETAILER'
  | 'STRUCTURED_PRODUCT_DATABASE';
type ResearchStep = {
  kind: 'RETAILER_SEARCH' | 'OPEN_WEB_SEARCH';
  url: string | null;
  allowedDomains: string[];
};
type ResolverQuery = {
  resolverVersion: typeof TEXTIMPORT_EAN_RESOLVER_VERSION;
  sourceRowId: string | null;
  identity: {
    exactProductName: string;
    brand: string | null;
    manufacturer: string | null;
    variant: string | null;
    packageText: string | null;
  };
  source: { url: string; title: string | null } | null;
};
type ProviderFact = {
  field: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceAuthorityClass: string;
  retrievedAt: string;
  researchStep: ResearchStep;
};
type CheckedSource = {
  url: string;
  title: string | null;
  researchStep: ResearchStep;
};
type ResearchTrace = {
  budget: {
    rowWebCallCap: number;
    runWebCallCap: number;
    worstCaseWebCallsPerRequest: number;
    rowWebCallsReserved: number;
    runWebCallsReserved: number;
  };
  providerRequestsUsed: number;
  webCallsUsed: number;
  completedSteps: ResearchStep[];
  sourcesChecked: CheckedSource[];
  exactEvidence: ProviderFact[];
  checksumChecks: Array<{ input: string; normalized: string | null; valid: boolean }>;
};

const ACCEPTED_AUTHORITY = new Set<AcceptedAuthority>([
  'OFFICIAL_MANUFACTURER',
  'OFFICIAL_BRAND',
  'OFFICIAL_TECHNICAL_PDF',
  'OFFICIAL_PRIVATE_LABEL',
  'AUTHORITATIVE_RETAILER',
  'STRUCTURED_PRODUCT_DATABASE',
]);

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

const nullableText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const httpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

function resolverQuery(value: unknown): ResolverQuery | null {
  const raw = objectValue(value);
  const identity = objectValue(raw.identity);
  const source = objectValue(raw.source);
  const exactProductName = nullableText(identity.exactProductName, 200);
  const brand = nullableText(identity.brand, 120);
  const manufacturer = nullableText(identity.manufacturer, 160);
  const variant = nullableText(identity.variant, 160);
  const packageText = nullableText(identity.packageText, 60);
  // Name-only matching is explicitly forbidden. Exact identity needs a maker/brand
  // anchor and a package or variant anchor before any provider is contacted.
  if (
    raw.resolverVersion !== TEXTIMPORT_EAN_RESOLVER_VERSION ||
    !exactProductName ||
    (!brand && !manufacturer) ||
    (!variant && !packageText)
  )
    return null;
  const sourceUrl = httpsUrl(source.url);
  return {
    resolverVersion: TEXTIMPORT_EAN_RESOLVER_VERSION,
    sourceRowId: nullableText(raw.sourceRowId, 120),
    identity: { exactProductName, brand, manufacturer, variant, packageText },
    source: sourceUrl ? { url: sourceUrl, title: nullableText(source.title, 240) } : null,
  };
}

const sourceDomain = (url: string): string =>
  new URL(url).hostname.toLowerCase().replace(/^www\./, '');

const normalizeValidatedEan = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[\s-]/g, '');
  if (![8, 12, 13].includes(digits.length)) return null;
  let sum = 0;
  for (let index = digits.length - 2, offset = 0; index >= 0; index -= 1, offset += 1) {
    sum += Number(digits[index]) * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1)) ? digits : null;
};

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const researchTrace = (): ResearchTrace => ({
  budget: {
    rowWebCallCap: ROW_WEB_CALL_CAP,
    runWebCallCap: RUN_WEB_CALL_CAP,
    worstCaseWebCallsPerRequest: WORST_CASE_WEB_CALLS_PER_REQUEST,
    rowWebCallsReserved: 0,
    runWebCallsReserved: 0,
  },
  providerRequestsUsed: 0,
  webCallsUsed: 0,
  completedSteps: [],
  sourcesChecked: [],
  exactEvidence: [],
  checksumChecks: [],
});

const addSource = (trace: ResearchTrace, source: CheckedSource) => {
  if (!trace.sourcesChecked.some((item) => item.url === source.url)) {
    trace.sourcesChecked.push(source);
  }
};

const blocked = (
  query: ResolverQuery,
  reason: string,
  blockedStep: ResearchStep | null,
  research: ResearchTrace,
) => ({
  status: 'EAN_RESOLUTION_BLOCKED',
  query,
  reason,
  blockedStep,
  research,
});

function classify(query: ResolverQuery, facts: ProviderFact[], research: ResearchTrace) {
  const byEan = new Map<
    string,
    Array<{
      exactValue: string;
      sourceUrl: string;
      sourceTitle: string | null;
      sourceAuthorityClass: AcceptedAuthority;
      retrievedAt: string;
      researchStep: ResearchStep;
    }>
  >();
  for (const fact of facts) {
    if (fact.field !== 'barcode' || !httpsUrl(fact.sourceUrl)) continue;
    if (!ACCEPTED_AUTHORITY.has(fact.sourceAuthorityClass as AcceptedAuthority)) continue;
    const ean = normalizeValidatedEan(fact.value);
    if (!ean) continue;
    const evidence = {
      exactValue: fact.value,
      sourceUrl: fact.sourceUrl,
      sourceTitle: fact.sourceTitle,
      sourceAuthorityClass: fact.sourceAuthorityClass as AcceptedAuthority,
      retrievedAt: fact.retrievedAt,
      researchStep: fact.researchStep,
    };
    const current = byEan.get(ean) ?? [];
    if (!current.some((item) => item.sourceUrl === evidence.sourceUrl)) current.push(evidence);
    byEan.set(ean, current);
  }
  const candidates = [...byEan.entries()]
    .map(([ean, evidence]) => ({ ean, evidence }))
    .sort((left, right) => left.ean.localeCompare(right.ean));
  if (candidates.length === 1) {
    const identityParts = [
      `exact product name ${JSON.stringify(query.identity.exactProductName)}`,
      query.identity.brand ? `brand ${JSON.stringify(query.identity.brand)}` : null,
      query.identity.manufacturer
        ? `manufacturer ${JSON.stringify(query.identity.manufacturer)}`
        : null,
      query.identity.variant ? `variant ${JSON.stringify(query.identity.variant)}` : null,
      query.identity.packageText ? `package ${JSON.stringify(query.identity.packageText)}` : null,
    ].filter((part): part is string => part !== null);
    return {
      status: 'EAN_RESOLVED',
      query,
      ean: candidates[0]!.ean,
      evidence: candidates[0]!.evidence,
      identityMatchExplanation: `Authoritative source evidence was returned for the resolver's exact identity query: ${identityParts.join(', ')}.`,
      research,
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'EAN_CONFLICT',
      query,
      candidates,
      reason:
        'Multiple checksum-valid EANs have authoritative evidence for the exact identity query; automatic selection is forbidden.',
      research,
    };
  }
  return {
    status: 'EAN_NOT_FOUND',
    query,
    reason: 'No checksum-valid EAN was found after every permitted research step completed.',
    searchedSteps: research.completedSteps,
    research,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !authorization) return json({ error: 'textimport_ean_unavailable' }, 503);

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
  const runId = nullableText(body.runId, 48);
  const query = resolverQuery(body.query);
  if (!runId || !/^[a-z0-9-]+$/i.test(runId) || !query) {
    return json({ error: 'invalid_textimport_ean_request' }, 400);
  }

  const steps: ResearchStep[] = [];
  if (query.source) {
    steps.push({
      kind: 'RETAILER_SEARCH',
      url: query.source.url,
      allowedDomains: [sourceDomain(query.source.url)],
    });
  }
  steps.push({ kind: 'OPEN_WEB_SEARCH', url: null, allowedDomains: [] });

  const research = researchTrace();
  const facts: ProviderFact[] = [];
  const identityHash = (await sha256Hex(JSON.stringify(query.identity))).slice(0, 24);
  const rowBudgetId = `${query.sourceRowId?.slice(0, 80) ?? 'anonymous'}-${identityHash}`;
  const runHash = (await sha256Hex(`${auth.user.id}:${runId}`)).slice(0, 12);
  const rowHash = (await sha256Hex(rowBudgetId)).slice(0, 12);
  // The existing enrichment cap now applies independently to this row. The
  // TEXTIMPORT reservation ledger above it enforces the separate overall run cap.
  const enrichmentImportId = `text-ean-${runHash}-${rowHash}`;

  for (const step of steps) {
    const stepKey = step.kind === 'RETAILER_SEARCH' ? 'retailer_search' : 'open_web_search';
    const { data: reservationData, error: reservationError } = await authClient.rpc(
      'gellatti_reserve_textimport_ean_budget_v1',
      {
        p_actor_user_id: auth.user.id,
        p_run_id: runId,
        p_source_row_id: rowBudgetId,
        p_step_key: stepKey,
        p_reserved_web_calls: WORST_CASE_WEB_CALLS_PER_REQUEST,
      },
    );
    const reservation = objectValue(reservationData);
    if (reservationError) {
      return json(
        blocked(
          query,
          'TEXTIMPORT EAN budget reservation is unavailable; no unbudgeted research was attempted.',
          step,
          research,
        ),
      );
    }
    research.budget.rowWebCallsReserved = Number(reservation.rowWebCallsReserved ?? 0);
    research.budget.runWebCallsReserved = Number(reservation.runWebCallsReserved ?? 0);
    if (reservation.allowed !== true) {
      return json(
        blocked(
          query,
          String(reservation.reason ?? 'textimport_ean_budget_exhausted'),
          step,
          research,
        ),
      );
    }

    let response: Response;
    let payload: Record<string, unknown>;
    research.providerRequestsUsed += 1;
    try {
      response = await fetch(`${url}/functions/v1/intimport-enrich`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          importId: enrichmentImportId,
          product: {
            brand: query.identity.brand,
            manufacturer: query.identity.manufacturer,
            name: query.identity.exactProductName,
            variant: query.identity.variant,
            barcode: null,
            netQuantity: query.identity.packageText,
            knownSourceUrl: query.source?.url ?? null,
            technicalPdfUrl: null,
          },
          researchStep: step,
          fields: ['barcode'],
        }),
      });
      try {
        payload = objectValue(await response.json());
      } catch {
        payload = {};
      }
    } catch {
      response = new Response(null, { status: 503 });
      payload = { error: 'provider_unavailable' };
    }

    const actualWebCalls =
      payload.cacheHit === true
        ? 0
        : Math.max(0, Math.min(4, Number(payload.webCalls ?? payload.calls ?? 0)));
    research.webCallsUsed += actualWebCalls;

    for (const item of Array.isArray(payload.sources) ? payload.sources : []) {
      const source = objectValue(item);
      const sourceUrl = httpsUrl(source.url);
      if (sourceUrl) {
        addSource(research, {
          url: sourceUrl,
          title: nullableText(source.title, 240),
          researchStep: step,
        });
      }
    }

    const stepFacts: ProviderFact[] = [];
    for (const item of Array.isArray(payload.facts) ? payload.facts : []) {
      const fact = objectValue(item);
      const providerFact: ProviderFact = {
        field: String(fact.field ?? ''),
        value: String(fact.value ?? ''),
        sourceUrl: String(fact.sourceUrl ?? ''),
        sourceTitle: typeof fact.sourceTitle === 'string' ? fact.sourceTitle : null,
        sourceAuthorityClass: String(fact.sourceAuthorityClass ?? ''),
        retrievedAt:
          typeof fact.retrievedAt === 'string' ? fact.retrievedAt : new Date().toISOString(),
        researchStep: step,
      };
      stepFacts.push(providerFact);
      const sourceUrl = httpsUrl(providerFact.sourceUrl);
      if (sourceUrl) {
        addSource(research, {
          url: sourceUrl,
          title: providerFact.sourceTitle,
          researchStep: step,
        });
      }
      if (providerFact.field === 'barcode') {
        const normalized = normalizeValidatedEan(providerFact.value);
        research.checksumChecks.push({
          input: providerFact.value,
          normalized,
          valid: normalized !== null,
        });
      }
    }

    const providerError =
      typeof payload.error === 'string'
        ? payload.error
        : response.ok
          ? null
          : 'provider_request_failed';
    const sourceUrls = research.sourcesChecked
      .filter((source) => source.researchStep.kind === step.kind)
      .map((source) => source.url);
    const { error: completionError } = await authClient.rpc(
      'gellatti_complete_textimport_ean_budget_v1',
      {
        p_actor_user_id: auth.user.id,
        p_run_id: runId,
        p_source_row_id: rowBudgetId,
        p_step_key: stepKey,
        p_actual_web_calls: actualWebCalls,
        p_source_urls: sourceUrls,
        p_outcome: providerError ?? 'completed',
      },
    );
    if (completionError) {
      return json(
        blocked(
          query,
          'TEXTIMPORT EAN budget completion could not be recorded; research stopped safely.',
          step,
          research,
        ),
      );
    }
    if (providerError) {
      return json(
        blocked(
          query,
          `EAN research step was blocked before authoritative completion: ${providerError}.`,
          step,
          research,
        ),
      );
    }

    facts.push(...stepFacts);
    research.exactEvidence.push(...stepFacts);
    research.completedSteps.push(step);
  }

  // EAN_NOT_FOUND is possible only here, after every permitted step completed.
  return json(classify(query, facts, research));
});
