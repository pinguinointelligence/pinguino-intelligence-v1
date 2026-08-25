-- Durable operator decision for a confirmed Production deviation.
--
-- The trusted Rescue authorization already owns the option id, source actual
-- revision and display-safe outcome. Consumption appends that decision to the
-- existing run history so refresh/recovery cannot send an operator who already
-- accepted a safe result back through the decision panel.

alter table public.production_run_events
  drop constraint if exists production_run_events_event_type_check;
alter table public.production_run_events
  add constraint production_run_events_event_type_check check (
    event_type in (
      'created','planned','started','actual_recorded','rescue_applied',
      'completed','cancelled','amended','note_added',
      'production_started','heat_information_acknowledged',
      'ingredient_actual_confirmed','actual_entry_corrected','variance_detected',
      'rescue_previewed','rescue_accepted','deviation_decision_accepted',
      'batch_target_changed','additional_ingredient_requested','ingredient_completed',
      'production_completed','production_cancelled'
    )
  );

create or replace function public.enforce_production_event_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  run_status text;
begin
  select run.status into run_status
  from public.production_runs run
  where run.id = new.run_id and run.owner_user_id = new.owner_user_id;

  if run_status is null then
    raise exception 'Production event requires its owned parent run.' using errcode = '23514';
  end if;

  if not (
    new.event_type = 'note_added'
    or (new.event_type = 'created' and run_status = 'draft')
    or (new.event_type = 'planned' and run_status = 'planned')
    or (
      new.event_type in (
        'started','actual_recorded','rescue_applied','production_started',
        'heat_information_acknowledged','ingredient_actual_confirmed',
        'actual_entry_corrected','variance_detected','rescue_previewed',
        'rescue_accepted','deviation_decision_accepted','batch_target_changed',
        'additional_ingredient_requested','ingredient_completed'
      ) and run_status = 'in_progress'
    )
    or (
      new.event_type in ('completed','amended','production_completed')
      and run_status = 'completed'
    )
    or (
      new.event_type in ('cancelled','production_cancelled')
      and run_status = 'cancelled'
    )
  ) then
    raise exception 'Production event is incompatible with the current run status.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.production_emit_deviation_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_rescue_revision integer;
begin
  if old.consumed_at is not null or new.consumed_at is null then return new; end if;

  select run.rescue_revision into v_rescue_revision
  from public.production_runs run
  where run.id = new.run_id and run.owner_user_id = new.owner_user_id;

  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (
    gen_random_uuid(), new.run_id, new.owner_user_id,
    'deviation_decision_accepted', 'Operator accepted a Production deviation decision',
    jsonb_build_object(
      'authorizationId', new.id,
      'stableOptionId', new.stable_option_id,
      'sourceActualRevision', new.source_actual_revision,
      'rescueRevision', v_rescue_revision,
      'finalMassG', new.safe_metadata->'finalMassG',
      'scoreDisplay', new.safe_metadata->>'scoreDisplay'
    ),
    new.consumed_by, new.consumed_at
  );
  return new;
end;
$$;

drop trigger if exists production_deviation_decision_audit_v1
  on private.production_rescue_authorizations;
create trigger production_deviation_decision_audit_v1
after update of consumed_at on private.production_rescue_authorizations
for each row
when (old.consumed_at is null and new.consumed_at is not null)
execute function public.production_emit_deviation_decision_v1();

revoke all on function public.production_emit_deviation_decision_v1()
  from public, anon, authenticated, service_role;
