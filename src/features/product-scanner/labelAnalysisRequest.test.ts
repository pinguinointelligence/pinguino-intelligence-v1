import { describe, expect, it } from 'vitest';
import { requestedLabelFields } from './labelAnalysisRequest';

/*
  Reproduces the owner's 2026-09-07 runs, from the secured sessions:

    Sport 001  scan_session_id 6b8f1040-82c9-4ec6-9871-70171c7d06cf  asset b9d15efc  vision 200
    Sport 002  scan_session_id 3375f79a-1070-4ea6-a1f3-49c4be1ee3ee  asset 3573a9b8  vision 200

  Both sessions carried missingCritical [] because web discovery had filled every tracked field,
  so the client sent `missingFields: []`. The photograph was then analysed for nothing:
  product_scan_field_evidence 0 rows, result_json.evidence [], and the score identical before and
  after the photograph (Sport 001: 77.9 -> 77.9).
*/
const ALL = new Set(['ingredientsText', 'allergensText', 'nutrition', 'identity', 'package']);

describe('which label fields a photograph is asked to read', () => {
  it('reads the whole label when the caller says nothing is missing', () => {
    // the regression: [] used to mean "read none", so the photo produced no evidence
    expect(requestedLabelFields([], ALL)).toEqual({ fields: [...ALL], rejected: false });
  });

  it('reads the whole label when the caller names no field at all', () => {
    expect(requestedLabelFields(undefined, ALL)).toEqual({ fields: [...ALL], rejected: false });
    expect(requestedLabelFields(null, ALL)).toEqual({ fields: [...ALL], rejected: false });
  });

  it('narrows to exactly the fields a caller names, so a second photo can complete the first', () => {
    expect(requestedLabelFields(['nutrition'], ALL)).toEqual({
      fields: ['nutrition'],
      rejected: false,
    });
  });

  it('never silently narrows: an unknown field is refused, not dropped', () => {
    expect(requestedLabelFields(['nutrition', 'not_a_field'], ALL)).toEqual({
      fields: [],
      rejected: true,
    });
  });

  it('a non-array is not a wish list', () => {
    expect(requestedLabelFields('nutrition' as unknown as string[], ALL).fields).toEqual([...ALL]);
  });
});
