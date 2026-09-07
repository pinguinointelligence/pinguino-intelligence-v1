/**
 * ONE SCAN, ONE VERDICT — the reproduction that found the owner's regression, kept runnable.
 *
 * It drives the SHIPPED chain against staging: one scan session, three `preview` calls that differ
 * in nothing but whether the request repeats the customer's answers. On staging `416d5d90` it
 * printed
 *
 *     1 · answers in the request                  productAccuracy 90.0
 *     2 · SAME session, no confirmations          productAccuracy 73.4   ← what Cola Zero saved
 *     3 · answers in the request again            productAccuracy 90.0
 *
 * — and call 2 raised `INGREDIENTS_EVIDENCE_REQUIRED` for an ingredient text that was already on
 * the session. After the fix all three calls must agree, and their `assessmentHash` must be equal.
 *
 * Nothing is written to the catalogue: `action: 'preview'` never reaches the upsert RPC, so only the
 * caller's own scan session is touched. Run it with a repository-owned QA account only.
 *
 *   GELLATTI_STAGING_ANON_KEY=<anon> node scripts/scanner-preview-finalize-repro.mjs
 *   GELLATTI_STAGING_ANON_KEY=<anon> REPRO_EAN=7340222800457 node scripts/scanner-preview-finalize-repro.mjs
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
// the password stays owned by the existing staging fixture source; it is never logged or passed as an argument
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
    let detail = error.message;
    try {
      detail = JSON.stringify(await error.context.json());
    } catch {
      /* keep the message */
    }
    return { __error: detail };
  }
  return data;
};

const EAN = process.env.REPRO_EAN ?? '8402001042911'; // Cola Zero Hacendado (owner fixture)

/** the customer's answers, exactly as `confirmationsFromFields` shapes them */
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
  ingredientsText:
    'Agua carbonatada, colorante E-150d, acidulantes (E-338, E-331), edulcorantes (E-951, E-950), aroma, aroma de cafeína.',
};

const sessionId = crypto.randomUUID();
const analysis = await invoke('product-scan-analyze', {
  sessionId,
  mode: 'ean_lookup',
  images: [],
  barcode: { value: EAN, format: 'EAN_13', lookupValue: EAN },
});
if (analysis?.__error) throw new Error(`analyze failed: ${analysis.__error}`);
if (analysis?.kind === 'existing_product') {
  console.log(JSON.stringify({ skipped: 'existing_product', ean: EAN }, null, 2));
  process.exit(0);
}

const shot = (label, payload) => {
  const assessment = payload?.productAccuracyAssessment ?? {};
  const recognition = payload?.recognition ?? {};
  return {
    label,
    kind: payload?.kind ?? null,
    error: payload?.__error ?? payload?.error ?? null,
    productAccuracy: assessment.productAccuracy ?? payload?.productAccuracy ?? null,
    ready: payload?.ready ?? assessment.gellattiReadiness?.ready ?? null,
    roleReadiness: assessment.roleReadiness ?? null,
    components: assessment.components ?? null,
    criticalBlockers: assessment.criticalBlockers ?? null,
    recognition: {
      source: recognition.classificationSource ?? null,
      family: recognition.ingredientFamily ?? null,
      form: recognition.physicalForm ?? null,
      modelRequired: recognition.modelRequired ?? null,
      carriedForward: recognition.carriedForwardFromScan ?? false,
      fingerprint: recognition.evidenceFingerprint ?? null,
    },
    behaviour: payload?.productBehavior?.classificationOutcome ?? null,
    assessmentHash: payload?.assessmentHash ?? null,
  };
};

const call = (n, confirmations) =>
  invoke('product-scan-finalize', {
    action: 'preview',
    sessionId,
    idempotencyKey: `repro:${sessionId}:${n}`,
    customerFamily: 'beverage',
    confirmations,
    privateOverlay: {},
  });

const calls = [
  shot(
    '1 · answers in the request',
    await call(1, { packageEvidenceExhausted: true, productFields: PRODUCT_FIELDS }),
  ),
  shot(
    '2 · SAME session, no confirmations in the request',
    await call(2, { packageEvidenceExhausted: true, productFields: {} }),
  ),
  shot(
    '3 · answers in the request again',
    await call(3, { packageEvidenceExhausted: true, productFields: PRODUCT_FIELDS }),
  ),
];

const accuracies = new Set(calls.map((c) => c.productAccuracy));
const hashes = new Set(calls.map((c) => c.assessmentHash));
console.log(
  JSON.stringify(
    {
      account: email,
      ean: EAN,
      sessionId,
      verdict: {
        oneAccuracy: accuracies.size === 1,
        oneAssessmentHash: hashes.size === 1 && !hashes.has(null),
      },
      calls,
    },
    null,
    2,
  ),
);
// a drift between two calls on one session is the defect itself
process.exit(accuracies.size === 1 && hashes.size === 1 && !hashes.has(null) ? 0 : 1);
