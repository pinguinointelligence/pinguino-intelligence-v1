import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Notification backend is unavailable in this build.');
};

export interface DurableNotification {
  id: string;
  type: string;
  entityType: string;
  entityId: string | null;
  title: string;
  body: string;
  deepLink: string | null;
  payload: Record<string, unknown>;
  isTest: boolean;
  soundEligible: boolean;
  createdAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  soundPlayedAt: string | null;
}

export async function listNotifications(admin: boolean): Promise<DurableNotification[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_my_notifications_v1', {
    p_admin: admin,
    p_limit: 200,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DurableNotification[];
}

export async function notificationAction(
  notificationId: string,
  action: 'READ' | 'ACKNOWLEDGE' | 'SOUND_PLAYED',
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_notification_action_v1', {
    p_notification_id: notificationId,
    p_action: action,
  });
  if (error) throw new Error(error.message);
}

export async function getAdminNotificationPreferences(): Promise<{ salesSoundEnabled: boolean }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_my_admin_preferences_v1');
  if (error) throw new Error(error.message);
  return data as unknown as { salesSoundEnabled: boolean };
}

export async function setAdminSalesSound(enabled: boolean): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_set_admin_preference_v1', {
    p_sales_sound_enabled: enabled,
  });
  if (error) throw new Error(error.message);
}

