import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const edge = readFileSync(resolve(root, 'supabase/functions/intimport-enrich/index.ts'), 'utf8');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260825230000_product_recognition_v2_cache.sql'),
  'utf8',
);
const profileAuthority = readFileSync(
  resolve(root, 'supabase/functions/_shared/intimportWholeProfileAuthority.ts'),
  'utf8',
);
const catalogSubmit = readFileSync(
  resolve(root, 'supabase/functions/catalog-submit/index.ts'),
  'utf8',
);
const productScanFinalize = readFileSync(
  resolve(root, 'supabase/functions/product-scan-finalize/index.ts'),
  'utf8',
);

describe('Product Recognition V2 server boundary', () => {
  it('reuses the existing authenticated OpenAI backend with strict structured output', () => {
    expect(edge).toContain("body.action === 'semantic_classification'");
    expect(edge).toContain("Deno.env.get('OPENAI_API_KEY')");
    expect(edge).toContain("Deno.env.get('OPENAI_PROJECT_ID')");
    expect(edge).toContain("Deno.env.get('INTIMPORT_ENRICHMENT_MODEL')");
    expect(edge).toContain("type: 'json_schema'");
    expect(edge).toContain('PRODUCT_RECOGNITION_MODEL_SCHEMA');
    expect(edge).toContain('validateProductSemanticModelOutput');
    expect(edge).toContain('AbortSignal.timeout(30_000)');
  });

  it('caches by exact evidence and enforces a server-side import cap', () => {
    expect(edge).toContain("from('intimport_semantic_classification_usage')");
    expect(edge).toContain("action: 'semantic_classification'");
    expect(edge).toContain('classifierVersion: PRODUCT_RECOGNITION_VERSION');
    expect(edge).toContain('cacheRevision: PRODUCT_RECOGNITION_CACHE_REVISION');
    expect(edge).toContain("numberEnv('INTIMPORT_MAX_SEMANTIC_CALLS_PER_IMPORT', 40)");
    expect(edge).toContain('const semanticCap = Math.min(');
    expect(edge).toContain("numberEnv('INTIMPORT_MAX_EXTERNAL_CALLS_PER_IMPORT', 40)");
    expect(edge).toContain("'reserve_intimport_semantic_classification'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("return 'CAP_REACHED'");
    expect(edge).toContain('intimport_semantic_call_cap_reached');
    expect(edge).toContain('semantic_attempt_not_repeated');
  });

  it('server-recomputes semantics instead of trusting the browser verdict', () => {
    expect(profileAuthority).toContain('classifyProductSemantics(input.recognitionEvidence)');
    expect(profileAuthority).toContain('semantic: recognition');
    expect(profileAuthority).toMatch(
      /technical:\s*recognition\?\.isTechnicalProduct\s*\?\?\s*\(?input\.matchInput\.technical === true\)?/,
    );
    expect(catalogSubmit).toContain('recognitionEvidence: trustedEvidence.recognitionEvidence');
    expect(catalogSubmit).toContain('mergeRecognitionFact(field, fact.value, factSourceUrl)');
    expect(catalogSubmit).toContain("origin: 'PR'");
    expect(catalogSubmit).toContain('recognitionEvidence: proposal.recognitionEvidence');
    expect(productScanFinalize).toContain("'gellatti_submit_product_request_v1'");
    expect(productScanFinalize).not.toContain('productSemanticEvidenceFromScanResult');
  });

  it('stores no secret and gives clients no write permission', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('revoke insert, update, delete');
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(/OPENAI_API_KEY|sk-[a-z0-9]/i);
  });

  it('does not mutate Mapper data', () => {
    expect(migration).not.toMatch(
      /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.mapper_basement/i,
    );
  });
});
