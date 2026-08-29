import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Franchise backend is unavailable in this build.');
};

/** The four approved Gellatti concepts. The raw values are contracts and are
 *  never translated — the customer sees them through a display map. */
export type FranchiseConcept = 'punkt' | 'wozek' | 'przyczepa' | 'lokal';

export type FranchiseInquiryStatus = 'new' | 'contacted' | 'qualified' | 'closed';

export interface FranchiseInquiryDraft {
  concept: FranchiseConcept;
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  country?: string;
  note?: string;
}

export interface FranchiseInquiry {
  id: string;
  user_id: string | null;
  concept: FranchiseConcept;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  note: string | null;
  status: FranchiseInquiryStatus;
  admin_note: string | null;
  handled_at: string | null;
  created_at: string;
}

export async function submitFranchiseInquiry(
  draft: FranchiseInquiryDraft,
): Promise<{ id: string; status: FranchiseInquiryStatus }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_submit_franchise_inquiry_v1', {
    p_inquiry: draft,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; status: FranchiseInquiryStatus };
}

export async function getFranchiseInquiries(
  status?: FranchiseInquiryStatus,
): Promise<FranchiseInquiry[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_franchise_inquiries_v1', {
    p_status: status ?? null,
    p_limit: 200,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FranchiseInquiry[];
}

export async function setFranchiseInquiryStatus(input: {
  inquiryId: string;
  status: FranchiseInquiryStatus;
  note?: string;
}): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_franchise_inquiry_action_v1', {
    p_inquiry_id: input.inquiryId,
    p_status: input.status,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
}
