/**
 * Owner-approved links used ONLY to FIND existing recipes made with another form of a
 * concept („truskawkowe” finding a recipe built on a branded strawberry puree).
 *
 * The shape deliberately cannot express a default: there is no rank, no eligibility flag
 * and no recipe scope. Product SELECTION keeps reading the frozen SA-03/SA-04 order in
 * `conceptDefaults`, which these links never touch.
 */
export interface MapperConceptDiscoveryLink {
  readonly linkId: string;
  readonly conceptId: string;
  readonly conceptKey: string;
  readonly piId: string;
  readonly form: string;
  readonly note: string;
}

export interface MapperConceptDiscoveryData {
  readonly authority: 'HOME_CONCEPT_DISCOVERY_LINKS_OWNER_APPROVED_V1';
  readonly usage: 'RECIPE_DISCOVERY_ONLY';
  readonly approvedOn: string;
  readonly approvedBy: string;
  readonly searchReleaseId: string;
  readonly source: { readonly fileName: string; readonly sha256: string };
  readonly counts: { readonly links: number; readonly concepts: number };
  readonly links: readonly MapperConceptDiscoveryLink[];
}
