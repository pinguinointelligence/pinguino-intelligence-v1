import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidGtin } from './normalization';

const seed = readFileSync(
  resolve(process.cwd(), 'scripts/seed-staging-canonical-country-milk.mjs'),
  'utf8',
).replace(/\r\n/g, '\n');
const verification = readFileSync(
  resolve(process.cwd(), 'scripts/verify-staging-canonical-country-milk.mjs'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('staging canonical country Milk seed', () => {
  it('is hard-locked to staging and requires an explicit mutation flag', () => {
    expect(seed).toContain("const STAGING_REF = 'tunabqqrwabacxjcxxkz'");
    expect(seed).toContain("args.get('--project-ref') !== STAGING_REF");
    expect(seed).toContain("!args.has('--apply')");
    expect(seed).not.toContain('riwipywgqobrulyzrzad');
  });

  it.each([
    ['ES', '8402001047251'],
    ['PL', '5900820012434'],
    ['FR', '3262970109108'],
  ])('uses a checksum-valid real exact EAN for %s', (country, ean) => {
    expect(isValidGtin(ean)).toBe(true);
    expect(seed).toContain(`country: '${country}'`);
    expect(seed).toContain(`ean: '${ean}'`);
  });

  it('routes through canonical Product Request, Catalog ingest, slot review and country authority', () => {
    expect(seed).toContain("'gellatti_submit_product_request_v1'");
    expect(seed).toContain("admin.functions.invoke('catalog-submit'");
    expect(seed).toContain(".from('product_canonical_slot_reviews')");
    expect(seed).toContain('productOwnedBehaviorPreserved: true');
    expect(seed).toContain('runtimeMapperIdentity: null');
    expect(seed).toContain(".from('country_product_slot_assignments')");
    expect(seed).toContain("'set_user_preferred_product_for_slot_v1'");
  });

  it('preserves the frozen per-100-ml source basis and never writes Mapper', () => {
    expect(seed.match(/basis: 'per_100ml'/g)).toHaveLength(3);
    expect(seed).not.toMatch(/from\(['"]mapper_basement['"]\)\.(?:insert|update|upsert|delete)/);
    expect(seed).not.toContain('mapperDecision');
    expect(seed).not.toContain('matched_basement_id');
    expect(seed).not.toMatch(/density/i);
  });

  it('verifies guest country defaults plus HOME and explicit PRO preference through the live RPC', () => {
    expect(verification).toContain("ES: Object.freeze({ brand: 'Hacendado'");
    expect(verification).toContain("PL: Object.freeze({ brand: 'Łaciate'");
    expect(verification).toContain("FR: Object.freeze({ brand: 'Alsace Lait'");
    expect(verification).toContain("assertExact(homePoland, 'PL', 'COUNTRY_PRIMARY_DEFAULT')");
    expect(verification).toContain("assertExact(proPreferred, 'ES', 'USER_PREFERRED', 'PL')");
    expect(verification).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
  });
});
