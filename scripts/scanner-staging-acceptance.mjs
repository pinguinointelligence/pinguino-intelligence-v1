import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=') || true];
  }),
);
if (args.get('--project-ref') !== STAGING_REF) {
  throw new Error('Refusing: exact staging project ref confirmation is required.');
}
const imagePath = resolve(String(args.get('--image') ?? ''));
if (!imagePath || !['.png', '.jpg', '.jpeg', '.webp'].includes(extname(imagePath).toLowerCase())) {
  throw new Error('A supported --image=/absolute/path fixture is required.');
}
const fixtureEmail = String(args.get('--account') ?? 'pro@pro.com').toLowerCase();
if (!['home@home.com', 'pro@pro.com', 'admin@admin.com'].includes(fixtureEmail)) {
  throw new Error('Only a repository-owned staging QA account is accepted.');
}

const apiKeys = JSON.parse(
  execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ),
);
const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
if (typeof anonKey !== 'string' || anonKey.length < 100) {
  throw new Error('The staging anonymous API key could not be resolved through the linked CLI.');
}

// The password stays owned by the existing staging fixture source and is never
// copied into this script, command arguments, logs or the completion report.
const fixtureSource = readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8');
const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
if (!fixturePassword) throw new Error('Repository staging fixture password is missing.');

const client = createClient(STAGING_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email: fixtureEmail,
  password: fixturePassword,
});
if (signInError || !signIn.session?.access_token) {
  throw new Error(`Staging QA authentication failed for ${fixtureEmail}.`);
}
const accessToken = signIn.session.access_token;

const invoke = async (name, body) => {
  const response = await fetch(`${STAGING_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${name}:${response.status}:${String(payload.error ?? 'unknown_error')}`);
  }
  return payload;
};

const sessionId = randomUUID();
const assetId = randomUUID();
const barcode = { kind: 'EAN_13', value: '4001686322536', lookupValue: '4001686322536' };
const bytes = readFileSync(imagePath);
const mime =
  extname(imagePath).toLowerCase() === '.png'
    ? 'image/png'
    : extname(imagePath).toLowerCase() === '.webp'
      ? 'image/webp'
      : 'image/jpeg';
const image = {
  assetId,
  mime,
  base64: bytes.toString('base64'),
  source: 'gallery',
  originalMime: mime,
  transformations: [],
  qualityScore: null,
};

const lookup = await invoke('product-scan-analyze', {
  sessionId,
  mode: 'ean_lookup',
  images: [],
  barcode,
});
if (lookup.kind === 'existing_product') {
  console.log(
    JSON.stringify({
      ok: true,
      path: 'EXACT_EAN_SHORT_CIRCUIT',
      sessionId,
      product: lookup.product,
      usage: lookup.usage,
    }),
  );
  await client.auth.signOut();
  process.exit(0);
}

let analysis = await invoke('product-scan-analyze', {
  sessionId,
  images: [image],
  barcode,
  accurateRetry: false,
  missingFields: lookup.missingCriticalFields ?? [],
});
if (
  analysis.kind !== 'existing_product' &&
  Array.isArray(analysis.missingCriticalFields) &&
  analysis.missingCriticalFields.length > 0 &&
  Number(analysis.usage?.visionCalls ?? 0) < 2
) {
  analysis = await invoke('product-scan-analyze', {
    sessionId,
    images: [image],
    barcode,
    accurateRetry: true,
    missingFields: analysis.missingCriticalFields,
  });
}
if (analysis.kind === 'existing_product') {
  console.log(
    JSON.stringify({
      ok: true,
      path: 'VISION_EXACT_EAN_SHORT_CIRCUIT',
      sessionId,
      product: analysis.product,
      usage: analysis.usage,
    }),
  );
  await client.auth.signOut();
  process.exit(0);
}

const result = analysis.result;
const nutrition = Object.fromEntries(
  Object.entries(result.nutrition ?? {}).filter(
    ([key, value]) =>
      (key === 'basis' && ['per_100g', 'per_100ml'].includes(value)) ||
      (key !== 'basis' && typeof value === 'number' && Number.isFinite(value)),
  ),
);
const productionDeclarations = Object.fromEntries(
  Object.entries(result.productionDeclarations ?? {}).filter(
    ([, value]) =>
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.trim().length > 0),
  ),
);
const productFields = {
  barcode: barcode.lookupValue,
  identity: {
    displayName: result.identity?.displayName ?? result.identity?.originalName ?? null,
    brand: result.identity?.brand ?? null,
    explicitlyUnbranded: result.identity?.explicitlyUnbranded === true,
  },
  nutrition,
  ...(result.ingredientsText ? { ingredientsText: result.ingredientsText } : {}),
  ...(result.allergensText ? { allergensText: result.allergensText } : {}),
  productionDeclarations,
};
const action = args.has('--create') ? 'finalize' : 'preview';
const profile = await invoke('product-scan-finalize', {
  action,
  sessionId,
  idempotencyKey: `${sessionId}:staging-acceptance-v1:${action}`,
  customerFamily: null,
  confirmations: { packageEvidenceExhausted: true, productFields },
  privateOverlay: {},
});
const recognition = profile.recognition ?? {};
const behavior = profile.productBehavior ?? {};
const mapper = profile.mapper ?? {};
console.log(
  JSON.stringify({
    ok: profile.ready === true || profile.usableProductCreated === true,
    action,
    path: 'ONE_PHOTO_AUTONOMOUS_LOOP',
    sessionId,
    identity: {
      name: productFields.identity.displayName,
      brand: productFields.identity.brand,
      barcode: productFields.barcode,
    },
    evidence: {
      labelFields: Array.isArray(result.evidence) ? result.evidence.length : 0,
      externalSources: Array.isArray(result.externalSources) ? result.externalSources.length : 0,
      ingredients: Boolean(result.ingredientsText),
      nutritionBasis: result.nutrition?.basis ?? null,
    },
    usage: analysis.usage,
    recognition: {
      archetype: recognition.productArchetype ?? null,
      family: recognition.ingredientFamily ?? null,
      form: recognition.physicalForm ?? null,
      role: recognition.intendedUsageRole ?? null,
      confidence: recognition.confidence ?? null,
      technical: recognition.isTechnicalProduct ?? null,
    },
    mapper: {
      donor: mapper.selectedDonorId ?? null,
      similarity: mapper.similarity ?? null,
      basis: mapper.basis ?? null,
      candidatesBeforeFilter: mapper.candidatesBeforeFilter ?? [],
      candidatesAfterFilter: mapper.candidatesAfterFilter ?? [],
      rejectedCandidates: mapper.rejectedCandidates ?? [],
    },
    productAccuracy: profile.productAccuracy ?? null,
    behavior: {
      outcome: behavior.classificationOutcome ?? null,
      base: behavior.baseRecipeEligible ?? null,
      topping: behavior.toppingEligible ?? null,
      reference: behavior.referenceMapperIngredientId ?? null,
    },
    engineUsable: profile.engineUsable ?? null,
    ready: profile.ready ?? profile.usableProductCreated ?? false,
    criticalGaps: profile.criticalGaps ?? [],
    productId: profile.productId ?? null,
    productCode: profile.productCode ?? null,
  }),
);
await client.auth.signOut();
