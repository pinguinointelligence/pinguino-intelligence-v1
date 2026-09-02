import { describe, expect, it } from 'vitest';
import { OFFICIAL_GELLATTI_WORDMARK_URL, resolveMasterLabelLogoUrl } from './labelBrand';
import { createCompleteLabel } from './masterLabelTestFixture';

describe('Master Label public wordmark authority', () => {
  it('replaces the legacy Gellatti AI upload only in Gellatti label output', () => {
    const label = createCompleteLabel('WORLD', {
      businessName: 'Gellatti QA Laboratory (staging)',
      logoPath: 'owner/legacy-gellatti-ai.png',
      enabledOptionalFields: ['logo'],
    });

    expect(resolveMasterLabelLogoUrl(label, 'https://signed.test/legacy-gellatti-ai.png')).toBe(
      OFFICIAL_GELLATTI_WORDMARK_URL,
    );
    expect(OFFICIAL_GELLATTI_WORDMARK_URL).toMatch(/gellatti.*wordmark/i);
  });

  it('preserves a non-Gellatti account logo', () => {
    const label = createCompleteLabel('WORLD', {
      businessName: 'Independent Gelato Lab',
      logoPath: 'owner/independent.png',
      enabledOptionalFields: ['logo'],
    });

    expect(resolveMasterLabelLogoUrl(label, 'https://signed.test/independent.png')).toBe(
      'https://signed.test/independent.png',
    );
  });
});
