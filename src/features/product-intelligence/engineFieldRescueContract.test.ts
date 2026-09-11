import { describe, expect, it } from 'vitest';
import { ENGINE_FIELD_RESCUE_MATRIX } from './engineFieldRescueContract';
import { WORKING_NUMERIC_FIELDS } from './productFieldTruth';

describe('complete Engine-field Rescue inventory', () => {
  it('covers every Product Intelligence working field plus optional saturated fat exactly once', () => {
    const fields = ENGINE_FIELD_RESCUE_MATRIX.map((entry) => entry.field);
    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toEqual([...WORKING_NUMERIC_FIELDS, 'saturated_fat_percent']);
  });

  it('never permits cohort copies of Engine-derived POD/PAC', () => {
    for (const field of ['pod_value', 'pac_value'] as const) {
      expect(ENGINE_FIELD_RESCUE_MATRIX.find((entry) => entry.field === field)).toMatchObject({
        perFieldRescueAllowed: false,
      });
    }
  });
});
