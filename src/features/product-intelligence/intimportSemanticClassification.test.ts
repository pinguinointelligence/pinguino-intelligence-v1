import { describe, expect, it, vi } from 'vitest';
import { parseINTIMPORT, INTIMPORT_COLUMNS, type IntimportColumn } from '@/data/products/intimport';
import { assessIntimportProduct } from './intimportIntelligence';
import { runIntimportSemanticClassification } from './intimportSemanticClassification';

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
const candidate = (name: string) => {
  const row = Object.fromEntries(INTIMPORT_COLUMNS.map((column) => [column, 'not_found'])) as Record<IntimportColumn, string>;
  Object.assign(row, {
    'Product ID': `PL-${name}`,
    'Country Code': 'PL',
    Brand: 'Test',
    'Product Name Original': name,
    'Net Quantity Value': '1',
    'Net Quantity Unit': 'kg',
  });
  const csv = [INTIMPORT_COLUMNS.map(quote).join(','), INTIMPORT_COLUMNS.map((column) => quote(row[column])).join(',')].join('\n');
  return parseINTIMPORT(csv).candidates[0]!;
};

describe('bounded semantic-classifier orchestration', () => {
  it('never calls the model for deterministic products', async () => {
    const row = assessIntimportProduct(candidate('White chocolate bar'));
    const provider = vi.fn();
    const result = await runIntimportSemanticClassification([row], provider);
    expect(provider).not.toHaveBeenCalled();
    expect(result.summary.deterministicOnly).toBe(1);
  });

  it('caches identical exact evidence and keeps unresolved output fail-closed', async () => {
    const source = assessIntimportProduct(candidate('Ambiguous X'));
    const duplicate = { ...source, rowIndex: source.rowIndex + 1 };
    const provider = vi.fn(async () => ({
      classification: source.recognition,
      calls: 1,
      cacheHit: false,
      evidenceReceipt: 'receipt',
      model: 'test',
    }));
    const result = await runIntimportSemanticClassification([source, duplicate], provider, 4);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result.summary.modelCalls).toBe(1);
    expect(result.summary.cacheHits).toBe(1);
    expect(result.summary.unresolved).toBe(2);
    expect(result.evidenceReceipts.size).toBe(0);
  });
});
