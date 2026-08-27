-- Integrate contributor capability reanalysis into the existing PRODUCT REQUESTS
-- Admin authority. The specialized table remains the immutable domain ledger;
-- Overview, queue navigation and presentation use the shared request contract.

select pg_advisory_xact_lock(hashtextextended('product-reanalysis-admin-integration-v1',0));

alter table public.product_capability_reanalysis_requests
  add column request_type text not null
    default 'PRODUCT_CAPABILITY_REANALYSIS';
alter table public.product_capability_reanalysis_requests
  add constraint product_capability_reanalysis_request_type_check
  check(request_type='PRODUCT_CAPABILITY_REANALYSIS');

comment on column public.product_capability_reanalysis_requests.request_type is
  'Canonical PRODUCT REQUESTS discriminator; every row is PRODUCT_CAPABILITY_REANALYSIS.';

-- Extend the accepted Overview semantics. `open` remains all nonterminal
-- PRODUCT REQUESTS; `waitingAdmin` remains requests that require Admin work.
do $$
declare
  v_definition text;
  v_open_old text := $old$'open',(select count(*) from public.product_add_requests where status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED')),$old$;
  v_open_new text := $new$'open',(
        (select count(*) from public.product_add_requests where status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED'))
        + (select count(*) from public.product_capability_reanalysis_requests where status in ('OPEN','IN_REVIEW'))
      ),$new$;
  v_waiting_old text := $old$'waitingAdmin',(select count(*) from public.product_add_requests where status in ('SUBMITTED','RESUBMITTED')),$old$;
  v_waiting_new text := $new$'waitingAdmin',(
        (select count(*) from public.product_add_requests where status in ('SUBMITTED','RESUBMITTED'))
        + (select count(*) from public.product_capability_reanalysis_requests where status in ('OPEN','IN_REVIEW'))
      ),$new$;
  v_oldest_old text := $old$'oldest',(select min(submitted_at) from public.product_add_requests where status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED')),$old$;
  v_oldest_new text := $new$'oldest',least(
        (select min(submitted_at) from public.product_add_requests where status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED')),
        (select min(submitted_at) from public.product_capability_reanalysis_requests where status in ('OPEN','IN_REVIEW'))
      ),$new$;
begin
  select pg_get_functiondef(
    'public.gellatti_admin_overview_v1()'::regprocedure
  ) into v_definition;

  if position('product_capability_reanalysis_requests' in v_definition)>0 then
    return;
  end if;
  if position(v_open_old in v_definition)=0
    or position(v_waiting_old in v_definition)=0
    or position(v_oldest_old in v_definition)=0 then
    raise exception 'admin_overview_product_request_anchor_missing';
  end if;

  v_definition:=replace(v_definition,v_open_old,v_open_new);
  v_definition:=replace(v_definition,v_waiting_old,v_waiting_new);
  v_definition:=replace(v_definition,v_oldest_old,v_oldest_new);
  execute v_definition;
end;
$$;

-- One Admin queue projection. Status tabs retain their established meanings:
-- NEW also includes OPEN reanalysis; IN REVIEW also includes IN_REVIEW;
-- APPROVED also includes ACCEPTED. The returned status remains the real domain
-- status and requestType makes the lifecycle explicit.
create or replace function public.gellatti_admin_product_requests_v1(
  p_status text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG') then
    raise exception 'catalog_administrator_required';
  end if;

  return coalesce((
    select jsonb_agg(queue.row_data order by queue.submitted_at desc,queue.id desc)
    from (
      select candidates.id,candidates.submitted_at,candidates.row_data
      from (
        select r.id,r.submitted_at,jsonb_build_object(
          'requestType','PRODUCT_ADD',
          'id',r.id,'requestNumber',r.request_number,'status',r.status,
          'requesterUserId',r.requester_user_id,'requesterEmail',u.email,
          'marketCountryCode',r.market_country_code,'countryOfOrigin',r.country_of_origin,
          'ean',r.detected_ean,'name',r.product_name,'brand',r.brand,'variant',r.variant,
          'netQuantity',r.net_quantity,'manufacturer',r.manufacturer,
          'assignedAdminUserId',r.assigned_admin_user_id,'submittedAt',r.submitted_at,
          'updatedAt',r.updated_at,'adminNote',r.admin_note,'rejectionReason',r.rejection_reason,
          'duplicateProductId',r.duplicate_product_id,'approvedProductId',r.approved_product_id,
          'extractedData',r.extracted_data,'userCorrections',r.user_corrections,
          'adminVerifiedData',r.admin_verified_data,'source',r.source,
          'scannerProvenance',r.scanner_provenance,
          'exactMatchCandidate',exists(
            select 1
            from public.products candidate
            where candidate.is_active
              and candidate.merged_into_product_id is null
              and candidate.visibility='shared'
              and candidate.canonical_verification_status<>'blocked'
              and (
                (
                  r.detected_ean is not null
                  and (
                    regexp_replace(coalesce(candidate.ean_code_normalized,''),'\D','','g')=r.detected_ean
                    or exists(
                      select 1 from public.product_variants candidate_variant
                      where candidate_variant.product_id=candidate.id
                        and candidate_variant.is_current
                        and regexp_replace(coalesce(candidate_variant.ean,''),'\D','','g')=r.detected_ean
                    )
                  )
                )
                or (
                  r.detected_ean is null and r.product_name is not null
                  and lower(btrim(candidate.product_name_display))=lower(btrim(r.product_name))
                  and lower(btrim(coalesce(candidate.brand,'')))=lower(btrim(coalesce(r.brand,'')))
                )
              )
          ),
          'missingFields',coalesce((select jsonb_agg(jsonb_build_object(
            'id',m.id,'fieldType',m.field_type,'status',m.status,'instruction',m.instruction,
            'requestedAt',m.requested_at,'suppliedAt',m.supplied_at
          ) order by m.requested_at) from public.product_add_request_missing_fields m
            where m.request_id=r.id),'[]'::jsonb),
          'events',coalesce((select jsonb_agg(jsonb_build_object(
            'id',e.id,'actorType',e.actor_type,'actorUserId',e.actor_user_id,
            'eventType',e.event_type,'fromStatus',e.from_status,'toStatus',e.to_status,
            'data',e.event_data,'createdAt',e.created_at
          ) order by e.created_at,e.id) from public.product_add_request_events e
            where e.request_id=r.id),'[]'::jsonb),
          'evidence',coalesce((select jsonb_agg(jsonb_build_object(
            'id',ev.id,'kind',ev.evidence_kind,'storagePath',ev.storage_path,
            'sourceUrl',ev.source_url,'mimeType',ev.mime_type,'byteSize',ev.byte_size,
            'payload',ev.evidence_payload,'provenance',ev.provenance,'createdAt',ev.created_at
          ) order by ev.created_at) from public.product_add_request_evidence ev
            where ev.request_id=r.id),'[]'::jsonb)
        ) row_data
        from public.product_add_requests r
        join auth.users u on u.id=r.requester_user_id
        where p_status is null or p_status='ALL' or r.status=p_status

        union all

        select r.id,r.submitted_at,jsonb_build_object(
          'requestType',r.request_type,
          'id',r.id,'requestNumber',null,'status',r.status,
          'requesterUserId',r.requesting_user_id,'requesterEmail',u.email,
          'marketCountryCode',null,'countryOfOrigin',null,
          'ean',nullif(p.ean_code_normalized,''),'name',p.product_name_display,
          'brand',p.brand,'variant',null,'netQuantity',null,'manufacturer',null,
          'assignedAdminUserId',r.assigned_admin_user_id,'submittedAt',r.submitted_at,
          'updatedAt',r.updated_at,'adminNote',r.review_reason,
          'rejectionReason',case when r.status='REJECTED' then r.review_reason else null end,
          'duplicateProductId',null,'approvedProductId',null,
          'extractedData','{}'::jsonb,'userCorrections','{}'::jsonb,
          'adminVerifiedData','{}'::jsonb,'source','CONTRIBUTOR_REANALYSIS',
          'scannerProvenance',r.contribution_reference,'exactMatchCandidate',true,
          'missingFields','[]'::jsonb,'events',jsonb_build_array(jsonb_build_object(
            'id',r.id,'actorType','USER','actorUserId',r.requesting_user_id,
            'eventType','REANALYSIS_REQUEST_SUBMITTED','fromStatus',null,'toStatus','OPEN',
            'data',jsonb_build_object('reasonCode',r.reason_code),'createdAt',r.submitted_at
          )),'evidence','[]'::jsonb,
          'canonicalProductId',r.canonical_product_id,'productCode',p.product_code,
          'requestingUserId',r.requesting_user_id,
          'requestedCapability',r.requested_capability,
          'attemptedContext',r.attempted_context,'reasonCode',r.reason_code,
          'currentClassification',r.current_classification,
          'identitySnapshot',r.identity_snapshot,
          'capabilitySnapshot',r.capability_snapshot,
          'readinessSnapshot',r.readiness_snapshot,
          'contributionReference',r.contribution_reference,
          'evidenceReferences',r.evidence_references,
          'currentAuthority',public.gellatti_product_capability_authority_v1(r.canonical_product_id),
          'reviewReason',r.review_reason,'reviewStartedAt',r.review_started_at,
          'resolvedAt',r.resolved_at
        ) row_data
        from public.product_capability_reanalysis_requests r
        join public.products p on p.id=r.canonical_product_id
        join auth.users u on u.id=r.requesting_user_id
        where p_status is null or p_status='ALL'
          or (p_status='SUBMITTED' and r.status='OPEN')
          or (p_status='ADMIN_REVIEW' and r.status='IN_REVIEW')
          or (p_status='APPROVED' and r.status='ACCEPTED')
          or (p_status='REJECTED' and r.status='REJECTED')
      ) candidates
      order by candidates.submitted_at desc,candidates.id desc
      limit least(greatest(coalesce(p_limit,100),1),500)
    ) queue
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_admin_product_requests_v1(text,integer)
  from public,anon;
grant execute on function public.gellatti_admin_product_requests_v1(text,integer)
  to authenticated;

-- The former specialist Admin list is no longer a customer-facing authority.
-- Domain actions remain permission checked, but all reads go through PRODUCT REQUESTS.
revoke execute on function public.gellatti_admin_product_capability_reanalysis_v1(text,integer)
  from authenticated;
comment on function public.gellatti_admin_product_capability_reanalysis_v1(text,integer) is
  'Legacy internal projection; authenticated Admin reads use gellatti_admin_product_requests_v1.';

-- Use the existing durable Admin notification center and the same deep link.
create or replace function public.gellatti_notify_product_reanalysis_admin_v1()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public
as $$
begin
  insert into public.user_notifications(
    admin_permission,notification_type,entity_type,entity_id,title,body,deep_link,payload,dedupe_key
  )
  select
    'CATALOG','PRODUCT_CAPABILITY_REANALYSIS',new.request_type,new.id::text,
    'Ponowna analiza produktu',p.product_name_display,
    '/admin/product-requests?request='||new.id,
    jsonb_build_object(
      'requestType',new.request_type,
      'canonicalProductId',new.canonical_product_id,
      'requestedCapability',new.requested_capability
    ),
    'product-request:reanalysis:'||new.id
  from public.products p where p.id=new.canonical_product_id
  on conflict(dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function public.gellatti_notify_product_reanalysis_admin_v1()
  from public,anon,authenticated;

drop trigger if exists product_capability_reanalysis_notify_admin
  on public.product_capability_reanalysis_requests;
create trigger product_capability_reanalysis_notify_admin
  after insert on public.product_capability_reanalysis_requests
  for each row execute function public.gellatti_notify_product_reanalysis_admin_v1();

insert into public.user_notifications(
  admin_permission,notification_type,entity_type,entity_id,title,body,deep_link,payload,dedupe_key
)
select
  'CATALOG','PRODUCT_CAPABILITY_REANALYSIS',r.request_type,r.id::text,
  'Ponowna analiza produktu',p.product_name_display,
  '/admin/product-requests?request='||r.id,
  jsonb_build_object(
    'requestType',r.request_type,
    'canonicalProductId',r.canonical_product_id,
    'requestedCapability',r.requested_capability
  ),
  'product-request:reanalysis:'||r.id
from public.product_capability_reanalysis_requests r
join public.products p on p.id=r.canonical_product_id
where r.status in ('OPEN','IN_REVIEW')
on conflict(dedupe_key) do nothing;
