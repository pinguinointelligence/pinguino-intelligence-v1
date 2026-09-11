import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAPPER_SEARCH_RELEASE_COUNTS,
  MAPPER_SEARCH_RELEASE_ID,
  MAPPER_SEARCH_RELEASE_SHA256,
  MAPPER_SEARCH_VECTOR_SHA256,
} from './generated/releaseManifest';
import { createMapperSearchRuntime } from './runtime';
import { readTestMapperSearchRelease } from './testRelease';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('SA11-01 immutable FINAL_FROZEN release loader', () => {
  it('pins the generated release and frozen vectors by SHA-256', () => {
    const releaseSource = readFileSync(
      resolve(process.cwd(), 'public/mapper-search-runtime/sa10-final-frozen.json'),
      'utf8',
    );
    const vectorSource = readFileSync(
      resolve(
        process.cwd(),
        'src/features/mapper-search-runtime/generated/sa12Vectors.json',
      ),
      'utf8',
    );
    expect(sha(releaseSource)).toBe(MAPPER_SEARCH_RELEASE_SHA256);
    expect(sha(vectorSource)).toBe(MAPPER_SEARCH_VECTOR_SHA256);
  });

  it('loads all certified rows into three isolated channels', () => {
    const release = readTestMapperSearchRelease();
    expect(release.releaseId).toBe(MAPPER_SEARCH_RELEASE_ID);
    expect(release.counts).toEqual(MAPPER_SEARCH_RELEASE_COUNTS);
    expect(release.searchAliases).toHaveLength(27963);
    expect(release.roleAliases).toHaveLength(1714);
    expect(release.technicalAliases).toHaveLength(69);
    expect(new Set(release.searchAliases.map((row) => row.id)).size).toBe(27963);
    expect(new Set(release.roleAliases.map((row) => row.id)).size).toBe(1714);
    expect(new Set(release.technicalAliases.map((row) => row.id)).size).toBe(69);
  });

  it('loads 45 locale contracts, 75 markets and all 2541 Mapper IDs', () => {
    const release = readTestMapperSearchRelease();
    expect(release.localeContracts).toHaveLength(45);
    expect(release.marketRoutes).toHaveLength(75);
    expect(release.dataContracts).toHaveLength(45);
    expect(new Set(release.dataContracts.map((row) => `${row.suite}:${row.testId}`)).size).toBe(45);
    expect(release.mapperRows).toHaveLength(2541);
    expect(new Set(release.mapperRows.map((row) => row.id)).size).toBe(2541);
  });

  it('hard-fails forbidden alias→PI and technical auto-add mutations', () => {
    const release = readTestMapperSearchRelease();
    expect(() => createMapperSearchRuntime(release)).not.toThrow();
    const firstSearch = release.searchAliases[0]!;
    const firstTechnical = release.technicalAliases[0]!;
    expect(() =>
      createMapperSearchRuntime({
        ...release,
        searchAliases: [{ ...firstSearch, targetId: 'PI-ING-000001' }, ...release.searchAliases.slice(1)],
      }),
    ).toThrow(/direct Search alias/);
    expect(() =>
      createMapperSearchRuntime({
        ...release,
        technicalAliases: [
          { ...firstTechnical, autoAddAllowed: true },
          ...release.technicalAliases.slice(1),
        ],
      }),
    ).toThrow(/automatic PI\/auto-add/);
  });
});
