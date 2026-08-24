import {
  buildMapperKnowledge,
  findProfileMatch,
  fingerprintMapperRows,
  profileDonor,
  PROFILE_MATCH_FLOOR,
  type MapperKnowledgeRow,
  type ProfileMatchBasis,
  type ProfileMatchInput,
} from '../../../src/features/product-intelligence/mapperValueInference.ts';

export const INTIMPORT_WHOLE_PROFILE_AUTHORITY = 'INTIMPORT_WHOLE_PROFILE_MATCH' as const;

export interface IntimportMapperAuthorityRow extends MapperKnowledgeRow {
  approved_for_base: boolean;
  approved_for_engines: boolean;
  verification_status: string;
}

export interface IntimportWholeProfileAuthority {
  authority: typeof INTIMPORT_WHOLE_PROFILE_AUTHORITY;
  validationMode: 'server_recomputed_whole_profile';
  mapperIngredientId: string;
  confidence: number;
  profileBasis: Exclude<ProfileMatchBasis, 'none'>;
  hardContradiction: false;
  rejected: null;
  mapperFingerprint: string;
  selectionFingerprint: string;
}

export interface IntimportWholeProfileProposalInput {
  proposedMapperIngredientId: string;
  matchInput: ProfileMatchInput;
  rows: readonly IntimportMapperAuthorityRow[];
}

/** The immutable Mapper vocabulary is prefix-governed, not case-exact. */
export function isBindableIntimportMapperTarget(row: IntimportMapperAuthorityRow): boolean {
  return (
    row.is_active !== false &&
    row.approved_for_base === true &&
    row.approved_for_engines === true &&
    row.verification_status.trim().toLowerCase().startsWith('verified')
  );
}

/**
 * Recompute the frozen whole-profile decision from public import facts.
 *
 * The proposal contains only an ID. Its confidence, contradiction verdict and
 * selected donor all come from this calculation, so a browser cannot promote a
 * random target by attaching READY/confidence flags to the request.
 */
export function validateIntimportWholeProfileProposal(
  input: IntimportWholeProfileProposalInput,
): IntimportWholeProfileAuthority | null {
  const proposedId = input.proposedMapperIngredientId.trim();
  if (!proposedId) return null;

  const mapperFingerprint = fingerprintMapperRows(input.rows);
  const knowledge = buildMapperKnowledge(input.rows, mapperFingerprint);
  const match = findProfileMatch(input.matchInput, knowledge);
  if (
    match.confidence < PROFILE_MATCH_FLOOR ||
    match.rejected !== null ||
    match.basis === 'none'
  ) {
    return null;
  }

  const selected = profileDonor(match);
  if (!selected || selected.ingredient_id !== proposedId) return null;
  const target = input.rows.find((row) => row.ingredient_id === selected.ingredient_id);
  if (!target || !isBindableIntimportMapperTarget(target)) return null;

  return {
    authority: INTIMPORT_WHOLE_PROFILE_AUTHORITY,
    validationMode: 'server_recomputed_whole_profile',
    mapperIngredientId: selected.ingredient_id,
    confidence: match.confidence,
    profileBasis: match.basis,
    hardContradiction: false,
    rejected: null,
    mapperFingerprint,
    selectionFingerprint: [
      mapperFingerprint,
      selected.ingredient_id,
      match.basis,
      match.confidence.toFixed(4),
    ].join(':'),
  };
}
