-- PostgreSQL recomputes stored GENERATED ALWAYS identity columns on the FK
-- anonymization UPDATE. They cannot be caller-assigned, so excluding them from
-- the byte comparison preserves the narrow actor-only exception.
create or replace function public.canonical_product_write_guard()
returns trigger language plpgsql set search_path=public as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_changed text[]:='{}'::text[];
begin
  if current_setting('app.canonical_product_ingest',true)='v1' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='UPDATE' then
    v_new:=to_jsonb(new);
    v_old:=to_jsonb(old);
    select coalesce(array_agg(e.key order by e.key),'{}'::text[])
    into v_changed
    from jsonb_each(v_new) e
    where e.value is distinct from v_old->e.key;
  end if;
  if tg_table_name='products' and tg_op='UPDATE'
    and (v_new-array[
      'owner_user_id','created_by','owning_account_id','updated_at',
      'ean_code_normalized','barcode_normalized'
    ])=(v_old-array[
      'owner_user_id','created_by','owning_account_id','updated_at',
      'ean_code_normalized','barcode_normalized'
    ])
    and ((v_new->'owner_user_id') is not distinct from (v_old->'owner_user_id')
      or v_new->'owner_user_id'='null'::jsonb)
    and ((v_new->'created_by') is not distinct from (v_old->'created_by')
      or v_new->'created_by'='null'::jsonb)
    and ((v_new->'owning_account_id') is not distinct from (v_old->'owning_account_id')
      or v_new->'owning_account_id'='null'::jsonb)
    and (
      (v_new->'owner_user_id') is distinct from (v_old->'owner_user_id')
      or (v_new->'created_by') is distinct from (v_old->'created_by')
      or (v_new->'owning_account_id') is distinct from (v_old->'owning_account_id')
    ) then
    return new;
  end if;
  if tg_table_name='product_ingest_events' and tg_op='UPDATE'
    and v_new->'actor_user_id'='null'::jsonb
    and v_old->'actor_user_id'<>'null'::jsonb
    and (v_new-'actor_user_id')=(v_old-'actor_user_id') then
    return new;
  end if;
  raise exception 'canonical product writes require ingest_product_v1 (table=%, op=%, columns=%)',
    tg_table_name,tg_op,v_changed;
end;
$$;
