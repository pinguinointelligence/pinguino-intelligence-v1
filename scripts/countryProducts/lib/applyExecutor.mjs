// The owner-approved mutation path of the GELATO base DB packages, shared by
// applyGelatoBaseV12.mjs and applyGelatoBaseV23.mjs through lib/applyCli.mjs.
// It is loaded only after evaluateApplyGuard answered APPLY — the exact project
// ref, --apply and the owner approval token of THIS registry version. A dry
// run never imports this module.
//
// The Supabase project tunabqqrwabacxjcxxkz is shared by staging AND
// production. Modeled on scripts/seed-staging-canonical-country-milk.mjs:
// product request → START_REVIEW → ADMIN_EVIDENCE_PATCH → duplicate preview →
// catalog-submit approval → APPROVE_LINK → canonical slot review → ADD_MARKET →
// country PRIMARY_DEFAULT. It never replaces or deactivates an existing
// assignment.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPLY_PROJECT_REF, applyProfileFor } from './applyPlan.mjs';
import { reconcileExistingApplyProduct } from './applyReconciliation.mjs';

/**
 * @param {object} input
 * @param {string} input.repoRoot
 * @param {object} input.registry parsed registry.json
 * @param {Buffer} input.registryBytes exact bytes of registry.json
 * @param {string} input.registryPath repository-relative registry path (as listed in the manifest)
 * @param {string} input.manifestPath repository-relative manifest path
 * @param {object} input.plan buildApplyPlan(registry)
 */
export async function executeApplyPlan({ repoRoot, registry, registryBytes, registryPath, manifestPath, plan }) {
  const profile = applyProfileFor(registry);
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8'));
  const registryEntry = manifest.outputs.find((entry) => entry.path === registryPath);
  const registrySha256 = createHash('sha256').update(registryBytes).digest('hex');
  if (!registryEntry || registryEntry.sha256 !== registrySha256) {
    process.stderr.write('Refusing: registry.json does not match the sha256 recorded in manifest.json.\n');
    process.exit(2);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const projectUrl = `https://${APPLY_PROJECT_REF}.supabase.co`;
  const apiKeys = JSON.parse(
    execFileSync('supabase', ['projects', 'api-keys', '--project-ref', APPLY_PROJECT_REF, '--output', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
  const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
  if (typeof anonKey !== 'string' || anonKey.length < 100) throw new Error('The anonymous API key could not be resolved.');

  // The QA password stays in its owner fixture and in process memory only.
  const fixtureSource = readFileSync(resolve(repoRoot, 'scripts/seed-staging-admin.mjs'), 'utf8');
  const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
  if (!fixturePassword) throw new Error('Repository QA fixture password is missing.');

  const clientFor = async (email) => {
    const client = createClient(projectUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password: fixturePassword });
    if (error || !data.session?.access_token || !data.user) throw new Error(`QA authentication failed for ${email}.`);
    return { client, user: data.user };
  };
  const { client: admin } = await clientFor('admin@admin.com');
  const { client: pro } = await clientFor('pro@pro.com');

  const functionErrorDetail = async (error) => {
    const response = error?.context;
    try {
      const body = await response?.clone?.().json?.();
      const detail = body?.detail ?? body?.error ?? body?.message;
      if (detail) return `${response.status ?? 'unknown'} ${detail}`;
    } catch {
      // fall through
    }
    return `${response?.status ?? 'unknown'} ${error instanceof Error ? error.message : String(error)}`;
  };

  const exactProductByEan = async (ean) => {
    const { data, error } = await admin
      .from('products')
      .select('id,product_code,current_version_id')
      .eq('ean_code_normalized', ean)
      .is('merged_into_product_id', null)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(`Exact product lookup failed for ${ean}: ${error.message}`);
    return data;
  };

  const activePrimary = async (country, piIngId) => {
    const { data, error } = await admin
      .from('country_product_slot_assignments')
      .select('id,product_id')
      .eq('country_code', country)
      .eq('mapper_ingredient_id', piIngId)
      .eq('assignment_kind', 'PRIMARY_DEFAULT')
      .eq('active', true)
      .maybeSingle();
    if (error) throw new Error(`Assignment lookup failed for ${country}/${piIngId}: ${error.message}`);
    return data;
  };

  const adminAction = async (requestId, action, payload = {}) => {
    const { data, error } = await admin.rpc('gellatti_admin_product_request_action_v1', {
      p_request_id: requestId,
      p_action: action,
      p_payload: payload,
    });
    if (error) throw new Error(`${action} failed for ${requestId}: ${error.message}`);
    return data;
  };

  const withRequestId = (value, requestId) =>
    JSON.parse(JSON.stringify(value).replaceAll('<requestId>', requestId));

  // Pre-flight: read-only. Any surprise stops the run before the first write.
  const { data: marketRows, error: marketError } = await admin.from('catalog_market_countries').select('code,is_active');
  if (marketError) throw new Error(`Market lookup failed: ${marketError.message}`);
  const liveMarkets = new Set((marketRows ?? []).filter((row) => row.is_active).map((row) => row.code));
  const preflight = [];
  const preflightRequests = new Map();
  const preflightIngestEvents = new Map();
  for (const product of plan.productsToCreate) {
    const { data: existingRequest, error: requestLookupError } = await pro
      .from('product_add_requests')
      .select('id,status,approved_product_id')
      .eq('idempotency_key', product.requestIdempotencyKey)
      .maybeSingle();
    if (requestLookupError) throw new Error(`Request lookup failed: ${requestLookupError.message}`);
    preflightRequests.set(product.productKey, existingRequest);
    let ingestEvent = null;
    if (existingRequest) {
      const { data, error } = await admin
        .from('product_ingest_events')
        .select('product_id,status,source,idempotency_key')
        .eq('idempotency_key', `product-request:${existingRequest.id}:${profile.catalogSubmitRevision}`)
        .maybeSingle();
      if (error) throw new Error(`Ingest event lookup failed: ${error.message}`);
      ingestEvent = data;
    }
    preflightIngestEvents.set(product.productKey, ingestEvent);
    const exactProduct = product.gtin ? await exactProductByEan(product.gtin) : null;
    const routePrimaries = [];
    for (const route of product.routes) {
      if (!liveMarkets.has(route.country)) preflight.push(`${route.proposalKey}: market ${route.country} not in catalog_market_countries`);
      routePrimaries.push({
        proposalKey: route.proposalKey,
        primary: await activePrimary(route.country, route.mapperIngredientId),
      });
    }
    preflight.push(
      ...reconcileExistingApplyProduct({
        productKey: product.productKey,
        gtin: product.gtin,
        request: existingRequest,
        exactProduct,
        ingestEvent,
        routePrimaries,
      }).issues,
    );
  }
  if (preflight.length > 0) {
    process.stderr.write(`Refusing: live state differs from the reviewed plan:\n${preflight.map((line) => `  ${line}`).join('\n')}\n`);
    process.exit(3);
  }

  const ledger = [];
  for (const product of plan.productsToCreate) {
    const entry = { productKey: product.productKey, requestId: null, productId: null, productCode: null, slotReviewId: null, addedMarkets: [], assignmentIds: [], outcome: null };
    ledger.push(entry);

    let request = preflightRequests.get(product.productKey) ?? null;
    if (!request) {
      const { data, error } = await pro.rpc('gellatti_submit_product_request_v1', {
        p_scan_session_id: null,
        p_market_country_code: product.requestMarket,
        p_idempotency_key: product.requestIdempotencyKey,
        p_payload: product.requestPayload,
      });
      if (error) throw new Error(`Product request failed for ${product.productKey}: ${error.message}`);
      if (data?.kind === 'existing_product') {
        entry.outcome = 'STOPPED_EXISTING_PRODUCT';
        throw new Error(`${product.productKey}: the catalog already holds ${data.productCode}; the plan is stale.`);
      }
      request = { id: data.requestId, status: data.status, approved_product_id: null };
    }
    entry.requestId = request.id;

    let productId = request.approved_product_id ?? null;
    const priorIngestEvent = preflightIngestEvents.get(product.productKey) ?? null;
    if (request.status !== 'APPROVED' && priorIngestEvent?.status === 'blocked') {
      entry.productId = priorIngestEvent.product_id;
      entry.outcome = 'CATALOG_PRODUCT_BLOCKED_REQUEST_NOT_LINKED';
      entry.detail = { ingestStatus: priorIngestEvent.status, source: priorIngestEvent.source };
      continue;
    }
    if (request.status !== 'APPROVED') {
      if (request.status === 'SUBMITTED' || request.status === 'RESUBMITTED') await adminAction(request.id, 'START_REVIEW');
      await adminAction(request.id, 'ADMIN_EVIDENCE_PATCH', {
        patch: product.evidencePatch,
        reason: `Owner workbook ${plan.workbook} (${plan.workbookSha256}) evidence for ${product.productKey}`,
      });
      const nutrition = product.evidencePatch.nutrition;
      const { data: candidates, error: duplicateError } = await admin.rpc('preview_product_duplicates_v1', {
        p_facts: {
          displayName: product.exactName,
          brand: product.brand,
          packageSize: product.evidencePatch.netQuantity,
          ean: product.gtin,
          ingredientsText: product.evidencePatch.ingredientsText,
          nutrition,
          imagePhashes: [],
        },
      });
      if (duplicateError) throw new Error(`Duplicate preview failed: ${duplicateError.message}`);
      if (product.gtin && (candidates ?? []).some((candidate) => candidate.ean === product.gtin)) {
        throw new Error(`${product.productKey}: duplicate preview found the same GTIN; stopping.`);
      }
      const different = (candidates ?? []).find((candidate) => candidate.ean && candidate.ean !== product.gtin) ?? null;
      const { data: approved, error: approveError } = await admin.functions.invoke('catalog-submit', {
        body: {
          source: 'admin',
          idempotencyKey: `product-request:${request.id}:${profile.catalogSubmitRevision}`,
          input: withRequestId(product.catalogInput, request.id),
          productId: null,
          operation: 'upsert',
          evidence: {
            productAddRequestId: request.id,
            evidenceIds: [],
            userCorrectionsAreEvidenceOnly: true,
            adminVerifiedData: product.evidencePatch,
            approvedByAdmin: true,
          },
          privateOverlay: {},
          market: product.requestMarket,
          retailer: null,
          packageLanguage: null,
          requireApprovalReady: true,
          duplicateDecision: different ? 'different' : null,
          duplicateProductId: different?.product_id ?? null,
          distinguishingEvidence: different
            ? { exactGtin: product.gtin, comparedProductId: different.product_id, reason: `Different GTIN or identity per owner workbook ${profile.label}.`, productKey: product.productKey }
            : {},
        },
      });
      if (approveError) throw new Error(`catalog-submit failed for ${product.productKey}: ${await functionErrorDetail(approveError)}`);
      if (approved?.kind === 'approval_not_ready') {
        entry.outcome = 'APPROVAL_NOT_READY_NO_PRODUCT_WRITTEN';
        entry.detail = { readiness: approved.readiness, missingEngineFields: approved.missingEngineFields, productAccuracy: approved.productAccuracy };
        continue;
      }
      if (approved?.kind === 'rate_limited') {
        entry.outcome = 'RATE_LIMITED_NO_PRODUCT_WRITTEN';
        entry.detail = { retryAt: approved.retryAt, rateReason: approved.rateReason };
        continue;
      }
      if (typeof approved?.productId !== 'string') {
        entry.outcome = 'CATALOG_SUBMIT_NO_PRODUCT_WRITTEN';
        entry.detail = approved ?? null;
        continue;
      }
      if (approved.status === 'blocked') {
        entry.productId = approved.productId;
        entry.outcome = 'CATALOG_PRODUCT_BLOCKED_REQUEST_NOT_LINKED';
        entry.detail = { ingestStatus: approved.status, kind: approved.kind ?? null };
        continue;
      }
      try {
        await adminAction(request.id, 'APPROVE_LINK', { productId: approved.productId });
      } catch (error) {
        if (/canonical_admin_pr_ingest_required|publishable_product_authority_required/.test(String(error))) {
          entry.productId = approved.productId;
          entry.outcome = 'CATALOG_PRODUCT_BLOCKED_REQUEST_NOT_LINKED';
          entry.detail = { approvalError: String(error) };
          continue;
        }
        throw error;
      }
      productId = approved.productId;
    }

    const { data: productRow, error: productError } = await admin
      .from('products')
      .select('id,product_code,current_version_id')
      .eq('id', productId)
      .single();
    if (productError) throw new Error(`Product lookup failed: ${productError.message}`);
    entry.productId = productRow.id;
    entry.productCode = productRow.product_code;

    const { data: review, error: reviewLookupError } = await admin
      .from('product_canonical_slot_reviews')
      .select('id,product_version_id,mapper_ingredient_id')
      .eq('product_id', productRow.id)
      .eq('active', true)
      .maybeSingle();
    if (reviewLookupError) throw new Error(`Slot review lookup failed: ${reviewLookupError.message}`);
    if (review) {
      if (review.product_version_id !== productRow.current_version_id || review.mapper_ingredient_id !== product.piIngId) {
        throw new Error(`Refusing to replace active slot review ${review.id} for ${product.productKey}.`);
      }
      entry.slotReviewId = review.id;
    } else {
      const { data: inserted, error: insertError } = await admin
        .from('product_canonical_slot_reviews')
        .insert({ product_id: productRow.id, product_version_id: productRow.current_version_id, ...product.slotReview, active: true })
        .select('id')
        .single();
      if (insertError) throw new Error(`Slot review failed for ${product.productKey}: ${insertError.message}`);
      entry.slotReviewId = inserted.id;
    }

    for (const market of product.additionalMarkets) {
      const { error } = await admin.rpc('gellatti_admin_catalog_action_v1', {
        p_product_id: productRow.id,
        p_action: 'ADD_MARKET',
        p_payload: { market, reason: `${product.productKey}: owner workbook ${profile.label} route ${market}` },
      });
      if (error) throw new Error(`ADD_MARKET ${market} failed for ${product.productKey}: ${error.message}`);
      entry.addedMarkets.push(market);
    }

    for (const route of product.routes) {
      const existing = await activePrimary(route.country, route.mapperIngredientId);
      if (existing) {
        if (existing.product_id !== productRow.id) throw new Error(`Refusing to replace the primary for ${route.proposalKey}.`);
        entry.assignmentIds.push(existing.id);
        continue;
      }
      const { data: assignment, error } = await admin
        .from('country_product_slot_assignments')
        .insert({
          country_code: route.country,
          mapper_ingredient_id: route.mapperIngredientId,
          product_id: productRow.id,
          assignment_kind: route.assignmentKind,
          fallback_priority: route.fallbackPriority,
          active: true,
          approval_reason: route.approvalReason,
        })
        .select('id')
        .single();
      if (error) throw new Error(`Route ${route.proposalKey} failed: ${error.message}`);
      entry.assignmentIds.push(assignment.id);
    }
    entry.outcome = 'CREATED';
  }

  process.stdout.write(`${JSON.stringify({ projectRef: APPLY_PROJECT_REF, ledger }, null, 2)}\n`);
}
