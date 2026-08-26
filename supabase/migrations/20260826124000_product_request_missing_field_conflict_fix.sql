-- REQUEST_INFO uses ON CONFLICT while an open field is unique only for the
-- REQUESTED lifecycle state. PostgreSQL cannot infer a DEFERRABLE constraint
-- for ON CONFLICT, so keep the invariant as a partial, immediate index.

alter table public.product_add_request_missing_fields
  drop constraint if exists product_add_request_missing_fields_request_id_field_type_status_key;

create unique index if not exists product_add_request_missing_fields_open_uniq
  on public.product_add_request_missing_fields(request_id,field_type)
  where status='REQUESTED';
