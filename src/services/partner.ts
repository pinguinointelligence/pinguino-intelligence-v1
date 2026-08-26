import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => { throw new Error('Partner backend is unavailable in this build.'); };

export interface PartnerCodeAnalytics {
  id: string;
  code: string;
  slug: string;
  label: string | null;
  status: 'active' | 'retired' | 'blocked';
  createdAt: string;
  clickCount: number;
  uniqueVisitors: number;
  signups: number;
  paidCustomers: number;
  grossAttributedRevenueCents: number;
  refundCommissionCents: number;
  pendingCommissionCents: number;
  approvedCommissionCents: number;
  paidCommissionCents: number;
}

export interface PartnerWorkspace {
  ok: boolean;
  reason?: string;
  status?: string;
  partner?: {
    id: string;
    status: string;
    tier: string;
    onboardingComplete: boolean;
    payoutsEnabled: boolean;
    connectAccountPresent: boolean;
  };
  profile?: {
    slug: string;
    displayName: string;
    logoPath: string | null;
    shortDescription: string | null;
    websiteUrl: string | null;
    socialLinks: Record<string, string>;
    defaultDestinationPath: string;
    moderationStatus: string;
    updatedAt: string;
  };
  codes?: PartnerCodeAnalytics[];
  links?: Array<Record<string, unknown>>;
  commissions?: Array<Record<string, unknown>>;
  payouts?: Array<Record<string, unknown>>;
}

export async function getPartnerWorkspace(): Promise<PartnerWorkspace> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_partner_workspace_v1');
  if (error) throw new Error(error.message);
  return data as unknown as PartnerWorkspace;
}

export async function managePartnerCode(input: {
  action: 'CREATE' | 'ARCHIVE';
  code?: string;
  label?: string;
  codeId?: string;
}): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_partner_manage_code_v1', {
    p_action: input.action,
    p_code: input.code ?? '',
    p_label: input.label ?? null,
    p_code_id: input.codeId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updatePartnerProfile(profile: {
  displayName: string;
  shortDescription: string;
  websiteUrl: string;
  socialLinks: Record<string, string>;
  defaultDestinationPath: string;
}): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_partner_update_profile_v1', {
    p_profile: profile,
  });
  if (error) throw new Error(error.message);
}

const imageDimensions = async (file: File): Promise<{ width: number; height: number }> => {
  const bitmap = await createImageBitmap(file);
  try { return { width: bitmap.width, height: bitmap.height }; }
  finally { bitmap.close(); }
};

export async function uploadPartnerLogo(file: File): Promise<void> {
  if (!supabase) return unavailable();
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Logo musi być plikiem JPG, PNG lub WEBP.');
  if (file.size < 1 || file.size > 2 * 1024 * 1024) throw new Error('Logo musi mieć maksymalnie 2 MB.');
  const dimensions = await imageDimensions(file);
  if (dimensions.width < 128 || dimensions.height < 128 || dimensions.width > 2000 || dimensions.height > 2000) {
    throw new Error('Logo musi mieć wymiary od 128×128 do 2000×2000 px.');
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Zaloguj się jako Partner.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${auth.user.id}/logo-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('partner-public-assets').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { error: registerError } = await supabase.rpc('gellatti_partner_register_logo_v1', {
    p_storage_path: path,
    p_mime_type: file.type,
    p_byte_size: file.size,
    p_width: dimensions.width,
    p_height: dimensions.height,
  });
  if (registerError) throw new Error(registerError.message);
}

export async function createPartnerContentLink(input: {
  codeId: string;
  destinationType: string;
  destinationPath: string;
  label?: string;
}): Promise<{ linkSlug: string }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_partner_create_content_link_v1', {
    p_partner_code_id: input.codeId,
    p_destination_type: input.destinationType,
    p_destination_path: input.destinationPath,
    p_label: input.label ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { linkSlug: string };
}

export async function startConnectOnboarding(): Promise<string> {
  if (!supabase) return unavailable();
  const origin = window.location.origin;
  const { data, error } = await supabase.functions.invoke('create-connect-onboarding-link', {
    body: {
      returnUrl: `${origin}/partner?section=payouts&connect=returned`,
      refreshUrl: `${origin}/partner?section=payouts&connect=refresh`,
    },
  });
  if (error) throw new Error(error.message);
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('Connect onboarding URL is unavailable.');
  return url;
}

export interface ReferralEvidence {
  clickId: string;
  attributionId?: string;
  expiresAt: string;
}

export interface PartnerPublicResolution {
  clickId: string;
  expiresAt: string;
  destinationPath: string;
  contentLink: boolean;
  profile: {
    slug: string;
    displayName: string;
    shortDescription: string | null;
    websiteUrl: string | null;
    socialLinks: Record<string, string>;
    logoUrl: string | null;
  };
}

export async function resolvePartnerPublicLink(input: {
  partnerSlug: string;
  code: string;
  linkSlug?: string | null;
}): Promise<PartnerPublicResolution> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.functions.invoke('partner-link-resolve', {
    body: { action: 'RESOLVE', ...input, linkSlug: input.linkSlug ?? null },
  });
  const result = data as PartnerPublicResolution | null;
  if (error || !result || typeof result.clickId !== 'string') {
    throw new Error('partner_link_not_found');
  }
  return result;
}

const REFERRAL_KEY = 'gellatti_referral_evidence_v1';

export function saveReferralEvidence(evidence: ReferralEvidence): void {
  localStorage.setItem(REFERRAL_KEY, JSON.stringify(evidence));
}

export function getReferralEvidence(): ReferralEvidence | null {
  try {
    const raw = localStorage.getItem(REFERRAL_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ReferralEvidence>;
    if (typeof value.clickId !== 'string' || typeof value.expiresAt !== 'string') return null;
    if (Date.parse(value.expiresAt) <= Date.now()) { localStorage.removeItem(REFERRAL_KEY); return null; }
    return value as ReferralEvidence;
  } catch { return null; }
}

export async function claimReferralEvidence(): Promise<string | null> {
  if (!supabase) return null;
  const evidence = getReferralEvidence();
  if (!evidence) return null;
  if (evidence.attributionId) return evidence.attributionId;
  const { data, error } = await supabase.functions.invoke('partner-link-resolve', {
    body: { action: 'CLAIM', clickId: evidence.clickId },
  });
  if (error) return null;
  const attributionId = (data as { attributionId?: unknown } | null)?.attributionId;
  if (typeof attributionId !== 'string') return null;
  saveReferralEvidence({ ...evidence, attributionId });
  return attributionId;
}
