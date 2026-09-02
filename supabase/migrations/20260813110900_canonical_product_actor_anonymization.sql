-- Preserve canonical product history when an auth account is deleted. The
-- original owner FK still used CASCADE; canonical history must instead be
-- anonymized, matching created_by/owning_account_id and immutable evidence.
alter table public.products
  drop constraint products_owner_user_id_fkey;
alter table public.products
  add constraint products_owner_user_id_fkey
  foreign key(owner_user_id) references auth.users(id) on delete set null;

-- FK-driven account anonymization is the only write allowed outside ingest.
-- No scientific/public/private product fact may change in this exception.
create or replace function public.canonical_product_write_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('app.canonical_product_ingest',true)='v1' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='UPDATE'
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
  raise exception 'canonical product writes require ingest_product_v1';
end;
$$;
