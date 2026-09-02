import { supabase } from '@/lib/supabase/client';

/** Owner Review is an administrative staging surface, not a Pro-plan
 * entitlement. RLS on admin_users exposes only the caller's own row, so this
 * check cannot be used to enumerate or self-promote administrators. */
export async function currentUserHasOwnerReviewAccess(userId: string): Promise<boolean> {
  if (!supabase || !userId.trim()) return false;
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle();
  return !error && data?.user_id === userId;
}
