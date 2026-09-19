import { describe, expect, it } from 'vitest';
import { evidenceKindForMissingField, scanEvidenceState } from './evidenceState';

describe('Scanner consequence of unresolved Engine fields', () => {
  it.each([
    'water_percent',
    'total_solids_percent',
    'pod_value',
    'pac_value',
    'sweetness_factor',
    'freezing_factor',
  ])('does not classify %s as a label photograph request', (field) => {
    expect(evidenceKindForMissingField(field)).toBeNull();
  });

  it('does not request another view when only internal physics remains unresolved', () => {
    const state = scanEvidenceState({
      localBarcode: '8480000804693',
      catalogMatch: false,
      resolvedByLookup: ['identity', 'barcode', 'nutrition', 'ingredients'],
      resolvedByCamera: [],
      missingCriticalFields: ['water_percent', 'total_solids_percent'],
      shownViews: [],
      analysisExhausted: false,
    });
    expect(state).toMatchObject({
      complete: true,
      missingKinds: [],
      requestView: null,
      requestMessage: null,
    });
  });
});
