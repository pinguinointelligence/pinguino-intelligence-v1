import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Admin backend is unavailable in this build.');
};

export type ProductRequestStatus =
  | 'SUBMITTED'
  | 'ADMIN_REVIEW'
  | 'NEEDS_INFO'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'USER_CANCELED';

export interface AdminOverview {
  users: { today: number; days7: number; days30: number };
  subscriptions: {
    active: number;
    pastDue: number;
    cancelAtPeriodEnd: number;
    newPaid: number;
    renewals: number;
    failedPayments: number;
    cancellations: number;
    refunds: number;
    grossRevenueCents: number;
    refundCents: number;
  };
  productRequests: {
    open: number;
    waitingAdmin: number;
    waitingUser: number;
    oldest: string | null;
    approvedToday: number;
  };
  partners: { active: number; pendingPayouts: number };
  operations: {
    failedStripeWebhooks: number;
    activeImports: number;
    failedImports: number;
    openCommunityReports: number;
  };
  environment: 'staging';
  knownIncidents: Array<Record<string, unknown>>;
}

export interface AdminProductRequest {
  id: string;
  requestNumber: number;
  status: ProductRequestStatus;
  source: 'SCANNER' | 'MANUAL_EVIDENCE' | 'ADMIN';
  requesterUserId: string;
  requesterEmail: string;
  marketCountryCode: string | null;
  countryOfOrigin: string | null;
  ean: string | null;
  name: string | null;
  brand: string | null;
  variant: string | null;
  netQuantity: string | null;
  manufacturer: string | null;
  assignedAdminUserId: string | null;
  submittedAt: string;
  updatedAt: string;
  adminNote: string | null;
  rejectionReason: string | null;
  duplicateProductId: string | null;
  approvedProductId: string | null;
  extractedData: Record<string, unknown>;
  userCorrections: Record<string, unknown>;
  adminVerifiedData: Record<string, unknown>;
  scannerProvenance: Record<string, unknown>;
  exactMatchCandidate: boolean;
  missingFields: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
}

export interface AdminCustomerAddedProduct {
  id: string;
  ean: string;
  productId: string;
  productCode: string;
  name: string;
  brand: string | null;
  status: 'PENDING' | 'CANONICALIZED' | 'ARCHIVED';
  distinctCustomerCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  productAccuracy: number;
  profile: Record<string, unknown>;
  behavior: Record<string, unknown>;
}

export async function listAdminCustomerAddedProducts(): Promise<AdminCustomerAddedProduct[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_customer_added_products_v1', {
    p_status: 'PENDING',
    p_limit: 500,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminCustomerAddedProduct[];
}

export async function canonicalizeAdminCustomerAddedProduct(
  pendingId: string,
): Promise<Record<string, unknown>> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_canonicalize_customer_added_v1', {
    p_customer_added_product_id: pendingId,
  });
  if (error) throw new Error(error.message);
  return record(data);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_overview_v1');
  if (error) throw new Error(error.message);
  return data as unknown as AdminOverview;
}

export async function listAdminProductRequests(
  status: ProductRequestStatus | 'ALL' = 'ALL',
): Promise<AdminProductRequest[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_product_requests_v1', {
    p_status: status,
    p_limit: 500,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminProductRequest[];
}

export async function adminProductRequestAction(
  requestId: string,
  action:
    | 'ADMIN_EVIDENCE_PATCH'
    | 'START_REVIEW'
    | 'REQUEST_INFO'
    | 'REJECT'
    | 'DUPLICATE'
    | 'APPROVE_LINK',
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_product_request_action_v1', {
    p_request_id: requestId,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const value = (primary: unknown, fallback: unknown): unknown =>
  primary === undefined || primary === null || primary === '' ? fallback : primary;

/**
 * Admin approval reuses catalog-submit and its shared PR profile/ProductBehavior
 * authority. `requireApprovalReady` makes the server validate 85+/role readiness
 * before creating a product; incomplete previews leave no orphan PR.
 */
export async function approveProductRequest(
  request: AdminProductRequest,
): Promise<Record<string, unknown>> {
  if (!supabase) return unavailable();
  const extracted = record(request.extractedData);
  const corrected = record(request.userCorrections);
  const verified = record(request.adminVerifiedData);
  const identity = {
    ...record(extracted.identity),
    ...record(corrected.identity),
    ...record(verified.identity),
  };
  const packageFacts = {
    ...record(extracted.package),
    ...record(corrected.package),
    ...record(verified.package),
  };
  const nutrition = {
    ...record(extracted.nutrition),
    ...record(corrected.nutrition),
    ...record(verified.nutrition),
  };
  const ean =
    String(value(verified.ean, value(corrected.ean, request.ean)) ?? '').replace(/\D/g, '') || null;
  const displayName = String(
    value(
      verified.productName,
      value(corrected.productName, value(identity.displayName, request.name)),
    ) ?? '',
  ).trim();
  const brand = String(
    value(verified.brand, value(corrected.brand, value(identity.brand, request.brand))) ?? '',
  ).trim();
  const input = {
    productKind: 'commercial_product',
    displayName,
    originalName: value(identity.originalName, displayName),
    originalLanguage: Array.isArray(identity.labelLanguages) ? identity.labelLanguages[0] : null,
    brand: brand || null,
    explicitlyUnbranded: identity.explicitlyUnbranded === true,
    canonicalFamily: null,
    category: value(verified.category, value(corrected.category, identity.category)),
    countryOfOrigin: value(
      verified.countryOfOrigin,
      value(corrected.countryOfOrigin, request.countryOfOrigin),
    ),
    ean,
    barcode: ean,
    provenance: 'product_add_request_admin_v1',
    facts: {
      productAddRequestId: request.id,
      packageSize: value(
        verified.netQuantity,
        value(corrected.netQuantity, value(packageFacts.netQuantityText, request.netQuantity)),
      ),
      ingredientsText: value(
        verified.ingredientsText,
        value(corrected.ingredientsText, extracted.ingredientsText),
      ),
      allergensText: value(
        verified.allergensText,
        value(corrected.allergensText, extracted.allergensText),
      ),
      mayContainAllergens: extracted.mayContainAllergens ?? [],
      labelLanguages: identity.labelLanguages ?? [],
      nutrition: {
        basis: nutrition.basis ?? null,
        energyKcal: nutrition.energyKcal ?? null,
        fat: nutrition.fat ?? null,
        saturatedFat: nutrition.saturatedFat ?? null,
        carbohydrate: nutrition.carbohydrate ?? null,
        sugars: nutrition.sugars ?? null,
        protein: nutrition.protein ?? null,
        salt: nutrition.salt ?? null,
        fibre: nutrition.fibre ?? null,
      },
    },
    manualProductProfileProposal: { authority: 'ADMIN_PRODUCT_REQUEST_V1', requestId: request.id },
  };
  const { data, error } = await supabase.functions.invoke('catalog-submit', {
    body: {
      source: 'admin',
      idempotencyKey: `product-request:${request.id}:approve-v1`,
      input,
      evidence: {
        productAddRequestId: request.id,
        evidenceIds: request.evidence.map((item) => item.id).filter(Boolean),
        userCorrectionsAreEvidenceOnly: true,
        adminVerifiedData: verified,
        approvedByAdmin: true,
      },
      privateOverlay: {},
      market: request.marketCountryCode,
      requireApprovalReady: true,
    },
  });
  if (error) throw new Error(error.message);
  const result = record(data);
  if (result.kind === 'approval_not_ready') return result;
  const productId = typeof result.productId === 'string' ? result.productId : null;
  if (!productId) throw new Error('Canonical approval did not return a product ID.');
  await adminProductRequestAction(request.id, 'APPROVE_LINK', { productId });
  return result;
}

export async function getAdminDirectory<T = Record<string, unknown>>(
  section: 'USERS' | 'PARTNERS' | 'FINANCE' | 'AUDIT' | 'COMMUNITY',
): Promise<T[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_directory_v1', {
    p_section: section,
    p_limit: 500,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as T[];
}

export async function activatePartner(input: {
  userId: string;
  displayName: string;
  slug: string;
  reason: string;
}): Promise<string> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_activate_partner_for_user_v1', {
    p_user_id: input.userId,
    p_display_name: input.displayName,
    p_slug: input.slug,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function setPartnerStatus(
  partnerId: string,
  status: 'active' | 'suspended' | 'terminated',
  reason: string,
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_partner_status_v1', {
    p_partner_id: partnerId,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export interface AdminCatalogProduct {
  id: string;
  articleId: string;
  origin: 'PI' | 'PR' | 'LEGACY_PM' | string;
  name: string | null;
  brand: string | null;
  ean: string | null;
  productKind: string;
  visibility: string;
  active: boolean;
  verificationStatus: string;
  countryOfOrigin: string | null;
  mergedIntoProductId: string | null;
  currentVersion: Record<string, unknown> | null;
  behavior: Record<string, unknown> | null;
  variants: Array<Record<string, unknown>>;
  contributorRequests: Array<Record<string, unknown>>;
  updatedAt: string;
}

export interface AdminCountryOverview {
  code: string;
  name: string;
  active: boolean;
  totalApprovedProducts: number;
  pendingRequests: number;
  reviewQueue: number;
  toppingOnly: number;
  baseReady: number;
  lastUpdated: string | null;
}

export async function getAdminCatalog(query = ''): Promise<AdminCatalogProduct[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_catalog_v1', {
    p_query: query || null,
    p_limit: 250,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminCatalogProduct[];
}

export async function getAdminCountryOverview(): Promise<AdminCountryOverview[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_country_overview_v1');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminCountryOverview[];
}

export async function adminCatalogAction(
  productId: string,
  action: 'ADD_MARKET' | 'REMOVE_MARKET' | 'PUBLISH' | 'UNPUBLISH' | 'RETIRE' | 'MERGE_DUPLICATE',
  payload: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_catalog_action_v1', {
    p_product_id: productId,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
}

export async function adminUserAction(
  userId: string,
  action: 'SUSPEND' | 'REACTIVATE' | 'GRANT_COMPLIMENTARY' | 'REVOKE_COMPLIMENTARY',
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_user_action_v1', {
    p_user_id: userId,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
  return data as unknown as Record<string, unknown>;
}

export async function adminCommunityAction(
  reportId: string,
  action: 'START_REVIEW' | 'DISMISS' | 'HIDE_PUBLICATION' | 'RESTORE_PUBLICATION',
  reason: string,
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_community_action_v1', {
    p_report_id: reportId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export interface AdminInvites {
  home: Array<Record<string, unknown>>;
  partner: Array<Record<string, unknown>>;
}

export async function getAdminInvites(): Promise<AdminInvites> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_invites_v1');
  if (error) throw new Error(error.message);
  return data as unknown as AdminInvites;
}

async function invokeAdminControl<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.functions.invoke('admin-control', { body });
  if (error) throw new Error(error.message);
  const response = data as Record<string, unknown> | null;
  if (typeof response?.error === 'string') throw new Error(response.error);
  return data as T;
}

export async function invitePartnerByEmail(input: {
  email: string;
  displayName: string;
  slug: string;
}): Promise<Record<string, unknown>> {
  return invokeAdminControl({ action: 'INVITE_PARTNER', ...input });
}

export async function resendPartnerInvitation(invitationId: string): Promise<void> {
  await invokeAdminControl({ action: 'RESEND_PARTNER_INVITE', invitationId });
}

export async function mintHomeInvite(email: string): Promise<{
  inviteId: string;
  code: string;
  expiresAt: string;
}> {
  return invokeAdminControl({ action: 'MINT_HOME_INVITE', email, expiresInDays: 30 });
}

export async function provisionPartnerConnect(partnerId: string): Promise<Record<string, unknown>> {
  return invokeAdminControl({ action: 'PROVISION_CONNECT', partnerId });
}

export async function getSignedRequestEvidence(requestId: string): Promise<{
  evidence: Array<Record<string, unknown>>;
  expiresInSeconds: number;
}> {
  return invokeAdminControl({ action: 'SIGNED_REQUEST_EVIDENCE', requestId });
}

export async function addPartnerAdminNote(partnerId: string, note: string): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_partner_note_v1', {
    p_partner_id: partnerId,
    p_note: note,
  });
  if (error) throw new Error(error.message);
}

export async function setPartnerProfileStatus(
  partnerId: string,
  action: 'APPROVE' | 'DISABLE' | 'REMOVE_LOGO',
  reason: string,
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_partner_profile_action_v1', {
    p_partner_id: partnerId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function setPartnerLinkStatus(
  linkId: string,
  action: 'DISABLE' | 'REACTIVATE',
  reason: string,
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_partner_link_action_v1', {
    p_link_id: linkId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function setPartnerCodeStatus(
  codeId: string,
  action: 'DISABLE' | 'REACTIVATE',
  reason: string,
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_partner_code_action_v1', {
    p_code_id: codeId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export interface AdminOperations {
  environment: 'staging';
  backendProjectRef: string;
  scannerFailures: Array<Record<string, unknown>>;
  imports: Array<Record<string, unknown>>;
  stripeFailures: Array<Record<string, unknown>>;
  providerFailures: Array<Record<string, unknown>>;
  notificationDeliveryFailures: Array<Record<string, unknown>>;
  notificationDeliveryInstrumentation: string;
  knownIncidents: Array<Record<string, unknown>>;
}

export async function getAdminOperations(): Promise<AdminOperations> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_operations_v1');
  if (error) throw new Error(error.message);
  return data as unknown as AdminOperations;
}

export async function getAdminCommissionRules(): Promise<Array<Record<string, unknown>>> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_commission_rules_v1');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
}

export async function setAdminCommissionRule(input: {
  product: 'home' | 'pro';
  cadence: 'monthly' | 'annual';
  tier: 'standard' | 'gold' | 'elite';
  amountCents: number;
  reason: string;
}): Promise<number> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_set_commission_rule_v1', {
    p_product: input.product,
    p_cadence: input.cadence,
    p_tier: input.tier,
    p_amount_cents: input.amountCents,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}
