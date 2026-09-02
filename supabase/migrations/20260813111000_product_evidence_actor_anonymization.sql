-- Immutable evidence survives account deletion. Permit only the FK-owned
-- anonymization of owner_user_id; evidence content and every product/version
-- reference remain byte-for-byte immutable.
create or replace function public.canonical_product_immutable_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' and current_setting('app.canonical_product_ingest',true)='v1' then
    return new;
  end if;
  if tg_table_name='product_evidence' and tg_op='UPDATE'
    and new.owner_user_id is null and old.owner_user_id is not null
    and (to_jsonb(new)-'owner_user_id')=(to_jsonb(old)-'owner_user_id') then
    return new;
  end if;
  raise exception 'canonical product history is immutable and ingest-owned';
end;
$$;
