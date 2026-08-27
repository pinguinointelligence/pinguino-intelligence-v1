import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Product capability review backend is unavailable in this build.');
};

export type ProductCapability = 'INGREDIENT' | 'TOPPING';
export type ProductPickerAttemptContext = 'INGREDIENT_PICKER' | 'TOPPING_PICKER';
export type ProductCapabilityReanalysisReason =
  | 'USER_EXPECTS_INGREDIENT_CAPABILITY'
  | 'USER_EXPECTS_TOPPING_CAPABILITY';
export type ProductCapabilityClassification =
  | 'INGREDIENT_ONLY'
  | 'TOPPING_ONLY'
  | 'BOTH'
  | 'NEITHER';
export type ProductCapabilityReanalysisStatus = 'OPEN' | 'IN_REVIEW' | 'ACCEPTED' | 'REJECTED';

export interface ProductCapabilityReviewEligibility {
  eligible: boolean;
  existingRequestStatus: Extract<ProductCapabilityReanalysisStatus, 'OPEN' | 'IN_REVIEW'> | null;
  currentClassification: ProductCapabilityClassification | null;
}

export interface ProductCapabilityReviewSubmission {
  requestId: string;
  status: Extract<ProductCapabilityReanalysisStatus, 'OPEN' | 'IN_REVIEW'>;
  alreadyExists: boolean;
}

export interface AdminProductCapabilityReanalysisRequest {
  id: string;
  status: ProductCapabilityReanalysisStatus;
  requestingUserId: string;
  canonicalProductId: string;
  productCode: string | null;
  productName: string;
  brand: string | null;
  ean: string | null;
  requestedCapability: ProductCapability;
  attemptedContext: ProductPickerAttemptContext;
  reasonCode: ProductCapabilityReanalysisReason;
  currentClassification: ProductCapabilityClassification;
  identitySnapshot: Record<string, unknown>;
  capabilitySnapshot: Record<string, unknown>;
  readinessSnapshot: Record<string, unknown>;
  contributionReference: Record<string, unknown>;
  evidenceReferences: Array<Record<string, unknown>>;
  currentAuthority: Record<string, unknown> | null;
  assignedAdminUserId: string | null;
  reviewReason: string | null;
  resolutionAuthority: Record<string, unknown> | null;
  submittedAt: string;
  reviewStartedAt: string | null;
  resolvedAt: string | null;
  updatedAt: string;
}

export const attemptedContextForCapability = (
  capability: ProductCapability,
): ProductPickerAttemptContext =>
  capability === 'INGREDIENT' ? 'INGREDIENT_PICKER' : 'TOPPING_PICKER';

export async function getProductCapabilityReviewEligibility(
  productId: string,
  requestedCapability: ProductCapability,
): Promise<ProductCapabilityReviewEligibility> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc(
    'gellatti_product_capability_reanalysis_eligibility_v1',
    {
      p_product_id: productId,
      p_requested_capability: requestedCapability,
    },
  );
  if (error) throw new Error(error.message);
  return data as unknown as ProductCapabilityReviewEligibility;
}

export async function requestProductCapabilityReview(input: {
  productId: string;
  requestedCapability: ProductCapability;
  attemptedContext: ProductPickerAttemptContext;
}): Promise<ProductCapabilityReviewSubmission> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_request_product_capability_reanalysis_v1', {
    p_product_id: input.productId,
    p_requested_capability: input.requestedCapability,
    p_attempted_context: input.attemptedContext,
  });
  if (error) throw new Error(error.message);
  return data as unknown as ProductCapabilityReviewSubmission;
}

export async function listAdminProductCapabilityReanalysisRequests(
  status: ProductCapabilityReanalysisStatus | 'ALL' = 'OPEN',
): Promise<AdminProductCapabilityReanalysisRequest[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_product_capability_reanalysis_v1', {
    p_status: status,
    p_limit: 500,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminProductCapabilityReanalysisRequest[];
}

export async function adminProductCapabilityReanalysisAction(
  requestId: string,
  action: 'START_REVIEW' | 'ACCEPT' | 'REJECT',
  reason?: string,
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_product_capability_reanalysis_action_v1', {
    p_request_id: requestId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}
