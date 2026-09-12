import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RELEASE = resolve('public/mapper-search-runtime/sa10-final-frozen.json');
const BUNDLE = resolve('supabase/functions/_shared/generated/productSemanticSearch.bundle.mjs');
const DECLARATION = resolve(
  'supabase/functions/_shared/generated/productSemanticSearch.bundle.d.mts',
);
const EXPECTED_SHA = '20e92e6c84d8909e97bde2359d81a0aa429b3f0c6311474c3e50b10705936127';

describe('product semantic FINAL Search Edge bundle', () => {
  it('PRING-BUNDLE-01 contains the exact frozen release byte-for-byte', () => {
    const release = readFileSync(RELEASE);
    const bundle = readFileSync(BUNDLE, 'utf8');
    const encoded = bundle.match(/const COMPRESSED_RELEASE_BASE64 = "([A-Za-z0-9+/=]+)";/)?.[1];
    expect(encoded).toBeTruthy();
    const hydrated = gunzipSync(Buffer.from(encoded!, 'base64'));

    expect(createHash('sha256').update(release).digest('hex')).toBe(EXPECTED_SHA);
    expect(createHash('sha256').update(hydrated).digest('hex')).toBe(EXPECTED_SHA);
    expect(hydrated.equals(release)).toBe(true);
  });

  it('PRING-BUNDLE-02 pins the generated runtime and declaration to FINAL Search', () => {
    const bundle = readFileSync(BUNDLE, 'utf8');
    const declaration = readFileSync(DECLARATION, 'utf8');
    expect(bundle).toContain('import { createMapperSearchRuntime }');
    expect(bundle).toContain(
      'PRODUCT_SEMANTIC_SEARCH_RELEASE_ID = "GELLATTI-SA10-2026-09-10-FINAL"',
    );
    expect(bundle).toContain(EXPECTED_SHA);
    expect(declaration).toContain("'GELLATTI-SA10-2026-09-10-FINAL'");
    expect(declaration).toContain(EXPECTED_SHA);
  });

  it('PRING-BUNDLE-03 resolves an exact mixed-language PR by cross-locale consensus', async () => {
    const { resolveFinalProductSemanticSearch } = await import(
      '../../../supabase/functions/_shared/generated/productSemanticSearch.bundle.mjs'
    );
    const resolution = await resolveFinalProductSemanticSearch(
      [
        'HARIBO Żelki owocowe arbuz',
        'CARAMELOS DE GOMA SABOR SANDÍA',
        'confectionery SOLID FRUIT inclusion bakery_inclusion confectionery_inclusion',
      ].join(' '),
      [],
    );

    expect(resolution.searchMentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: 'SC-ING-000184',
          targetKey: 'watermelon',
        }),
      ]),
    );
  });

  it('PRING-BUNDLE-04 preserves a FINAL Search ambiguity gate', async () => {
    const { resolveFinalProductSemanticSearch } = await import(
      '../../../supabase/functions/_shared/generated/productSemanticSearch.bundle.mjs'
    );
    const resolution = await resolveFinalProductSemanticSearch('MCC', []);

    expect(resolution.searchMentions).toEqual([]);
    expect(resolution.technicalMentions).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'AMBIGUITY_GATE' })]),
    );
  });
});
