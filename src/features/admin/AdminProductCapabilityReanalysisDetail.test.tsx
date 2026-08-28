/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ action: vi.fn() }));

vi.mock('@/services/productCapabilityReanalysis', () => ({
  adminProductCapabilityReanalysisAction: mocks.action,
}));

import { AdminProductCapabilityReanalysisDetail } from './AdminProductCapabilityReanalysisDetail';
import type { AdminProductCapabilityReanalysisQueueRequest } from '@/services/adminControl';

const request: AdminProductCapabilityReanalysisQueueRequest = {
  requestType: 'PRODUCT_CAPABILITY_REANALYSIS',
  id: '7f4b5acc-28c7-4ed6-92e7-c8e3847d2276',
  requestNumber: null,
  status: 'OPEN',
  source: 'CONTRIBUTOR_REANALYSIS',
  requesterUserId: 'contributor-user-uuid',
  requesterEmail: 'pro@pro.com',
  marketCountryCode: null,
  countryOfOrigin: null,
  ean: '4001686322536',
  name: 'HARIBO Quaxi',
  brand: 'HARIBO',
  variant: null,
  netQuantity: null,
  manufacturer: null,
  assignedAdminUserId: null,
  submittedAt: '2026-08-27T08:16:55.042446Z',
  updatedAt: '2026-08-27T08:16:55.042446Z',
  adminNote: null,
  rejectionReason: null,
  duplicateProductId: null,
  approvedProductId: null,
  extractedData: {},
  userCorrections: {},
  adminVerifiedData: {},
  scannerProvenance: {},
  exactMatchCandidate: true,
  missingFields: [],
  events: [],
  evidence: [],
  canonicalProductId: '363ff5b6-0b7b-41a9-acbb-394daa26b4d2',
  productCode: 'PR-ING-007144',
  requestingUserId: 'contributor-user-uuid',
  requestedCapability: 'INGREDIENT',
  attemptedContext: 'INGREDIENT_PICKER',
  reasonCode: 'USER_EXPECTS_INGREDIENT_CAPABILITY',
  currentClassification: 'TOPPING_ONLY',
  identitySnapshot: { canonicalProductUuid: '363ff5b6-0b7b-41a9-acbb-394daa26b4d2' },
  capabilitySnapshot: {
    classification: 'TOPPING_ONLY',
    ingredientAllowed: false,
    toppingAllowed: true,
  },
  readinessSnapshot: { bindingStatus: 'ready', productAccuracy: 96 },
  contributionReference: {
    customerAddedProductId: 'customer-added-uuid',
    firstScanSessionId: 'scan-session-uuid',
  },
  evidenceReferences: [{ scanSessionId: 'scan-session-uuid' }],
  currentAuthority: { classification: 'TOPPING_ONLY', ingredientAllowed: false },
  reviewReason: null,
  reviewStartedAt: null,
  resolvedAt: null,
};

describe('AdminProductCapabilityReanalysisDetail', () => {
  let host: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.action.mockResolvedValue(undefined);
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  const renderDetail = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AdminProductCapabilityReanalysisDetail request={request} onClose={vi.fn()} />
        </QueryClientProvider>,
      );
    });
  };

  it('shows the exact request contract and original Scanner attribution', async () => {
    await renderDetail();
    const text = document.body.textContent ?? '';
    for (const value of [
      'Ponowna analiza',
      'HARIBO Quaxi',
      'PR-ING-007144',
      '4001686322536',
      'Obecnie',
      'Topping',
      'Sprawdź, czy produkt może działać również jako składnik',
      'Wyszukano w Dodaj składnik',
      'pro@pro.com',
      'scan-session-uuid',
      '7f4b5acc-28c7-4ed6-92e7-c8e3847d2276',
    ]) {
      expect(text).toContain(value);
    }
  });

  it('offers the required non-automatic Admin actions', async () => {
    await renderDetail();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.some((button) => button.textContent === 'Rozpocznij analizę')).toBe(true);
    expect(buttons.some((button) => button.textContent === 'Zatwierdź zmianę')).toBe(true);
    expect(buttons.some((button) => button.textContent === 'Pozostaw bez zmian')).toBe(true);

    await act(async () =>
      buttons.find((button) => button.textContent === 'Rozpocznij analizę')?.click(),
    );
    expect(mocks.action).toHaveBeenCalledWith(
      '7f4b5acc-28c7-4ed6-92e7-c8e3847d2276',
      'START_REVIEW',
      undefined,
    );
  });
});
