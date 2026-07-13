import { describe, expect, it } from 'vitest';
import {
  buildSubstitutionIntent,
  CUSTOMER_SUBSTITUTION_CONTRACT_VERSION,
} from './substitutionIntent';

describe('customer substitution intent contract (contract only)', () => {
  it('captures a "replace with" request with the requested substitute', () => {
    const intent = buildSubstitutionIntent({
      lineId: 'line-1',
      ingredientName: 'Cream 30%',
      reason: 'replace_with',
      requestedSubstituteName: 'Coconut cream',
    });
    expect(intent.reason).toBe('replace_with');
    expect(intent.requestedSubstituteName).toBe('Coconut cream');
    expect(intent.contractVersion).toBe(CUSTOMER_SUBSTITUTION_CONTRACT_VERSION);
  });

  it('drops the target for "I don\'t have this" and "why is this here?"', () => {
    const missing = buildSubstitutionIntent({
      lineId: 'line-2',
      ingredientName: 'Tara gum',
      reason: 'i_dont_have_this',
      requestedSubstituteName: 'ignored',
    });
    expect('requestedSubstituteName' in missing).toBe(false);

    const why = buildSubstitutionIntent({
      lineId: 'line-3',
      ingredientName: 'Dextrose',
      reason: 'why_is_this_here',
    });
    expect(why.reason).toBe('why_is_this_here');
    expect('requestedSubstituteName' in why).toBe(false);
  });
});
