-- Supabase grants table DML by default. RLS may reduce an UPDATE to zero rows,
-- but statement-level invalidation triggers still fire and can enqueue every
-- Mapper/catalog entity. Published registries are read-only to customers;
-- service-owned classifier/publisher functions retain their definer rights.
revoke insert,update,delete on table
  public.product_taxonomy_versions,
  public.product_taxonomy_nodes,
  public.product_taxonomy_aliases,
  public.product_behavior_policy_versions
from public,anon,authenticated;

grant select on table
  public.product_taxonomy_versions,
  public.product_taxonomy_nodes,
  public.product_taxonomy_aliases,
  public.product_behavior_policy_versions
to authenticated;
