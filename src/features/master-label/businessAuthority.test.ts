import { describe, expect, it } from 'vitest';
import { isEuMemberStateCode, responsibleBusinessDetails } from './businessAuthority';
import { createCompleteLabel } from './masterLabelTestFixture';

describe('market business-address authority', () => {
  it('accepts only a real EU Member State as EU destination context', () => {
    expect(isEuMemberStateCode('ES')).toBe(true);
    expect(isEuMemberStateCode('PL')).toBe(true);
    expect(isEuMemberStateCode('US')).toBe(false);
    expect(isEuMemberStateCode('NO')).toBe(false);
  });

  it('uses an EU importer when the operator is outside the European Union', () => {
    const baseline = createCompleteLabel('EU');
    const data = createCompleteLabel('EU', {
      operator: {
        ...baseline.operator,
        countryCode: 'US',
        importerName: 'Gellatti EU Import SL',
        importerAddress: '1 Import Street, Madrid',
        importerCountryCode: 'ES',
      },
    });
    expect(responsibleBusinessDetails(data)).toMatchObject({
      role: 'importer',
      ready: true,
      countryCode: 'ES',
    });
  });

  it('does not treat a Norway address as establishment in the European Union', () => {
    const baseline = createCompleteLabel('EU');
    expect(
      responsibleBusinessDetails(
        createCompleteLabel('EU', {
          operator: {
            ...baseline.operator,
            countryCode: 'NO',
            importerName: 'Gellatti EU Import SL',
            importerAddress: '1 Import Street, Madrid',
            importerCountryCode: 'ES',
          },
        }),
      ),
    ).toMatchObject({ role: 'importer', ready: true, countryCode: 'ES' });
  });

  it('distinguishes GB, Northern Ireland, Canadian and AU/NZ address jurisdiction', () => {
    expect(responsibleBusinessDetails(createCompleteLabel('UK'))).toMatchObject({
      role: 'importer',
      countryCode: 'GB',
      ready: true,
    });
    expect(
      responsibleBusinessDetails(
        createCompleteLabel('UK', {
          jurisdictionContext: {
            euDestinationCountryCode: 'ES',
            ukRegion: 'NI',
            auNzCountry: 'AU',
            usSaleContext: 'interstate_retail',
          },
        }),
      ),
    ).toMatchObject({ role: 'operator', countryCode: 'ES', ready: true });
    expect(responsibleBusinessDetails(createCompleteLabel('CA'))).toMatchObject({
      role: 'importer',
      countryCode: 'CA',
      ready: true,
    });
    expect(responsibleBusinessDetails(createCompleteLabel('AU_NZ'))).toMatchObject({
      role: 'distributor',
      countryCode: 'AU',
      ready: true,
    });
  });
});
