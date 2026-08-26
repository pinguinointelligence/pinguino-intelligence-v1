-- ============================================================================
-- Controlled Catalog: user/Admin read models.
-- Private recipes, payment-card data and secrets never enter these projections.
-- ============================================================================

create or replace function public.gellatti_my_product_requests_v1(
  p_archived boolean default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  return coalesce((
    select jsonb_agg(q.item order by q.updated_at desc)
    from (
      select r.updated_at, jsonb_build_object(
        'id', r.id,
        'requestNumber', r.request_number,
        'status', r.status,
        'source', r.source,
        'marketCountryCode', r.market_country_code,
        'countryOfOrigin', r.country_of_origin,
        'ean', r.detected_ean,
        'name', r.product_name,
        'brand', r.brand,
        'variant', r.variant,
        'netQuantity', r.net_quantity,
        'manufacturer', r.manufacturer,
        'adminNote', r.admin_note,
        'rejectionReason', r.rejection_reason,
        'duplicateProductId', r.duplicate_product_id,
        'approvedProductId', r.approved_product_id,
        'submittedAt', r.submitted_at,
        'updatedAt', r.updated_at,
        'resolvedAt', r.resolved_at,
        'archivedAt', us.user_archived_at,
        'missingFields', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id, 'fieldType', m.field_type, 'status', m.status,
            'instruction', m.instruction, 'requestedAt', m.requested_at,
            'suppliedAt', m.supplied_at, 'resolvedAt', m.resolved_at
          ) order by m.requested_at)
          from public.product_add_request_missing_fields m
          where m.request_id = r.id
        ), '[]'::jsonb),
        'events', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id, 'actorType', e.actor_type, 'eventType', e.event_type,
            'fromStatus', e.from_status, 'toStatus', e.to_status,
            'data', e.event_data, 'createdAt', e.created_at
          ) order by e.created_at, e.id)
          from public.product_add_request_events e where e.request_id = r.id
        ), '[]'::jsonb),
        'evidence', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ev.id, 'kind', ev.evidence_kind, 'storagePath', ev.storage_path,
            'sourceUrl', ev.source_url, 'mimeType', ev.mime_type,
            'byteSize', ev.byte_size, 'payload', ev.evidence_payload,
            'createdAt', ev.created_at
          ) order by ev.created_at)
          from public.product_add_request_evidence ev where ev.request_id = r.id
        ), '[]'::jsonb)
      ) item
      from public.product_add_requests r
      left join public.product_add_request_user_state us
        on us.request_id = r.id and us.user_id = v_user
      where r.requester_user_id = v_user
        and (p_archived is null or (us.user_archived_at is not null) = p_archived)
    ) q
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_my_product_requests_v1(boolean) from public, anon;
grant execute on function public.gellatti_my_product_requests_v1(boolean) to authenticated;

create or replace function public.gellatti_my_contributed_products_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'requestId', c.request_id,
      'productId', c.product_id,
      'productCode', p.product_code,
      'name', p.product_name_display,
      'brand', p.brand,
      'createdAt', c.created_at
    ) order by c.created_at desc)
    from public.user_contributed_products c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_my_contributed_products_v1() from public, anon;
grant execute on function public.gellatti_my_contributed_products_v1() to authenticated;

create or replace function public.gellatti_my_notifications_v1(
  p_admin boolean default false,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_admin and not public.gellatti_admin_has_permission_v1('ADMIN_READ', v_user) then
    raise exception 'administrator_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id, 'type', q.notification_type,
      'entityType', q.entity_type, 'entityId', q.entity_id,
      'title', q.title, 'body', q.body, 'deepLink', q.deep_link,
      'payload', q.payload, 'isTest', q.is_test,
      'soundEligible', q.sound_eligible, 'createdAt', q.created_at,
      'readAt', q.read_at, 'acknowledgedAt', q.acknowledged_at,
      'soundPlayedAt', q.sound_played_at
    ) order by q.created_at desc)
    from (
      select n.*, r.read_at, r.acknowledged_at, r.sound_played_at
      from public.user_notifications n
      left join public.user_notification_receipts r
        on r.notification_id = n.id and r.user_id = v_user
      where (
        (not p_admin and n.recipient_user_id = v_user)
        or (p_admin and n.admin_permission is not null
            and public.gellatti_admin_has_permission_v1(n.admin_permission, v_user))
      ) and (n.expires_at is null or n.expires_at > statement_timestamp())
      order by n.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) q
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_my_notifications_v1(boolean,integer) from public, anon;
grant execute on function public.gellatti_my_notifications_v1(boolean,integer) to authenticated;

create or replace function public.gellatti_my_admin_preferences_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('ADMIN_READ') then
    raise exception 'administrator_required';
  end if;
  return coalesce((select jsonb_build_object(
    'salesSoundEnabled', p.sales_sound_enabled,
    'updatedAt', p.updated_at
  ) from public.admin_user_preferences p where p.user_id = auth.uid()),
    jsonb_build_object('salesSoundEnabled', false, 'updatedAt', null));
end;
$$;
revoke all on function public.gellatti_my_admin_preferences_v1() from public, anon;
grant execute on function public.gellatti_my_admin_preferences_v1() to authenticated;
