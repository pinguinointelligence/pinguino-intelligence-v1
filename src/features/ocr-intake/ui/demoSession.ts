/**
 * Standalone demo state for the full intake session UI.
 *
 * Everything here is CLEARLY-SAMPLED contract-shaped data + an in-memory
 * event fallback so the page renders and reacts standalone. It fabricates
 * NOTHING that claims to be real: no OCR ran (ocrRuns stays empty), the
 * session carries an explicit sample warning, and locally added images get a
 * PENDING checksum ('' — displayed as "pending"), never an invented hash.
 *
 * INTEGRATION POINT (track H): `applyLocalIntakeEvent` is the throwaway
 * standalone reducer — the real session reducer replaces it through the
 * page's IntakeWiring, consuming the same IntakeSessionEvent vocabulary.
 * INTEGRATION POINT (track G): image checksums, OCR runs and extracted
 * evidence come from the provider/extractor seam, never from this file.
 */
import type {
  AcceptedMime,
  BatchIntake,
  DuplicateAssessment,
  IntakeFieldKey,
  IntakeImage,
  IntakeImageRole,
  ProductIntakeSession,
  ReviewedField,
} from '../intakeContracts';

/* ── the event vocabulary the page dispatches (contract-typed payloads) ───── */

export interface IncomingImageFile {
  fileName: string;
  mime: AcceptedMime;
  byteSize: number;
}

export type IntakeSessionEvent =
  | { type: 'add_images'; files: IncomingImageFile[] }
  | { type: 'set_image_role'; imageId: string; role: IntakeImageRole }
  | { type: 'move_image'; imageId: string; direction: 'up' | 'down' }
  | { type: 'replace_image'; imageId: string; file: IncomingImageFile }
  | { type: 'remove_image'; imageId: string }
  | { type: 'retry_image'; imageId: string }
  | { type: 'set_manual_ean'; ean: string }
  | { type: 'edit_field'; fieldKey: IntakeFieldKey; value: string }
  | { type: 'mark_unknown'; fieldKey: IntakeFieldKey }
  | { type: 'choose_candidate'; fieldKey: IntakeFieldKey; candidateIndex: number }
  | { type: 'confirm_field'; fieldKey: IntakeFieldKey }
  | { type: 'duplicate_action'; action: DuplicateAssessment['allowedActions'][number] };

/* ── sample session (wiring preview — every value is openly sample data) ──── */

const hex = (seed: string): string => seed.repeat(Math.ceil(64 / seed.length)).slice(0, 64);

const demoImage = (
  imageId: string,
  role: IntakeImageRole,
  order: number,
  fileName: string,
  state: IntakeImage['state'],
  failure: string | null = null,
): IntakeImage => ({
  imageId,
  role,
  order,
  fileName,
  mime: 'image/jpeg',
  byteSize: 482_000 + order * 11_000,
  checksumSha256: hex(`${order + 1}a3f9c`),
  width: 1600,
  height: 1200,
  state,
  failure,
});

const explicitField = (
  fieldKey: IntakeFieldKey,
  raw: string,
  normalized: string,
  imageId: string,
  lineIndex: number,
  sourceText: string,
  extraction: number,
  normalization: number,
  reviewStatus: ReviewedField['reviewStatus'] = 'needs_confirmation',
  warnings: string[] = [],
): ReviewedField => ({
  fieldKey,
  candidates: [
    {
      extractedRaw: raw,
      normalized,
      evidence: { imageId, lineIndex, sourceText },
      extractionConfidence: extraction,
      normalizationConfidence: normalization,
      provenance: 'explicit',
      warnings,
    },
  ],
  chosenCandidate: reviewStatus === 'confirmed' || reviewStatus === 'auto_accepted' ? 0 : null,
  editedValue: null,
  reviewStatus,
});

const absentField = (fieldKey: IntakeFieldKey): ReviewedField => ({
  fieldKey,
  candidates: [
    {
      extractedRaw: null,
      normalized: null,
      evidence: null,
      extractionConfidence: null,
      normalizationConfidence: null,
      provenance: 'absent',
      warnings: [],
    },
  ],
  chosenCandidate: null,
  editedValue: null,
  reviewStatus: 'needs_confirmation',
});

/** A contract-typed SAMPLE session demonstrating every review render path. */
export function createDemoIntakeSession(): ProductIntakeSession {
  return {
    sessionId: 'sample-session-1',
    state: 'review',
    images: [
      demoImage('img-front', 'front', 0, 'front.jpg', 'ready'),
      demoImage('img-nutrition', 'nutrition_table', 1, 'nutrition.jpg', 'needs_review'),
      demoImage(
        'img-ingredients',
        'ingredients',
        2,
        'ingredients.jpg',
        'failed',
        'unreadable_image — the engine could not read usable text from this photo',
      ),
      demoImage('img-barcode', 'barcode', 3, 'barcode.jpg', 'uploaded'),
    ],
    manualEan: '8480000610928',
    ocrRuns: {}, // honest: NO OCR ran on this sample — runs attach at integration
    fields: [
      explicitField('product_name', 'GRIEGO NATURAL', 'Griego natural', 'img-front', 2, 'GRIEGO NATURAL', 91, 88),
      explicitField('brand', 'Hacendado', 'Hacendado', 'img-front', 3, 'Hacendado', 94, 96, 'confirmed'),
      {
        ...explicitField('package_size', '4 x 125 g', '500', 'img-front', 5, '4 x 125 g', 82, 71),
        editedValue: '500',
        reviewStatus: 'edited',
      },
      explicitField('package_unit', 'g', 'g', 'img-front', 5, '4 x 125 g', 82, 90, 'auto_accepted'),
      explicitField('ean_code', '8480000610928', '8480000610928', 'img-barcode', 0, '8 480000 610928', 88, 99),
      explicitField('nutrition_basis', 'por 100 g', 'per_100g', 'img-nutrition', 0, 'VALORES MEDIOS POR 100 g', 90, 93, 'auto_accepted'),
      {
        fieldKey: 'energy_kcal',
        candidates: [
          {
            extractedRaw: '123',
            normalized: '123',
            evidence: { imageId: 'img-nutrition', lineIndex: 1, sourceText: 'Valor energético 515 kJ / 123 kcal' },
            extractionConfidence: 84,
            normalizationConfidence: 92,
            provenance: 'explicit',
            warnings: [],
          },
          {
            extractedRaw: '128',
            normalized: '128',
            evidence: { imageId: 'img-front', lineIndex: 7, sourceText: '128 kcal por unidad' },
            extractionConfidence: 61,
            normalizationConfidence: 55,
            provenance: 'explicit',
            warnings: ['second reading disagrees with the nutrition table'],
          },
        ],
        chosenCandidate: null,
        editedValue: null,
        reviewStatus: 'conflict_unresolved',
      },
      explicitField('energy_kj', '515', '515', 'img-nutrition', 1, 'Valor energético 515 kJ / 123 kcal', 84, 92),
      explicitField('fat', '9,8 g', '9.8', 'img-nutrition', 2, 'Grasas 9,8 g', 87, 90),
      explicitField('saturated_fat', '6,4 g', '6.4', 'img-nutrition', 3, 'de las cuales saturadas 6,4 g', 85, 90),
      explicitField('carbohydrate', '4,3 g', '4.3', 'img-nutrition', 4, 'Hidratos de carbono 4,3 g', 86, 90),
      {
        fieldKey: 'sugars',
        candidates: [
          {
            extractedRaw: '5,4 g (por 125 g)',
            normalized: '4.3',
            evidence: { imageId: 'img-nutrition', lineIndex: 5, sourceText: 'de los cuales azúcares 5,4 g (por unidad 125 g)' },
            extractionConfidence: 79,
            normalizationConfidence: 64,
            provenance: 'calculated',
            warnings: ['calculated from the per-unit declaration (125 g) — verify against the label'],
          },
        ],
        chosenCandidate: null,
        editedValue: null,
        reviewStatus: 'needs_confirmation',
      },
      explicitField('protein', '5,9 g', '5.9', 'img-nutrition', 6, 'Proteínas 5,9 g', 88, 90),
      explicitField('salt', '0,13 g', '0.13', 'img-nutrition', 7, 'Sal 0,13 g', 83, 90),
      {
        ...explicitField('sodium', '0,05 g', '0.05', 'img-nutrition', 8, 'Sodio 0,05 g', 80, 90),
        candidates: [
          {
            extractedRaw: '0,05 g',
            normalized: '0.05',
            evidence: { imageId: 'img-nutrition', lineIndex: 8, sourceText: 'Sodio 0,05 g' },
            extractionConfidence: 80,
            normalizationConfidence: 90,
            provenance: 'explicit',
            warnings: ['recorded as evidence only — NEVER auto-converted to salt'],
          },
        ],
      },
      absentField('fibre'), // not on this label → missing indicator, never 0
      {
        fieldKey: 'category',
        candidates: [
          {
            extractedRaw: null,
            normalized: 'dairy',
            evidence: { imageId: 'img-ingredients', lineIndex: 0, sourceText: 'Yogur griego natural (leche)' },
            extractionConfidence: null,
            normalizationConfidence: 55,
            provenance: 'inferred',
            warnings: ['inferred from the ingredients text — verify'],
          },
        ],
        chosenCandidate: null,
        editedValue: null,
        reviewStatus: 'needs_confirmation',
      },
      {
        fieldKey: 'supplier',
        candidates: [],
        chosenCandidate: null,
        editedValue: null,
        reviewStatus: 'marked_unknown',
      },
      explicitField('ingredients_text', 'Nata pasteurizada, leche desnatada, fermentos lácticos', 'Nata pasteurizada, leche desnatada, fermentos lácticos', 'img-ingredients', 1, 'INGREDIENTES: Nata pasteurizada…', 76, 80),
      explicitField('allergens_text', 'leche', 'milk', 'img-ingredients', 2, 'Contiene: LECHE', 90, 95, 'confirmed'),
      absentField('may_contain_text'),
      absentField('claim_gluten_free'),
    ],
    warnings: ['Sample data — wiring preview only. No OCR ran; nothing is uploaded or saved.'],
    duplicate: {
      verdict: 'likely_duplicate',
      reasons: [
        { check: 'ean_match', existingProductId: 'P-000069' },
        { check: 'normalized_identity_match', existingProductId: 'P-000069', score: 87 },
      ],
      allowedActions: ['open_existing', 'update_existing_with_review', 'create_new'],
    },
  };
}

/** A contract-typed SAMPLE batch (one of each outcome + a defaulted pending). */
export function createDemoBatch(): { batch: BatchIntake; sessionLabels: Record<string, string> } {
  return {
    batch: {
      batchId: 'sample-batch-1',
      sessionIds: ['s-01', 's-02', 's-03', 's-04', 's-05'],
      outcomes: {
        's-01': 'saved',
        's-02': 'duplicate',
        's-03': 'needs_review',
        's-04': 'failed',
        // s-05 intentionally absent → renders as 'pending' (the default)
      },
    },
    sessionLabels: {
      's-01': 'Greek yogurt 4-pack (sample)',
      's-02': 'Dark chocolate 70% (sample)',
      's-03': 'Vanilla dessert base (sample)',
      's-04': 'Blurred ingredients photo (sample)',
      's-05': 'Queued session (sample)',
    },
  };
}

/* ── standalone in-memory fallback reducer ────────────────────────────────── */

let localImageSeq = 0;

const nextLocalImage = (file: IncomingImageFile, order: number): IntakeImage => ({
  imageId: `local-${(localImageSeq += 1)}`,
  role: 'other',
  order,
  fileName: file.fileName,
  mime: file.mime,
  byteSize: file.byteSize,
  // checksum is PENDING (shown as such) — track G computes the real SHA-256
  checksumSha256: '',
  width: null,
  height: null,
  state: 'uploaded',
  failure: null,
});

const reindex = (images: IntakeImage[]): IntakeImage[] =>
  [...images].sort((a, b) => a.order - b.order).map((img, order) => ({ ...img, order }));

const patchField = (
  session: ProductIntakeSession,
  fieldKey: IntakeFieldKey,
  patch: (field: ReviewedField) => ReviewedField,
): ProductIntakeSession => {
  const exists = session.fields.some((f) => f.fieldKey === fieldKey);
  const blank: ReviewedField = {
    fieldKey,
    candidates: [],
    chosenCandidate: null,
    editedValue: null,
    reviewStatus: 'needs_confirmation',
  };
  const fields = exists
    ? session.fields.map((f) => (f.fieldKey === fieldKey ? patch(f) : f))
    : [...session.fields, patch(blank)];
  return { ...session, fields };
};

/**
 * The standalone (no-wiring) reducer: pure in-memory updates so the page is
 * usable on its own. It never invents evidence, never runs OCR and never
 * saves — replaced wholesale by track H's session reducer at integration.
 */
export function applyLocalIntakeEvent(
  session: ProductIntakeSession,
  event: IntakeSessionEvent,
): ProductIntakeSession {
  switch (event.type) {
    case 'add_images': {
      const base = session.images.length;
      return {
        ...session,
        images: [...session.images, ...event.files.map((f, i) => nextLocalImage(f, base + i))],
      };
    }
    case 'set_image_role':
      return {
        ...session,
        images: session.images.map((img) =>
          img.imageId === event.imageId ? { ...img, role: event.role } : img,
        ),
      };
    case 'move_image': {
      const ordered = [...session.images].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((img) => img.imageId === event.imageId);
      const target = event.direction === 'up' ? index - 1 : index + 1;
      const a = ordered[index];
      const b = ordered[target];
      if (index === -1 || a === undefined || b === undefined) return session;
      return {
        ...session,
        images: session.images.map((img) =>
          img.imageId === a.imageId
            ? { ...img, order: b.order }
            : img.imageId === b.imageId
              ? { ...img, order: a.order }
              : img,
        ),
      };
    }
    case 'replace_image':
      return {
        ...session,
        images: session.images.map((img) =>
          img.imageId === event.imageId
            ? {
                ...img,
                fileName: event.file.fileName,
                mime: event.file.mime,
                byteSize: event.file.byteSize,
                checksumSha256: '', // pending again — new bytes, new hash
                width: null,
                height: null,
                state: 'uploaded',
                failure: null,
              }
            : img,
        ),
      };
    case 'remove_image':
      return {
        ...session,
        images: reindex(session.images.filter((img) => img.imageId !== event.imageId)),
      };
    case 'retry_image':
      // standalone: re-queue only; the real re-run needs track G's provider
      return {
        ...session,
        images: session.images.map((img) =>
          img.imageId === event.imageId ? { ...img, state: 'uploaded', failure: null } : img,
        ),
      };
    case 'set_manual_ean':
      return { ...session, manualEan: event.ean === '' ? null : event.ean };
    case 'edit_field':
      return patchField(session, event.fieldKey, (f) => ({
        ...f,
        editedValue: event.value === '' ? null : event.value,
        reviewStatus: event.value === '' ? 'needs_confirmation' : 'edited',
      }));
    case 'mark_unknown':
      return patchField(session, event.fieldKey, (f) => ({
        ...f,
        editedValue: null,
        chosenCandidate: null,
        reviewStatus: 'marked_unknown',
      }));
    case 'choose_candidate':
      return patchField(session, event.fieldKey, (f) => ({
        ...f,
        chosenCandidate: event.candidateIndex,
        reviewStatus: 'confirmed',
      }));
    case 'confirm_field':
      return patchField(session, event.fieldKey, (f) => ({ ...f, reviewStatus: 'confirmed' }));
    case 'duplicate_action':
      // standalone: no catalog exists here — the action is a no-op until
      // track H wires the duplicate flow
      return session;
  }
}
