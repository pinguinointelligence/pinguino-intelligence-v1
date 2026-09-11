export declare const DIFF_SCHEMA: 'gellatti.country-products.gelato-base.registry-diff/v1';

export interface RegistryDiffEntry {
  productKey?: string | null;
  selectionKey?: string | null;
  gapId?: string;
  kind: string;
  field?: string;
  country?: string;
  closedGapId?: string | null;
  from: unknown;
  to: unknown;
}

export interface RegistryDiff {
  schema: typeof DIFF_SCHEMA;
  from: { registryId: string | null; workbook: string | null; sha256: string | null };
  to: { registryId: string | null; workbook: string | null; sha256: string | null };
  newlyCompletedProducts: RegistryDiffEntry[];
  newlyCompletedEvidence: RegistryDiffEntry[];
  changedVerification: RegistryDiffEntry[];
  changedAvailability: RegistryDiffEntry[];
  changedExactIdentity: RegistryDiffEntry[];
  addedProducts: string[];
  removedProducts: string[];
  openGapsClosed: RegistryDiffEntry[];
  openGapsOpened: RegistryDiffEntry[];
  counts: Record<string, number>;
}

/** Structural subset of a registry that the diff reads. */
export interface DiffableRegistry {
  registryId?: string;
  source?: { workbook?: string; sha256?: string };
  sources?: Readonly<Record<string, { url: string }>>;
  texts?: Readonly<Record<string, string>>;
  products: ReadonlyArray<Record<string, unknown> & { productKey: string }>;
  selections: ReadonlyArray<Record<string, unknown> & { selectionKey: string }>;
  openGaps: ReadonlyArray<Record<string, unknown> & { id: string }>;
}

export declare function diffRegistries(
  oldRegistry: DiffableRegistry,
  newRegistry: DiffableRegistry,
): RegistryDiff;

export declare function renderDiffMarkdown(diff: RegistryDiff): string;
