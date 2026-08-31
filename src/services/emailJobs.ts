import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Email backend is unavailable in this build.');
};

/**
 * The delivery states an operator can see. Raw values are CONTRACTS shared with
 * the `email_jobs` CHECK constraint — never rendered directly (see
 * `emailJobStatusCopy`).
 */
export type EmailJobStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'abandoned' | 'cancelled';

export type EmailFailureKind = 'retryable' | 'permanent';

export interface AdminEmailJob {
  id: string;
  subject_key: string;
  subject: string;
  recipient: string;
  environment: string;
  status: EmailJobStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  provider_name: string | null;
  provider_message_id: string | null;
  last_failure_kind: EmailFailureKind | null;
  last_failure_message: string | null;
  last_failure_code: string | null;
  sent_at: string | null;
  created_at: string;
}

/**
 * Failed and pending jobs, newest first. Bodies are never returned — an
 * operator needs to know WHICH message did not arrive, not what it said.
 */
export async function getAdminEmailJobs(status?: EmailJobStatus): Promise<AdminEmailJob[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_email_jobs_v1', {
    p_status: status ?? null,
    p_limit: 200,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminEmailJob[];
}
