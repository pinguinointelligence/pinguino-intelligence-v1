export const TEXTIMPORT_EAN_RESOLVER_VERSION = 'gellatti_textimport_ean_resolver_v1' as const;

export type TextImportEanAuthority =
  | 'OFFICIAL_MANUFACTURER'
  | 'OFFICIAL_BRAND'
  | 'OFFICIAL_TECHNICAL_PDF'
  | 'OFFICIAL_PRIVATE_LABEL'
  | 'AUTHORITATIVE_RETAILER'
  | 'STRUCTURED_PRODUCT_DATABASE';

export interface TextImportEanResolverQuery {
  resolverVersion: typeof TEXTIMPORT_EAN_RESOLVER_VERSION;
  sourceRowId: string | null;
  identity: {
    exactProductName: string;
    brand: string | null;
    manufacturer: string | null;
    variant: string | null;
    packageText: string | null;
  };
  source: {
    url: string;
    title: string | null;
  } | null;
}

export interface TextImportEanResearchStep {
  kind: 'RETAILER_SEARCH' | 'OPEN_WEB_SEARCH';
  url: string | null;
  allowedDomains: string[];
}

export interface TextImportEanProviderFact {
  field: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceAuthorityClass: string;
  retrievedAt: string;
  researchStep: TextImportEanResearchStep;
}

export interface TextImportEanEvidence {
  exactValue: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceAuthorityClass: TextImportEanAuthority;
  retrievedAt: string;
  researchStep: TextImportEanResearchStep;
}

export interface TextImportEanCandidate {
  ean: string;
  evidence: TextImportEanEvidence[];
}

export interface TextImportEanCheckedSource {
  url: string;
  title: string | null;
  researchStep: TextImportEanResearchStep;
}

export interface TextImportEanChecksumCheck {
  input: string;
  normalized: string | null;
  valid: boolean;
}

export interface TextImportEanResearchTrace {
  budget: {
    rowWebCallCap: number;
    runWebCallCap: number;
    worstCaseWebCallsPerRequest: number;
    rowWebCallsReserved: number;
    runWebCallsReserved: number;
  };
  providerRequestsUsed: number;
  webCallsUsed: number;
  completedSteps: TextImportEanResearchStep[];
  sourcesChecked: TextImportEanCheckedSource[];
  exactEvidence: TextImportEanProviderFact[];
  checksumChecks: TextImportEanChecksumCheck[];
}

export type TextImportEanResolverResult =
  | {
      status: 'EAN_RESOLVED';
      query: TextImportEanResolverQuery;
      ean: string;
      evidence: TextImportEanEvidence[];
      identityMatchExplanation: string;
      research: TextImportEanResearchTrace;
    }
  | {
      status: 'EAN_CONFLICT';
      query: TextImportEanResolverQuery;
      candidates: TextImportEanCandidate[];
      reason: string;
      research: TextImportEanResearchTrace;
    }
  | {
      status: 'EAN_NOT_FOUND';
      query: TextImportEanResolverQuery;
      reason: string;
      searchedSteps: TextImportEanResearchStep[];
      research: TextImportEanResearchTrace;
    }
  | {
      status: 'EAN_RESOLUTION_BLOCKED';
      query: TextImportEanResolverQuery;
      reason: string;
      blockedStep: TextImportEanResearchStep | null;
      research: TextImportEanResearchTrace;
    };

const ACCEPTED_AUTHORITY = new Set<TextImportEanAuthority>([
  'OFFICIAL_MANUFACTURER',
  'OFFICIAL_BRAND',
  'OFFICIAL_TECHNICAL_PDF',
  'OFFICIAL_PRIVATE_LABEL',
  'AUTHORITATIVE_RETAILER',
  'STRUCTURED_PRODUCT_DATABASE',
]);

const httpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const identityExplanation = (query: TextImportEanResolverQuery): string => {
  const parts = [
    `exact product name ${JSON.stringify(query.identity.exactProductName)}`,
    query.identity.brand ? `brand ${JSON.stringify(query.identity.brand)}` : null,
    query.identity.manufacturer
      ? `manufacturer ${JSON.stringify(query.identity.manufacturer)}`
      : null,
    query.identity.variant ? `variant ${JSON.stringify(query.identity.variant)}` : null,
    query.identity.packageText ? `package ${JSON.stringify(query.identity.packageText)}` : null,
  ].filter((part): part is string => part !== null);
  return `Authoritative source evidence was returned for the resolver's exact identity query: ${parts.join(', ')}.`;
};

/**
 * Classifies only provider facts about EAN/GTIN. The caller supplies the frozen
 * Scanner checksum validator so this boundary never grows a second checksum rule.
 */
export function classifyTextImportEanFacts(
  query: TextImportEanResolverQuery,
  facts: readonly TextImportEanProviderFact[],
  normalizeValidatedEan: (value: unknown) => string | null,
  research: TextImportEanResearchTrace,
  notFoundReason = 'No checksum-valid EAN was found in authoritative exact-product evidence.',
): TextImportEanResolverResult {
  const byEan = new Map<string, TextImportEanEvidence[]>();
  for (const fact of facts) {
    if (fact.field !== 'barcode' || !httpsUrl(fact.sourceUrl)) continue;
    if (!ACCEPTED_AUTHORITY.has(fact.sourceAuthorityClass as TextImportEanAuthority)) continue;
    const ean = normalizeValidatedEan(fact.value);
    if (!ean) continue;
    const evidence: TextImportEanEvidence = {
      exactValue: fact.value,
      sourceUrl: fact.sourceUrl,
      sourceTitle: fact.sourceTitle,
      sourceAuthorityClass: fact.sourceAuthorityClass as TextImportEanAuthority,
      retrievedAt: fact.retrievedAt,
      researchStep: fact.researchStep,
    };
    const existing = byEan.get(ean) ?? [];
    if (!existing.some((item) => item.sourceUrl === evidence.sourceUrl)) existing.push(evidence);
    byEan.set(ean, existing);
  }

  const candidates = [...byEan.entries()]
    .map(([ean, evidence]) => ({ ean, evidence }))
    .sort((left, right) => left.ean.localeCompare(right.ean));
  if (candidates.length === 1) {
    return {
      status: 'EAN_RESOLVED',
      query,
      ean: candidates[0]!.ean,
      evidence: candidates[0]!.evidence,
      identityMatchExplanation: identityExplanation(query),
      research,
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'EAN_CONFLICT',
      query,
      candidates,
      reason:
        'Multiple checksum-valid EANs have authoritative evidence for the exact identity query; automatic selection is forbidden.',
      research,
    };
  }
  return {
    status: 'EAN_NOT_FOUND',
    query,
    reason: notFoundReason,
    searchedSteps: [...research.completedSteps],
    research,
  };
}
