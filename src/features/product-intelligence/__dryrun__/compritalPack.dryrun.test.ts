/**
 * Comprital source-pack measurement — the state of one manufacturer's 367
 * products before any external enrichment is applied.
 *
 * Costs nothing: no web, OpenAI, Vision or DB call. The external retrieval this
 * report accompanies happened separately and is accounted for in the closeout.
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
const REPORT = resolve(__dirname, '../../../../docs/products/comprital_pack_baseline.json');

describe.runIf(existsSync(IMPORT_FILE) && existsSync(MAPPER_FILE))('Comprital pack baseline', () => {
  it('measures composition and technical dimensions separately', () => {
    const mapper = loadMapperKnowledgeRows();
    const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
    const parsed = parseINTIMPORT(readFileSync(IMPORT_FILE, 'utf8'));
    const comprital = parsed.candidates.filter((candidate) =>
      `${candidate.source.Brand ?? ''}${candidate.source.Manufacturer ?? ''}`
        .toLowerCase()
        .includes('comprital'),
    );
    const { rows } = runIntimportLocalIntelligence(comprital, {}, knowledge);

    const has = (value: string | null | undefined): boolean =>
      !!value && !['not_found', 'not_applicable'].includes(value.trim());
    const source = (index: number): Partial<Record<string, string | null>> =>
      comprital[index]?.source ?? {};

    const report = {
      compritalProducts: rows.length,
      // COMPOSITION dimension — the nine engine fields.
      compositionReady: rows.filter((row) => row.workingValues?.engineReady).length,
      compositionReview: rows.filter((row) => row.workingValues?.valueReadiness === 'REVIEW')
        .length,
      mapperContributedAnyField: rows.filter(
        (row) => (row.workingValues?.mapperTiersUsed.length ?? 0) > 0,
      ).length,
      declaredNutritionRows: comprital.filter((c) => c.nutritionBasis === 'per_100g').length,
      // TECHNICAL dimension — reported separately, never merged.
      withProfessionalDosage: comprital.filter((_, i) => has(source(i)['Professional Dosage']))
        .length,
      withTechnicalParameters: comprital.filter((_, i) => has(source(i)['Technical Parameters']))
        .length,
      withTechnicalPdf: comprital.filter((_, i) => has(source(i)['Technical PDF URL'])).length,
      withIngredients: comprital.filter((_, i) => has(source(i)['Ingredients Original'])).length,
      withAllergens: comprital.filter((_, i) => has(source(i).Allergens)).length,
      withBarcode: comprital.filter((c) => c.ean !== null).length,
      // INTIMPORT grants no technical authority; ProductBehavior does, server-side.
      technicalAuthorityGrantedHere: 0,
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
    expect(report.compritalProducts).toBeGreaterThan(0);
  });
});
