-- Product ingest events are immutable audit records, but their auth actor is
-- deliberately anonymized by the 10800 FK when an account is deleted. Permit
-- only that one referential update outside ingest.
create or replace function public.canonical_product_write_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('app.canonical_product_ingest',true)='v1' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_table_name='products' and tg_op='UPDATE'
    and (to_jsonb(new)-array['owner_user_id','created_by','owning_account_id','updated_at'])
      =(to_jsonb(old)-array['owner_user_id','created_by','owning_account_id','updated_at'])
    and (new.owner_user_id is not distinct from old.owner_user_id or new.owner_user_id is null)
    and (new.created_by is not distinct from old.created_by or new.created_by is null)
    and (new.owning_account_id is not distinct from old.owning_account_id or new.owning_account_id is null)
    and (
      new.owner_user_id is distinct from old.owner_user_id
      or new.created_by is distinct from old.created_by
      or new.owning_account_id is distinct from old.owning_account_id
    ) then
    return new;
  end if;
  if tg_table_name='product_ingest_events' and tg_op='UPDATE'
    and new.actor_user_id is null and old.actor_user_id is not null
    and (to_jsonb(new)-'actor_user_id')=(to_jsonb(old)-'actor_user_id') then
    return new;
  end if;
  raise exception 'canonical product writes require ingest_product_v1';
end;
$$;
