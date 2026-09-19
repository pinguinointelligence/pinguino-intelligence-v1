import type { ExternalEvidenceOutcome } from './externalEvidenceOutcome';

/** The existing GTIN_LOOKUP provider contract, shared by runtime validation and focused tests. */
export const INTIMPORT_ENRICHMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sources', 'facts', 'notFound'],
  properties: {
    sources: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'title', 'kind'],
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['manufacturer', 'brand', 'technical_pdf', 'retailer', 'database', 'other'],
          },
        },
      },
    },
    facts: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value', 'sourceUrl', 'sourceStatedEan'],
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
          sourceUrl: { type: 'string' },
          sourceStatedEan: { type: 'string' },
        },
      },
    },
    notFound: { type: 'array', maxItems: 24, items: { type: 'string' } },
  },
} as const;

export interface IntimportEnrichmentVerdict {
  outcome: Extract<ExternalEvidenceOutcome, 'FOUND' | 'NOT_FOUND' | 'MALFORMED'>;
  reasonCode: string;
  completeness: 'COMPLETE' | 'PARTIAL' | 'NONE';
}

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Semantic checks that JSON Schema cannot express: useful facts or explicit requested absence. */
export function classifyIntimportEnrichment(
  value: unknown,
  requestedFields: readonly string[],
): IntimportEnrichmentVerdict {
  const root = objectValue(value);
  const facts = Array.isArray(root.facts) ? root.facts.map(objectValue) : [];
  const notFound = Array.isArray(root.notFound)
    ? root.notFound.filter((field): field is string => typeof field === 'string')
    : [];
  const requested = new Set(requestedFields);
  const invalidFact = facts.some(
    (fact) =>
      typeof fact.field !== 'string' ||
      !requested.has(fact.field) ||
      typeof fact.value !== 'string' ||
      fact.value.trim() === '' ||
      typeof fact.sourceUrl !== 'string' ||
      !/^https:\/\//i.test(fact.sourceUrl),
  );
  const invalidNotFound = notFound.some((field) => !requested.has(field));
  if (requested.size === 0 || invalidFact || invalidNotFound) {
    return {
      outcome: 'MALFORMED',
      reasonCode: 'enrichment_contract_mismatch',
      completeness: 'NONE',
    };
  }
  if (facts.length > 0) {
    return {
      outcome: 'FOUND',
      reasonCode: notFound.length > 0 ? 'enrichment_partial_facts' : 'enrichment_facts_found',
      completeness: notFound.length > 0 ? 'PARTIAL' : 'COMPLETE',
    };
  }
  if (requestedFields.every((field) => notFound.includes(field))) {
    return {
      outcome: 'NOT_FOUND',
      reasonCode: 'enrichment_explicit_not_found',
      completeness: 'COMPLETE',
    };
  }
  return {
    outcome: 'MALFORMED',
    reasonCode: 'enrichment_empty_outcome',
    completeness: 'NONE',
  };
}
