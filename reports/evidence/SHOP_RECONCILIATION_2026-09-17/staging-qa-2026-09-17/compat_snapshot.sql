-- Read-only compatibility snapshot, as the real callers (old clients use the v1 reads).
-- Runs the STABLE read functions under the QA identities, then raises to roll everything back.
do $$
declare
  r jsonb := '{}'::jsonb;
  a uuid := 'e10ea1b3-6c5a-43b7-9173-a9a8baa43f15';  -- QA A test1
  b uuid := 'cad05017-9efc-4cc5-ac77-842839db2061';  -- QA B home
  f uuid := 'cdde5544-3ffa-4e06-a6e1-4079ade8f446';  -- finance admin
  v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.gellatti_my_shop_orders_v1();
  r := r || jsonb_build_object('A_v1_my_orders', jsonb_build_object(
    'count', jsonb_array_length(coalesce(v, '[]')),
    'types', (select jsonb_agg(distinct coalesce(e->>'orderType', e->>'order_type', '?')) from jsonb_array_elements(coalesce(v, '[]')) e),
    'documentsListed', (select count(*) from jsonb_array_elements(coalesce(v, '[]')) e where e::text ilike '%DIGITAL_DOCUMENT%')));
  v := public.gellatti_my_shop_documents_v1();
  r := r || jsonb_build_object('A_my_documents', (select jsonb_agg(jsonb_build_object('n', e->>'orderNumber', 'v', e->>'documentVersion', 'mail', e->>'emailStatus', 'total', e->>'totalCents')) from jsonb_array_elements(coalesce(v, '[]')) e));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.gellatti_my_shop_documents_v1();
  r := r || jsonb_build_object('B_my_documents', (select jsonb_agg(jsonb_build_object('n', e->>'orderNumber', 'v', e->>'documentVersion')) from jsonb_array_elements(coalesce(v, '[]')) e));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.gellatti_admin_shop_orders_v1(500);
  r := r || jsonb_build_object('Finance_v1_admin_orders', jsonb_build_object(
    'count', jsonb_array_length(coalesce(v, '[]')),
    'documentsListed', (select count(*) from jsonb_array_elements(coalesce(v, '[]')) e where e::text ilike '%DIGITAL_DOCUMENT%')));
  r := r || jsonb_build_object('Finance_v1_revenue_summary', public.gellatti_shop_revenue_summary_v1());
  v := public.gellatti_admin_shop_documents_v1(200);
  r := r || jsonb_build_object('Finance_documents', (select jsonb_agg(jsonb_build_object('n', e->>'orderNumber', 'qa', e->>'qaAccount', 'v', e->>'documentVersion', 'sha8', left(e->>'documentSha256', 8), 'mail', e->>'emailStatus')) from jsonb_array_elements(coalesce(v, '[]')) e));
  reset role;

  r := r || jsonb_build_object('orders_by_type', (select jsonb_object_agg(order_type, n) from (select order_type, count(*) n from public.shop_orders group by order_type) t));
  raise exception 'SNAPSHOT %', r;
end $$;
