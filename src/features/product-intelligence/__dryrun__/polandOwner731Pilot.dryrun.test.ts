import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseINTIMPORT } from '@/data/products/intimport';
import {
  intimportWorkbookToCsv,
  OWNER_SEMANTIC_POPULATION,
  OWNER_SEMANTIC_SHEET,
} from '@/data/products/intimportWorkbook';
import { buildMapperKnowledge } from '../mapperValueInference';
import { planIntimportImport, runIntimportLocalIntelligence } from '../intimportIntelligence';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const WORKBOOK = '/Users/tomaszboro22/Desktop/PL_POLAND_GELLATTI_SEMANTIC_CLASSIFIED.xlsx';
const SELECTION = resolve(process.cwd(), 'reports/poland-intimport-pilot/selection.json');

describe.runIf(existsSync(WORKBOOK))('Poland owner-classified 20-product pilot dry run', () => {
  it('processes exactly the pre-recorded 20 from the retained 731 through shared Product Intelligence', () => {
    const selected = JSON.parse(readFileSync(SELECTION, 'utf8')) as {
      population: number;
      selected: Array<{
        sourceProductId: string;
        usageRole: 'BASE_ONLY' | 'TOPPING_ONLY' | 'BASE_AND_TOPPING';
      }>;
    };
    expect(selected.population).toBe(OWNER_SEMANTIC_POPULATION);
    expect(selected.selected).toHaveLength(20);

    const converted = intimportWorkbookToCsv(readFileSync(WORKBOOK));
    expect(converted.sheet).toBe(OWNER_SEMANTIC_SHEET);
    expect(converted.ownerClassifications).toHaveLength(OWNER_SEMANTIC_POPULATION);
    const parsed = parseINTIMPORT(converted.csv);
    expect(parsed.candidates).toHaveLength(OWNER_SEMANTIC_POPULATION);
    const candidatesById = new Map(
      parsed.candidates.map((candidate) => [candidate.sourceProductId, candidate] as const),
    );
    const selectedCandidates = selected.selected.map(({ sourceProductId }) => {
      const candidate = candidatesById.get(sourceProductId);
      if (!candidate)
        throw new Error(`Selection is absent from retained population: ${sourceProductId}`);
      return candidate;
    });
    const ownerById = new Map(
      converted.ownerClassifications.map((classification) => [
        classification.sourceProductId,
        classification,
      ]),
    );
    const ownerByRow = new Map(
      selectedCandidates.map((candidate) => [
        candidate.rowIndex,
        ownerById.get(candidate.sourceProductId!)!,
      ]),
    );
    const mapperBefore = readFileSync(MAPPER_FILE);
    const mapper = loadMapperKnowledgeRows();
    const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
    const result = runIntimportLocalIntelligence(
      selectedCandidates,
      {},
      knowledge,
      new Map(),
      new Map(),
      new Map(),
      ownerByRow,
    );

    expect(result.rows).toHaveLength(20);
    expect(result.rows.map((row) => row.sourceProductId)).toEqual(
      selected.selected.map((row) => row.sourceProductId),
    );
    for (const [index, row] of result.rows.entries()) {
      expect(row.ownerClassification?.usageRole).toBe(selected.selected[index]?.usageRole);
      expect(row.recognition.intendedUsageRole).toBe(selected.selected[index]?.usageRole);
      expect(row.recognition.classificationSource).toBe('OWNER_CONFIRMED');
    }
    const plan = planIntimportImport(result.rows);
    expect(plan.rows).toHaveLength(20);
    for (const row of plan.rows) {
      const extracted = row.insert.extracted_json as Record<string, unknown>;
      const intelligence = extracted.productIntelligence as Record<string, unknown>;
      const proposal = intelligence.intimportProductProfileProposal as Record<string, unknown>;
      expect(proposal.ownerClassification).toBeTruthy();
      expect(row.insert).not.toHaveProperty('matched_basement_id');
    }
    expect(readFileSync(MAPPER_FILE)).toEqual(mapperBefore);
  }, 60_000);
});
