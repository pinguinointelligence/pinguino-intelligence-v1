/**
 * Scanner Rescue/AI handoff. This module does not calculate product physics. It only names which
 * unresolved product facts can be researched and builds the cumulative, read-only evidence packet
 * a targeted research pass receives after deterministic derivation + Mapper Rescue.
 */

type JsonObject = Record<string, unknown>;

const objectValue = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const stringValue = (value: unknown, limit = 2000): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
const finiteValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const scalarValue = (value: unknown, limit = 2000): string | number | boolean | null => {
  const string = stringValue(value, limit);
  if (string !== null) return string;
  const number = finiteValue(value);
  if (number !== null) return number;
  return typeof value === 'boolean' ? value : null;
};

const pickScalars = (value: unknown, keys: readonly string[], stringLimit = 2000): JsonObject => {
  const source = objectValue(value);
  const output: JsonObject = {};
  for (const key of keys) {
    const picked = scalarValue(source[key], stringLimit);
    if (picked !== null) output[key] = picked;
  }
  return output;
};

const pickStringArray = (value: unknown, limit = 40): string[] =>
  Array.isArray(value)
    ? unique(
        value
          .flatMap((entry) => {
            const picked = stringValue(entry, 500);
            return picked ? [picked] : [];
          })
          .slice(0, limit),
      )
    : [];

const sanitizeTechnicalTruth = (value: unknown): JsonObject => {
  const output: JsonObject = {};
  for (const [field, raw] of Object.entries(objectValue(value)).slice(0, 60)) {
    if (!/^[a-z0-9_.-]{1,80}$/i.test(field)) continue;
    const truth = pickScalars(raw, ['value', 'state', 'basis', 'confidence'], 300);
    if (typeof truth.value === 'number') output[field] = truth;
  }
  return output;
};

const sanitizeScanResult = (value: unknown): JsonObject => {
  const source = objectValue(value);
  const identity = pickScalars(
    source.identity,
    [
      'displayName',
      'originalName',
      'brand',
      'variant',
      'category',
      'countryOfOrigin',
      'explicitlyUnbranded',
    ],
    500,
  );
  const packageValue = pickScalars(source.package, ['netQuantity', 'unit', 'netQuantityText'], 200);
  const nutrition = pickScalars(
    source.nutrition,
    [
      'basis',
      'energyKj',
      'energyKcal',
      'fat',
      'saturatedFat',
      'carbohydrate',
      'sugars',
      'protein',
      'salt',
      'fibre',
    ],
    100,
  );
  const productionDeclarations = pickScalars(
    source.productionDeclarations,
    [
      'alcoholAbv',
      'cocoaButterPercent',
      'cocoaSolidsPercent',
      'fruitContentPercent',
      'brix',
      'waterPercent',
      'totalSolidsPercent',
      'concentrationText',
      'dosageText',
      'technicalParametersText',
      'formDeclaration',
    ],
    5000,
  );
  const barcodes = Array.isArray(source.barcodes)
    ? source.barcodes
        .slice(0, 4)
        .map((entry) => pickScalars(entry, ['value', 'format'], 40))
        .filter((entry) => Object.keys(entry).length > 0)
    : [];
  const externalSources = Array.isArray(source.externalSources)
    ? source.externalSources
        .slice(0, 24)
        .map((entry) => {
          const row = objectValue(entry);
          const clean = pickScalars(
            row,
            [
              'sourceType',
              'url',
              'title',
              'sourceAuthorityClass',
              'sourceStatedEan',
              'sourceEanConfirmationMethod',
              'sourceEanConfirmedAt',
              'evidenceSource',
              'retrievedAt',
            ],
            2000,
          );
          const fieldsUsed = pickStringArray(row.fieldsUsed, 40);
          if (fieldsUsed.length > 0) clean.fieldsUsed = fieldsUsed;
          return clean;
        })
        .filter((entry) => Object.keys(entry).length > 0)
    : [];
  const output: JsonObject = {};
  if (Object.keys(identity).length > 0) output.identity = identity;
  if (Object.keys(packageValue).length > 0) output.package = packageValue;
  if (barcodes.length > 0) output.barcodes = barcodes;
  if (Object.keys(nutrition).length > 0) output.nutrition = nutrition;
  if (Object.keys(productionDeclarations).length > 0)
    output.productionDeclarations = productionDeclarations;
  for (const key of [
    'ingredientsText',
    'allergensText',
    'mayContainAllergens',
    'storageInstructions',
    'manufacturer',
  ]) {
    const picked = scalarValue(source[key], key === 'ingredientsText' ? 20_000 : 5000);
    if (picked !== null) output[key] = picked;
  }
  const claims = pickStringArray(source.claims, 30);
  if (claims.length > 0) output.claims = claims;
  if (externalSources.length > 0) output.externalSources = externalSources;
  return output;
};

const sanitizePhotoEvidence = (value: unknown): JsonObject[] =>
  Array.isArray(value)
    ? value
        .slice(0, 24)
        .map((entry) =>
          pickScalars(
            entry,
            ['field', 'value', 'rawText', 'source', 'confidence', 'pageIndex'],
            2000,
          ),
        )
        .filter((entry) => entry.source === 'label' && Object.keys(entry).length > 1)
    : [];

const sanitizeRecognition = (value: unknown): JsonObject => {
  const source = objectValue(value);
  const output = pickScalars(
    source,
    [
      'authority',
      'classificationSource',
      'status',
      'evidenceFingerprint',
      'confidence',
      'modelRequired',
      'ingredientFamily',
      'ingredientSubfamily',
      'physicalForm',
      'productArchetype',
      'intendedUsageRole',
      'searchConcept',
      'technicalProduct',
      'dosageDependent',
      'gellattiApplication',
    ],
    1000,
  );
  for (const key of [
    'compatibleMapperCategories',
    'evidenceRefs',
    'reasonCodes',
    'modelReasonCodes',
  ]) {
    const picked = pickStringArray(source[key], 40);
    if (picked.length > 0) output[key] = picked;
  }
  return output;
};

const sanitizeConflicts = (value: unknown): JsonObject[] =>
  Array.isArray(value)
    ? value
        .slice(0, 24)
        .map((entry) =>
          pickScalars(
            entry,
            [
              'field',
              'kind',
              'reason',
              'retainedValue',
              'incomingValue',
              'retainedSource',
              'incomingSource',
              'resolution',
            ],
            2000,
          ),
        )
        .filter((entry) => Object.keys(entry).length > 0)
    : [];

/**
 * Provider-boundary privacy allowlist. Calling this twice is intentional: the finalizer minimizes
 * the packet and intimport-enrich independently refuses any private or unexpected key before the
 * OpenAI request is built.
 */
export function sanitizeAccumulatedScannerEvidence(value: unknown): JsonObject {
  const source = objectValue(value);
  const scanResult = sanitizeScanResult(source.scanResult);
  const photoEvidence = sanitizePhotoEvidence(source.photoEvidence);
  const recognition = sanitizeRecognition(source.recognition);
  const knownTechnicalFacts = sanitizeTechnicalTruth(source.knownTechnicalFacts);
  const rescueEstimates = sanitizeTechnicalTruth(source.rescueEstimates);
  const unresolvedFields = pickStringArray(source.unresolvedFields, 60);
  const conflicts = sanitizeConflicts(source.conflicts);
  const readiness = objectValue(source.readinessContext);
  const readinessContext = pickScalars(
    readiness,
    ['ready', 'engineUsable', 'roleReadiness', 'productAccuracy'],
    300,
  );
  for (const key of ['criticalBlockers', 'reasonCodes', 'missingCriticalFields']) {
    const picked = pickStringArray(readiness[key], 60);
    if (picked.length > 0) readinessContext[key] = picked;
  }
  return {
    scanResult,
    photoEvidence,
    recognition,
    knownTechnicalFacts,
    rescueEstimates,
    unresolvedFields,
    conflicts,
    readinessContext,
  };
}

export function researchFieldsForScannerGaps(gaps: readonly string[]): string[] {
  const fields: string[] = [];
  for (const raw of gaps) {
    const gap = raw.toLowerCase();
    if (/water_percent/.test(gap)) fields.push('waterPercent');
    if (/total_solids_percent/.test(gap)) fields.push('totalSolidsPercent');
    if (/sweeten|freez|(^|_)pod(_|$)|(^|_)pac(_|$)|sugar_(split|spectrum)/.test(gap))
      fields.push('technicalParameters');
  }
  return unique(fields);
}

export function buildAccumulatedScannerEvidence(input: {
  scanResult: unknown;
  recognition: unknown;
  fieldTruth: unknown;
  unresolvedFields: readonly string[];
  readinessContext?: unknown;
}): JsonObject {
  const result = objectValue(input.scanResult);
  const evidence = Array.isArray(result.evidence) ? result.evidence.map(objectValue) : [];
  const conflicts = Array.isArray(result.conflicts) ? result.conflicts.map(objectValue) : [];
  const knownTechnicalFacts: JsonObject = {};
  const rescueEstimates: JsonObject = {};
  for (const [field, raw] of Object.entries(objectValue(input.fieldTruth))) {
    const truth = objectValue(raw);
    if (typeof truth.value !== 'number' || !Number.isFinite(truth.value)) continue;
    const state = String(truth.state ?? '');
    const basis = String(truth.basis ?? '');
    const target =
      state === 'ESTIMATED' || /mapper.*(rescue|profile)|rescue.*estimate/i.test(basis)
        ? rescueEstimates
        : knownTechnicalFacts;
    target[field] = {
      value: truth.value,
      state: truth.state ?? null,
      basis: truth.basis ?? null,
      confidence: typeof truth.confidence === 'number' ? truth.confidence : null,
    };
  }
  return sanitizeAccumulatedScannerEvidence({
    scanResult: result,
    photoEvidence: evidence
      .filter((row) => row.source === 'label')
      .slice(0, 100)
      .map((row) => structuredClone(row)),
    recognition: structuredClone(objectValue(input.recognition)),
    knownTechnicalFacts,
    rescueEstimates,
    unresolvedFields: unique(input.unresolvedFields.filter((value) => value.trim()).slice(0, 100)),
    conflicts: conflicts.slice(0, 100).map((row) => structuredClone(row)),
    readinessContext: input.readinessContext,
  });
}
