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
  it('PRING-BUNDLE-01 preserves the exact frozen runtime projection', () => {
    const releaseBytes = readFileSync(RELEASE);
    const release = JSON.parse(releaseBytes.toString('utf8')) as Record<string, unknown> & {
      searchAliases: Array<{ id: string }>;
      roleAliases: Array<{ id: string }>;
    };
    const bundle = readFileSync(BUNDLE, 'utf8');
    const commonEncoded = bundle.match(
      /const COMPRESSED_COMMON_BASE64 = "([A-Za-z0-9+/=]+)";/,
    )?.[1];
    const segmentsJson = bundle.match(
      /const COMPRESSED_LOCALE_SEGMENTS_BASE64 = Object\.freeze\((\{.+\})\);/,
    )?.[1];
    expect(commonEncoded).toBeTruthy();
    expect(segmentsJson).toBeTruthy();
    const common = JSON.parse(
      gunzipSync(Buffer.from(commonEncoded!, 'base64')).toString('utf8'),
    ) as Record<string, unknown>;
    const segments = Object.values(JSON.parse(segmentsJson!) as Record<string, string>).map(
      (encoded) =>
        JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')) as {
          searchAliases: Array<{ id: string }>;
          roleAliases: Array<{ id: string }>;
        },
    );
    const byId = <T extends { id: string }>(rows: T[]) =>
      rows.slice().sort((left, right) => left.id.localeCompare(right.id));

    expect(createHash('sha256').update(releaseBytes).digest('hex')).toBe(EXPECTED_SHA);
    for (const key of [
      'schemaVersion',
      'releaseId',
      'technicalAliases',
      'localeContracts',
      'marketRoutes',
      'precedence',
      'runtimeLexicon',
      'roleGrammar',
    ]) {
      expect(common[key]).toEqual(release[key]);
    }
    expect(byId(segments.flatMap((segment) => segment.searchAliases))).toEqual(
      byId(release.searchAliases),
    );
    expect(byId(segments.flatMap((segment) => segment.roleAliases))).toEqual(
      byId(release.roleAliases),
    );
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
    const { resolveFinalProductSemanticSearch } =
      await import('../../../supabase/functions/_shared/generated/productSemanticSearch.bundle.mjs');
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
    const { resolveFinalProductSemanticSearch } =
      await import('../../../supabase/functions/_shared/generated/productSemanticSearch.bundle.mjs');
    const resolution = await resolveFinalProductSemanticSearch('MCC', []);

    expect(resolution.searchMentions).toEqual([]);
    expect(resolution.technicalMentions).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'AMBIGUITY_GATE' })]),
    );
  });

  it('PRING-BUNDLE-05 bounds one Edge hydration to a single locale segment', () => {
    const bundle = readFileSync(BUNDLE, 'utf8');
    const commonEncoded = bundle.match(
      /const COMPRESSED_COMMON_BASE64 = "([A-Za-z0-9+/=]+)";/,
    )?.[1];
    const hintsEncoded = bundle.match(
      /const COMPRESSED_LOCALE_HINTS_BASE64 = "([A-Za-z0-9+/=]+)";/,
    )?.[1];
    const segmentsJson = bundle.match(
      /const COMPRESSED_LOCALE_SEGMENTS_BASE64 = Object\.freeze\((\{.+\})\);/,
    )?.[1];
    const segments = Object.values(JSON.parse(segmentsJson!) as Record<string, string>);
    const largestHydratedSegment = Math.max(
      ...segments.map((encoded) => gunzipSync(Buffer.from(encoded, 'base64')).byteLength),
    );

    expect(bundle).not.toContain('COMPRESSED_RELEASE_BASE64');
    expect(bundle).not.toContain('normalizeMapperSearchText(surface');
    expect(gunzipSync(Buffer.from(commonEncoded!, 'base64')).byteLength).toBeLessThan(300_000);
    expect(gunzipSync(Buffer.from(hintsEncoded!, 'base64')).byteLength).toBeLessThan(2_000_000);
    expect(largestHydratedSegment).toBeLessThan(1_000_000);
  });
});
