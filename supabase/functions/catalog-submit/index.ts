import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { evidenceImageDimensionsAllowed } from '../_shared/evidenceImageDimensions.ts';
import { authorizeLiveOverlayIdentity } from '../_shared/liveOverlayIdentity.ts';
import {
  INTIMPORT_WHOLE_PROFILE_AUTHORITY,
  validateIntimportWholeProfileProposal,
  type IntimportMapperAuthorityRow,
  type IntimportWholeProfileAuthority,
} from '../_shared/intimportWholeProfileAuthority.ts';
import type { ProfileMatchInput } from '../../../src/features/product-intelligence/mapperValueInference.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ServiceClient = ReturnType<typeof createClient>;
interface IntakeImageRow {
  id: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  checksum_sha256: string;
  display_order: number;
  role: string;
  state: string;
}

interface CapturedEvidence {
  imagePhashes: string[];
  archivedImagePaths: string[];
  newlyArchivedImagePaths: string[];
  imageChecksums: string[];
  images: Array<{ path: string; mime: IntakeImageRow['mime']; checksum: string }>;
}

interface ServerOcrResult {
  provider: string;
  providerVersion: string;
  overallConfidence: number;
  verifiedFields: Record<string, unknown>;
}

const INGEST_SOURCES = new Set([
  'ocr',
  'barcode',
  'manual',
  'admin',
  'catalog_import',
  'retailer_feed',
  'spreadsheet',
  'supplier_specification',
  'shop',
  'franchise',
  'internal_subproduct',
  'future_integration',
]);

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const MAPPER_AUTHORITY_COLUMNS = [
  'ingredient_id',
  'ingredient_name_internal',
  'ingredient_name_display',
  'brand',
  'ingredient_category',
  'ingredient_subcategory',
  'is_active',
  'approved_for_base',
  'approved_for_engines',
  'verification_status',
  'ean_code',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'kcal_per_100g',
  'pod_value',
  'pac_value',
  'sweetness_factor',
  'freezing_factor',
].join(',');

let mapperAuthorityRowsCache: Promise<IntimportMapperAuthorityRow[]> | null = null;

async function loadMapperAuthorityRows(service: ServiceClient): Promise<IntimportMapperAuthorityRow[]> {
  if (!mapperAuthorityRowsCache) {
    mapperAuthorityRowsCache = (async () => {
      const rows: IntimportMapperAuthorityRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await service
          .from('mapper_basement')
          .select(MAPPER_AUTHORITY_COLUMNS)
          .order('ingredient_id', { ascending: true })
          .range(offset, offset + 999);
        if (error) throw new Error('intimport_mapper_authority_read_failed');
        const page = (data ?? []) as unknown as IntimportMapperAuthorityRow[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    })().catch((error: unknown) => {
      mapperAuthorityRowsCache = null;
      throw error;
    });
  }
  return mapperAuthorityRowsCache;
}

const comparableText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : null;

function serverMatchInput(canonicalInput: Record<string, unknown>): {
  matchInput: ProfileMatchInput;
  sourceProductId: string | null;
} | null {
  const facts = objectValue(canonicalInput.facts);
  const identity = objectValue(facts.catalogImportIdentity);
  if (identity.system !== 'INTIMPORT') return null;
  const raw = objectValue(identity.matchInput);
  if (comparableText(raw.name) !== comparableText(canonicalInput.displayName)) return null;
  if (comparableText(raw.brand) !== comparableText(canonicalInput.brand)) return null;
  // INTIMPORT keeps the source category as evidence while canonicalInput.category
  // carries its mapped catalogue category. They are deliberately not compared:
  // requiring equality would reject every legitimately mapped source label.

  const canonicalCode = String(canonicalInput.ean ?? canonicalInput.barcode ?? '').replace(/\D+/g, '');
  const proposedCode = String(raw.barcode ?? '').replace(/\D+/g, '');
  if (canonicalCode !== proposedCode) return null;

  const technical = objectValue(facts.technicalComposition);
  const rawMacros = objectValue(raw.knownMacros);
  const macroToFact: Readonly<Record<string, string>> = {
    fat_percent: 'fat',
    protein_percent: 'protein',
    carbohydrate_percent: 'carbohydrate',
    total_sugars_percent: 'sugars',
    fiber_percent: 'fibre',
    salt_percent: 'salt',
  };
  const knownMacros: Record<string, number> = {};
  for (const [macro, fact] of Object.entries(macroToFact)) {
    const value = rawMacros[macro];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const persistedValue = technical[fact];
    if (
      typeof persistedValue !== 'number' ||
      !Number.isFinite(persistedValue) ||
      Math.abs(persistedValue - value) > 0.0001
    ) {
      return null;
    }
    knownMacros[macro] = value;
  }

  return {
    matchInput: {
      name: typeof raw.name === 'string' ? raw.name : null,
      variant: typeof raw.variant === 'string' ? raw.variant : null,
      brand: typeof raw.brand === 'string' ? raw.brand : null,
      category: typeof raw.category === 'string' ? raw.category : null,
      subcategory: typeof raw.subcategory === 'string' ? raw.subcategory : null,
      barcode: typeof raw.barcode === 'string' ? raw.barcode : null,
      knownMacros,
      technical: raw.technical === true,
    },
    sourceProductId:
      typeof identity.sourceProductId === 'string' && identity.sourceProductId.trim() !== ''
        ? identity.sourceProductId.trim()
        : null,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function legacyOwnedProductInput(input: {
  service: ServiceClient;
  actorUserId: string;
  productId: string;
}): Promise<Record<string, unknown>> {
  const { data, error } = await input.service
    .from('products')
    .select('*')
    .eq('id', input.productId)
    .eq('owner_user_id', input.actorUserId)
    .maybeSingle();
  if (error || !data) throw new Error('owned_source_product_not_found');
  const extracted = objectValue(data.extracted_json);
  return {
    productKind: 'commercial_product',
    displayName: data.product_name_display,
    originalName: data.product_name_internal,
    originalLanguage: extracted.originalLanguage ?? null,
    brand: data.brand,
    explicitlyUnbranded: extracted.explicitlyUnbranded === true,
    canonicalFamily: null,
    category: data.product_category,
    countryOfOrigin: data.country,
    ean: data.ean_code,
    barcode: data.barcode,
    facts: {
      packageSize: data.package_size,
      allergensText: data.allergens,
      ingredientsText: extracted.ingredientsText ?? null,
      nutrition: {
        basis: extracted.nutritionBasis ?? 'per_100g',
        energyKcal: data.kcal_per_100g,
        fat: data.fat_percent,
        saturatedFat: data.saturated_fat_percent,
        carbohydrate: data.carbohydrate_percent,
        sugars: data.total_sugars_percent,
        protein: data.protein_percent,
        salt: data.salt_percent,
        fibre: data.fiber_percent,
      },
      technicalComposition: {
        water: data.water_percent,
        totalSolids: data.total_solids_percent,
        fat: data.fat_percent,
        saturatedFat: data.saturated_fat_percent,
        protein: data.protein_percent,
        carbohydrate: data.carbohydrate_percent,
        sugars: data.total_sugars_percent,
        fibre: data.fiber_percent,
        salt: data.salt_percent,
      },
    },
    provenance: data.source_type ?? 'ocr',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function extensionFor(mime: IntakeImageRow['mime']): string {
  return mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
}

async function hmacRiskValue(value: string | null, secret: string): Promise<string | null> {
  if (!value) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Server-derived 8x8 average hash. It is intentionally evidence/dedup only. */
async function perceptualHash(
  bytes: Uint8Array,
  mime: IntakeImageRow['mime'],
): Promise<string | null> {
  // ImageScript's stable decoder covers PNG/JPEG. WebP stays archived with its
  // cryptographic checksum and simply has no perceptual hash; never fabricate one.
  if (mime === 'image/webp') return null;
  if (!evidenceImageDimensionsAllowed(bytes, mime)) return null;
  try {
    const decoded = await Image.decode(bytes);
    const resized = (await decoded.resize(8, 8)) ?? decoded;
    const luminance: number[] = [];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        // ImageScript uses 1-based pixel coordinates even though this loop is
        // intentionally 0-based for the 64-bit hash layout.
        const value = resized.getRGBAAt(x + 1, y + 1) as unknown;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 255;
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
          const channels = Array.from(value as ArrayLike<number>);
          [r = 0, g = 0, b = 0, a = 255] = channels;
        } else if (typeof value === 'number') {
          r = (value >>> 24) & 255;
          g = (value >>> 16) & 255;
          b = (value >>> 8) & 255;
          a = value & 255;
        } else return null;
        const opacity = a / 255;
        const visibleRed = r * opacity + 255 * (1 - opacity);
        const visibleGreen = g * opacity + 255 * (1 - opacity);
        const visibleBlue = b * opacity + 255 * (1 - opacity);
        luminance.push((visibleRed * 299 + visibleGreen * 587 + visibleBlue * 114) / 1000);
      }
    }
    const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
    let hash = '';
    for (let offset = 0; offset < 64; offset += 4) {
      let nibble = 0;
      for (let bit = 0; bit < 4; bit += 1) {
        if (luminance[offset + bit]! >= average) nibble |= 1 << (3 - bit);
      }
      hash += nibble.toString(16);
    }
    return hash;
  } catch {
    return null;
  }
}

async function captureOwnedEvidence(input: {
  service: ServiceClient;
  actorUserId: string;
  ocrSessionId: string;
}): Promise<CapturedEvidence> {
  const { data: session, error: sessionError } = await input.service
    .from('ocr_intake_sessions')
    .select('id,user_id,state')
    .eq('id', input.ocrSessionId)
    .eq('user_id', input.actorUserId)
    .in('state', ['ready_to_save', 'duplicate_blocked', 'saved'])
    .maybeSingle();
  if (sessionError || !session) throw new Error('owned_saved_ocr_session_not_found');

  const { data, error } = await input.service
    .from('ocr_intake_images')
    .select('id,mime,checksum_sha256,display_order,role,state')
    .eq('session_id', input.ocrSessionId)
    .order('display_order', { ascending: true });
  if (error) throw new Error('ocr_evidence_read_failed');

  const phashes: string[] = [];
  const archived: string[] = [];
  const newlyArchived: string[] = [];
  const checksums: string[] = [];
  const images: CapturedEvidence['images'] = [];
  try {
    for (const image of (data ?? []) as IntakeImageRow[]) {
      if (image.state !== 'ready') continue;
      const ext = extensionFor(image.mime);
      const sourcePath = `${input.actorUserId}/${input.ocrSessionId}/${image.id}.${ext}`;
      const { data: source, error: downloadError } = await input.service.storage
        .from('product-intake-images')
        .download(sourcePath);
      if (downloadError || !source) throw new Error(`ocr_evidence_image_missing:${image.id}`);
      const bytes = new Uint8Array(await source.arrayBuffer());
      const actualChecksum = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      )
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (actualChecksum !== image.checksum_sha256.toLowerCase()) {
        throw new Error(`ocr_evidence_checksum_mismatch:${image.id}`);
      }
      if (!evidenceImageDimensionsAllowed(bytes, image.mime)) {
        throw new Error(`ocr_evidence_image_dimensions_invalid:${image.id}`);
      }
      const archivePath = `${input.ocrSessionId}/${image.display_order}-${image.id}-${image.checksum_sha256}.${ext}`;
      const { error: archiveError } = await input.service.storage
        .from('global-catalog-evidence')
        .upload(archivePath, bytes, { contentType: image.mime, upsert: false });
      if (archiveError && !/already exists|duplicate/i.test(archiveError.message)) {
        throw new Error(`ocr_evidence_archive_failed:${image.id}`);
      }
      if (!archiveError) newlyArchived.push(archivePath);
      archived.push(archivePath);
      checksums.push(actualChecksum);
      images.push({ path: archivePath, mime: image.mime, checksum: actualChecksum });
      const phash = await perceptualHash(bytes, image.mime);
      if (phash) phashes.push(phash);
    }
  } catch (error) {
    if (newlyArchived.length > 0) {
      await input.service.storage.from('global-catalog-evidence').remove(newlyArchived);
    }
    throw error;
  }
  return {
    imagePhashes: [...new Set(phashes)],
    archivedImagePaths: archived,
    newlyArchivedImagePaths: newlyArchived,
    imageChecksums: checksums,
    images,
  };
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function attestServerOcr(input: {
  service: ServiceClient;
  actorUserId: string;
  ocrSessionId: string;
  evidence: CapturedEvidence;
  expectedPublicSnapshotSha256: string;
  market: string | null;
}): Promise<{ id: string; created: boolean } | null> {
  const endpoint = Deno.env.get('CATALOG_OCR_VERIFY_URL');
  const key = Deno.env.get('CATALOG_OCR_VERIFY_KEY');
  if (!endpoint || !key) return null;
  // A retry of duplicate resolution or manual completion must not pay for OCR
  // again and must not violate the immutable evidence key.
  const { data: prior } = await input.service
    .from('global_catalog_server_ocr_attestations')
    .select('id,verified_fields,image_checksums')
    .eq('source_session_key', input.ocrSessionId);
  const reusable = (prior ?? []).find(
    (row) =>
      row.verified_fields?.sourceProductSnapshotSha256 === input.expectedPublicSnapshotSha256 &&
      (row.verified_fields?.market ?? null) === input.market &&
      JSON.stringify(row.image_checksums) === JSON.stringify(input.evidence.imageChecksums),
  );
  if (reusable?.id) return { id: reusable.id as string, created: false };

  let result: Partial<ServerOcrResult>;
  try {
    const signedImages: Array<{ url: string; mime: string; checksum: string }> = [];
    for (const image of input.evidence.images) {
      const { data, error } = await input.service.storage
        .from('global-catalog-evidence')
        .createSignedUrl(image.path, 15 * 60);
      if (error || !data?.signedUrl) return null;
      signedImages.push({ url: data.signedUrl, mime: image.mime, checksum: image.checksum });
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: input.ocrSessionId,
        images: signedImages,
        // The trusted worker must return the complete normalized public-facts
        // object. SQL compares it byte-for-byte as jsonb to server-built facts;
        // echoing only this hash can never make a product GREEN.
        expectedPublicSnapshotSha256: input.expectedPublicSnapshotSha256,
        market: input.market,
      }),
    });
    if (!response.ok) return null;
    result = (await response.json()) as Partial<ServerOcrResult>;
  } catch {
    // Provider unavailability is an honest fail-closed BLUE/RED outcome, not a
    // generic 409 that strands the customer's manual-completion flow.
    return null;
  }
  if (
    typeof result.provider !== 'string' ||
    typeof result.providerVersion !== 'string' ||
    typeof result.overallConfidence !== 'number' ||
    result.overallConfidence < 0 ||
    result.overallConfidence > 100 ||
    typeof result.verifiedFields !== 'object' ||
    result.verifiedFields === null
  )
    return null;
  if (result.verifiedFields.sourceProductSnapshotSha256 !== input.expectedPublicSnapshotSha256) {
    return null;
  }
  const evidenceSha = await sha256Text(
    JSON.stringify({
      checksums: input.evidence.imageChecksums,
      fields: result.verifiedFields,
      provider: result.provider,
      providerVersion: result.providerVersion,
    }),
  );
  const { data, error } = await input.service
    .from('global_catalog_server_ocr_attestations')
    .upsert(
      {
        actor_user_id: input.actorUserId,
        ocr_session_id: input.ocrSessionId,
        source_session_key: input.ocrSessionId,
        provider: result.provider,
        provider_version: result.providerVersion,
        image_checksums: input.evidence.imageChecksums,
        archived_image_paths: input.evidence.archivedImagePaths,
        verified_fields: result.verifiedFields,
        overall_confidence: result.overallConfidence,
        evidence_sha256: evidenceSha,
      },
      { onConflict: 'source_session_key,evidence_sha256', ignoreDuplicates: false },
    )
    .select('id')
    .single();
  if (error || !data?.id) throw new Error('server_ocr_attestation_save_failed');
  return { id: data.id as string, created: true };
}

async function cleanupUnfinalizedEvidence(input: {
  service: ServiceClient;
  actorUserId: string;
  evidence: CapturedEvidence;
  attestation: { id: string; created: boolean } | null;
}): Promise<void> {
  if (input.attestation?.created) {
    await input.service
      .from('global_catalog_server_ocr_attestations')
      .delete()
      .eq('id', input.attestation.id)
      .eq('actor_user_id', input.actorUserId);
  }
  if (input.evidence.newlyArchivedImagePaths.length > 0) {
    await input.service.storage
      .from('global-catalog-evidence')
      .remove(input.evidence.newlyArchivedImagePaths);
  }
}

async function verifyRiskChallenge(input: {
  token: string | null;
  secret: string | undefined;
  remoteIp: string | null;
}): Promise<boolean> {
  if (!input.token || !input.secret) return false;
  const form = new FormData();
  form.set('secret', input.secret);
  form.set('response', input.token);
  if (input.remoteIp) form.set('remoteip', input.remoteIp);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const result = (await response.json()) as { success?: boolean };
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization)
    return json({ error: 'catalog_submit_unavailable' }, 503);
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
  const legacyPrivateProductId =
    typeof body.privateProductId === 'string'
      ? body.privateProductId
      : typeof objectValue(body.input).legacyPrivateProductId === 'string'
        ? (objectValue(body.input).legacyPrivateProductId as string)
        : null;
  const source =
    typeof body.source === 'string' ? body.source : legacyPrivateProductId ? 'ocr' : null;
  const ocrSessionId = typeof body.ocrSessionId === 'string' ? body.ocrSessionId : null;
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null;
  if (!source || !INGEST_SOURCES.has(source) || !idempotencyKey) {
    return json({ error: 'missing_or_invalid_required_fields' }, 400);
  }
  if (source === 'ocr' && !ocrSessionId) return json({ error: 'ocr_session_required' }, 400);
  if (idempotencyKey.length > 160) return json({ error: 'invalid_idempotency_key' }, 400);
  const market = typeof body.market === 'string' ? body.market.trim().slice(0, 64) : null;
  const retailer = typeof body.retailer === 'string' ? body.retailer.trim().slice(0, 120) : null;
  const packageLanguage =
    typeof body.packageLanguage === 'string' ? body.packageLanguage.trim().slice(0, 24) : null;
  const distinguishingEvidence =
    typeof body.distinguishingEvidence === 'object' && body.distinguishingEvidence !== null
      ? body.distinguishingEvidence
      : {};
  if (JSON.stringify(distinguishingEvidence).length > 8_000)
    return json({ error: 'distinguishing_evidence_too_large' }, 400);
  const suppliedInput = objectValue(body.input);
  const suppliedEvidence = objectValue(body.evidence);
  const privateOverlay = objectValue(body.privateOverlay);
  if (
    JSON.stringify(suppliedInput).length > 200_000 ||
    JSON.stringify(suppliedEvidence).length > 200_000
  ) {
    return json({ error: 'ingest_payload_too_large' }, 400);
  }
  if (JSON.stringify(privateOverlay).length > 32_000)
    return json({ error: 'private_overlay_too_large' }, 400);
  // Prefer gateway-owned address headers. If only X-Forwarded-For is present,
  // use the right-most hop added by the trusted edge rather than the
  // client-spoofable left-most value.
  const forwardedChain =
    request.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  const forwarded =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    forwardedChain.at(-1) ||
    null;
  const device = typeof body.deviceSignal === 'string' ? body.deviceSignal : null;
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const riskSecret = Deno.env.get('CATALOG_RISK_HMAC_SECRET');
  if (!riskSecret) return json({ error: 'catalog_risk_control_unavailable' }, 503);
  const riskChallengePassed = await verifyRiskChallenge({
    token: typeof body.riskChallengeToken === 'string' ? body.riskChallengeToken : null,
    secret: Deno.env.get('TURNSTILE_SECRET_KEY'),
    remoteIp: forwarded,
  });
  const ipHash = riskSecret ? await hmacRiskValue(forwarded, riskSecret) : null;
  const deviceHash = riskSecret
    ? await hmacRiskValue(device?.slice(0, 512) ?? null, riskSecret)
    : null;
  let canonicalInput: Record<string, unknown>;
  try {
    canonicalInput = legacyPrivateProductId
      ? await legacyOwnedProductInput({
          service,
          actorUserId: auth.user.id,
          productId: legacyPrivateProductId,
        })
      : { ...suppliedInput };
  } catch {
    return json({ error: 'source_product_snapshot_failed' }, 409);
  }
  canonicalInput.market = market;
  canonicalInput.retailer = retailer;
  canonicalInput.packageLanguage = packageLanguage;
  canonicalInput.duplicateDecision =
    body.duplicateDecision === 'same' || body.duplicateDecision === 'different'
      ? body.duplicateDecision
      : null;
  canonicalInput.distinguishingEvidence = distinguishingEvidence;
  if (typeof body.duplicateProductId === 'string')
    canonicalInput.duplicateProductId = body.duplicateProductId;
  if (typeof body.productId === 'string') canonicalInput.productId = body.productId;
  if (
    body.operation === 'upsert' ||
    body.operation === 'retire' ||
    body.operation === 'bind_intimport_mapper'
  )
    canonicalInput.operation = body.operation;

  // Backfill mode is existing-only by construction. Resolve the same base
  // canonical identity ingest uses before reserving quota; a miss never falls
  // through to upsert/product creation.
  if (body.operation === 'bind_intimport_mapper' && typeof body.productId !== 'string') {
    const { data: existingProductId, error: identityError } = await service.rpc(
      'resolve_intimport_existing_product_v1',
      {
        p_actor_user_id: auth.user.id,
        p_source: source,
        p_input: canonicalInput,
      },
    );
    if (identityError || typeof existingProductId !== 'string') {
      return json({ error: 'intimport_existing_product_not_found' }, 409);
    }
    canonicalInput.productId = existingProductId;
  }

  const suppliedMapperDecision = objectValue(canonicalInput.mapperDecision);
  if (suppliedMapperDecision.authority === INTIMPORT_WHOLE_PROFILE_AUTHORITY) {
    return json({ error: 'browser_intimport_mapper_authority_forbidden' }, 403);
  }

  let preflightEvidenceIdentity: unknown[] = [];
  if (ocrSessionId) {
    const { data: imageIdentity, error: imageIdentityError } = await service
      .from('ocr_intake_images')
      .select('id,checksum_sha256,display_order,role,state')
      .eq('session_id', ocrSessionId)
      .order('display_order', { ascending: true });
    if (imageIdentityError) return json({ error: 'catalog_evidence_preflight_failed' }, 409);
    preflightEvidenceIdentity = imageIdentity ?? [];
  }

  // Reserve account/IP/device quota before any image download, decode, archive,
  // or external OCR request. The durable reservation survives a later ingest
  // rollback and is consumed by ingest_product_v1.
  const preflightPayloadHash = await sha256Text(
    stableJson({
      source,
      input: canonicalInput,
      evidence: { supplied: suppliedEvidence, images: preflightEvidenceIdentity },
      privateOverlay,
      ocrSessionId,
    }),
  );
  const { data: preflight, error: preflightError } = await service.rpc(
    'preflight_product_ingest_v1',
    {
      p_actor_user_id: auth.user.id,
      p_source: source,
      p_idempotency_key: idempotencyKey,
      p_payload_hash: preflightPayloadHash,
      p_ip_hash: ipHash,
      p_device_hash: deviceHash,
      p_risk_challenge_passed: riskChallengePassed,
      p_ocr_session_id: ocrSessionId,
      p_duplicate_decision: canonicalInput.duplicateDecision,
      p_review_escalation:
        canonicalInput.lifecycleDecision !== undefined ||
        Object.keys(objectValue(canonicalInput.mapperDecision)).length > 0 ||
        Object.keys(objectValue(canonicalInput.mapperCandidate)).length > 0,
    },
  );
  if (preflightError) {
    if (/administrator/i.test(preflightError.message))
      return json({ error: 'administrator_required' }, 403);
    if (/idempotency|payload mismatch/i.test(preflightError.message)) {
      return json({ error: 'idempotency_payload_mismatch' }, 409);
    }
    return json({ error: 'product_ingest_preflight_failed' }, 400);
  }
  const preflightResult = objectValue(preflight);
  if (preflightResult.allowed !== true) {
    return json({
      schemaVersion: 1,
      kind: 'rate_limited',
      productId: null,
      productVersionId: null,
      behaviorBindingId: null,
      status: null,
      verificationMethod: null,
      autoFavorited: false,
      reviewCaseKey: null,
      idempotent: false,
      missingFields: [],
      invalidFields: [],
      duplicateCandidates: [],
      retryAt: preflightResult.retryAt ?? null,
      challengeRequired: preflightResult.challengeRequired === true,
      rateReason: preflightResult.reason ?? 'rate_limited',
    });
  }
  if (typeof preflightResult.reservationId !== 'string') {
    return json({ error: 'product_ingest_preflight_invalid' }, 503);
  }
  const completedResult = objectValue(preflightResult.completedResult);
  if (Object.keys(completedResult).length > 0) {
    return json({ ...completedResult, idempotent: true });
  }

  let serverWholeProfileAuthority: (IntimportWholeProfileAuthority & {
    sourceProductId: string | null;
  }) | null = null;
  const wholeProfileProposal = objectValue(canonicalInput.intimportWholeProfileProposal);
  delete canonicalInput.intimportWholeProfileProposal;
  if (Object.keys(wholeProfileProposal).length > 0) {
    if (source !== 'catalog_import') {
      return json({ error: 'intimport_mapper_authority_requires_catalog_import' }, 403);
    }
    const proposedMapperIngredientId =
      typeof wholeProfileProposal.mapperIngredientId === 'string'
        ? wholeProfileProposal.mapperIngredientId
        : '';
    const serverInput = serverMatchInput(canonicalInput);
    if (!serverInput) return json({ error: 'intimport_mapper_match_input_invalid' }, 409);
    try {
      const authority = validateIntimportWholeProfileProposal({
        proposedMapperIngredientId,
        matchInput: serverInput.matchInput,
        rows: await loadMapperAuthorityRows(service),
      });
      if (!authority) return json({ error: 'intimport_mapper_authority_rejected' }, 409);
      serverWholeProfileAuthority = {
        ...authority,
        sourceProductId: serverInput.sourceProductId,
      };
      canonicalInput.mapperDecision = {
        authority: INTIMPORT_WHOLE_PROFILE_AUTHORITY,
        mapperIngredientId: authority.mapperIngredientId,
      };
    } catch {
      return json({ error: 'intimport_mapper_authority_unavailable' }, 503);
    }
  }

  let evidence: CapturedEvidence = {
    imagePhashes: [],
    archivedImagePaths: [],
    newlyArchivedImagePaths: [],
    imageChecksums: [],
    images: [],
  };
  let serverAttestation: { id: string; created: boolean } | null = null;
  try {
    if (ocrSessionId) {
      evidence = await captureOwnedEvidence({ service, actorUserId: auth.user.id, ocrSessionId });
      const expectedPublicSnapshotSha256 = await sha256Text(JSON.stringify(canonicalInput));
      serverAttestation = await attestServerOcr({
        service,
        actorUserId: auth.user.id,
        ocrSessionId,
        evidence,
        expectedPublicSnapshotSha256,
        market,
      });
    } else {
      serverAttestation = null;
    }
  } catch {
    await cleanupUnfinalizedEvidence({
      service,
      actorUserId: auth.user.id,
      evidence,
      attestation: serverAttestation,
    });
    return json({ error: 'catalog_evidence_verification_failed' }, 409);
  }
  const { data, error } = await service.rpc('ingest_product_v1', {
    p_actor_user_id: auth.user.id,
    p_source: source,
    p_idempotency_key: idempotencyKey,
    p_input: canonicalInput,
    p_evidence: {
      ...suppliedEvidence,
      ocrSessionId,
      archivedImagePaths: evidence.archivedImagePaths,
      imageChecksums: evidence.imageChecksums,
      imagePhashes: evidence.imagePhashes,
      serverAttestationId: serverAttestation?.id ?? null,
    },
    p_private_overlay: privateOverlay,
    p_risk: {
      ipHash,
      deviceHash,
      challengePassed: riskChallengePassed,
      rateReservationId: preflightResult.reservationId,
      disputeReservationId: preflightResult.disputeReservationId ?? null,
      reviewReservationId: preflightResult.reviewReservationId ?? null,
      preflightPayloadHash,
      intimportWholeProfileAuthority: serverWholeProfileAuthority,
    },
  });
  if (error) {
    await cleanupUnfinalizedEvidence({
      service,
      actorUserId: auth.user.id,
      evidence,
      attestation: serverAttestation,
    });
    if (/idempotency|payload mismatch/i.test(error.message))
      return json({ error: 'idempotency_payload_mismatch' }, 409);
    return json({ error: 'product_ingest_failed' }, 400);
  }
  // The same last hop the Scanner takes. INTIMPORT and a manual entry reach identical
  // capability because they reach it through identical authority — not a copy of it.
  const ingested = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const ingestedProductId =
    typeof ingested.productId === 'string' ? ingested.productId : null;
  const liveOverlay = ingestedProductId
    ? await authorizeLiveOverlayIdentity({
        service,
        actorUserId: auth.user.id,
        productId: ingestedProductId,
      })
    : { authorized: false, reason: 'product_id_missing' };
  return json({ ...ingested, liveOverlay });
});
