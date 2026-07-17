/**
 * PINGÜINO Machine Preference — backend (Supabase) adapter. FILE-FIRST.
 *
 * Implements the `MachinePreferenceStore` port against migrations
 * `0030_user_machine_preference.sql` + `0031_user_machine_preference_user_default.sql`
 * (the owner hotfix's own default batch / own container columns). The adapter
 * must not be wired into the selector until BOTH are applied to the database
 * the bundle talks to: that unwired factory IS the launch gate, mirroring the
 * pro-core repository pattern.
 *
 * Honesty:
 *  - requires a signed-in session (owner-scoped RLS by auth.uid()); without
 *    one it throws instead of pretending to persist;
 *  - rows are re-validated through `parseMachinePreferenceRecord` on read —
 *    a corrupt/foreign row yields null, never a repaired guess;
 *  - upsert-by-user (one preference row per account), delete on clear.
 */
import { supabase } from '@/lib/supabase/client';
import {
  parseMachinePreferenceRecord,
  type MachinePreferenceRecord,
  type MachinePreferenceStore,
} from '@/features/machine-onboarding/preferenceContracts';

const TABLE = 'user_machine_preference';

export class MachinePreferenceAuthRequiredError extends Error {
  constructor() {
    super('Zapis preferencji maszyny na koncie wymaga zalogowania.');
    this.name = 'MachinePreferenceAuthRequiredError';
  }
}

export class MachinePreferenceBackendError extends Error {
  constructor(operation: 'load' | 'save' | 'clear', cause?: unknown) {
    super(`Machine preference backend ${operation} failed.`);
    this.name = 'MachinePreferenceBackendError';
    this.cause = cause;
  }
}

interface PreferenceRow {
  schema_version: number;
  machine_profile_id: string | null;
  custom_profile: unknown;
  market: string;
  resolved_technology: string;
  resolved_visible_mode: string;
  capacity_snapshot: unknown;
  default_batch: unknown;
  /** 0031 — the USER's own setting, kept apart from the recommendation. */
  user_default_batch_grams: number | null;
  custom_container_capacity_ml: number | null;
  custom_container_recommended_grams: number | null;
  catalog_version: string;
  set_at: string;
  updated_at: string | null;
}

/** Rebuild the untrusted row into record shape, then strict-parse it. */
function recordFromRow(row: PreferenceRow): MachinePreferenceRecord | null {
  const selection =
    row.machine_profile_id !== null
      ? { kind: 'catalog', machineProfileId: row.machine_profile_id }
      : { kind: 'custom', customProfile: row.custom_profile };
  // A half-declared container is left as-is for the parser to REJECT — the
  // adapter never completes missing data (0031 also constrains it in SQL).
  const customContainer =
    row.custom_container_capacity_ml === null && row.custom_container_recommended_grams === null
      ? null
      : {
          capacityMl: row.custom_container_capacity_ml,
          recommendedBatchGrams: row.custom_container_recommended_grams,
        };
  return parseMachinePreferenceRecord({
    schemaVersion: row.schema_version,
    selection,
    market: row.market,
    resolvedTechnology: row.resolved_technology,
    resolvedVisibleMode: row.resolved_visible_mode,
    capacity: row.capacity_snapshot,
    defaultBatch: row.default_batch,
    userDefaultBatchGrams: row.user_default_batch_grams,
    customContainer,
    setAt: row.set_at,
    updatedAt: row.updated_at,
    catalogVersion: row.catalog_version,
  });
}

async function requireUserId(): Promise<string> {
  if (supabase === null) throw new MachinePreferenceBackendError('load');
  const { data, error } = await supabase.auth.getUser();
  if (error !== null || !data.user) throw new MachinePreferenceAuthRequiredError();
  return data.user.id;
}

/** Create the account-scoped backend adapter (0030 + 0031 must be applied first). */
export function supabaseMachinePreferenceStore(): MachinePreferenceStore {
  return {
    async load(): Promise<MachinePreferenceRecord | null> {
      const userId = await requireUserId();
      if (supabase === null) throw new MachinePreferenceBackendError('load');
      // The column list stays an inline literal — supabase-js infers the row
      // type from it, and a hoisted constant collapses that inference.
      const { data, error } = await supabase
        .from(TABLE)
        .select(
          'schema_version, machine_profile_id, custom_profile, market, resolved_technology, resolved_visible_mode, capacity_snapshot, default_batch, user_default_batch_grams, custom_container_capacity_ml, custom_container_recommended_grams, catalog_version, set_at, updated_at',
        )
        .eq('user_id', userId)
        .maybeSingle();
      if (error !== null) throw new MachinePreferenceBackendError('load', error);
      if (data === null) return null;
      return recordFromRow(data as PreferenceRow);
    },

    async save(record: MachinePreferenceRecord): Promise<void> {
      const userId = await requireUserId();
      if (supabase === null) throw new MachinePreferenceBackendError('save');
      const row = {
        user_id: userId,
        schema_version: record.schemaVersion,
        machine_profile_id:
          record.selection.kind === 'catalog' ? record.selection.machineProfileId : null,
        custom_profile: record.selection.kind === 'custom' ? record.selection.customProfile : null,
        market: record.market,
        resolved_technology: record.resolvedTechnology,
        resolved_visible_mode: record.resolvedVisibleMode,
        capacity_snapshot: record.capacity,
        default_batch: record.defaultBatch,
        // The user's own setting — stored apart from the recommendation (§9).
        user_default_batch_grams: record.userDefaultBatchGrams,
        custom_container_capacity_ml: record.customContainer?.capacityMl ?? null,
        custom_container_recommended_grams: record.customContainer?.recommendedBatchGrams ?? null,
        catalog_version: record.catalogVersion,
        set_at: record.setAt,
        // The record carries the change time — the row mirrors it (no second clock).
        updated_at: record.updatedAt,
      };
      const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'user_id' });
      if (error !== null) throw new MachinePreferenceBackendError('save', error);
    },

    async clear(): Promise<void> {
      const userId = await requireUserId();
      if (supabase === null) throw new MachinePreferenceBackendError('clear');
      const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
      if (error !== null) throw new MachinePreferenceBackendError('clear', error);
    },
  };
}
