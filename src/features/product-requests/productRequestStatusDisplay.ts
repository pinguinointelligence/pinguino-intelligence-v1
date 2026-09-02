import type { ProductRequestStatus } from '@/services/productRequests';

export const PRODUCT_REQUEST_STATUS_LABELS = {
  SUBMITTED: 'Wysłano',
  ADMIN_REVIEW: 'W trakcie weryfikacji',
  NEEDS_INFO: 'Wymaga uzupełnienia',
  RESUBMITTED: 'Wysłano ponownie',
  APPROVED: 'Zatwierdzone',
  REJECTED: 'Odrzucone',
  DUPLICATE: 'Duplikat',
  USER_CANCELED: 'Anulowane przez użytkownika',
} as const satisfies Readonly<Record<ProductRequestStatus, string>>;

export function productRequestStatusLabel(status: ProductRequestStatus): string {
  return PRODUCT_REQUEST_STATUS_LABELS[status];
}
