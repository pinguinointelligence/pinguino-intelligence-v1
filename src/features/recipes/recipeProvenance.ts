/**
 * Where a working recipe came from.
 *
 * Carried INSIDE the recipe input as a sidecar (`gellatti_provenance_v1`, beside
 * `pinguino_label_draft_v1`), so the first save, every later version and every reopen keep
 * it without a schema change.
 *
 * It records the source; nothing ever writes back through it. An official recipe stays the
 * frozen library record and a Community recipe stays its author's immutable published
 * version — the working copy is the customer's own recipe from the first save on.
 */
import type { RecipeInput } from '@/engine';
import type { LineageRelation } from '@/features/community/domain/lineage';

export const RECIPE_PROVENANCE_KEY = 'gellatti_provenance_v1' as const;

export interface OfficialRecipeProvenance {
  readonly schemaVersion: 1;
  readonly kind: 'official';
  readonly officialRecipeId: string;
  readonly officialRecipeNumber: number;
  readonly sourceName: string;
  /** The frozen library the copy was materialised from. */
  readonly libraryVersion: string;
  readonly librarySha256: string;
}

export interface CommunityRecipeProvenance {
  readonly schemaVersion: 1;
  readonly kind: 'community';
  readonly relation: LineageRelation;
  /** Exactly one of the two addresses is set — a publication or a direct share. */
  readonly publicationId: string | null;
  readonly shareLinkId: string | null;
  readonly sourceTitle: string;
  readonly sourceCreatorDisplayName: string;
  readonly sourceVersionNumber: number | null;
}

export type RecipeProvenance = OfficialRecipeProvenance | CommunityRecipeProvenance;

type RecipeInputWithProvenance = RecipeInput & { [RECIPE_PROVENANCE_KEY]?: unknown };

export function attachRecipeProvenance(
  input: RecipeInput,
  provenance: RecipeProvenance | null,
): RecipeInput {
  if (provenance === null) return input;
  return {
    ...input,
    [RECIPE_PROVENANCE_KEY]: structuredClone(provenance),
  } as RecipeInputWithProvenance;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const optionalText = (value: unknown): value is string | null => value === null || text(value);

/** Tolerant Save/Reopen seam: anything malformed reads as "no provenance", never a guess. */
export function readRecipeProvenance(input: unknown): RecipeProvenance | null {
  const value = record(record(input)?.[RECIPE_PROVENANCE_KEY]);
  if (!value || value.schemaVersion !== 1) return null;
  if (value.kind === 'official') {
    if (
      !text(value.officialRecipeId) ||
      typeof value.officialRecipeNumber !== 'number' ||
      !Number.isInteger(value.officialRecipeNumber) ||
      !text(value.sourceName) ||
      !text(value.libraryVersion) ||
      !text(value.librarySha256)
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      kind: 'official',
      officialRecipeId: value.officialRecipeId,
      officialRecipeNumber: value.officialRecipeNumber,
      sourceName: value.sourceName,
      libraryVersion: value.libraryVersion,
      librarySha256: value.librarySha256,
    };
  }
  if (value.kind === 'community') {
    if (
      (value.relation !== 'copy' && value.relation !== 'remix') ||
      !optionalText(value.publicationId) ||
      !optionalText(value.shareLinkId) ||
      (value.publicationId === null) === (value.shareLinkId === null) ||
      typeof value.sourceTitle !== 'string' ||
      typeof value.sourceCreatorDisplayName !== 'string' ||
      !(value.sourceVersionNumber === null || Number.isInteger(value.sourceVersionNumber))
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      kind: 'community',
      relation: value.relation,
      publicationId: value.publicationId,
      shareLinkId: value.shareLinkId,
      sourceTitle: value.sourceTitle,
      sourceCreatorDisplayName: value.sourceCreatorDisplayName,
      sourceVersionNumber: value.sourceVersionNumber as number | null,
    };
  }
  return null;
}
