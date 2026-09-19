/**
 * Canonical boundary between "we can formulate with these facts" and "this is an exact SKU that
 * may be published for every account". Mapper/Engine readiness is deliberately not an input.
 */
export const PRODUCT_PUBLICATION_IDENTITY_VERSION = 'PRODUCT_PUBLICATION_IDENTITY_V1' as const;

export type PublicationIdentitySource =
  | 'user_confirmed'
  | 'label'
  | 'barcode_registry'
  | 'manufacturer'
  | 'retailer'
  | 'web_search'
  | 'catalog_verified'
  | 'mapper_estimate'
  | 'unknown';

export interface PublicationFieldProvenance {
  source: PublicationIdentitySource;
  /** Required for automatic internet/registry identity. Domain reputation alone is not identity. */
  exactGtinMatch: boolean;
  sourceUrl: string | null;
}

export type PublicationIdentityReasonCode =
  | 'DISPLAY_NAME_REQUIRED'
  | 'DISPLAY_NAME_PROVENANCE_REQUIRED'
  | 'EXACT_EAN_PROVENANCE_REQUIRED'
  | 'NAME_EQUALS_BRAND_OR_MANUFACTURER'
  | 'DISTINGUISHING_SKU_IDENTITY_REQUIRED';

export interface ProductPublicationIdentityInput {
  displayName?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  variant?: string | null;
  productType?: string | null;
  fieldProvenance?: Partial<
    Record<
      'displayName' | 'brand' | 'manufacturer' | 'variant' | 'productType',
      PublicationFieldProvenance
    >
  >;
}

export interface ProductPublicationIdentityEligibility {
  version: typeof PRODUCT_PUBLICATION_IDENTITY_VERSION;
  eligible: boolean;
  exactSkuIdentity: boolean;
  normalized: {
    displayName: string;
    brand: string;
    manufacturer: string;
    variant: string;
    productType: string;
  };
  distinguishingTokens: string[];
  reasonCodes: PublicationIdentityReasonCode[];
  fieldProvenance: ProductPublicationIdentityInput['fieldProvenance'];
}

const LEGAL_SUFFIXES = new Set([
  'ab',
  'ag',
  'as',
  'bv',
  'co',
  'company',
  'corp',
  'corporation',
  'gmbh',
  'inc',
  'incorporated',
  'limited',
  'llc',
  'ltd',
  'nv',
  'oy',
  'plc',
  'sa',
  'sl',
  'spa',
]);

/** Words that describe only a broad commodity, never a line/flavour/model by themselves. */
const GENERIC_PRODUCT_WORDS = new Set([
  'beverage',
  'drink',
  'food',
  'ingredient',
  'mineral',
  'napoj',
  'produkt',
  'product',
  'vitamin',
  'vitamins',
  'water',
  'woda',
]);

export function normalizePublicationIdentity(value: unknown): string {
  return typeof value === 'string'
    ? value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('en-US')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
    : '';
}

function withoutLegalSuffix(value: string): string {
  const parts = value.split(' ').filter(Boolean);
  while (parts.length > 0 && LEGAL_SUFFIXES.has(parts.at(-1)!)) parts.pop();
  return parts.join(' ');
}

const internetSource = (source: PublicationIdentitySource): boolean =>
  ['barcode_registry', 'manufacturer', 'retailer', 'web_search'].includes(source);

function trustedIdentityProvenance(value: PublicationFieldProvenance | undefined): boolean {
  if (!value) return false;
  if (value.source === 'user_confirmed' || value.source === 'label') return true;
  if (value.source === 'catalog_verified') return true;
  return internetSource(value.source) && value.exactGtinMatch;
}

export function assessProductPublicationIdentity(
  input: ProductPublicationIdentityInput,
): ProductPublicationIdentityEligibility {
  const normalized = {
    displayName: normalizePublicationIdentity(input.displayName),
    brand: withoutLegalSuffix(normalizePublicationIdentity(input.brand)),
    manufacturer: withoutLegalSuffix(normalizePublicationIdentity(input.manufacturer)),
    variant: normalizePublicationIdentity(input.variant),
    productType: normalizePublicationIdentity(input.productType),
  };
  const reasonCodes: PublicationIdentityReasonCode[] = [];
  if (!normalized.displayName) reasonCodes.push('DISPLAY_NAME_REQUIRED');

  const nameProvenance = input.fieldProvenance?.displayName;
  if (normalized.displayName && !nameProvenance)
    reasonCodes.push('DISPLAY_NAME_PROVENANCE_REQUIRED');
  else if (
    normalized.displayName &&
    nameProvenance &&
    internetSource(nameProvenance.source) &&
    !nameProvenance.exactGtinMatch
  )
    reasonCodes.push('EXACT_EAN_PROVENANCE_REQUIRED');
  else if (normalized.displayName && !trustedIdentityProvenance(nameProvenance))
    reasonCodes.push('DISPLAY_NAME_PROVENANCE_REQUIRED');

  const parties = [normalized.brand, normalized.manufacturer].filter(Boolean);
  const isPartyOnly = parties.some(
    (party) =>
      normalized.displayName === party || withoutLegalSuffix(normalized.displayName) === party,
  );
  if (isPartyOnly) reasonCodes.push('NAME_EQUALS_BRAND_OR_MANUFACTURER');

  const partyTokens = new Set(parties.flatMap((value) => value.split(' ')));
  const distinguishingTokens = normalized.displayName
    .split(' ')
    .filter(Boolean)
    .filter((token) => !partyTokens.has(token))
    .filter((token) => !LEGAL_SUFFIXES.has(token))
    .filter((token) => !GENERIC_PRODUCT_WORDS.has(token));
  if (normalized.displayName && !isPartyOnly && distinguishingTokens.length === 0)
    reasonCodes.push('DISTINGUISHING_SKU_IDENTITY_REQUIRED');

  const exactSkuIdentity =
    normalized.displayName.length > 0 && !isPartyOnly && distinguishingTokens.length > 0;
  return {
    version: PRODUCT_PUBLICATION_IDENTITY_VERSION,
    eligible: exactSkuIdentity && reasonCodes.length === 0,
    exactSkuIdentity,
    normalized,
    distinguishingTokens: [...new Set(distinguishingTokens)],
    reasonCodes,
    fieldProvenance: input.fieldProvenance ?? {},
  };
}

type JsonObject = Record<string, unknown>;
const objectValue = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const pathValue = (root: JsonObject, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => objectValue(value)[key], root);

const TRUSTED_EXACT_EAN_AUTHORITIES = new Set([
  'OFFICIAL_MANUFACTURER',
  'OFFICIAL_BRAND',
  'OFFICIAL_PRIVATE_LABEL',
  'OFFICIAL_TECHNICAL_PDF',
  'STRUCTURED_PRODUCT_DATABASE',
  'AUTHORITATIVE_RETAILER',
]);

function scannedGtins(root: JsonObject): string[] {
  return (Array.isArray(root.barcodes) ? root.barcodes.map(objectValue) : [])
    .map((row) => stringValue(row.value)?.replace(/\D/g, '') ?? '')
    .filter((value) => value.length >= 8);
}

function externalProvenance(
  root: JsonObject,
  fieldPath: string,
): PublicationFieldProvenance | null {
  const gtins = scannedGtins(root);
  for (const row of Array.isArray(root.externalSources)
    ? root.externalSources.map(objectValue)
    : []) {
    const fields = Array.isArray(row.fieldsUsed) ? row.fieldsUsed.map(String) : [];
    if (!fields.includes(fieldPath)) continue;
    const sourceType = String(row.sourceType ?? 'web_search') as PublicationIdentitySource;
    const authority = String(row.sourceAuthorityClass ?? '');
    const sourceUrl = stringValue(row.url);
    const urlDigits = sourceUrl?.replace(/\D/g, '') ?? '';
    const stated = stringValue(row.sourceStatedEan)?.replace(/\D/g, '') ?? '';
    const exactGtinMatch =
      TRUSTED_EXACT_EAN_AUTHORITIES.has(authority) &&
      gtins.some((gtin) => urlDigits.includes(gtin) || stated === gtin);
    return { source: sourceType, exactGtinMatch, sourceUrl };
  }
  return null;
}

function directLabelProvenance(
  root: JsonObject,
  fieldPath: string,
): PublicationFieldProvenance | null {
  const found = (Array.isArray(root.evidence) ? root.evidence.map(objectValue) : []).find(
    (row) =>
      row.field === fieldPath &&
      row.source === 'label' &&
      (row.directVisibility === true || row.directVisibility === undefined),
  );
  return found ? { source: 'label', exactGtinMatch: true, sourceUrl: null } : null;
}

function legacyProfileProvenance(
  root: JsonObject,
  evidenceField: string,
): PublicationFieldProvenance | null {
  const raw = pathValue(
    root,
    `productIntelligence.productProfileAuthority.evidence.fields.${evidenceField}`,
  );
  const source = stringValue(raw) as PublicationIdentitySource | null;
  if (!source) return null;
  return {
    source,
    exactGtinMatch: source === 'label' || source === 'user_confirmed',
    sourceUrl: null,
  };
}

const PUBLICATION_IDENTITY_SOURCES = new Set<PublicationIdentitySource>([
  'user_confirmed',
  'label',
  'barcode_registry',
  'manufacturer',
  'retailer',
  'web_search',
  'catalog_verified',
  'mapper_estimate',
  'unknown',
]);

function storedContractProvenance(
  contract: JsonObject,
): ProductPublicationIdentityInput['fieldProvenance'] {
  const rawFields = objectValue(contract.fieldProvenance);
  const fields: NonNullable<ProductPublicationIdentityInput['fieldProvenance']> = {};
  for (const field of ['displayName', 'brand', 'manufacturer', 'variant', 'productType'] as const) {
    const raw = objectValue(rawFields[field]);
    const source = stringValue(raw.source) as PublicationIdentitySource | null;
    if (!source || !PUBLICATION_IDENTITY_SOURCES.has(source)) continue;
    fields[field] = {
      source,
      exactGtinMatch: raw.exactGtinMatch === true,
      sourceUrl: stringValue(raw.sourceUrl),
    };
  }
  return fields;
}

function publicationIdentityInputFromRoot(
  root: JsonObject,
  fieldProvenance: ProductPublicationIdentityInput['fieldProvenance'],
): ProductPublicationIdentityInput {
  const identity = objectValue(root.identity);
  return {
    displayName:
      stringValue(identity.displayName) ??
      stringValue(identity.originalName) ??
      stringValue(root.displayName) ??
      stringValue(root.originalName),
    brand: stringValue(identity.brand) ?? stringValue(root.brand),
    manufacturer: stringValue(root.manufacturer),
    variant: stringValue(identity.variant) ?? stringValue(root.variant),
    productType:
      stringValue(identity.category) ?? stringValue(root.productType) ?? stringValue(root.category),
    fieldProvenance,
  };
}

/** Derive publication provenance from the server-owned scan result, never from Mapper output. */
export function publicationIdentityEligibilityFromScanResult(
  value: unknown,
  userConfirmedFields: readonly string[] = [],
): ProductPublicationIdentityEligibility {
  const root = objectValue(value);
  const identity = objectValue(root.identity);
  const userConfirmed = new Set(userConfirmedFields);
  const provenanceFor = (
    path: string,
    evidenceField: string,
  ): PublicationFieldProvenance | undefined => {
    if (userConfirmed.has(evidenceField))
      return { source: 'user_confirmed', exactGtinMatch: true, sourceUrl: null };
    return (
      directLabelProvenance(root, path) ??
      externalProvenance(root, path) ??
      legacyProfileProvenance(root, evidenceField) ??
      undefined
    );
  };
  return assessProductPublicationIdentity({
    displayName: stringValue(identity.displayName) ?? stringValue(identity.originalName),
    brand: stringValue(identity.brand),
    manufacturer: stringValue(root.manufacturer),
    variant: stringValue(identity.variant),
    productType: stringValue(identity.category),
    fieldProvenance: {
      displayName: provenanceFor('identity.displayName', 'identity'),
      brand: provenanceFor('identity.brand', 'brand'),
      manufacturer: provenanceFor('manufacturer', 'manufacturer'),
      variant: provenanceFor('identity.variant', 'variant'),
      productType: provenanceFor('identity.category', 'productType'),
    },
  });
}

/**
 * Compatibility boundary for immutable catalogue versions created before this contract existed.
 * They cannot be required to carry a field that did not exist, but they still must pass the same
 * distinguishing-name quality check. Every newly finalized scan carries publicationEligibility
 * and therefore takes the strict, versioned stored-contract path below.
 */
export function publicationIdentityEligibilityFromStoredProductFacts(
  value: unknown,
): ProductPublicationIdentityEligibility {
  const root = objectValue(value);
  const contract = objectValue(root.publicationEligibility);
  if (Object.keys(contract).length > 0) {
    const provenance =
      contract.version === PRODUCT_PUBLICATION_IDENTITY_VERSION && contract.eligible === true
        ? storedContractProvenance(contract)
        : {};
    return assessProductPublicationIdentity(publicationIdentityInputFromRoot(root, provenance));
  }
  const legacyCatalogue: PublicationFieldProvenance = {
    source: 'catalog_verified',
    exactGtinMatch: true,
    sourceUrl: null,
  };
  return assessProductPublicationIdentity(
    publicationIdentityInputFromRoot(root, { displayName: legacyCatalogue }),
  );
}
