/**
 * Shape of the FINAL concept-default export (SA-03 ANY-scope default map + SA-04
 * recipe-scope map), generated verbatim from the certified SEARCH_CONCEPTS workbook
 * by scripts/buildMapperSearchRuntimeRelease.mjs.
 *
 * A decision names Mapper identities for a recognised CONCEPT. It is consumed only
 * at the later selection stage (HOME_ADD): aliases and the parser still never
 * produce a PI identity (`SearchMention.piId` stays `null`).
 */
export type MapperConceptScope = 'GELATO' | 'SORBET' | 'VEGAN';

export type MapperConceptScopePolicy =
  | 'INHERIT_ANY_FINAL'
  | 'USE_ALTERNATIVE_FINAL'
  | 'NO_CURRENT_CANDIDATE_FINAL';

export interface MapperConceptScopeRule {
  readonly policy: MapperConceptScopePolicy;
  readonly suggestedPiId: string | null;
  readonly eligiblePiIds: readonly string[];
}

export interface MapperConceptDefaultDecision {
  readonly queueId: string;
  readonly conceptId: string;
  readonly conceptKey: string;
  readonly selectionMode: string;
  readonly defaultStatus: 'RANKED' | 'AUTO_CONFIRMED_SINGLE';
  readonly defaultPiId: string;
  /** Owner-ranked order after the default; never re-ranked at runtime. */
  readonly alternativePiIds: readonly string[];
  readonly scopes: Readonly<Record<MapperConceptScope, MapperConceptScopeRule>>;
}

export interface MapperConceptDefaultsData {
  readonly authority: string;
  readonly searchReleaseId: string;
  readonly source: {
    readonly fileName: string;
    readonly sha256: string;
    readonly sheets: readonly string[];
  };
  readonly counts: {
    readonly defaults: number;
    readonly ranked: number;
    readonly autoConfirmedSingle: number;
  };
  readonly defaults: readonly MapperConceptDefaultDecision[];
}
