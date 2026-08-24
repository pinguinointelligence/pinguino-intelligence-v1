/**
 * What the scan session ALREADY knows, and what is genuinely still missing.
 *
 * The served defect this replaces: the scanner asked for „dodatkowe ujęcie" before it
 * had used the barcode, the catalogue or any exact source, and it asked in the
 * generic — the owner was told something was missing but not what. Worse, it kept
 * asking for photographs of information that is not printed on the package at all.
 *
 * So evidence is accounted per KIND, with the provenance that supplied it, and a
 * request for another view is only ever emitted when that view has not already been
 * shown. Missing information is not the same thing as a missing photo.
 */

/** Where a field came from. Kept internally; the ordinary UI shows the plain state. */
export type ScanFieldProvenance =
  | 'camera'
  | 'catalog'
  | 'ean_lookup'
  | 'official_source'
  | 'external_source'
  | 'mapper_estimated'
  | 'derived';

export type ScanEvidenceKind = 'identity' | 'barcode' | 'nutrition' | 'ingredients';

export const SCAN_EVIDENCE_KINDS: readonly ScanEvidenceKind[] = [
  'identity',
  'barcode',
  'nutrition',
  'ingredients',
];

export interface ScanEvidenceEntry {
  kind: ScanEvidenceKind;
  present: boolean;
  provenance: ScanFieldProvenance | null;
}

/** The Polish label the live checklist renders. */
export const EVIDENCE_LABEL: Readonly<Record<ScanEvidenceKind, string>> = Object.freeze({
  identity: 'Nazwa',
  barcode: 'Kod EAN',
  nutrition: 'Wartości odżywcze',
  ingredients: 'Skład',
});

/**
 * The instruction for one specific missing view. Never „potrzebne dodatkowe ujęcie" —
 * the owner has to know which surface of the package to turn towards the camera.
 */
export const EVIDENCE_REQUEST: Readonly<Record<ScanEvidenceKind, string>> = Object.freeze({
  identity: 'Pokaż przód opakowania z nazwą produktu.',
  barcode: 'Pokaż kod kreskowy z bliska.',
  nutrition: 'Obróć produkt i pokaż tabelę wartości odżywczych.',
  ingredients: 'Pokaż fragment etykiety ze składem.',
});

/** Which evidence kind a server-reported missing field belongs to. */
export function evidenceKindForMissingField(field: string): ScanEvidenceKind | null {
  if (field === 'barcode') return 'barcode';
  if (field.startsWith('nutrition')) return 'nutrition';
  if (field === 'ingredientsText' || field === 'allergensText') return 'ingredients';
  if (field === 'product_identity' || field === 'brand_or_unbranded' || field === 'net_quantity')
    return 'identity';
  // `allergen_confirmation` is a question for the owner, not a view of the package.
  return null;
}

export interface ScanEvidenceInput {
  /** Barcode read live from the camera, before anything is sent anywhere. */
  localBarcode: string | null;
  /** An exact canonical product was found — the scan is already answered. */
  catalogMatch: boolean;
  /** Kinds an exact EAN lookup resolved, before any photograph was requested. */
  resolvedByLookup: readonly ScanEvidenceKind[];
  /** Kinds the label analysis resolved. */
  resolvedByCamera: readonly ScanEvidenceKind[];
  /** The server's own verdict on the merged session result. */
  missingCriticalFields: readonly string[];
  /** Views the owner has already been asked for and has shown. */
  shownViews: readonly ScanEvidenceKind[];
  /** True once no further label analysis is available in this session. */
  analysisExhausted: boolean;
}

export interface ScanEvidenceState {
  entries: ScanEvidenceEntry[];
  /** Kinds that are still absent after every cheap source has been merged. */
  missingKinds: ScanEvidenceKind[];
  /** The ONE view worth asking for next, or null when asking is pointless. */
  requestView: ScanEvidenceKind | null;
  requestMessage: string | null;
  /**
   * The owner has shown what there is to show. Whatever is still missing is not
   * obtainable from the package, so the pipeline continues with estimation instead
   * of asking for another photograph (§10).
   */
  packageEvidenceExhausted: boolean;
  /** Nothing is missing — go straight through, ask for nothing. */
  complete: boolean;
}

export function scanEvidenceState(input: ScanEvidenceInput): ScanEvidenceState {
  const missingFromServer = new Set(
    input.missingCriticalFields
      .map(evidenceKindForMissingField)
      .filter((kind): kind is ScanEvidenceKind => kind !== null),
  );
  const lookup = new Set(input.resolvedByLookup);
  const camera = new Set(input.resolvedByCamera);
  const shown = new Set(input.shownViews);

  const provenanceFor = (kind: ScanEvidenceKind): ScanFieldProvenance | null => {
    if (input.catalogMatch) return 'catalog';
    if (kind === 'barcode' && input.localBarcode) return 'camera';
    if (camera.has(kind)) return 'camera';
    if (lookup.has(kind)) return 'ean_lookup';
    return null;
  };

  const entries = SCAN_EVIDENCE_KINDS.map((kind) => {
    const present = input.catalogMatch
      ? true
      : kind === 'barcode'
        ? input.localBarcode !== null || (!missingFromServer.has('barcode') && (camera.has(kind) || lookup.has(kind)))
        : !missingFromServer.has(kind) && (camera.has(kind) || lookup.has(kind));
    return { kind, present, provenance: present ? provenanceFor(kind) : null };
  });

  const missingKinds = entries.filter((entry) => !entry.present).map((entry) => entry.kind);
  // A view the owner has already turned towards the camera will not become readable
  // by asking for it a second time. That loop is the defect, not the remedy.
  const askable = missingKinds.filter((kind) => !shown.has(kind));
  const exhausted = missingKinds.length > 0 && (askable.length === 0 || input.analysisExhausted);
  const requestView = exhausted || askable.length === 0 ? null : askable[0]!;
  return {
    entries,
    missingKinds,
    requestView,
    requestMessage: requestView ? EVIDENCE_REQUEST[requestView] : null,
    packageEvidenceExhausted: exhausted,
    complete: missingKinds.length === 0,
  };
}
