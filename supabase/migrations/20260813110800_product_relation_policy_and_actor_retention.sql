-- RLS policy helpers are evaluated as the authenticated caller and therefore
-- require EXECUTE even when their body is SECURITY DEFINER. The helper exposes
-- one boolean only and performs the complete visibility check internally.
grant execute on function public.can_use_product_relation_v1(uuid,uuid)
  to authenticated,service_role;

-- Canonical evidence and immutable product/version history survive account
-- deletion, but a deleted account must not make auth.users undeletable. Keep
-- the audit event and anonymize its actor exactly like product_evidence does.
alter table public.product_ingest_events
  alter column actor_user_id drop not null;
alter table public.product_ingest_events
  drop constraint product_ingest_events_actor_user_id_fkey;
alter table public.product_ingest_events
  add constraint product_ingest_events_actor_user_id_fkey
  foreign key(actor_user_id) references auth.users(id) on delete set null;
