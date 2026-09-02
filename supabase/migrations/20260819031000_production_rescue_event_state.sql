-- PINGÜINO Production Rescue — permit the audited Rescue event while a run is active.
-- Forward-only staging repair. No run, recipe, ProductBehavior, Mapper, or secret row is changed.

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
  where run.id = new.run_id
    and run.owner_user_id = new.owner_user_id;

  if run_status is null then
    raise exception 'Production event requires its owned parent run.' using errcode = '23514';
  end if;

  if not (
    new.event_type = 'note_added'
    or (new.event_type = 'created' and run_status = 'draft')
    or (new.event_type = 'planned' and run_status = 'planned')
    or (
      new.event_type in ('started', 'actual_recorded', 'rescue_applied')
      and run_status = 'in_progress'
    )
    or (new.event_type in ('completed', 'amended') and run_status = 'completed')
    or (new.event_type = 'cancelled' and run_status = 'cancelled')
  ) then
    raise exception 'Production event is incompatible with the current run status.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_production_event_state() is
  'Enforces owned Production event/status chronology, including rescue_applied on in-progress runs.';
