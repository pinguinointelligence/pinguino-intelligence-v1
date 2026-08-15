-- Repair the authenticated canonical-product projection. The relation model
-- stores the private note in `user_product_relations.notes`; the original
-- projection referenced the nonexistent singular `note`, causing runtime
-- hydration to fail after an otherwise successful canonical ingest.

select pg_advisory_xact_lock(hashtextextended('canonical-product-projection-notes-repair-v1',0));

create or replace function public.get_canonical_product_for_account_v1(
  p_product_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=public
as $$
declare v_row jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select to_jsonb(p)||jsonb_build_object(
    'owner_user_id',auth.uid(),
    'created_by',case when p.created_by=auth.uid() then p.created_by else null end,
    'supplier',r.supplier,
    'cost_per_kg',r.private_price,
    'currency',r.currency,
    'usage_notes',r.notes,
    'product_image_url',null,
    'detected_text',null,
    'extracted_json',null,
    'reviewed_by',null,
    'reviewed_at',null,
    'review_notes',null,
    'mapper_notes',null
  ) into v_row
  from public.products p
  left join public.user_product_relations r
    on r.product_id=p.id and r.user_id=auth.uid()
  where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
    and (
      (p.visibility='shared' and p.canonical_verification_status<>'blocked')
      or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
      or exists(select 1 from public.product_ingest_events e
        where e.product_id=p.id and e.actor_user_id=auth.uid())
    );
  return v_row;
end $$;

revoke all on function public.get_canonical_product_for_account_v1(uuid) from public,anon;
grant execute on function public.get_canonical_product_for_account_v1(uuid)
  to authenticated,service_role;

comment on function public.get_canonical_product_for_account_v1(uuid)
is 'Returns an account-safe canonical product projection with private relation notes from user_product_relations.notes.';
