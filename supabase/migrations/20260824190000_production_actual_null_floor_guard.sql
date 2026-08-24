-- A recorded physical amount may be corrected to another explicit numeric
-- amount, including zero, but it must never disappear back to JSON null.
-- This table-level guard protects every caller, including future RPCs, from
-- erasing a line while another ingredient is being confirmed.

create or replace function public.enforce_production_actual_null_floor_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(old.actual_items) previous
    where previous->>'actualGrams' is not null
      and not exists (
        select 1
        from jsonb_array_elements(new.actual_items) candidate
        where candidate->>'id' = previous->>'id'
          and candidate->>'actualGrams' is not null
      )
  ) then
    raise exception 'physically recorded material cannot become null'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists production_actual_null_floor_v1
  on public.production_run_actuals;
create trigger production_actual_null_floor_v1
before update of actual_items on public.production_run_actuals
for each row execute function public.enforce_production_actual_null_floor_v1();
