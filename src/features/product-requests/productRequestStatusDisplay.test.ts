import { describe, expect, it } from 'vitest';
import {
  PRODUCT_REQUEST_STATUS_LABELS,
  productRequestStatusLabel,
} from './productRequestStatusDisplay';

describe('product request status display labels', () => {
  it('uses the owner-approved Polish label for every contract status', () => {
    expect(PRODUCT_REQUEST_STATUS_LABELS).toEqual({
      SUBMITTED: 'Wysłano',
      ADMIN_REVIEW: 'W trakcie weryfikacji',
      NEEDS_INFO: 'Wymaga uzupełnienia',
      RESUBMITTED: 'Wysłano ponownie',
      APPROVED: 'Zatwierdzone',
      REJECTED: 'Odrzucone',
      DUPLICATE: 'Duplikat',
      USER_CANCELED: 'Anulowane przez użytkownika',
    });
  });

  it('returns display copy without changing the underlying status value', () => {
    const status = 'ADMIN_REVIEW' as const;

    expect(productRequestStatusLabel(status)).toBe('W trakcie weryfikacji');
    expect(status).toBe('ADMIN_REVIEW');
  });
});
