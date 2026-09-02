import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as { message: string } | null },
  rpc: vi.fn(),
}));

harness.rpc.mockImplementation(async () => harness.result);

vi.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: harness.rpc },
  isSupabaseConfigured: true,
}));

const {
  adminProductCapabilityReanalysisAction,
  attemptedContextForCapability,
  getProductCapabilityReviewEligibility,
  requestProductCapabilityReview,
} = await import('./productCapabilityReanalysis');

describe('productCapabilityReanalysis service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.result = { data: null, error: null };
  });

  it('maps each requested capability to its failed picker context', () => {
    expect(attemptedContextForCapability('INGREDIENT')).toBe('INGREDIENT_PICKER');
    expect(attemptedContextForCapability('TOPPING')).toBe('TOPPING_PICKER');
  });

  it('reads only the customer-safe eligibility projection', async () => {
    harness.result.data = {
      eligible: true,
      existingRequestStatus: null,
      currentClassification: 'TOPPING_ONLY',
    };
    await expect(getProductCapabilityReviewEligibility('product-1', 'INGREDIENT')).resolves.toEqual(
      harness.result.data,
    );
    expect(harness.rpc).toHaveBeenCalledWith(
      'gellatti_product_capability_reanalysis_eligibility_v1',
      { p_product_id: 'product-1', p_requested_capability: 'INGREDIENT' },
    );
  });

  it('submits the one-click context and preserves the duplicate response', async () => {
    harness.result.data = {
      requestId: 'request-1',
      status: 'OPEN',
      alreadyExists: true,
    };
    await expect(
      requestProductCapabilityReview({
        productId: 'product-1',
        requestedCapability: 'TOPPING',
        attemptedContext: 'TOPPING_PICKER',
      }),
    ).resolves.toEqual(harness.result.data);
    expect(harness.rpc).toHaveBeenCalledWith('gellatti_request_product_capability_reanalysis_v1', {
      p_product_id: 'product-1',
      p_requested_capability: 'TOPPING',
      p_attempted_context: 'TOPPING_PICKER',
    });
  });

  it('keeps the review action on its permission-checked domain RPC', async () => {
    harness.result.data = { ok: true };
    await adminProductCapabilityReanalysisAction('request-1', 'REJECT', 'Not supported');
    expect(harness.rpc).toHaveBeenLastCalledWith(
      'gellatti_admin_product_capability_reanalysis_action_v1',
      { p_request_id: 'request-1', p_action: 'REJECT', p_reason: 'Not supported' },
    );
  });

  it('surfaces backend authorization and validation failures', async () => {
    harness.result.error = { message: 'exact_product_contributor_required' };
    await expect(
      requestProductCapabilityReview({
        productId: 'product-1',
        requestedCapability: 'INGREDIENT',
        attemptedContext: 'INGREDIENT_PICKER',
      }),
    ).rejects.toThrow('exact_product_contributor_required');
  });
});
