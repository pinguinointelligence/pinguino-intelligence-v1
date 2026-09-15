#!/usr/bin/env node
// Owner-authorized RL-05/RL-20 evidence rescue. Preview is the default and
// never creates a product. `--apply-ready` finalizes only products whose shared
// Scanner authority already returned ready + Product Accuracy >85 + exact-SKU
// publication eligibility. Unresolved identities remain open and fail-closed.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildApplyPlan } from './lib/applyPlan.mjs';
import {
  manualEvidenceBlockFor,
  resumableDuplicateProductId,
  rescueInputCounts,
  routeMarketsFor,
  shouldSelectRescueRequest,
} from './lib/mapperRescueRun.mjs';
import {
  mergeProductScanResults,
  normalizeValidatedBarcode,
  scanResultFromLookupFacts,
} from '../../supabase/functions/_shared/productScanner.ts';

const PROJECT_REF = 'tunabqqrwabacxjcxxkz';
const RESCUE_VERSION = 'rl05-rl20-mapper-rescue-v1';
const ROLE_PRIORITY = Object.freeze({ SMP: 1, DEXTROSE: 2, STABILIZER: 3, MILK: 4, CREAM: 5 });
const ROLE_FAMILY = Object.freeze({
  MILK: 'dairy',
  CREAM: 'dairy',
  SMP: 'dairy',
  DEXTROSE: 'sweetener',
  STABILIZER: 'technical',
});

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);
const applyReady = args.has('--apply-ready');
const projectRef = args.get('--project-ref');
if (projectRef !== PROJECT_REF) {
  throw new Error(`Refusing: --project-ref=${PROJECT_REF} is required.`);
}
if (applyReady && args.get('--owner-approval') !== 'RL05-RL20-MAPPER-RESCUE') {
  throw new Error('Refusing: --apply-ready requires --owner-approval=RL05-RL20-MAPPER-RESCUE.');
}
const allowedArgs = new Set([
  '--project-ref',
  '--apply-ready',
  '--owner-approval',
  '--only',
  '--concurrency',
  '--output',
]);
const unknownArgs = [...args.keys()].filter((key) => !allowedArgs.has(key));
if (unknownArgs.length) throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);

const concurrency = Math.max(1, Math.min(4, Number(args.get('--concurrency') ?? 3)));
const only = String(args.get('--only') ?? '').trim();
const outputPath = resolve(
  String(args.get('--output') ?? '/private/tmp/rl05-rl20-rescue-preview.json'),
);
const repoRoot = resolve(import.meta.dirname, '..', '..');
const registry = JSON.parse(
  readFileSync(resolve(repoRoot, 'docs/country-products/gelato-base-v23/registry.json'), 'utf8'),
);
const plan = buildApplyPlan(registry);

const apiKeys = JSON.parse(
  execFileSync('supabase', ['projects', 'api-keys', '--project-ref', PROJECT_REF, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);
const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
const serviceKey = apiKeys.find((row) => row.name === 'service_role' && row.type === 'legacy')?.api_key;
if (typeof anonKey !== 'string' || typeof serviceKey !== 'string') {
  throw new Error('The staging API keys could not be resolved.');
}
const projectUrl = `https://${PROJECT_REF}.supabase.co`;
const fixtureSource = readFileSync(resolve(repoRoot, 'scripts/seed-staging-admin.mjs'), 'utf8');
const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
if (!fixturePassword) throw new Error('The QA fixture password could not be resolved.');
const admin = createClient(projectUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signedIn = await admin.auth.signInWithPassword({
  email: 'admin@admin.com',
  password: fixturePassword,
});
if (signedIn.error || !signedIn.data.user) throw new Error('QA Admin authentication failed.');
const adminUser = signedIn.data.user;
const service = createClient(projectUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: requests, error: requestsError } = await service
  .from('product_add_requests')
  .select('id,status,approved_product_id,duplicate_product_id,idempotency_key,market_country_code')
  .like('idempotency_key', 'gellatti-v23-pr-ing:%');
if (requestsError) throw new Error(`Request snapshot failed: ${requestsError.message}`);
const requestByKey = new Map((requests ?? []).map((row) => [row.idempotency_key, row]));
const requestIds = (requests ?? []).map((row) => row.id);
const { data: ingestEvents, error: ingestError } = await service
  .from('product_ingest_events')
  .select('product_id,status,source,idempotency_key,result_snapshot')
  .in('idempotency_key', requestIds.map((id) => `product-request:${id}:approve-v23`));
if (ingestError) throw new Error(`Ingest snapshot failed: ${ingestError.message}`);
const ingestByRequestId = new Map(
  (ingestEvents ?? []).map((row) => [row.idempotency_key.split(':')[1], row]),
);

let selected = plan.productsToCreate
  .flatMap((product) => {
    const request = requestByKey.get(product.requestIdempotencyKey);
    if (!shouldSelectRescueRequest(request, { applyReady, only })) return [];
    const ingest = ingestByRequestId.get(request.id) ?? null;
    return [{ product, request, ingest }];
  })
  .sort((left, right) =>
    (ROLE_PRIORITY[left.product.slot] ?? 99) - (ROLE_PRIORITY[right.product.slot] ?? 99) ||
    left.product.productKey.localeCompare(right.product.productKey),
  );
if (only) {
  selected = selected.filter(({ product, request }) =>
    [product.productKey, product.slot, product.requestMarket, request.id].includes(only),
  );
}
if (!selected.length) throw new Error('No open v23 product request matches this rescue run.');

const stableSessionId = (requestId) => {
  const hex = createHash('sha256').update(`${RESCUE_VERSION}:${requestId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const withoutNullish = (value) =>
  Object.fromEntries(
    Object.entries(value ?? {}).filter(([, item]) => item !== null && item !== undefined && item !== ''),
  );
const functionErrorDetail = async (error) => {
  try {
    const payload = await error?.context?.clone?.().json?.();
    return `${error?.context?.status ?? 'unknown'} ${payload?.error ?? payload?.detail ?? JSON.stringify(payload)}`;
  } catch {
    return error instanceof Error ? error.message : String(error);
  }
};
const initialScanResult = (product, gtin) => {
  const result = structuredClone(product.requestPayload.result);
  result.schemaVersion = 'gellatti_product_scan_v1';
  result.barcodes = gtin
    ? [{ value: gtin, format: gtin.length === 8 ? 'EAN_8' : gtin.length === 12 ? 'UPC_A' : 'EAN_13' }]
    : [];
  result.evidence = [];
  result.conflicts = [];
  result.externalSources = product.evidencePatch.sourceUrls.map((sourceUrl) => ({
    sourceType: 'web_search',
    url: sourceUrl,
    title: null,
    fieldsUsed: [],
  }));
  return result;
};
const confirmationsFor = (product, gtin) => {
  const fields = {
    barcode: gtin,
    identity: { displayName: product.exactName, brand: product.brand },
    nutrition: withoutNullish(product.evidencePatch.nutrition),
    ingredientsText: product.evidencePatch.ingredientsText,
    allergensText: product.evidencePatch.allergensText,
  };
  return {
    evidenceOrigin: 'customer_action',
    customerActionFields: fields,
    productFields: fields,
  };
};
const researchMissingGtin = async (product, request) => {
  const { data, error } = await admin.functions.invoke('intimport-enrich', {
    body: {
      importId: `rl05-rescue-identity-${request.id}`,
      product: {
        brand: product.brand,
        manufacturer: product.evidencePatch.manufacturer,
        name: product.exactName,
        variant: null,
        barcode: null,
        netQuantity: product.evidencePatch.netQuantity,
        knownSourceUrl: product.evidencePatch.sourceUrls[0] ?? null,
        technicalPdfUrl: null,
      },
      fields: [
        'barcode',
        'waterPercent',
        'totalSolidsPercent',
        'technicalParameters',
        'technicalSource',
      ],
      researchStep: { kind: 'OPEN_WEB_SEARCH', url: null, allowedDomains: [] },
      accumulatedEvidence: { scanResult: initialScanResult(product, null) },
    },
  });
  if (error) return { gtin: null, partial: null, detail: await functionErrorDetail(error) };
  const facts = Array.isArray(data?.facts) ? data.facts : [];
  const barcodeFacts = facts.flatMap((fact) =>
    fact?.field === 'barcode' && typeof fact.value === 'string' ? [fact.value] : [],
  );
  const gtin = barcodeFacts.map(normalizeValidatedBarcode).find(Boolean) ?? null;
  return {
    gtin,
    partial: scanResultFromLookupFacts(facts),
    detail: {
      cacheHit: data?.cacheHit === true,
      calls: data?.calls ?? 0,
      webCalls: data?.webCalls ?? 0,
      sources: data?.sources ?? [],
      notFound: data?.notFound ?? [],
      factFields: facts.map((fact) => fact?.field).filter(Boolean),
    },
  };
};
const ensureSession = async ({ product, request }, sessionId, gtin, partial) => {
  const { data: existing, error } = await service
    .from('product_scan_sessions')
    .select('id,user_id,state,validation_json,result_json,barcode,exact_product_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) {
    const marker = existing.validation_json?.rl05Rl20Rescue;
    if (existing.user_id !== adminUser.id || marker?.requestId !== request.id) {
      throw new Error('Deterministic rescue session ownership/lineage mismatch.');
    }
    return existing;
  }
  let result = initialScanResult(product, gtin);
  if (partial) result = mergeProductScanResults(result, partial, gtin);
  const { error: insertError } = await service.from('product_scan_sessions').insert({
    id: sessionId,
    user_id: adminUser.id,
    state: 'analyzed',
    barcode: gtin,
    result_json: result,
    validation_json: {
      rl05Rl20Rescue: {
        authority: 'OWNER_APPROVAL_RL05_RL20_MAPPER_RESCUE',
        version: RESCUE_VERSION,
        requestId: request.id,
        productKey: product.productKey,
      },
    },
    overlay_state: 'SCAN_DRAFT',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (insertError) throw new Error(insertError.message);
  return { id: sessionId, user_id: adminUser.id, state: 'analyzed', barcode: gtin };
};
const invokePreview = async (product, request, sessionId, gtin) => {
  const body = {
    contractVersion: 'PRODUCT_SCAN_FINALIZE_V2',
    action: 'preview',
    sessionId,
    idempotencyKey: `${RESCUE_VERSION}:preview:${request.id}`,
    customerFamily: ROLE_FAMILY[product.slot],
    automaticEvidence: null,
    confirmations: confirmationsFor(product, gtin),
    privateOverlay: {},
  };
  const { data, error } = await admin.functions.invoke('product-scan-finalize', { body });
  if (error) return { data: null, error: await functionErrorDetail(error) };
  return { data, error: null };
};
const invokeFinalize = async (product, request, sessionId, gtin, expectedAssessmentHash) => {
  const body = {
    contractVersion: 'PRODUCT_SCAN_FINALIZE_V2',
    action: 'finalize',
    sessionId,
    idempotencyKey: `${RESCUE_VERSION}:finalize:${request.id}`,
    customerFamily: ROLE_FAMILY[product.slot],
    automaticEvidence: null,
    confirmations: confirmationsFor(product, gtin),
    privateOverlay: {},
    expectedAssessmentHash,
  };
  const { data, error } = await admin.functions.invoke('product-scan-finalize', { body });
  if (error) return { data: null, error: await functionErrorDetail(error) };
  return { data, error: null };
};
const markRequestDuplicate = async (requestId, productId) => {
  const { data, error } = await admin.rpc('gellatti_admin_product_request_action_v1', {
    p_request_id: requestId,
    p_action: 'DUPLICATE',
    p_payload: { productId },
  });
  if (error) throw new Error(`DUPLICATE failed: ${error.message}`);
  return data;
};
const addRouting = async (product, productId) => {
  const { data: productRow, error: productError } = await service
    .from('products')
    .select('id,product_code,current_version_id,current_behavior_binding_id,visibility,canonical_verification_status')
    .eq('id', productId)
    .single();
  if (productError) throw new Error(productError.message);
  if (!productRow.product_code?.startsWith('PR-ING-') || productRow.visibility !== 'shared') {
    throw new Error('Rescued product is not a shared PR article.');
  }
  const addedMarkets = [];
  for (const market of routeMarketsFor(product.routes)) {
    const { error } = await admin.rpc('gellatti_admin_catalog_action_v1', {
      p_product_id: productId,
      p_action: 'ADD_MARKET',
      p_payload: {
        market,
        reason: `${product.productKey}: ${RESCUE_VERSION} route ${market}`,
      },
    });
    if (error) throw new Error(`ADD_MARKET ${market} failed: ${error.message}`);
    addedMarkets.push(market);
  }
  const { data: review, error: reviewError } = await service
    .from('product_canonical_slot_reviews')
    .select('id,product_version_id,mapper_ingredient_id')
    .eq('product_id', productId)
    .eq('active', true)
    .maybeSingle();
  if (reviewError) throw new Error(reviewError.message);
  let slotReviewId = review?.id ?? null;
  if (review) {
    if (
      review.product_version_id !== productRow.current_version_id ||
      review.mapper_ingredient_id !== product.piIngId
    ) throw new Error('Existing active slot review conflicts with the approved rescue target.');
  } else {
    const inserted = await service
      .from('product_canonical_slot_reviews')
      .insert({
        product_id: productId,
        product_version_id: productRow.current_version_id,
        ...product.slotReview,
        review_evidence: {
          ...product.slotReview.review_evidence,
          rescueAuthority: 'OWNER_APPROVAL_RL05_RL20_MAPPER_RESCUE',
          rescueVersion: RESCUE_VERSION,
        },
        active: true,
      })
      .select('id')
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    slotReviewId = inserted.data.id;
  }
  const assignmentIds = [];
  for (const route of product.routes) {
    const { data: current, error: currentError } = await service
      .from('country_product_slot_assignments')
      .select('id,product_id')
      .eq('country_code', route.country)
      .eq('mapper_ingredient_id', route.mapperIngredientId)
      .eq('assignment_kind', 'PRIMARY_DEFAULT')
      .eq('active', true)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (current) {
      if (current.product_id !== productId) throw new Error(`Primary route conflict: ${route.proposalKey}`);
      assignmentIds.push(current.id);
      continue;
    }
    const inserted = await service
      .from('country_product_slot_assignments')
      .insert({
        country_code: route.country,
        mapper_ingredient_id: route.mapperIngredientId,
        product_id: productId,
        assignment_kind: route.assignmentKind,
        fallback_priority: route.fallbackPriority,
        active: true,
        approval_reason: `${route.approvalReason}; ${RESCUE_VERSION}`,
      })
      .select('id')
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    assignmentIds.push(inserted.data.id);
  }
  return { productCode: productRow.product_code, slotReviewId, assignmentIds, addedMarkets };
};

const processOne = async ({ product, request, ingest }) => {
  const startedAt = Date.now();
  const sessionId = stableSessionId(request.id);
  let gtin = normalizeValidatedBarcode(product.gtin);
  let identityResearch = null;
  let partial = null;
  if (!gtin) {
    const researched = await researchMissingGtin(product, request);
    gtin = researched.gtin;
    partial = researched.partial;
    identityResearch = researched.detail;
  }
  const base = {
    productKey: product.productKey,
    requestId: request.id,
    requestStatusBefore: request.status,
    priorIngestStatus: ingest?.status ?? null,
    slot: product.slot,
    requestMarket: product.requestMarket,
    routeMarkets: product.routes.map((route) => route.country),
    originalGtin: product.gtin,
    rescuedGtin: gtin,
    identityResearch,
    sessionId,
  };
  if (!gtin) {
    return {
      ...base,
      outcome: 'BLOCKED_NO_VALID_GTIN_AFTER_EVIDENCE_RESCUE',
      durationMs: Date.now() - startedAt,
    };
  }
  const { data: exactProducts, error: exactError } = await service
    .from('products')
    .select('id,product_code,visibility,canonical_verification_status,current_version_id,current_behavior_binding_id')
    .eq('ean_code_normalized', gtin)
    .eq('is_active', true)
    .is('merged_into_product_id', null);
  if (exactError) throw new Error(exactError.message);
  const unrelated = (exactProducts ?? []).filter((row) => row.id !== ingest?.product_id);
  const resumableProductId = resumableDuplicateProductId(request, exactProducts);
  if (resumableProductId) {
    const routing = await addRouting(product, resumableProductId);
    return {
      ...base,
      outcome: 'RESCUED_SHARED_PR_ROUTED',
      resumedAfterPartialWrite: true,
      productId: resumableProductId,
      productCode: routing.productCode,
      slotReviewId: routing.slotReviewId,
      assignmentIds: routing.assignmentIds,
      addedMarkets: routing.addedMarkets,
      durationMs: Date.now() - startedAt,
    };
  }
  const unrelatedToRequest = unrelated.filter((row) => row.id !== request.duplicate_product_id);
  if (unrelatedToRequest.length > 0) {
    return {
      ...base,
      outcome: 'BLOCKED_EXACT_GTIN_ALREADY_EXISTS',
      exactProducts: unrelatedToRequest,
      durationMs: Date.now() - startedAt,
    };
  }
  await ensureSession({ product, request }, sessionId, gtin, partial);
  const preview = await invokePreview(product, request, sessionId, gtin);
  if (preview.error) {
    return { ...base, outcome: 'PREVIEW_ERROR', error: preview.error, durationMs: Date.now() - startedAt };
  }
  const value = preview.data ?? {};
  const manualEvidenceBlock = manualEvidenceBlockFor(product.productKey, value.assessmentHash);
  const authorityReady =
    value.ready === true &&
    Number(value.productAccuracy) > 85 &&
    value.publicationEligibility?.eligible === true &&
    manualEvidenceBlock === null;
  const summary = {
    kind: value.kind ?? null,
    ready: value.ready === true,
    productAccuracy: value.productAccuracy ?? null,
    roleReadiness: value.productAccuracyAssessment?.roleReadiness ?? null,
    criticalGaps: value.criticalGaps ?? [],
    missingEngineFields: value.productAccuracyAssessment?.missingEngineFields ?? [],
    criticalPhysicsBlockers: value.productAccuracyAssessment?.criticalPhysicsBlockers ?? [],
    publicationEligible: value.publicationEligibility?.eligible === true,
    publicationReasonCodes: value.publicationEligibility?.reasonCodes ?? [],
    recognition: value.recognition
      ? {
          family: value.recognition.ingredientFamily,
          form: value.recognition.physicalForm,
          role: value.recognition.intendedUsageRole,
          modelRequired: value.recognition.modelRequired,
          reasonCodes: value.recognition.reasonCodes,
        }
      : null,
    mapper: value.mapper ?? null,
    technicalComposition: value.technicalComposition ?? null,
    assessmentHash: value.assessmentHash ?? null,
    manualEvidenceBlock,
  };
  if (!applyReady || !authorityReady) {
    return {
      ...base,
      outcome: authorityReady ? 'READY_PREVIEW_NOT_APPLIED' : 'STILL_BLOCKED_AFTER_RESCUE',
      preview: summary,
      durationMs: Date.now() - startedAt,
    };
  }
  if (ingest?.status === 'blocked') {
    return {
      ...base,
      outcome: 'READY_PREVIEW_BUT_EXISTING_PRODUCT_BLOCKED',
      preview: summary,
      durationMs: Date.now() - startedAt,
    };
  }
  const finalized = await invokeFinalize(
    product,
    request,
    sessionId,
    gtin,
    value.assessmentHash,
  );
  if (finalized.error) {
    return {
      ...base,
      outcome: 'FINALIZE_ERROR',
      preview: summary,
      error: finalized.error,
      durationMs: Date.now() - startedAt,
    };
  }
  const saved = finalized.data ?? {};
  if (saved.route !== 'PR' || typeof saved.productId !== 'string') {
    return {
      ...base,
      outcome: 'FINALIZE_REFUSED_SHARED_PR',
      preview: summary,
      finalize: saved,
      durationMs: Date.now() - startedAt,
    };
  }
  await markRequestDuplicate(request.id, saved.productId);
  const routing = await addRouting(product, saved.productId);
  return {
    ...base,
    outcome: 'RESCUED_SHARED_PR_ROUTED',
    preview: summary,
    productId: saved.productId,
    productCode: routing.productCode,
    slotReviewId: routing.slotReviewId,
    assignmentIds: routing.assignmentIds,
    addedMarkets: routing.addedMarkets,
    durationMs: Date.now() - startedAt,
  };
};

const ledger = [];
for (const role of ['SMP', 'DEXTROSE', 'STABILIZER', 'MILK', 'CREAM']) {
  const queue = selected.filter(({ product }) => product.slot === role);
  if (!queue.length) continue;
  process.stdout.write(`ROLE ${role}: ${queue.length} open identities\n`);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= queue.length) return;
      const item = queue[index];
      let result;
      try {
        result = await processOne(item);
      } catch (error) {
        result = {
          productKey: item.product.productKey,
          requestId: item.request.id,
          slot: item.product.slot,
          requestMarket: item.product.requestMarket,
          routeMarkets: item.product.routes.map((route) => route.country),
          outcome: 'UNEXPECTED_ERROR',
          error: error instanceof Error ? error.message : String(error),
        };
      }
      ledger.push(result);
      process.stdout.write(`${role} ${index + 1}/${queue.length} ${result.outcome} ${result.productKey}\n`);
    }
  });
  await Promise.all(workers);
}
ledger.sort((left, right) =>
  (ROLE_PRIORITY[left.slot] ?? 99) - (ROLE_PRIORITY[right.slot] ?? 99) ||
  left.productKey.localeCompare(right.productKey),
);
const count = (outcome) => ledger.filter((entry) => entry.outcome === outcome).length;
const report = {
  schema: 'gellatti.rl05-rl20.mapper-rescue-run/v1',
  rescueVersion: RESCUE_VERSION,
  generatedAt: new Date().toISOString(),
  projectRef: PROJECT_REF,
  mode: applyReady ? 'APPLY_READY' : 'PREVIEW_ONLY',
  input: rescueInputCounts(ledger),
  outcomes: {
    rescued: count('RESCUED_SHARED_PR_ROUTED'),
    readyPreviewNotApplied: count('READY_PREVIEW_NOT_APPLIED'),
    stillBlockedAfterRescue: count('STILL_BLOCKED_AFTER_RESCUE'),
    noValidGtin: count('BLOCKED_NO_VALID_GTIN_AFTER_EVIDENCE_RESCUE'),
    exactGtinExists: count('BLOCKED_EXACT_GTIN_ALREADY_EXISTS'),
    previewErrors: count('PREVIEW_ERROR'),
    unexpectedErrors: count('UNEXPECTED_ERROR'),
  },
  byRole: Object.fromEntries(
    ['SMP', 'DEXTROSE', 'STABILIZER', 'MILK', 'CREAM'].map((role) => {
      const rows = ledger.filter((entry) => entry.slot === role);
      return [role, {
        total: rows.length,
        ready: rows.filter((entry) => entry.preview?.ready === true).length,
        rescued: rows.filter((entry) => entry.outcome === 'RESCUED_SHARED_PR_ROUTED').length,
        blocked: rows.filter((entry) => entry.outcome !== 'RESCUED_SHARED_PR_ROUTED').length,
      }];
    }),
  ),
  ledger,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`REPORT ${outputPath}\n${JSON.stringify({ mode: report.mode, input: report.input, outcomes: report.outcomes, byRole: report.byRole }, null, 2)}\n`);
