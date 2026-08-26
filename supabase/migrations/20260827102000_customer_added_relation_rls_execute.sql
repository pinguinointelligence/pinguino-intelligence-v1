-- Replacing can_use_product_relation_v1 in the customer-added migration reset
-- its established EXECUTE grant. The user_product_relations RLS policy invokes
-- this security-definer boolean helper as the authenticated caller, so retain
-- the same least-privilege grant established by migration 20260813110800.

select pg_advisory_xact_lock(hashtextextended('customer-added-relation-rls-execute-v1',0));

grant execute on function public.can_use_product_relation_v1(uuid,uuid)
  to authenticated,service_role;

comment on function public.can_use_product_relation_v1(uuid,uuid)
is 'RLS visibility predicate for per-account product relations, including linked customer-added products.';
