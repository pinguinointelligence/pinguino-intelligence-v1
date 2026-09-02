import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

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
  imageChecksums: string[];
  images: Array<{ path: string; mime: IntakeImageRow['mime']; checksum: string }>;
}

interface ServerOcrResult {
  provider: string;
  providerVersion: string;
  overallConfidence: number;
  verifiedFields: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Server-derived 8x8 average hash. It is intentionally evidence/dedup only. */
async function perceptualHash(bytes: Uint8Array, mime: IntakeImageRow['mime']): Promise<string | null> {
  // ImageScript's stable decoder covers PNG/JPEG. WebP stays archived with its
  // cryptographic checksum and simply has no perceptual hash; never fabricate one.
  if (mime === 'image/webp') return null;
  try {
    const decoded = await Image.decode(bytes);
    const resized = (await decoded.resize(8, 8)) ?? decoded;
    const luminance: number[] = [];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const value = resized.getRGBAAt(x, y) as unknown;
        let r = 0;
        let g = 0;
        let b = 0;
        if (Array.isArray(value)) {
          [r, g, b] = value as number[];
        } else if (typeof value === 'number') {
          r = (value >>> 24) & 255;
          g = (value >>> 16) & 255;
          b = (value >>> 8) & 255;
        } else return null;
        luminance.push((r * 299 + g * 587 + b * 114) / 1000);
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
    .in('state', ['saved', 'cancelled'])
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
  const checksums: string[] = [];
  const images: CapturedEvidence['images'] = [];
  for (const image of (data ?? []) as IntakeImageRow[]) {
    if (image.state !== 'ready') continue;
    const ext = extensionFor(image.mime);
    const sourcePath = `${input.actorUserId}/${input.ocrSessionId}/${image.id}.${ext}`;
    const { data: source, error: downloadError } = await input.service.storage
      .from('product-intake-images')
      .download(sourcePath);
    if (downloadError || !source) throw new Error(`ocr_evidence_image_missing:${image.id}`);
    const bytes = new Uint8Array(await source.arrayBuffer());
    const actualChecksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (actualChecksum !== image.checksum_sha256.toLowerCase()) {
      throw new Error(`ocr_evidence_checksum_mismatch:${image.id}`);
    }
    const archivePath = `${input.ocrSessionId}/${image.display_order}-${image.id}-${image.checksum_sha256}.${ext}`;
    const { error: archiveError } = await input.service.storage
      .from('global-catalog-evidence')
      .upload(archivePath, bytes, { contentType: image.mime, upsert: false });
    if (archiveError && !/already exists|duplicate/i.test(archiveError.message)) {
      throw new Error(`ocr_evidence_archive_failed:${image.id}`);
    }
    archived.push(archivePath);
    checksums.push(actualChecksum);
    images.push({ path: archivePath, mime: image.mime, checksum: actualChecksum });
    const phash = await perceptualHash(bytes, image.mime);
    if (phash) phashes.push(phash);
  }
  return {
    imagePhashes: [...new Set(phashes)],
    archivedImagePaths: archived,
    imageChecksums: checksums,
    images,
  };
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function attestServerOcr(input: {
  service: ServiceClient;
  actorUserId: string;
  ocrSessionId: string;
  evidence: CapturedEvidence;
  sourceProductSnapshotSha256: string;
  market: string | null;
}): Promise<string | null> {
  const endpoint = Deno.env.get('CATALOG_OCR_VERIFY_URL');
  const key = Deno.env.get('CATALOG_OCR_VERIFY_KEY');
  if (!endpoint || !key) return null;
  // A retry of duplicate resolution or manual completion must not pay for OCR
  // again and must not violate the immutable evidence key.
  const { data: prior } = await input.service
    .from('global_catalog_server_ocr_attestations')
    .select('id,verified_fields,image_checksums')
    .eq('source_session_key', input.ocrSessionId);
  const reusable = (prior ?? []).find((row) =>
    row.verified_fields?.sourceProductSnapshotSha256 === input.sourceProductSnapshotSha256
      && (row.verified_fields?.market ?? null) === input.market
      && JSON.stringify(row.image_checksums) === JSON.stringify(input.evidence.imageChecksums));
  if (reusable?.id) return reusable.id as string;

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
        expectedPublicSnapshotSha256: input.sourceProductSnapshotSha256,
        market: input.market,
      }),
    });
    if (!response.ok) return null;
    result = await response.json() as Partial<ServerOcrResult>;
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
  ) return null;
  if (result.verifiedFields.sourceProductSnapshotSha256 !== input.sourceProductSnapshotSha256) {
    return null;
  }
  const evidenceSha = await sha256Text(JSON.stringify({
    checksums: input.evidence.imageChecksums,
    fields: result.verifiedFields,
    provider: result.provider,
    providerVersion: result.providerVersion,
  }));
  const { data, error } = await input.service
    .from('global_catalog_server_ocr_attestations')
    .upsert({
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
    }, { onConflict: 'source_session_key,evidence_sha256', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error('server_ocr_attestation_save_failed');
  return data.id as string;
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
    const result = await response.json() as { success?: boolean };
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
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'catalog_submit_unavailable' }, 503);
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json({ error: 'authentication_required' }, 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const privateProductId = typeof body.privateProductId === 'string' ? body.privateProductId : null;
  const ocrSessionId = typeof body.ocrSessionId === 'string' ? body.ocrSessionId : null;
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null;
  if (!privateProductId || !ocrSessionId || !idempotencyKey) return json({ error: 'missing_required_fields' }, 400);
  if (idempotencyKey.length > 160) return json({ error: 'invalid_idempotency_key' }, 400);
  const market = typeof body.market === 'string' ? body.market.trim().slice(0, 64) : null;
  const retailer = typeof body.retailer === 'string' ? body.retailer.trim().slice(0, 120) : null;
  const packageLanguage = typeof body.packageLanguage === 'string' ? body.packageLanguage.trim().slice(0, 24) : null;
  const distinguishingEvidence = typeof body.distinguishingEvidence === 'object' && body.distinguishingEvidence !== null
    ? body.distinguishingEvidence
    : {};
  if (JSON.stringify(distinguishingEvidence).length > 8_000) return json({ error: 'distinguishing_evidence_too_large' }, 400);
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const device = typeof body.deviceSignal === 'string' ? body.deviceSignal : null;
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const riskSecret = Deno.env.get('CATALOG_RISK_HMAC_SECRET');
  if (!riskSecret) return json({ error: 'catalog_risk_control_unavailable' }, 503);
  const riskChallengePassed = await verifyRiskChallenge({
    token: typeof body.riskChallengeToken === 'string' ? body.riskChallengeToken : null,
    secret: Deno.env.get('TURNSTILE_SECRET_KEY'),
    remoteIp: forwarded,
  });
  const ipHash = riskSecret ? await hmacRiskValue(forwarded, riskSecret) : null;
  const deviceHash = riskSecret ? await hmacRiskValue(device?.slice(0, 512) ?? null, riskSecret) : null;
  const payloadHash = await sha256Text(`${auth.user.id}:${privateProductId}:${ocrSessionId}`);
  const { data: reservation, error: reservationError } = await service.rpc('begin_global_catalog_submission', {
    p_actor_user_id: auth.user.id,
    p_ocr_session_id: ocrSessionId,
    p_idempotency_key: idempotencyKey,
    p_payload_hash: payloadHash,
    p_ip_hash: ipHash,
    p_device_hash: deviceHash,
    p_risk_challenge_passed: riskChallengePassed,
  });
  if (reservationError) return json({ error: 'catalog_preflight_failed' }, 409);
  if (!reservation?.allowed) {
    return json({
      kind: 'rate_limited',
      productId: null,
      status: null,
      autoFavorited: false,
      duplicateCandidates: [],
      missingFields: [],
      reviewCaseKey: null,
      retryAt: reservation?.retryAt ?? null,
      challengeRequired: reservation?.challengeRequired === true,
      rateReason: reservation?.reason ?? 'rate_limited',
    });
  }
  const { data: sourceProductSnapshotSha256, error: snapshotError } = await service.rpc(
    'global_catalog_product_snapshot_hash',
    { p_actor_user_id: auth.user.id, p_private_product_id: privateProductId },
  );
  if (snapshotError || typeof sourceProductSnapshotSha256 !== 'string') {
    return json({ error: 'source_product_snapshot_failed' }, 409);
  }
  if (reservation?.idempotent) {
    const { data: prior } = await service
      .from('global_catalog_submissions')
      .select('outcome,result_snapshot')
      .eq('submitter_user_id', auth.user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    const decision = body.duplicateDecision === 'same' || body.duplicateDecision === 'different';
    const resumesBlocked = body.resumeBlocked === true && prior?.outcome === 'blocked';
    if (prior && resumesBlocked) {
      const { data: priorBinding } = await service
        .from('global_catalog_product_session_bindings')
        .select('product_snapshot_sha256')
        .eq('private_product_id', privateProductId)
        .eq('ocr_session_id', ocrSessionId)
        .maybeSingle();
      const priorRateLimited = prior.result_snapshot?.kind === 'rate_limited';
      const retryAt = typeof prior.result_snapshot?.retryAt === 'string'
        ? Date.parse(prior.result_snapshot.retryAt)
        : Number.NaN;
      const retryWindowOpen = priorRateLimited && Number.isFinite(retryAt) && retryAt <= Date.now();
      if (priorBinding?.product_snapshot_sha256 === sourceProductSnapshotSha256 && !retryWindowOpen) {
        return json(prior.result_snapshot);
      }
    }
    if (prior && ((!decision && !resumesBlocked) || (decision && prior.outcome !== 'likely_duplicate' && prior.outcome !== 'blocked'))) {
      return json(prior.result_snapshot);
    }
  }
  let evidence: CapturedEvidence;
  let serverAttestationId: string | null;
  try {
    evidence = await captureOwnedEvidence({ service, actorUserId: auth.user.id, ocrSessionId });
    serverAttestationId = await attestServerOcr({
      service,
      actorUserId: auth.user.id,
      ocrSessionId,
      evidence,
      sourceProductSnapshotSha256,
      market,
    });
  } catch {
    return json({ error: 'catalog_evidence_verification_failed' }, 409);
  }
  const { data, error } = await service.rpc('submit_owned_product_to_global_catalog_v2', {
    p_actor_user_id: auth.user.id,
    p_private_product_id: privateProductId,
    p_ocr_session_id: ocrSessionId,
    p_idempotency_key: idempotencyKey,
    p_market: market,
    p_retailer: retailer,
    p_package_language: packageLanguage,
    // pHash and archived paths are always derived above from owned server data;
    // similarly named browser fields are deliberately ignored.
    p_image_phashes: evidence.imagePhashes,
    p_archived_image_paths: evidence.archivedImagePaths,
    p_duplicate_decision: body.duplicateDecision === 'same' || body.duplicateDecision === 'different' ? body.duplicateDecision : null,
    p_distinguishing_evidence: distinguishingEvidence,
    p_ip_hash: ipHash,
    p_device_hash: deviceHash,
    p_rate_reservation_id: reservation.reservationId,
    p_server_attestation_id: serverAttestationId,
  });
  if (error) return json({ error: 'catalog_submission_failed' }, 400);
  return json(data);
});
