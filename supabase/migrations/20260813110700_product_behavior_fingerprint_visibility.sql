-- `ingest_product_v1` creates a version and resolves its behavior inside one
-- outer SQL statement. A STABLE fingerprint function is pinned to the outer
-- statement snapshot and cannot see that newly inserted version. VOLATILE is
-- required here for command-to-command visibility within the ingest
-- transaction; the function remains read-only and deterministic for a given
-- visible authority state.
alter function public.product_behavior_entity_fingerprint_v1(text,text) volatile;
