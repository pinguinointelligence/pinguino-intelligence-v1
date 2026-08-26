import { supabase } from '@/lib/supabase/client';

export async function redeemHomeInvite(code: string): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('Backend zaproszeń jest niedostępny.');
  const { data, error } = await supabase.functions.invoke('redeem-home-invite', { body: { code } });
  if (error) throw new Error(error.message);
  const result = data as Record<string, unknown> | null;
  if (typeof result?.error === 'string') throw new Error(result.error);
  return result ?? {};
}
