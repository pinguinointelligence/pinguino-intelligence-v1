export type MapperSearchChannel = 'SEARCH' | 'ROLE' | 'TECHNICAL';

export interface SourceSpan {
  start: number;
  end: number;
}

export interface SearchAliasRecord {
  id: string;
  locale: string;
  market: string;
  raw: string;
  normalized: string;
  fallback: string;
  aliasType: string;
  targetType: string;
  targetId: string;
  targetKey: string;
  matchPolicy: string;
  priority: number;
  morphologyMode: string;
  hyphenPolicy: string;
  autoAddAllowed: boolean;
  ambiguityGroup: string;
  collisionPolicy: string;
  fallbackPolicy: string;
  overrideTargetId: string;
  overrideTargetKey: string;
  releaseSequence: number;
}

export interface RoleAliasRecord {
  id: string;
  locale: string;
  market: string;
  raw: string;
  normalized: string;
  fallback: string;
  aliasClass: string;
  semanticLevel: string;
  roleId: string;
  roleKey: string;
  roleSubtypeId: string;
  roleSubtypeKey: string;
  defaultParentRoleId: string;
  defaultParentRoleKey: string;
  allowedParentRoleIds: string[];
  attachmentMode: string;
  attachmentDirection: string;
  matchPolicy: string;
  priority: number;
  tokenBoundaryPolicy: string;
  hyphenPolicy: string;
  standaloneBehavior: string;
  ambiguityGroup: string;
  collisionPolicy: string;
  fallbackPolicy: string;
  protectedPhrase: boolean;
}

export interface TechnicalAliasRecord {
  id: string;
  raw: string;
  canonical: string;
  normalized: string;
  acceptedSurfaces: string[];
  namespace: string;
  referenceType: string;
  targetConceptId: string;
  targetKey: string;
  candidatePiIds: string[];
  semanticPrecision: string;
  automaticConceptResolutionAllowed: boolean;
  automaticPiResolutionAllowed: boolean;
  autoAddAllowed: boolean;
  exactQualifierRequired: string;
  gradeOrFormRule: string;
  matchPolicy: string;
  tokenBoundaryPolicy: string;
  punctuationNormalization: string;
  casePolicy: string;
  locale: string;
  market: string;
  priority: number;
  collisionPolicy: string;
  fallbackPolicy: string;
  verificationStatus: string;
}

export interface LocaleContract {
  locale_variant: string;
  script: string;
  direction: string;
  markets: string;
  productive_stemming_allowed: string;
  compound_strategy: string;
  fallback_policy_final: string;
  transliteration_policy: string;
  unresolved_fragment_policy: string;
  [key: string]: unknown;
}

export interface MapperDataContract {
  suite: 'C4' | 'C5' | 'C8';
  testId: string;
  sourceWorkbook: string;
  sourceSha256: string;
  sourceSheet: string;
  contractId: string;
  evidence: Record<string, unknown>;
}

export interface MapperReleaseData {
  schemaVersion: number;
  releaseId: string;
  counts: {
    mapper: number;
    mapperColumns: number;
    searchAliases: number;
    roleAliases: number;
    technicalAliases: number;
    concepts: number;
    localeContracts: number;
    markets: number;
    dataContracts: number;
  };
  searchAliases: SearchAliasRecord[];
  roleAliases: RoleAliasRecord[];
  technicalAliases: TechnicalAliasRecord[];
  localeContracts: LocaleContract[];
  dataContracts: MapperDataContract[];
  precedence: Array<{ rule_id: string; priority: string; rule_key: string }>;
  mapperRows: Array<{ id: string }>;
  marketRoutes: Array<Record<string, string>>;
  [key: string]: unknown;
}

export interface SearchMention {
  channel: 'SEARCH';
  aliasId: string;
  targetType: string;
  targetId: string;
  targetKey: string;
  specializationId: string | null;
  specializationKey: string | null;
  autoAddAllowed: boolean;
  sourceText: string;
  normalizedText: string;
  span: SourceSpan;
  rule: string;
  /** Parse stage never selects a PI. Kept explicit for contract guards. */
  piId: null;
}

export interface TechnicalMention {
  channel: 'TECHNICAL';
  aliasId: string;
  targetConceptId: string | null;
  targetKey: string | null;
  canonicalCode: string;
  gradeHint: string | null;
  action: 'RESOLVED_CONCEPT' | 'AMBIGUITY_GATE';
  autoAddAllowed: false;
  sourceText: string;
  normalizedText: string;
  span: SourceSpan;
  rule: string;
  piId: null;
}

export interface RoleMention {
  channel: 'ROLE';
  aliasId: string;
  roleId: string;
  roleKey: string;
  roleSubtypeId: string | null;
  roleSubtypeKey: string | null;
  negated: boolean;
  attachedSearchMention: number | null;
  attachment: string;
  sourceText: string;
  normalizedText: string;
  span: SourceSpan;
  rule: string;
  piId: null;
}

export interface SearchGap {
  sourceText: string;
  normalizedText: string;
  span: SourceSpan;
  reason: 'UNMATCHED' | 'AMBIGUOUS_FALLBACK' | 'AMBIGUOUS_TECHNICAL_CODE';
}

export interface MapperSearchTraceEntry {
  step: number;
  ruleId: string;
  channel: MapperSearchChannel | 'PIPELINE';
  action: string;
  aliasId: string | null;
  span: SourceSpan | null;
}

export interface MapperSearchResolution {
  releaseId: string;
  input: string;
  localeVariant: string;
  marketScope: string;
  recipeType: string | null;
  attributes: string[];
  searchMentions: SearchMention[];
  technicalMentions: TechnicalMention[];
  roleMentions: RoleMention[];
  searchGaps: SearchGap[];
  trace: MapperSearchTraceEntry[];
  downstream: {
    conceptKeys: string[];
    exactProductKeys: string[];
    /** Invariant: aliases never produce a direct PI identifier. */
    piIds: readonly [];
  };
}

export interface ResolveMapperSearchOptions {
  localeVariant?: string;
  marketScope?: string;
  telemetry?: SearchGapsTelemetry;
}

export interface SearchGapsTelemetry {
  record(input: {
    releaseId: string;
    localeVariant: string;
    marketScope: string;
    gaps: readonly SearchGap[];
  }): void;
}
