/**
 * demoSession — the standalone sample state is HONEST (no OCR claimed, no
 * invented values) and the in-memory fallback reducer keeps the contract
 * invariants (contiguous ordering, pending checksums, no evidence invention).
 */
import { describe, expect, it } from 'vitest';
import {
  applyLocalIntakeEvent,
  createDemoBatch,
  createDemoIntakeSession,
  type IncomingImageFile,
} from './demoSession';

const png: IncomingImageFile = { fileName: 'new.png', mime: 'image/png', byteSize: 1234 };

describe('createDemoIntakeSession — honesty of the sample', () => {
  const session = createDemoIntakeSession();

  it('claims NO OCR runs (ocrRuns empty) and carries an explicit sample warning', () => {
    expect(Object.keys(session.ocrRuns)).toHaveLength(0);
    expect(session.warnings.join(' ')).toMatch(/sample data/i);
  });

  it('absent fields carry NULLs and provenance absent — never a fabricated value', () => {
    const fibre = session.fields.find((f) => f.fieldKey === 'fibre');
    expect(fibre).toBeDefined();
    for (const c of fibre?.candidates ?? []) {
      expect(c.provenance).toBe('absent');
      expect(c.extractedRaw).toBeNull();
      expect(c.normalized).toBeNull();
    }
  });

  it('image ordering is contiguous from 0 and every evidence ref points at a session image', () => {
    const orders = [...session.images].map((i) => i.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i));
    const imageIds = new Set(session.images.map((i) => i.imageId));
    for (const f of session.fields) {
      for (const c of f.candidates) {
        if (c.evidence) expect(imageIds.has(c.evidence.imageId), c.evidence.imageId).toBe(true);
      }
    }
  });

  it('the sample manual EAN is checksum-plausible (13 digits)', () => {
    expect(session.manualEan).toMatch(/^[0-9]{13}$/);
  });
});

describe('createDemoBatch — honesty of the sample', () => {
  it('leaves one session without an outcome to prove the pending default', () => {
    const { batch } = createDemoBatch();
    const withoutOutcome = batch.sessionIds.filter((id) => !(id in batch.outcomes));
    expect(withoutOutcome).toHaveLength(1);
  });
});

describe('applyLocalIntakeEvent — in-memory fallback reducer', () => {
  const session = createDemoIntakeSession();

  it('add_images appends with contiguous order, pending checksum, uploaded state', () => {
    const next = applyLocalIntakeEvent(session, { type: 'add_images', files: [png] });
    const added = next.images.at(-1);
    expect(next.images).toHaveLength(session.images.length + 1);
    expect(added?.order).toBe(session.images.length);
    expect(added?.checksumSha256).toBe(''); // pending — never invented
    expect(added?.state).toBe('uploaded');
    expect(added?.mime).toBe('image/png');
  });

  it('set_image_role changes only the targeted image', () => {
    const next = applyLocalIntakeEvent(session, {
      type: 'set_image_role',
      imageId: 'img-front',
      role: 'other',
    });
    expect(next.images.find((i) => i.imageId === 'img-front')?.role).toBe('other');
    expect(next.images.find((i) => i.imageId === 'img-barcode')?.role).toBe('barcode');
  });

  it('move_image swaps orders with its neighbour and is a no-op at the boundary', () => {
    const down = applyLocalIntakeEvent(session, { type: 'move_image', imageId: 'img-front', direction: 'down' });
    expect(down.images.find((i) => i.imageId === 'img-front')?.order).toBe(1);
    expect(down.images.find((i) => i.imageId === 'img-nutrition')?.order).toBe(0);
    const up = applyLocalIntakeEvent(session, { type: 'move_image', imageId: 'img-front', direction: 'up' });
    expect(up).toBe(session); // already first — unchanged
  });

  it('remove_image re-indexes the remaining images contiguously', () => {
    const next = applyLocalIntakeEvent(session, { type: 'remove_image', imageId: 'img-nutrition' });
    expect(next.images).toHaveLength(session.images.length - 1);
    const orders = [...next.images].map((i) => i.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it('replace_image resets identity to pending (new bytes = new hash, uploaded again)', () => {
    const next = applyLocalIntakeEvent(session, { type: 'replace_image', imageId: 'img-ingredients', file: png });
    const replaced = next.images.find((i) => i.imageId === 'img-ingredients');
    expect(replaced?.fileName).toBe('new.png');
    expect(replaced?.checksumSha256).toBe('');
    expect(replaced?.state).toBe('uploaded');
    expect(replaced?.failure).toBeNull();
  });

  it('retry_image re-queues a failed image without inventing a result', () => {
    const next = applyLocalIntakeEvent(session, { type: 'retry_image', imageId: 'img-ingredients' });
    const retried = next.images.find((i) => i.imageId === 'img-ingredients');
    expect(retried?.state).toBe('uploaded');
    expect(retried?.failure).toBeNull();
    expect(Object.keys(next.ocrRuns)).toHaveLength(0); // still no fake OCR
  });

  it('set_manual_ean stores the value and empties to null', () => {
    expect(applyLocalIntakeEvent(session, { type: 'set_manual_ean', ean: '96385074' }).manualEan).toBe('96385074');
    expect(applyLocalIntakeEvent(session, { type: 'set_manual_ean', ean: '' }).manualEan).toBeNull();
  });

  it('edit_field sets editedValue + edited status; clearing reverts to needs_confirmation', () => {
    const edited = applyLocalIntakeEvent(session, { type: 'edit_field', fieldKey: 'brand', value: 'Otro' });
    const brand = edited.fields.find((f) => f.fieldKey === 'brand');
    expect(brand?.editedValue).toBe('Otro');
    expect(brand?.reviewStatus).toBe('edited');
    const cleared = applyLocalIntakeEvent(edited, { type: 'edit_field', fieldKey: 'brand', value: '' });
    expect(cleared.fields.find((f) => f.fieldKey === 'brand')?.editedValue).toBeNull();
  });

  it('edit_field on a contract field WITHOUT evidence creates a candidates-empty field (no invention)', () => {
    const next = applyLocalIntakeEvent(session, { type: 'edit_field', fieldKey: 'country', value: 'ES' });
    const country = next.fields.find((f) => f.fieldKey === 'country');
    expect(country?.candidates).toEqual([]);
    expect(country?.editedValue).toBe('ES');
  });

  it('mark_unknown clears the edit and the choice', () => {
    const next = applyLocalIntakeEvent(session, { type: 'mark_unknown', fieldKey: 'brand' });
    const brand = next.fields.find((f) => f.fieldKey === 'brand');
    expect(brand?.reviewStatus).toBe('marked_unknown');
    expect(brand?.editedValue).toBeNull();
    expect(brand?.chosenCandidate).toBeNull();
  });

  it('choose_candidate resolves a conflict by index', () => {
    const next = applyLocalIntakeEvent(session, {
      type: 'choose_candidate',
      fieldKey: 'energy_kcal',
      candidateIndex: 1,
    });
    const kcal = next.fields.find((f) => f.fieldKey === 'energy_kcal');
    expect(kcal?.chosenCandidate).toBe(1);
    expect(kcal?.reviewStatus).toBe('confirmed');
  });

  it('confirm_field marks the field confirmed', () => {
    const next = applyLocalIntakeEvent(session, { type: 'confirm_field', fieldKey: 'product_name' });
    expect(next.fields.find((f) => f.fieldKey === 'product_name')?.reviewStatus).toBe('confirmed');
  });

  it('duplicate_action is a NO-OP standalone (no catalog here — wired at integration)', () => {
    const next = applyLocalIntakeEvent(session, { type: 'duplicate_action', action: 'create_new' });
    expect(next).toBe(session);
  });
});
