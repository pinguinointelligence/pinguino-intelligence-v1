/**
 * Rank consumer/retail source packs by expected return per paid call.
 *
 * Ranking by brand size would put the biggest catalogue first regardless of
 * whether anything could be recovered from it. What matters is how many products
 * a single official-source discovery could actually move, so packs are ordered by
 * unresolved products per expected discovery call.
 *
 * Costs nothing: no web, OpenAI, Vision or DB call. Nothing here spends the
 * owner's authorized budget; it only says where spending it would pay.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';
import { buildMapperKnowledge } from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const IMPORT_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const REPORT = resolve(__dirname, '../../../../docs/products/consumer_pack_ranking.json');

/** Retailer hosts: real evidence, but never the manufacturer speaking. */
const RETAILERS = [
  'biedronka.pl',
  'auchan.pl',
  'carrefour.pl',
  'frisco.pl',
  'rossmann.pl',
  'lidl.pl',
  'kaufland.pl',
];

const clean = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed && !['not_found', 'not_applicable'].includes(trimmed) ? trimmed : null;
};

const host = (url: string | null): string | null => {
  const match = /^https?:\/\/([^/]+)/i.exec(url ?? '');
  return match?.[1] ? match[1].toLowerCase().replace(/^www\./, '') : null;
};

describe.runIf(existsSync(IMPORT_FILE) && existsSync(MAPPER_FILE))('Consumer pack ranking', () => {
  it('ranks packs by unresolved products per expected discovery call', () => {
    const mapper = loadMapperKnowledgeRows();
    const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
    const parsed = parseINTIMPORT(readFileSync(IMPORT_FILE, 'utf8'));
    // Comprital is settled: its composition is provably not published.
    const consumer = parsed.candidates.filter(
      (candidate) =>
        !`${candidate.source.Brand ?? ''}${candidate.source.Manufacturer ?? ''}`
          .toLowerCase()
          .includes('comprital'),
    );
    const { rows } = runIntimportLocalIntelligence(consumer, {}, knowledge);

    interface Pack {
      pack: string;
      products: number;
      ready: number;
      estimatedReady: number;
      unresolved: number;
      withDeclaredNutrition: number;
      withGtin: number;
      officialSourceRows: number;
      retailerSourceRows: number;
      domains: Record<string, number>;
    }
    const packs = new Map<string, Pack>();

    rows.forEach((row, index) => {
      const candidate = consumer[index];
      if (!candidate) return;
      const key =
        clean(candidate.source.Manufacturer) ?? clean(candidate.source.Brand) ?? 'UNATTRIBUTED';
      const pack =
        packs.get(key) ??
        {
          pack: key,
          products: 0,
          ready: 0,
          estimatedReady: 0,
          unresolved: 0,
          withDeclaredNutrition: 0,
          withGtin: 0,
          officialSourceRows: 0,
          retailerSourceRows: 0,
          domains: {},
        };
      pack.products += 1;
      const state = row.workingValues?.valueReadiness;
      if (state === 'READY') pack.ready += 1;
      else if (state === 'ESTIMATED_READY') pack.estimatedReady += 1;
      else pack.unresolved += 1;
      if (candidate.nutritionBasis === 'per_100g' && clean(candidate.source['Energy kcal'])) {
        pack.withDeclaredNutrition += 1;
      }
      if (candidate.ean) pack.withGtin += 1;
      const domain = host(clean(candidate.source['Primary Source URL']));
      if (domain) {
        pack.domains[domain] = (pack.domains[domain] ?? 0) + 1;
        if (RETAILERS.some((retailer) => domain.endsWith(retailer))) pack.retailerSourceRows += 1;
        else pack.officialSourceRows += 1;
      }
      packs.set(key, pack);
    });

    const ranked = [...packs.values()]
      .filter((pack) => pack.products >= 4 && pack.pack !== 'UNATTRIBUTED')
      .map((pack) => ({
        ...pack,
        // One discovery call finds the official domain; a second is budgeted only
        // when the owner recorded no official source at all for the pack.
        expectedDiscoveryCalls: pack.officialSourceRows > 0 ? 1 : 2,
        expectedImprovedPerCall: Number(
          (pack.unresolved / (pack.officialSourceRows > 0 ? 1 : 2)).toFixed(1),
        ),
      }))
      .sort((a, b) => b.expectedImprovedPerCall - a.expectedImprovedPerCall);

    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify({ packs: ranked }, null, 2)}\n`);
    expect(ranked.length).toBeGreaterThan(0);
  });
});
