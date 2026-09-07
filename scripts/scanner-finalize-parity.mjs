/**
 * PREVIEW == FINALIZE, on the shipped chain.
 *
 * The owner's regression was a scan that previewed one product and saved a different one. This runs
 * the real sequence a customer runs — research, preview, then the deliberate save of an unverified
 * product — and asserts the two verdicts are the same object by hash, the same confidence and the
 * same readiness.
 *
 * It DOES write: the save step is the thing under test. It writes only through the normal customer
 * path, as a repository-owned QA account, and the per-owner dedup means a repeated run updates that
 * account's existing private record rather than creating another one. Nothing is deleted.
 *
 *   GELLATTI_STAGING_ANON_KEY=<anon> node scripts/scanner-finalize-parity.mjs
 *   GELLATTI_STAGING_ANON_KEY=<anon> REPRO_EAN=7340222800457 node scripts/scanner-finalize-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const REF = 'tunabqqrwabacxjcxxkz';
const URL = `https://${REF}.supabase.co`;
const ANON = process.env.GELLATTI_STAGING_ANON_KEY;
if (!ANON) throw new Error('GELLATTI_STAGING_ANON_KEY is required');
const email = (process.env.QA_ACCOUNT ?? 'home@home.com').toLowerCase();
if (!['home@home.com', 'pro@pro.com', 'admin@admin.com'].includes(email))
  throw new Error('Only a repository-owned staging QA account is accepted.');
const password = /const FIXED_PASSWORD = '([^']+)'/.exec(
  readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8'),
)?.[1];
if (!password) throw new Error('repository staging fixture password missing');

const client = createClient(URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email,
  password,
});
if (signInError || !signIn.session) throw new Error(`sign-in failed for ${email}`);

const invoke = async (name, body) => {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    try {
      return await error.context.json();
    } catch {
      return { __error: error.message };
    }
  }
  return data;
};

const EAN = process.env.REPRO_EAN ?? '8402001042911';
const PRODUCT_FIELDS = {
  identity: { displayName: 'Cola Zero', brand: 'Hacendado' },
  nutrition: {
    basis: 'per_100g',
    energyKcal: 0.5,
    fat: 0,
    saturatedFat: 0,
    carbohydrate: 0.06,
    sugars: 0,
    protein: 0,
    salt: 0.02,
  },
};

const sessionId = crypto.randomUUID();
const analysis = await invoke('product-scan-analyze', {
  sessionId,
  mode: 'ean_lookup',
  images: [],
  barcode: { value: EAN, format: 'EAN_13', lookupValue: EAN },
});
if (analysis?.error) throw new Error(`analyze failed: ${analysis.error}`);
if (analysis?.kind === 'existing_product') {
  console.log(JSON.stringify({ skipped: 'existing_product', ean: EAN, product: analysis.product }));
  process.exit(0);
}

const confirmations = { packageEvidenceExhausted: true, productFields: PRODUCT_FIELDS };
const idempotencyKey = `parity:${sessionId}`;

const preview = await invoke('product-scan-finalize', {
  action: 'preview',
  sessionId,
  idempotencyKey,
  customerFamily: 'beverage',
  confirmations,
  privateOverlay: {},
});

/* The save carries the hash of the verdict that was just shown. If the pipeline would now produce a
   different one, the server refuses rather than persisting a product the customer never saw. */
const saved = await invoke('product-scan-finalize', {
  action: 'save_unverified',
  sessionId,
  idempotencyKey,
  customerFamily: 'beverage',
  confirmations,
  privateOverlay: {},
  expectedAssessmentHash: preview?.assessmentHash ?? null,
});

/* A repeated save of the same session must return the same product and the same usability. */
const again = await invoke('product-scan-finalize', {
  action: 'save_unverified',
  sessionId,
  idempotencyKey,
  customerFamily: 'beverage',
  confirmations,
  privateOverlay: {},
});

const previewVerdict = {
  productAccuracy: preview?.productAccuracyAssessment?.productAccuracy ?? null,
  ready: preview?.ready ?? null,
  roleReadiness: preview?.productAccuracyAssessment?.roleReadiness ?? null,
  family: preview?.recognition?.ingredientFamily ?? null,
  assessmentHash: preview?.assessmentHash ?? null,
};
const savedVerdict = {
  productAccuracy: saved?.assessment?.finalConfidence ?? saved?.productAccuracy ?? null,
  ready: saved?.assessment?.productionReady ?? saved?.productionReady ?? null,
  roleReadiness: saved?.assessment?.roleReadiness ?? null,
  family: saved?.assessment?.semanticFamily ?? saved?.recognition?.ingredientFamily ?? null,
  assessmentHash: saved?.assessmentHash ?? null,
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const verdict = {
  previewEqualsFinalize: same(previewVerdict, savedVerdict),
  repeatedFinalizeIdempotent:
    (again?.productId ?? again?.assessment?.sessionId) !== undefined &&
    (again?.productId ?? null) === (saved?.productId ?? null) &&
    (again?.engineUsable ?? null) === (saved?.engineUsable ?? null),
};

console.log(
  JSON.stringify(
    {
      account: email,
      ean: EAN,
      sessionId,
      verdict,
      preview: previewVerdict,
      saved: savedVerdict,
      route: saved?.route ?? null,
      productCode: saved?.productCode ?? null,
      engineUsable: saved?.engineUsable ?? null,
      repeated: {
        kind: again?.kind ?? null,
        productCode: again?.productCode ?? null,
        route: again?.route ?? null,
        engineUsable: again?.engineUsable ?? null,
      },
    },
    null,
    2,
  ),
);
process.exit(verdict.previewEqualsFinalize && verdict.repeatedFinalizeIdempotent ? 0 : 1);
