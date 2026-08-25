import type { MasterLabelData } from './masterLabel';

const EU_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'EL',
  'ES',
  'FI',
  'FR',
  'GR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);
const GB_ADDRESS_CODES = new Set(['GB', 'UK', 'IM', 'JE', 'GG']);
const NI_OR_EU_CODES = new Set(['NI', 'XI', ...EU_CODES]);

export function isEuMemberStateCode(value: string | undefined): boolean {
  return EU_CODES.has(cleanCode(value));
}

export interface ResponsibleBusinessDetails {
  name: string;
  address: string;
  countryCode: string;
  role: 'operator' | 'importer' | 'distributor';
  ready: boolean;
  reason: string;
}

const cleanCode = (value: string | undefined): string => value?.trim().toUpperCase() ?? '';

export function responsibleBusinessDetails(data: MasterLabelData): ResponsibleBusinessDetails {
  const operator = {
    name: data.operator.operatorName.trim(),
    address: data.operator.address.trim(),
    countryCode: cleanCode(data.operator.countryCode),
    role: 'operator' as const,
  };
  const importer = {
    name: data.operator.importerName?.trim() ?? '',
    address: data.operator.importerAddress?.trim() ?? '',
    countryCode: cleanCode(data.operator.importerCountryCode),
    role: 'importer' as const,
  };
  const distributor = {
    name: data.operator.distributorName?.trim() ?? '',
    address: data.operator.distributorAddress?.trim() ?? '',
    countryCode: cleanCode(data.operator.distributorCountryCode),
    role: 'distributor' as const,
  };
  const complete = (candidate: typeof operator | typeof importer | typeof distributor) =>
    Boolean(candidate.name && candidate.address);
  const result = (
    candidate: typeof operator | typeof importer | typeof distributor,
    jurisdictionReady: boolean,
    reason: string,
  ): ResponsibleBusinessDetails => ({
    ...candidate,
    ready: complete(candidate) && jurisdictionReady,
    reason,
  });

  if (data.market === 'EU') {
    if (EU_CODES.has(operator.countryCode)) {
      return result(operator, true, 'EU operator address.');
    }
    return result(
      importer,
      EU_CODES.has(importer.countryCode),
      'A non-EU operator requires the EU importer name, physical address and country.',
    );
  }
  if (data.market === 'UK') {
    const northernIreland = data.jurisdictionContext?.ukRegion === 'NI';
    const accepted = northernIreland ? NI_OR_EU_CODES : GB_ADDRESS_CODES;
    if (accepted.has(operator.countryCode)) {
      return result(
        operator,
        true,
        northernIreland ? 'NI/EU operator address.' : 'UK operator address.',
      );
    }
    return result(
      importer,
      accepted.has(importer.countryCode),
      northernIreland
        ? 'Northern Ireland requires an NI/EU importer name, physical address and country.'
        : 'Great Britain requires a UK/Channel Islands/Isle of Man importer name, physical address and country.',
    );
  }
  if (data.market === 'CA') {
    if (operator.countryCode === 'CA') return result(operator, true, 'Canadian dealer address.');
    return result(
      importer,
      importer.countryCode === 'CA',
      'Imported food requires the Canadian importer/dealer name, physical address and country.',
    );
  }
  if (data.market === 'AU_NZ') {
    if (operator.countryCode === 'AU' || operator.countryCode === 'NZ') {
      return result(operator, true, 'Australia/New Zealand supplier address.');
    }
    return result(
      distributor,
      distributor.countryCode === 'AU' || distributor.countryCode === 'NZ',
      'The label requires an Australia/New Zealand supplier name, business address and country.',
    );
  }
  return result(operator, true, 'Operator/manufacturer/packer/distributor details.');
}
