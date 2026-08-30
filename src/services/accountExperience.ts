/**
 * GELLATTI HOME — the §12 account setting "Default experience after login".
 *
 * One column on `account_profiles` (owner-only RLS), read and written through the
 * user's own session. There is deliberately NO "last visited view" here: §12 says
 * the login default is a stated setting, and a service that cannot record history
 * cannot accidentally start honouring it.
 *
 * Read failures are NOT thrown: a missing profile row, an unconfigured backend or a
 * transient error must never block someone from entering the app. The caller falls
 * back to the owner default (`pro`) through `resolveDefaultLandingView`.
 */
import { supabase } from '@/lib/supabase/client';
import type { DefaultExperience } from '@/features/home-creator/homeViewMode';

const TABLE = 'account_profiles';

const isDefaultExperience = (value: unknown): value is DefaultExperience =>
  value === 'home' || value === 'pro';

/** The stored setting, or `null` when unknown (unconfigured, anonymous, no row, error). */
export async function readDefaultExperience(): Promise<DefaultExperience | null> {
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('default_experience')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;

  const value = (data as { default_experience?: unknown } | null)?.default_experience;
  return isDefaultExperience(value) ? value : null;
}

/**
 * Persist the setting for the signed-in owner. Upsert because `account_profiles` is a
 * 1:1 extension that may not have been materialised yet for this account; the RLS
 * insert policy is owner-only, so the upsert cannot write another user's row.
 */
export async function writeDefaultExperience(value: DefaultExperience): Promise<void> {
  if (!supabase) throw new Error('Account settings backend is unavailable.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sign in to change the default experience.');

  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, default_experience: value }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}
