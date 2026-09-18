/**
 * Owner 2026-09-17 — the discovery links are a versioned projection with a manifest, and
 * they can never become a product the customer's own recipe is built from.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approvedConceptOrder, conceptDiscoveryIndex, indexConceptDefaults } from './index';
import { MAPPER_CONCEPT_DEFAULTS } from './generated/conceptDefaults';
import { MAPPER_CONCEPT_DISCOVERY_LINKS } from './generated/conceptDiscoveryLinks';
import {
  MAPPER_CONCEPT_DISCOVERY_SHA256,
  MAPPER_CONCEPT_DISCOVERY_SOURCE_SHA256,
} from './generated/conceptDiscoveryManifest';
import { MAPPER_SEARCH_RELEASE_ID } from './generated/releaseManifest';
import { readTestMapperSearchRelease } from './testRelease';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const defaults = indexConceptDefaults(MAPPER_CONCEPT_DEFAULTS);

describe('DISCOVERY — versioned projection with hash control', () => {
  it('DISCOVERY-01: the generated module and its owner-approved source match the manifest', () => {
    const generated = readFileSync(
      join(process.cwd(), 'src/features/mapper-search-runtime/generated/conceptDiscoveryLinks.ts'),
      'utf8',
    );
    const source = readFileSync(
      join(process.cwd(), 'src/features/mapper-search-runtime/conceptDiscoveryLinks.source.json'),
      'utf8',
    );
    expect(sha256(generated)).toBe(MAPPER_CONCEPT_DISCOVERY_SHA256);
    expect(sha256(source)).toBe(MAPPER_CONCEPT_DISCOVERY_SOURCE_SHA256);
    expect(MAPPER_CONCEPT_DISCOVERY_LINKS.source.sha256).toBe(
      MAPPER_CONCEPT_DISCOVERY_SOURCE_SHA256,
    );
    expect(MAPPER_CONCEPT_DISCOVERY_LINKS.searchReleaseId).toBe(MAPPER_SEARCH_RELEASE_ID);
    expect(MAPPER_CONCEPT_DISCOVERY_LINKS.usage).toBe('RECIPE_DISCOVERY_ONLY');
  });

  it('DISCOVERY-02: every link names a real concept and a real Mapper ingredient', () => {
    const release = readTestMapperSearchRelease();
    const mapperIds = new Set((release.mapperRows as { id: string }[]).map((row) => row.id));
    const conceptKeys = new Set(
      (release.concepts as { key: string; id: string }[]).map((row) => `${row.id}|${row.key}`),
    );
    expect(MAPPER_CONCEPT_DISCOVERY_LINKS.links.length).toBeGreaterThan(0);
    for (const link of MAPPER_CONCEPT_DISCOVERY_LINKS.links) {
      expect(mapperIds.has(link.piId), link.piId).toBe(true);
      expect(conceptKeys.has(`${link.conceptId}|${link.conceptKey}`), link.conceptKey).toBe(true);
    }
  });

  it('DISCOVERY-03: a discovery product is never part of the frozen selection order', () => {
    for (const link of MAPPER_CONCEPT_DISCOVERY_LINKS.links) {
      const decision = defaults.get(link.conceptKey);
      expect(decision, link.conceptKey).toBeDefined();
      for (const scope of [null, 'GELATO', 'SORBET', 'VEGAN'] as const) {
        expect(approvedConceptOrder(decision!, scope)).not.toContain(link.piId);
      }
      expect(decision!.defaultPiId).not.toBe(link.piId);
      expect(decision!.alternativePiIds).not.toContain(link.piId);
    }
  });

  it('DISCOVERY-04: the index answers per concept, and the owner link for strawberry is there', () => {
    const index = conceptDiscoveryIndex();
    expect(index.get('strawberry')).toContain('PI-ING-001435');
    expect(index.get('banana')).toBeUndefined();
  });

  it('DISCOVERY-05: product SELECTION never reads the discovery projection', () => {
    for (const path of [
      'src/services/productPicker/mapperSearch.ts',
      'src/features/mapper-search-runtime/conceptDefaults.ts',
      'src/features/home-creator/homeIntentResolutionService.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      expect(source, path).not.toContain('conceptDiscovery');
      expect(source, path).not.toContain('MAPPER_CONCEPT_DISCOVERY_LINKS');
    }
  });
});
