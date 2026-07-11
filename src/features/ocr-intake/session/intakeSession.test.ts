/// <reference types="node" />
/**
 * Session state-machine tests (spec §4, §9, §16): image lifecycle (add / remove /
 * replace / reorder / limits / checksum duplicate-upload / retry), manual EAN,
 * session transitions incl. deliberate rerun-extraction (edits discarded WITH a
 * warning), review actions, the ready_to_save gate, cancel, and the cross-product
 * evidence invariant. Everything pure — no engine, no services, no IO.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { IntakeSessionState, ProductIntakeSession, ReviewedField } from '../intakeContracts';
import {
  addImage,
  assertNoForeignEvidence,
  beginExtraction,
  beginImageAnalysis,
  beginSave,
  blockOnDuplicate,
  cancelSession,
  chooseCandidate,
  completeExtraction,
  completeImageAnalysis,
  confirmFieldReview,
  createIntakeSession,
  editFieldValue,
  extractSessionFields,
  failSession,
  IntakeSessionError,
  markFieldUnknown,
  markReadyToSave,
  markSaved,
  MAX_IMAGES_PER_SESSION,
  MAX_INTAKE_IMAGE_BYTES,
  removeImage,
  reopenReview,
  reorderImages,
  replaceImage,
  rerunExtraction,
  resumeAfterDuplicate,
  retryImage,
  SESSION_TRANSITIONS,
  setManualEan,
  successfulRuns,
} from './intakeSession';
import {
  collectingSession,
  evidence,
  extractedSession,
  failedRun,
  fakeSha,
  imageInput,
  okRun,
  resolvedField,
  reviewSession,
} from './__fixtures__/builders';

const expectRefusal = (fn: () => unknown, code: IntakeSessionError['code']): void => {
  try {
    fn();
    expect.unreachable(`expected IntakeSessionError(${code})`);
  } catch (error) {
    expect(error).toBeInstanceOf(IntakeSessionError);
    expect((error as IntakeSessionError).code).toBe(code);
  }
};

const DUPLICATE_FIXTURE = {
  verdict: 'exact_duplicate' as const,
  reasons: [{ check: 'ean_match' as const, existingProductId: 'prod-9' }],
  allowedActions: ['open_existing' as const, 'update_existing_with_review' as const],
};

describe('createIntakeSession', () => {
  it('creates an empty collecting_images session', () => {
    const s = createIntakeSession('session-1');
    expect(s).toEqual({
      sessionId: 'session-1',
      state: 'collecting_images',
      images: [],
      manualEan: null,
      ocrRuns: {},
      fields: [],
      warnings: [],
      duplicate: null,
    });
  });

  it('refuses a blank sessionId', () => {
    expectRefusal(() => createIntakeSession('   '), 'session_mismatch');
  });
});

describe('addImage', () => {
  it('assigns contiguous 0-based order in add sequence', () => {
    const s = collectingSession('s', 3);
    expect(s.images.map((i) => [i.imageId, i.order])).toEqual([
      ['img-1', 0],
      ['img-2', 1],
      ['img-3', 2],
    ]);
    expect(s.images.every((i) => i.state === 'uploaded')).toBe(true);
  });

  it('refuses an invalid role (typed)', () => {
    expectRefusal(
      () => addImage(createIntakeSession('s'), imageInput('x', { role: 'selfie' as never })),
      'invalid_role',
    );
  });

  it('refuses an unsupported mime (typed)', () => {
    expectRefusal(
      () => addImage(createIntakeSession('s'), imageInput('x', { mime: 'image/gif' as never })),
      'unsupported_mime',
    );
  });

  it('refuses an empty (0-byte) image', () => {
    expectRefusal(() => addImage(createIntakeSession('s'), imageInput('x', { byteSize: 0 })), 'empty_image');
  });

  it('accepts exactly the byte cap and refuses one byte over', () => {
    const at = addImage(createIntakeSession('s'), imageInput('x', { byteSize: MAX_INTAKE_IMAGE_BYTES }));
    expect(at.images).toHaveLength(1);
    expectRefusal(
      () => addImage(createIntakeSession('s'), imageInput('x', { byteSize: MAX_INTAKE_IMAGE_BYTES + 1 })),
      'image_too_large',
    );
  });

  it('the byte cap MIRRORS the OCR engine cap (source-pinned, can never drift)', () => {
    const engineSrc = readFileSync(join(resolve(import.meta.dirname), '..', 'ocrEngine.ts'), 'utf8');
    const match = /MAX_LABEL_IMAGE_BYTES\s*=\s*([0-9*\s]+);/.exec(engineSrc);
    expect(match).not.toBeNull();
    const engineCap = new Function(`return ${match![1]}`)() as number;
    expect(MAX_INTAKE_IMAGE_BYTES).toBe(engineCap);
  });

  it('refuses a malformed checksum', () => {
    expectRefusal(() => addImage(createIntakeSession('s'), imageInput('x', { checksumSha256: 'nope' })), 'invalid_checksum');
  });

  it('rejects a duplicate upload by CHECKSUM within the session (typed, names the twin)', () => {
    const s = collectingSession('s', 1);
    try {
      addImage(s, imageInput('img-2', { checksumSha256: fakeSha('img-1'), fileName: 'again.png' }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(IntakeSessionError);
      expect((error as IntakeSessionError).code).toBe('duplicate_upload');
      expect((error as Error).message).toContain('img-1');
    }
  });

  it('checksum comparison is case-insensitive (stored lowercase)', () => {
    const s = collectingSession('s', 1);
    expectRefusal(
      () => addImage(s, imageInput('img-2', { checksumSha256: fakeSha('img-1').toUpperCase() })),
      'duplicate_upload',
    );
  });

  it('rejects a duplicate imageId', () => {
    expectRefusal(() => addImage(collectingSession('s', 1), imageInput('img-1', { checksumSha256: fakeSha('other') })), 'duplicate_image_id');
  });

  it(`enforces the ${MAX_IMAGES_PER_SESSION}-image session limit (typed refusal)`, () => {
    const s = collectingSession('s', MAX_IMAGES_PER_SESSION);
    expect(s.images).toHaveLength(MAX_IMAGES_PER_SESSION);
    expectRefusal(() => addImage(s, imageInput('img-overflow')), 'image_limit');
  });

  it('cannot add images outside collecting_images', () => {
    expectRefusal(() => addImage(extractedSession(), imageInput('late')), 'illegal_transition');
  });

  it('is immutable — the input session is untouched', () => {
    const before = collectingSession('s', 1);
    const snapshot = JSON.parse(JSON.stringify(before)) as unknown;
    addImage(before, imageInput('img-2'));
    expect(before).toEqual(snapshot);
  });
});

describe('removeImage', () => {
  it('removes the image, renumbers contiguously, and discards its OCR run', () => {
    let s = collectingSession('s', 3);
    s = { ...s, ocrRuns: { 'img-2': okRun('img-2', 'text') } };
    s = removeImage(s, 'img-2');
    expect(s.images.map((i) => [i.imageId, i.order])).toEqual([
      ['img-1', 0],
      ['img-3', 1],
    ]);
    expect(s.ocrRuns['img-2']).toBeUndefined();
  });

  it('refuses an unknown image', () => {
    expectRefusal(() => removeImage(collectingSession('s', 1), 'ghost'), 'unknown_image');
  });
});

describe('replaceImage', () => {
  it('the replacement INHERITS role + order and the old OCR run is discarded', () => {
    let s = createIntakeSession('s');
    s = addImage(s, imageInput('img-1', { role: 'nutrition_table' }));
    s = addImage(s, imageInput('img-2', { role: 'ingredients' }));
    s = { ...s, ocrRuns: { 'img-1': okRun('img-1', 'old') } };
    s = replaceImage(s, 'img-1', imageInput('img-1b', { role: 'front' /* ignored — role inherited */ }));
    const fresh = s.images.find((i) => i.imageId === 'img-1b');
    expect(fresh?.role).toBe('nutrition_table');
    expect(fresh?.order).toBe(0);
    expect(fresh?.state).toBe('uploaded');
    expect(s.ocrRuns['img-1']).toBeUndefined();
    expect(s.images.map((i) => i.imageId)).toEqual(['img-1b', 'img-2']);
  });

  it('rejects replacement bytes that duplicate ANOTHER image (checksum)', () => {
    const s = collectingSession('s', 2);
    expectRefusal(
      () => replaceImage(s, 'img-1', imageInput('img-1b', { checksumSha256: fakeSha('img-2') })),
      'duplicate_upload',
    );
  });

  it('allows re-uploading the SAME bytes as a replacement of itself', () => {
    const s = collectingSession('s', 2);
    const next = replaceImage(s, 'img-1', imageInput('img-1b', { checksumSha256: fakeSha('img-1') }));
    expect(next.images[0]?.imageId).toBe('img-1b');
  });

  it('rejects a replacement id colliding with another image', () => {
    const s = collectingSession('s', 2);
    expectRefusal(() => replaceImage(s, 'img-1', imageInput('img-2', { checksumSha256: fakeSha('new') })), 'duplicate_image_id');
  });

  it('during extraction only a FAILED image may be replaced', () => {
    let s = collectingSession('s', 2);
    s = beginExtraction(s);
    s = beginImageAnalysis(s, 'img-1');
    s = completeImageAnalysis(s, 'img-1', failedRun());
    // img-1 failed → replaceable; img-2 still uploaded → refused
    const replaced = replaceImage(s, 'img-1', imageInput('img-1b'));
    expect(replaced.images.find((i) => i.imageId === 'img-1b')?.state).toBe('uploaded');
    expectRefusal(() => replaceImage(s, 'img-2', imageInput('img-2b')), 'image_not_failed');
  });
});

describe('reorderImages', () => {
  it('reorders to the given permutation with contiguous stable orders', () => {
    const s = reorderImages(collectingSession('s', 3), ['img-3', 'img-1', 'img-2']);
    expect(s.images.map((i) => [i.imageId, i.order])).toEqual([
      ['img-3', 0],
      ['img-1', 1],
      ['img-2', 2],
    ]);
  });

  it('refuses a partial or padded id list', () => {
    expectRefusal(() => reorderImages(collectingSession('s', 3), ['img-1', 'img-2']), 'invalid_reorder');
    expectRefusal(
      () => reorderImages(collectingSession('s', 3), ['img-1', 'img-2', 'img-3', 'img-4']),
      'invalid_reorder',
    );
  });

  it('refuses duplicates and unknown ids in the permutation', () => {
    expectRefusal(() => reorderImages(collectingSession('s', 3), ['img-1', 'img-1', 'img-2']), 'invalid_reorder');
    expectRefusal(() => reorderImages(collectingSession('s', 3), ['img-1', 'img-2', 'ghost']), 'invalid_reorder');
  });

  it('preserves image identity (same objects, new order only)', () => {
    const before = collectingSession('s', 2);
    const after = reorderImages(before, ['img-2', 'img-1']);
    expect(after.images.map((i) => i.checksumSha256).sort()).toEqual(
      before.images.map((i) => i.checksumSha256).sort(),
    );
  });
});

describe('per-image OCR lifecycle', () => {
  it('uploaded → analysing → needs_review (default) with the run recorded', () => {
    let s = beginExtraction(collectingSession('s', 1));
    s = beginImageAnalysis(s, 'img-1');
    expect(s.images[0]?.state).toBe('analysing');
    s = completeImageAnalysis(s, 'img-1', okRun('img-1', 'hello label'));
    expect(s.images[0]?.state).toBe('needs_review');
    expect(s.ocrRuns['img-1']?.ok).toBe(true);
  });

  it("resolution 'ready' is an explicit caller decision", () => {
    let s = beginExtraction(collectingSession('s', 1));
    s = beginImageAnalysis(s, 'img-1');
    s = completeImageAnalysis(s, 'img-1', okRun('img-1', 'hello'), 'ready');
    expect(s.images[0]?.state).toBe('ready');
  });

  it('a failed outcome lands in failed with an honest failure message', () => {
    let s = beginExtraction(collectingSession('s', 1));
    s = beginImageAnalysis(s, 'img-1');
    s = completeImageAnalysis(s, 'img-1', failedRun('unreadable_image'));
    expect(s.images[0]?.state).toBe('failed');
    expect(s.images[0]?.failure).toBe('unreadable_image');
    expect(s.ocrRuns['img-1']?.ok).toBe(false);
  });

  it('REFUSES an OCR result stamped with a different imageId (foreign run)', () => {
    let s = beginExtraction(collectingSession('s', 2));
    s = beginImageAnalysis(s, 'img-1');
    expectRefusal(() => completeImageAnalysis(s, 'img-1', okRun('img-2', 'stolen')), 'foreign_run');
  });

  it('only an uploaded image can begin analysis; only an analysing image can complete', () => {
    let s = beginExtraction(collectingSession('s', 1));
    expectRefusal(() => completeImageAnalysis(s, 'img-1', okRun('img-1', 'x')), 'invalid_image_state');
    s = beginImageAnalysis(s, 'img-1');
    expectRefusal(() => beginImageAnalysis(s, 'img-1'), 'invalid_image_state');
  });

  it('retryImage: failed → analysing, discarding the failed run', () => {
    let s = beginExtraction(collectingSession('s', 1));
    s = beginImageAnalysis(s, 'img-1');
    s = completeImageAnalysis(s, 'img-1', failedRun());
    s = retryImage(s, 'img-1');
    expect(s.images[0]?.state).toBe('analysing');
    expect(s.images[0]?.failure).toBeNull();
    expect(s.ocrRuns['img-1']).toBeUndefined();
  });

  it('retryImage refuses a non-failed image (typed)', () => {
    let s = beginExtraction(collectingSession('s', 1));
    s = beginImageAnalysis(s, 'img-1');
    s = completeImageAnalysis(s, 'img-1', okRun('img-1', 'fine'));
    expectRefusal(() => retryImage(s, 'img-1'), 'image_not_failed');
  });

  it('image analysis is an extraction-phase operation only', () => {
    expectRefusal(() => beginImageAnalysis(collectingSession('s', 1), 'img-1'), 'illegal_transition');
  });
});

describe('manual EAN (distinct candidate source)', () => {
  it('normalizes to digits, preserving leading zeros', () => {
    const s = setManualEan(collectingSession('s', 1), ' 00 490-0002 8911 ');
    expect(s.manualEan).toBe('0049000028911');
  });

  it('warns (but keeps) a short EAN', () => {
    const s = setManualEan(collectingSession('s', 1), '1234567');
    expect(s.manualEan).toBe('1234567');
    expect(s.warnings.join(' ')).toMatch(/looks short/);
  });

  it('refuses digit-free input (typed)', () => {
    expectRefusal(() => setManualEan(collectingSession('s', 1), 'no digits here'), 'invalid_ean');
  });

  it('null clears the manual EAN and never touches reviewed fields', () => {
    let s = reviewSession('s', [resolvedField('ean_code', '8480000610928')]);
    s = setManualEan(s, '7622210449283');
    expect(s.manualEan).toBe('7622210449283');
    expect(s.fields).toHaveLength(1); // OCR evidence coexists untouched
    s = setManualEan(s, null);
    expect(s.manualEan).toBeNull();
  });

  it('cannot change the EAN once the session is ready_to_save', () => {
    const s = markReadyToSave(reviewSession());
    expectRefusal(() => setManualEan(s, '8480000610928'), 'illegal_transition');
  });
});

describe('extraction phase transitions', () => {
  it('beginExtraction requires at least one image', () => {
    expectRefusal(() => beginExtraction(createIntakeSession('s')), 'no_images');
  });

  it('completeExtraction refuses while any image is still uploaded/analysing', () => {
    const s = beginExtraction(collectingSession('s', 2));
    expectRefusal(() => completeExtraction(s, []), 'invalid_image_state');
  });

  it('completeExtraction refuses when EVERY image failed (nothing to review)', () => {
    let s = beginExtraction(collectingSession('s', 1));
    s = beginImageAnalysis(s, 'img-1');
    s = completeImageAnalysis(s, 'img-1', failedRun());
    expectRefusal(() => completeExtraction(s, []), 'no_readable_images');
  });

  it('completeExtraction lands in review with the fields installed', () => {
    const fields = [resolvedField('product_name', 'Vanilla Base')];
    const s = completeExtraction(extractedSession('s'), fields);
    expect(s.state).toBe('review');
    expect(s.fields).toEqual(fields);
  });

  it('REFUSES evidence from another session/image (cross-product safety)', () => {
    const foreign = [resolvedField('brand', 'Polar Foods', 'someone-elses-image')];
    expectRefusal(() => completeExtraction(extractedSession('s'), foreign), 'foreign_evidence');
  });

  it('assertNoForeignEvidence passes for own images and evidence-free candidates', () => {
    const s = extractedSession('s');
    expect(() =>
      assertNoForeignEvidence(s, [
        resolvedField('brand', 'Polar', 'img-1'),
        { ...resolvedField('salt', '0.1', 'img-1'), candidates: [evidence('0.1', 'img-1', { evidence: null })] },
      ]),
    ).not.toThrow();
  });

  it('successfulRuns returns ok results in IMAGE ORDER (failed runs excluded)', () => {
    let s = collectingSession('s', 3);
    s = reorderImages(s, ['img-3', 'img-1', 'img-2']);
    s = beginExtraction(s);
    for (const id of ['img-1', 'img-2', 'img-3']) s = beginImageAnalysis(s, id);
    s = completeImageAnalysis(s, 'img-1', okRun('img-1', 'first'));
    s = completeImageAnalysis(s, 'img-2', failedRun());
    s = completeImageAnalysis(s, 'img-3', okRun('img-3', 'third'));
    expect(successfulRuns(s).map((r) => r.fullText)).toEqual(['third', 'first']);
  });

  it('extractSessionFields feeds the INJECTED extractor (runs + images) and installs its output', () => {
    const s = extractedSession('s', ['front text', 'back text']);
    const produced = [resolvedField('product_name', 'From Extractor', 'img-1')];
    const extract = vi.fn(() => produced);
    const next = extractSessionFields(s, extract);
    expect(extract).toHaveBeenCalledTimes(1);
    const [runs, images] = extract.mock.calls[0] as unknown as [unknown[], unknown[]];
    expect(runs).toHaveLength(2);
    expect(images).toHaveLength(2);
    expect(next.state).toBe('review');
    expect(next.fields).toEqual(produced);
  });
});

describe('rerun extraction (deliberate, never silent)', () => {
  it('review → extracting, replacing fields and WARNING about discarded edits', () => {
    let s = reviewSession('s', [
      resolvedField('product_name', 'Vanila Base'),
      resolvedField('brand', 'Polar Foods'),
      resolvedField('salt', '0.2', 'img-1', { reviewStatus: 'needs_confirmation', chosenCandidate: null }),
    ]);
    s = editFieldValue(s, 'product_name', 'Vanilla Base');
    s = confirmFieldReview(s, 'brand');
    const rerun = rerunExtraction(s);
    expect(rerun.state).toBe('extracting');
    expect(rerun.fields).toEqual([]);
    expect(rerun.duplicate).toBeNull();
    const warning = rerun.warnings.at(-1) ?? '';
    expect(warning).toMatch(/DISCARDED/);
    expect(warning).toMatch(/1 manual edit/);
    expect(warning).toMatch(/1 confirmation/);
    expect(warning).toMatch(/3 reviewed field/);
  });

  it('rerunExtraction is review-only', () => {
    expectRefusal(() => rerunExtraction(collectingSession('s', 1)), 'illegal_transition');
  });
});

describe('review actions (spec §9)', () => {
  const conflicted = (): ProductIntakeSession =>
    reviewSession('s', [
      {
        fieldKey: 'brand',
        candidates: [evidence('Polar Foods', 'img-1'), evidence('Polar Food5', 'img-1')],
        chosenCandidate: null,
        editedValue: null,
        reviewStatus: 'conflict_unresolved',
      },
    ]);

  it('chooseCandidate resolves a conflict → confirmed with the choice recorded', () => {
    const s = chooseCandidate(conflicted(), 'brand', 0);
    const field = s.fields[0] as ReviewedField;
    expect(field.reviewStatus).toBe('confirmed');
    expect(field.chosenCandidate).toBe(0);
    expect(field.editedValue).toBeNull();
  });

  it('chooseCandidate refuses an out-of-range index (typed)', () => {
    expectRefusal(() => chooseCandidate(conflicted(), 'brand', 2), 'invalid_candidate');
    expectRefusal(() => chooseCandidate(conflicted(), 'brand', -1), 'invalid_candidate');
  });

  it('editFieldValue overrides candidates → edited', () => {
    const s = editFieldValue(conflicted(), 'brand', 'Polar Foods S.A.');
    const field = s.fields[0] as ReviewedField;
    expect(field.reviewStatus).toBe('edited');
    expect(field.editedValue).toBe('Polar Foods S.A.');
    expect(field.chosenCandidate).toBeNull();
  });

  it('markFieldUnknown resolves honestly to unknown', () => {
    const s = markFieldUnknown(conflicted(), 'brand');
    expect((s.fields[0] as ReviewedField).reviewStatus).toBe('marked_unknown');
  });

  it('confirmFieldReview confirms a needs_confirmation field', () => {
    const base = reviewSession('s', [
      resolvedField('salt', '0.2', 'img-1', { reviewStatus: 'needs_confirmation', chosenCandidate: null }),
    ]);
    const s = confirmFieldReview(base, 'salt');
    expect((s.fields[0] as ReviewedField).reviewStatus).toBe('confirmed');
  });

  it('a CONFLICT cannot be blanket-confirmed — choose/edit/mark instead (typed)', () => {
    expectRefusal(() => confirmFieldReview(conflicted(), 'brand'), 'conflict_unresolved');
  });

  it('unknown field keys are typed refusals', () => {
    expectRefusal(() => editFieldValue(reviewSession(), 'fibre', 'x'), 'unknown_field');
  });

  it('review actions are review-state-only', () => {
    expectRefusal(() => editFieldValue(collectingSession('s', 1), 'brand', 'x'), 'illegal_transition');
    expectRefusal(() => markFieldUnknown(markReadyToSave(reviewSession()), 'product_name'), 'illegal_transition');
  });
});

describe('ready_to_save gate + terminal transitions', () => {
  it('the gate BLOCKS while needs_confirmation fields remain (typed, lists them)', () => {
    const s = reviewSession('s', [
      resolvedField('product_name', 'Vanilla Base'),
      resolvedField('salt', '0.2', 'img-1', { reviewStatus: 'needs_confirmation', chosenCandidate: null }),
    ]);
    try {
      markReadyToSave(s);
      expect.unreachable();
    } catch (error) {
      expect((error as IntakeSessionError).code).toBe('unresolved_fields');
      expect((error as Error).message).toContain('salt');
    }
  });

  it('the gate BLOCKS while conflicts remain unresolved', () => {
    const s = reviewSession('s', [
      {
        fieldKey: 'brand',
        candidates: [evidence('A', 'img-1'), evidence('B', 'img-1')],
        chosenCandidate: null,
        editedValue: null,
        reviewStatus: 'conflict_unresolved',
      },
    ]);
    expectRefusal(() => markReadyToSave(s), 'unresolved_fields');
  });

  it('the gate opens once every field is resolved (confirm/choose/edit/unknown)', () => {
    let s = reviewSession('s', [
      resolvedField('product_name', 'Vanilla Base'),
      resolvedField('salt', '0.2', 'img-1', { reviewStatus: 'needs_confirmation', chosenCandidate: null }),
    ]);
    s = confirmFieldReview(s, 'salt');
    expect(markReadyToSave(s).state).toBe('ready_to_save');
  });

  it('reopenReview steps back: ready_to_save → review', () => {
    expect(reopenReview(markReadyToSave(reviewSession())).state).toBe('review');
  });

  it('blockOnDuplicate records the assessment; resumeAfterDuplicate returns to ready_to_save', () => {
    const blocked = blockOnDuplicate(markReadyToSave(reviewSession()), DUPLICATE_FIXTURE);
    expect(blocked.state).toBe('duplicate_blocked');
    expect(blocked.duplicate).toEqual(DUPLICATE_FIXTURE);
    expect(resumeAfterDuplicate(blocked).state).toBe('ready_to_save');
  });

  it('beginSave → markSaved is the only route to saved', () => {
    const saved = markSaved(beginSave(markReadyToSave(reviewSession())));
    expect(saved.state).toBe('saved');
    expectRefusal(() => markSaved(reviewSession()), 'illegal_transition');
  });

  it('cancel works from EVERY pre-saving state', () => {
    const preSaving: Array<() => ProductIntakeSession> = [
      () => collectingSession('s', 1),
      () => extractedSession('s'),
      () => reviewSession('s'),
      () => markReadyToSave(reviewSession('s')),
      () => blockOnDuplicate(markReadyToSave(reviewSession('s')), DUPLICATE_FIXTURE),
    ];
    for (const make of preSaving) {
      expect(cancelSession(make()).state).toBe('cancelled');
    }
  });

  it('cancel is refused mid-save and after terminal states', () => {
    expectRefusal(() => cancelSession(beginSave(markReadyToSave(reviewSession()))), 'illegal_transition');
    expectRefusal(() => cancelSession(cancelSession(reviewSession())), 'illegal_transition');
    expectRefusal(() => cancelSession(markSaved(beginSave(markReadyToSave(reviewSession())))), 'illegal_transition');
  });

  it('failSession records the reason and is refused on terminal states', () => {
    const failed = failSession(beginSave(markReadyToSave(reviewSession())), 'network die');
    expect(failed.state).toBe('failed');
    expect(failed.warnings.join(' ')).toContain('network die');
    expectRefusal(() => failSession(failed, 'again'), 'illegal_transition');
  });

  it('the transition table covers all 9 contract states and terminals allow nothing', () => {
    const states: IntakeSessionState[] = [
      'collecting_images',
      'extracting',
      'review',
      'ready_to_save',
      'saving',
      'saved',
      'duplicate_blocked',
      'cancelled',
      'failed',
    ];
    expect(Object.keys(SESSION_TRANSITIONS).sort()).toEqual([...states].sort());
    expect(SESSION_TRANSITIONS.saved).toEqual([]);
    expect(SESSION_TRANSITIONS.cancelled).toEqual([]);
    expect(SESSION_TRANSITIONS.failed).toEqual([]);
  });

  it('sessionId is stamped through every transition unchanged', () => {
    const s = markSaved(beginSave(markReadyToSave(reviewSession('session-42'))));
    expect(s.sessionId).toBe('session-42');
  });
});
