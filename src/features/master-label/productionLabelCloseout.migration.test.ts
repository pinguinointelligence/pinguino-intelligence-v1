import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260824180000_production_label_closeout.sql',
  ),
  'utf8',
);
const FLOOR_GUARD_SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260824190000_production_actual_null_floor_guard.sql',
  ),
  'utf8',
);
const RESCUE_FINGERPRINT_GUARD_SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260824200000_production_rescue_preview_fingerprint_guard.sql',
  ),
  'utf8',
);
const LABEL_UNIFICATION_SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260824210000_label_tab_final_unification.sql',
  ),
  'utf8',
);
const FINAL_LABEL_SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260825180000_final_six_label_profiles_and_versioned_snapshots.sql',
  ),
  'utf8',
);

describe('Production / Label closeout migration', () => {
  it('extends the one append-only Production history with every required event', () => {
    for (const event of [
      'production_started',
      'heat_information_acknowledged',
      'ingredient_actual_confirmed',
      'actual_entry_corrected',
      'variance_detected',
      'rescue_previewed',
      'rescue_accepted',
      'batch_target_changed',
      'additional_ingredient_requested',
      'ingredient_completed',
      'production_completed',
      'production_cancelled',
    ]) {
      expect(SQL).toContain(`'${event}'`);
    }
    expect(SQL).toContain('on public.production_run_events');
    expect(SQL).not.toContain('create table if not exists public.production_audit_events');
  });

  it('freezes actual Production and Label snapshots without update/delete grants', () => {
    expect(SQL).toContain('create table if not exists public.production_completed_snapshots');
    expect(SQL).toContain('create table if not exists public.production_run_label_snapshots');
    expect(SQL).toContain('production_freeze_completed_snapshot_v1');
    expect(SQL).toContain('production_save_label_snapshot_v1');
    expect(SQL).toContain('revoke insert, update, delete on public.production_completed_snapshots');
    expect(SQL).toContain('revoke insert, update, delete on public.production_run_label_snapshots');
    expect(SQL).toContain('on conflict (run_id) do nothing');
    expect(SQL).toContain('production_complete_run_v2');
    expect(SQL).toContain(
      'perform public.production_freeze_completed_snapshot_v1(p_run_id, p_snapshot)',
    );
    expect(SQL).toContain('completion cannot reduce physically recorded material');
    expect(SQL).toContain('from authenticated;');
  });

  it('owns account defaults and private immutable logo objects by auth.uid()', () => {
    expect(SQL).toContain('create table if not exists public.account_label_profiles');
    expect(SQL).toContain('auth.uid() = owner_user_id');
    expect(SQL).toContain("'label-profile-assets'");
    expect(SQL).toContain('(storage.foldername(name))[1] = auth.uid()::text');
    expect(SQL).toContain('for insert to authenticated');
    expect(SQL).toContain('for select to authenticated');
    expect(SQL).not.toMatch(/label_profile_assets_(update|delete)_own/);
    expect(SQL).not.toMatch(/to anon/);
  });

  it('validates snapshot identity and actual mass against the completed owned run', () => {
    expect(SQL).toContain("where id = p_run_id and owner_user_id = v_uid and status = 'completed'");
    expect(SQL).toContain("p_snapshot->>'sessionId' is distinct from p_run_id::text");
    expect(SQL).toContain("p_snapshot#>>'{source,recipeVersionId}'");
    expect(SQL).toContain("abs((p_snapshot->>'actualFinalMassG')::numeric - v_final_mass)");
    expect(SQL).toContain('Label ingredients must come from the completed ACTUAL batch');
  });

  it('allows a downward actual only through the exact durable record-correction intent', () => {
    expect(SQL).toContain('physically recorded material cannot decrease');
    expect(SQL).toContain("p_action = 'record_correction'");
    expect(SQL).toContain('p_previous_actual_g is not distinct from');
    expect(SQL).toContain('record correction requires the exact previous durable amount');
    expect(SQL).toContain('production_cancel_run_v1');
    expect(SQL).toContain(
      'revoke execute on function public.production_transition_run_v1(uuid, text, uuid)',
    );
  });

  it('rejects null erasure of a previously recorded physical amount', () => {
    expect(FLOOR_GUARD_SQL).toContain("previous->>'actualGrams' is not null");
    expect(FLOOR_GUARD_SQL).toContain("candidate->>'actualGrams' is not null");
    expect(FLOOR_GUARD_SQL).toContain('physically recorded material cannot become null');
    expect(FLOOR_GUARD_SQL).toContain('before update of actual_items');
  });

  it('does not let the Preview audit event invalidate its own Rescue authorization', () => {
    expect(RESCUE_FINGERPRINT_GUARD_SQL).toContain(
      'private.production_rescue_source_fingerprint_v1',
    );
    expect(RESCUE_FINGERPRINT_GUARD_SQL).toContain("event.event_type <> 'rescue_previewed'");
    expect(RESCUE_FINGERPRINT_GUARD_SQL).toContain("'actualRevision', run.actual_revision");
    expect(RESCUE_FINGERPRINT_GUARD_SQL).toContain("'rescueRevision', run.rescue_revision");
  });

  it('persists the established optional fields and freezes their selection with the label', () => {
    expect(LABEL_UNIFICATION_SQL).toContain('enabled_optional_fields jsonb not null');
    expect(FINAL_LABEL_SQL).toContain('"qr_code","lot_barcode","gtin","website"');
    expect(LABEL_UNIFICATION_SQL).toContain(
      `'enabledOptionalFields', p_master_label->'enabledOptionalFields'`,
    );
    expect(LABEL_UNIFICATION_SQL).not.toContain('localStorage');
  });

  it('constrains the final selector to six profiles and removes the legacy custom profile', () => {
    expect(FINAL_LABEL_SQL).toContain("market in ('EU','UK','US','CA','AU_NZ','WORLD')");
    expect(FINAL_LABEL_SQL).toContain("where market = 'CUSTOM'");
    expect(FINAL_LABEL_SQL).not.toContain("'JP'");
    expect(FINAL_LABEL_SQL).not.toContain("'BR'");
  });

  it('creates append-only versioned snapshots with SHA-256 and exact print evidence', () => {
    expect(FINAL_LABEL_SQL).toContain('snapshot_id uuid');
    expect(FINAL_LABEL_SQL).toContain('snapshot_version integer');
    expect(FINAL_LABEL_SQL).toContain("'sha256'");
    expect(FINAL_LABEL_SQL).toContain('unique (run_id, snapshot_version)');
    expect(FINAL_LABEL_SQL).toContain('unique (run_id, content_hash)');
    expect(FINAL_LABEL_SQL).toContain('"profileVersion":"legacy-unconfigured"');
    expect(FINAL_LABEL_SQL).toContain('"verificationStatus":"UNVERIFIED"');
    expect(FINAL_LABEL_SQL).toContain('production_save_label_snapshot_v2');
    expect(FINAL_LABEL_SQL).toContain('Run Label Snapshot history is immutable');
    expect(FINAL_LABEL_SQL).toContain('PRINT_READY_UNIVERSAL');
    expect(FINAL_LABEL_SQL).toContain('PRINT_READY_REGULATORY');
    expect(FINAL_LABEL_SQL).toContain('batch mass is not package fill');
    expect(FINAL_LABEL_SQL).toContain(
      'Canadian ice cream/frozen dessert package quantity must be confirmed by volume',
    );
    expect(FINAL_LABEL_SQL).toContain('Complete Canadian FOP assessment data is required');
    expect(FINAL_LABEL_SQL).toContain('v_fop_required and (');
    expect(FINAL_LABEL_SQL).toContain("v_fop_exemption not in ('exempt','prohibited')");
    expect(FINAL_LABEL_SQL).toContain(
      'Label ingredients must come from the completed ACTUAL batch',
    );
    expect(FINAL_LABEL_SQL).not.toContain('mapper_basement');
  });
});
