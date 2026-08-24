-- One-time article identity repair for the canonical product projections.
-- Mapper data remains immutable: this changes only public.products.product_code.
-- The numeric suffix is preserved for every legacy customer-created article.

do $normalize_article_identity$
declare
  v_duplicate text;
begin
  perform set_config('app.canonical_product_ingest','v1',true);

  -- Fail closed if any intended PI identity is already owned by another row.
  select desired_code into v_duplicate
  from (
    select substring(p.normalized_identity from length('mapper:')+1) desired_code,
      count(*) over (
        partition by substring(p.normalized_identity from length('mapper:')+1)
      ) duplicate_count
    from public.products p
    where p.product_kind='mapper_reference'
      and p.normalized_identity like 'mapper:PI-ING-%'
  ) candidates
  where duplicate_count>1
  limit 1;
  if v_duplicate is not null then
    raise exception 'duplicate PI projection identity: %',v_duplicate;
  end if;

  if exists(
    select 1
    from public.products mapper_product
    join public.products occupied
      on occupied.product_code=substring(
        mapper_product.normalized_identity from length('mapper:')+1
      )
      and occupied.id<>mapper_product.id
    where mapper_product.product_kind='mapper_reference'
      and mapper_product.normalized_identity like 'mapper:PI-ING-%'
  ) then
    raise exception 'PI article identity is already occupied';
  end if;

  update public.products p
  set product_code=substring(p.normalized_identity from length('mapper:')+1),
      updated_at=now()
  where p.product_kind='mapper_reference'
    and p.normalized_identity like 'mapper:PI-ING-%'
    and p.product_code is distinct from substring(
      p.normalized_identity from length('mapper:')+1
    );

  -- Before PM existed, Scanner/manual rows consumed PR codes. Preserve their
  -- stable numeric suffix while correcting only the origin namespace.
  update public.products p
  set product_code='PM'||substring(p.product_code from 3),
      updated_at=now()
  where p.product_kind<>'mapper_reference'
    and p.source_type in ('label_scan','manual')
    and p.product_code like 'PR-ING-%';

  if exists(
    select 1 from public.products p
    where p.product_kind='mapper_reference'
      and p.normalized_identity like 'mapper:PI-ING-%'
      and p.product_code is distinct from substring(
        p.normalized_identity from length('mapper:')+1
      )
  ) then
    raise exception 'PI projection identity repair incomplete';
  end if;
end;
$normalize_article_identity$;

comment on function public.next_product_code()
is 'DB-owned PR/PM article allocator. PI identity is the immutable Mapper ingredient_id; Scanner/barcode/manual allocate PM and catalog imports allocate PR.';
