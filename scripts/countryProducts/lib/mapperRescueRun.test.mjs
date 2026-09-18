import assert from 'node:assert/strict';
import test from 'node:test';
import {
  manualEvidenceBlockFor,
  resumableDuplicateProductId,
  rescueInputCounts,
  routeMarketsFor,
  shouldSelectRescueRequest,
} from './mapperRescueRun.mjs';

test('routeMarketsFor returns normalized unique route markets', () => {
  assert.deepEqual(
    routeMarketsFor([{ country: 'no' }, { country: 'NO' }, { country: ' ch ' }]),
    ['NO', 'CH'],
  );
});

test('rescueInputCounts separates original not-ready, blocked, and resumed inputs', () => {
  assert.deepEqual(
    rescueInputCounts([
      { requestStatusBefore: 'ADMIN_REVIEW', priorIngestStatus: null },
      { requestStatusBefore: 'ADMIN_REVIEW', priorIngestStatus: 'blocked' },
      { requestStatusBefore: 'DUPLICATE', priorIngestStatus: null },
    ]),
    { selected: 3, approvalNotReady: 1, priorBlocked: 1, alreadyResolved: 1 },
  );
});

test('manualEvidenceBlockFor blocks only the reviewed unsupported assessment', () => {
  assert.equal(
    manualEvidenceBlockFor(
      'V23:SMP:GTIN-06426309006538',
      '2dd7b665a341b7a0693819a06d88ed69532168dae5c13c2139eee56c981fab98',
    ),
    'SOURCE_DOES_NOT_STATE_WATER_1_1',
  );
  assert.equal(
    manualEvidenceBlockFor('V23:SMP:GTIN-06426309006538', 'new-evidence-assessment'),
    null,
  );
});

test('resumableDuplicateProductId resumes only the exact product linked by a duplicate request', () => {
  const products = [{ id: 'product-a' }, { id: 'product-b' }];
  assert.equal(
    resumableDuplicateProductId(
      { status: 'DUPLICATE', duplicate_product_id: 'product-b' },
      products,
    ),
    'product-b',
  );
  assert.equal(
    resumableDuplicateProductId(
      { status: 'DUPLICATE', duplicate_product_id: 'product-c' },
      products,
    ),
    null,
  );
  assert.equal(
    resumableDuplicateProductId(
      { status: 'IN_REVIEW', duplicate_product_id: 'product-b' },
      products,
    ),
    null,
  );
});

test('shouldSelectRescueRequest skips terminal requests except an explicit apply resume', () => {
  assert.equal(shouldSelectRescueRequest(null, { applyReady: false, only: '' }), false);
  assert.equal(
    shouldSelectRescueRequest({ status: 'APPROVED' }, { applyReady: true, only: 'product' }),
    false,
  );
  assert.equal(
    shouldSelectRescueRequest({ status: 'DUPLICATE' }, { applyReady: false, only: '' }),
    false,
  );
  assert.equal(
    shouldSelectRescueRequest(
      { status: 'DUPLICATE' },
      { applyReady: true, only: 'V23:CREAM:GTIN-1' },
    ),
    true,
  );
  assert.equal(
    shouldSelectRescueRequest({ status: 'ADMIN_REVIEW' }, { applyReady: false, only: '' }),
    true,
  );
});
