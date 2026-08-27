/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  action: vi.fn(),
}));

vi.mock('@/services/productCapabilityReanalysis', () => ({
  listAdminProductCapabilityReanalysisRequests: mocks.list,
  adminProductCapabilityReanalysisAction: mocks.action,
}));

import { AdminProductCapabilityReanalysisSection } from './AdminProductCapabilityReanalysisSection';

const request = {
  id: 'request-uuid',
  status: 'OPEN' as const,
  requestingUserId: 'contributor-user-uuid',
  canonicalProductId: 'haribo-product-uuid',
  productCode: 'PR-ING-007144',
  productName: 'HARIBO Quaxi',
  brand: 'HARIBO',
  ean: '4001686322536',
  requestedCapability: 'INGREDIENT' as const,
  attemptedContext: 'INGREDIENT_PICKER' as const,
  reasonCode: 'USER_EXPECTS_INGREDIENT_CAPABILITY' as const,
  currentClassification: 'TOPPING_ONLY' as const,
  identitySnapshot: { canonicalProductUuid: 'haribo-product-uuid' },
  capabilitySnapshot: {
    classification: 'TOPPING_ONLY',
    ingredientAllowed: false,
    toppingAllowed: true,
  },
  readinessSnapshot: { bindingStatus: 'ready', productAccuracy: 96 },
  contributionReference: { customerAddedProductId: 'customer-added-uuid' },
  evidenceReferences: [{ scanSessionId: 'scan-session-uuid' }],
  currentAuthority: { classification: 'TOPPING_ONLY' },
  assignedAdminUserId: null,
  reviewReason: null,
  submittedAt: '2026-08-27T07:00:00.000Z',
  reviewStartedAt: null,
  resolvedAt: null,
  updatedAt: '2026-08-27T07:00:00.000Z',
};

describe('AdminProductCapabilityReanalysisSection', () => {
  let host: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.list.mockResolvedValue([request]);
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

  const renderSection = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AdminProductCapabilityReanalysisSection />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it('shows product identity, exact attempted context, current/requested capability, and references', async () => {
    await renderSection();
    expect(document.body.textContent).toContain('Ponowna analiza capability');
    expect(document.body.textContent).toContain('PR-ING-007144 · HARIBO Quaxi');
    expect(document.body.textContent).toContain('EAN 4001686322536');
    expect(document.body.textContent).toContain('TOPPING_ONLY → INGREDIENT');

    const open = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Otwórz'),
    );
    await act(async () => open?.click());
    expect(document.body.textContent).toContain('INGREDIENT_PICKER');
    expect(document.body.textContent).toContain('contributor-user-uuid');
    expect(document.body.textContent).toContain('scan-session-uuid');
    expect(document.body.textContent).toContain('Canonical authority musi zostać opublikowane');
  });

  it('starts review through the permission-checked shared admin action', async () => {
    await renderSection();
    const open = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Otwórz'),
    );
    await act(async () => open?.click());
    const start = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Rozpocznij review',
    );
    await act(async () => start?.click());
    expect(mocks.action).toHaveBeenCalledWith('request-uuid', 'START_REVIEW', undefined);
  });
});
