-- TEXTIMPORT-only pre-Scanner EAN research budget.
--
-- Each provider request reserves the observed worst case of three web calls.
-- Reservations are atomic and scoped both to one row and to the owner run, so
-- a row cannot consume the whole run while the total spend remains hard-capped.

create table if not exists public.product_textimport_ean_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id text not null check (run_id ~ '^[A-Za-z0-9-]{1,48}$'),
  source_row_id text not null check (length(source_row_id) between 1 and 120),
  step_key text not null check (step_key in ('retailer_search','open_web_search')),
  reserved_web_calls smallint not null check (reserved_web_calls between 1 and 3),
  actual_web_calls smallint check (actual_web_calls between 0 and 4),
  source_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(source_urls)='array'),
  outcome text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id,run_id,source_row_id,step_key)
);

create index if not exists product_textimport_ean_budget_run_idx
  on public.product_textimport_ean_budget_reservations(user_id,run_id,created_at);

alter table public.product_textimport_ean_budget_reservations enable row level security;

drop policy if exists product_textimport_ean_budget_select_own
  on public.product_textimport_ean_budget_reservations;
create policy product_textimport_ean_budget_select_own
  on public.product_textimport_ean_budget_reservations
  for select to authenticated using (auth.uid()=user_id);

grant select on public.product_textimport_ean_budget_reservations to authenticated;

create or replace function public.gellatti_reserve_textimport_ean_budget_v1(
  p_actor_user_id uuid,
  p_run_id text,
  p_source_row_id text,
  p_step_key text,
  p_reserved_web_calls integer
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_existing public.product_textimport_ean_budget_reservations%rowtype;
  v_row_reserved integer;
  v_run_reserved integer;
  v_row_web_call_cap constant integer:=6;
  v_run_web_call_cap constant integer:=18;
begin
  if auth.uid() is distinct from p_actor_user_id then
    raise exception 'textimport_ean_budget_actor_mismatch';
  end if;
  if p_run_id !~ '^[A-Za-z0-9-]{1,48}$'
     or length(coalesce(p_source_row_id,'')) not between 1 and 120
     or p_step_key not in ('retailer_search','open_web_search')
     or p_reserved_web_calls not between 1 and 3 then
    raise exception 'invalid_textimport_ean_budget_request';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_user_id::text||':'||p_run_id,0)
  );

  select * into v_existing
  from public.product_textimport_ean_budget_reservations
  where user_id=p_actor_user_id and run_id=p_run_id
    and source_row_id=p_source_row_id and step_key=p_step_key;

  select coalesce(sum(reserved_web_calls),0)::integer into v_row_reserved
  from public.product_textimport_ean_budget_reservations
  where user_id=p_actor_user_id and run_id=p_run_id and source_row_id=p_source_row_id;

  select coalesce(sum(reserved_web_calls),0)::integer into v_run_reserved
  from public.product_textimport_ean_budget_reservations
  where user_id=p_actor_user_id and run_id=p_run_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'allowed',true,
      'replay',true,
      'rowWebCallsReserved',v_row_reserved,
      'runWebCallsReserved',v_run_reserved
    );
  end if;

  if v_row_reserved+p_reserved_web_calls>v_row_web_call_cap then
    return jsonb_build_object(
      'allowed',false,
      'reason','textimport_ean_row_call_cap_reached',
      'rowWebCallsReserved',v_row_reserved,
      'runWebCallsReserved',v_run_reserved
    );
  end if;

  if v_run_reserved+p_reserved_web_calls>v_run_web_call_cap then
    return jsonb_build_object(
      'allowed',false,
      'reason','textimport_ean_run_call_cap_reached',
      'rowWebCallsReserved',v_row_reserved,
      'runWebCallsReserved',v_run_reserved
    );
  end if;

  insert into public.product_textimport_ean_budget_reservations(
    user_id,run_id,source_row_id,step_key,reserved_web_calls
  ) values (
    p_actor_user_id,p_run_id,p_source_row_id,p_step_key,p_reserved_web_calls
  );

  return jsonb_build_object(
    'allowed',true,
    'replay',false,
    'rowWebCallsReserved',v_row_reserved+p_reserved_web_calls,
    'runWebCallsReserved',v_run_reserved+p_reserved_web_calls
  );
end;
$$;

create or replace function public.gellatti_complete_textimport_ean_budget_v1(
  p_actor_user_id uuid,
  p_run_id text,
  p_source_row_id text,
  p_step_key text,
  p_actual_web_calls integer,
  p_source_urls jsonb,
  p_outcome text
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is distinct from p_actor_user_id then
    raise exception 'textimport_ean_budget_actor_mismatch';
  end if;
  if p_actual_web_calls not between 0 and 4
     or jsonb_typeof(coalesce(p_source_urls,'[]'::jsonb))<>'array'
     or length(coalesce(p_outcome,'')) not between 1 and 120 then
    raise exception 'invalid_textimport_ean_budget_completion';
  end if;

  update public.product_textimport_ean_budget_reservations
  set actual_web_calls=greatest(coalesce(actual_web_calls,0),p_actual_web_calls),
      source_urls=case when p_source_urls='[]'::jsonb then source_urls else p_source_urls end,
      outcome=p_outcome,
      completed_at=now()
  where user_id=p_actor_user_id and run_id=p_run_id
    and source_row_id=p_source_row_id and step_key=p_step_key;
  return found;
end;
$$;

revoke all on function public.gellatti_reserve_textimport_ean_budget_v1(
  uuid,text,text,text,integer
) from public;
revoke all on function public.gellatti_complete_textimport_ean_budget_v1(
  uuid,text,text,text,integer,jsonb,text
) from public;
grant execute on function public.gellatti_reserve_textimport_ean_budget_v1(
  uuid,text,text,text,integer
) to authenticated;
grant execute on function public.gellatti_complete_textimport_ean_budget_v1(
  uuid,text,text,text,integer,jsonb,text
) to authenticated;
