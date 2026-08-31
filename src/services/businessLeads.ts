import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Lead backend is unavailable in this build.');
};

/**
 * The four commercial paths of /work-with-us (owner correction §7). Raw values
 * are CONTRACTS shared with the `business_leads` CHECK constraint and are never
 * rendered directly — see `businessLeadPresentation`.
 */
export type BusinessLeadType = 'machine' | 'mobile' | 'trailer' | 'franchise';

/** §32 operational statuses, in full. */
export type BusinessLeadStatus = 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost';

export type BusinessLeadEventKind = 'created' | 'status_changed' | 'note' | 'assigned';

export interface BusinessLeadDraft {
  leadType: BusinessLeadType;
  fullName: string;
  email: string;
  phone?: string;
  country?: string;
  city?: string;
  message?: string;
  /** The route the customer was on, which may differ from the lead type. */
  sourceRoute?: string;
  /** Public model or format name — never a manufacturer name. */
  modelOrFormat?: string;
  /** Selector answers, verbatim. */
  configuration?: Record<string, unknown>;
}

export interface BusinessLead {
  id: string;
  reference: string;
  lead_type: BusinessLeadType;
  source_route: string | null;
  model_or_format: string | null;
  configuration: Record<string, unknown>;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  message: string | null;
  status: BusinessLeadStatus;
  assigned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
  event_count: number;
}

export interface BusinessLeadEvent {
  id: string;
  kind: BusinessLeadEventKind;
  from_status: BusinessLeadStatus | null;
  to_status: BusinessLeadStatus | null;
  note: string | null;
  actor_user_id: string | null;
  created_at: string;
}

/** Submitting does not require an account — a machine enquiry never should. */
export async function submitBusinessLead(
  draft: BusinessLeadDraft,
): Promise<{ id: string; reference: string; status: BusinessLeadStatus }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_submit_business_lead_v1', { p_lead: draft });
  if (error) throw new Error(error.message);
  return data as { id: string; reference: string; status: BusinessLeadStatus };
}

export async function getAdminBusinessLeads(
  filters: {
    leadType?: BusinessLeadType;
    status?: BusinessLeadStatus;
  } = {},
): Promise<BusinessLead[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_business_leads_v1', {
    p_lead_type: filters.leadType ?? null,
    p_status: filters.status ?? null,
    p_limit: 200,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessLead[];
}

export async function getBusinessLeadEvents(leadId: string): Promise<BusinessLeadEvent[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_business_lead_events_v1', {
    p_lead_id: leadId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessLeadEvent[];
}

/** One entry point: a status change and a note are the same operational act. */
export async function updateBusinessLead(input: {
  leadId: string;
  status?: BusinessLeadStatus;
  note?: string;
}): Promise<{ id: string; status: BusinessLeadStatus }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_update_business_lead_v1', {
    p_lead_id: input.leadId,
    p_status: input.status ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; status: BusinessLeadStatus };
}
