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

describe('Product Recognition V2 server boundary', () => {
  it('reuses the existing authenticated OpenAI backend with strict structured output', () => {
    expect(edge).toContain("body.action === 'semantic_classification'");
    expect(edge).toContain("Deno.env.get('OPENAI_API_KEY')");
    expect(edge).toContain("Deno.env.get('OPENAI_PROJECT_ID')");
    expect(edge).toContain("Deno.env.get('INTIMPORT_ENRICHMENT_MODEL')");
    expect(edge).toContain("type: 'json_schema'");
    expect(edge).toContain('PRODUCT_RECOGNITION_MODEL_SCHEMA');
    expect(edge).toContain('validateProductSemanticModelOutput');
  });

  it('caches by exact evidence and enforces a server-side import cap', () => {
    expect(edge).toContain("from('intimport_semantic_classification_usage')");
    expect(edge).toContain("action: 'semantic_classification'");
    expect(edge).toContain('classifierVersion: PRODUCT_RECOGNITION_VERSION');
    expect(edge).toContain("'reserve_intimport_semantic_classification'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("return 'CAP_REACHED'");
    expect(edge).toContain('intimport_semantic_call_cap_reached');
    expect(edge).toContain('semantic_attempt_not_repeated');
  });

  it('server-recomputes semantics instead of trusting the browser verdict', () => {
    expect(profileAuthority).toContain('classifyProductSemantics(input.recognitionEvidence)');
    expect(profileAuthority).toContain('semantic: recognition');
    expect(profileAuthority).toContain(
      'technical: recognition?.isTechnicalProduct ?? (input.matchInput.technical === true)',
    );
  });

  it('stores no secret and gives clients no write permission', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('revoke insert, update, delete');
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(/OPENAI_API_KEY|sk-[a-z0-9]/i);
  });

  it('does not mutate Mapper data', () => {
    expect(migration).not.toMatch(/(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.mapper_basement/i);
  });
});
