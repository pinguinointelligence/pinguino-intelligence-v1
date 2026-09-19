import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { savedProductNotice } from './scanFlowLogic';

/*
  The saved screen promised privacy for every outcome, including the one that publishes.

  Owner scan of 2026-09-07 21:16 UTC, EAN 7340222800457: the scan took the PR route and wrote
  PR-ING-007196 with `product_kind: commercial_product`, `visibility: shared`,
  `owner_user_id: null` — a shared registry row — and the screen said "prywatny, widoczny tylko na
  Twoim koncie". A customer reading that has been told the opposite of what happened, in the one
  direction where being wrong actually matters.
*/
const PRIVATE = 'Zapisano jako Twój produkt (prywatny, widoczny tylko na Twoim koncie).';

describe('the saved message follows what was actually saved', () => {
  it('promises privacy only for the customer’s own provisional row', () => {
    expect(
      savedProductNotice({ entityKind: 'customer_provisional', productCode: 'PM-ING-000123' }),
    ).toBe(PRIVATE);
  });

  it('never calls a shared registry row private', () => {
    for (const product of [
      { entityKind: 'commercial_product', productCode: 'PR-ING-007196' },
      { entityKind: 'commercial_product', productCode: 'PM-ING-000900' },
      { entityKind: 'pi_base', productCode: 'PI-ING-000494' },
      { entityKind: null, productCode: null },
      {},
    ]) {
      expect(savedProductNotice(product), JSON.stringify(product)).not.toBe(PRIVATE);
      expect(savedProductNotice(product)).not.toContain('widoczny tylko na Twoim koncie');
    }
  });

  it('does not read privacy off the article code, because the code does not carry it', () => {
    /*
      On the live catalogue 15 `PM-` products are `commercial_product` / `shared` and exactly one
      is `account_private`. A prefix rule would restate the same false promise with extra steps, so
      the same code must answer differently depending on what the row actually is.
    */
    expect(
      savedProductNotice({ entityKind: 'customer_provisional', productCode: 'PM-ING-000900' }),
    ).toBe(PRIVATE);
    expect(
      savedProductNotice({ entityKind: 'commercial_product', productCode: 'PM-ING-000900' }),
    ).not.toBe(PRIVATE);
  });

  it('still tells the customer their own commercial terms stay private', () => {
    // Losing the privacy promise entirely would be its own kind of wrong: what IS private here is
    // the customer's pricing, suppliers, notes and stock, and that remains true on both routes.
    expect(savedProductNotice({ entityKind: 'commercial_product' })).toContain(
      'pozostają prywatne',
    );
  });

  it('is the sentence the screen actually renders', () => {
    const screen = readFileSync(
      resolve(process.cwd(), 'src/features/scan-flow/ScanFlow.tsx'),
      'utf8',
    );
    expect(screen).toContain('savedProductNotice(phase.product)');
    // The unconditional promise must be gone from the component itself.
    expect(screen).not.toContain(PRIVATE);
  });
});
