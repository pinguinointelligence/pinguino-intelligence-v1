-- QA ONLY — controlled refusal of chosen Stripe webhook deliveries (fault injection at durable receipt).
--
-- Why: a real out-of-order delivery happens when Stripe's first delivery of an
-- event fails (the endpoint returns non-2xx) and Stripe delivers it again after
-- later events. stripe-webhook returns 500 `durable_receipt_failed` when its
-- insert into stripe_webhook_events fails. This trigger makes exactly that
-- insert fail for the event types of ONE Stripe customer while a fault row is
-- active. The code under test is not modified: the same signed Stripe deliveries,
-- the same function, the same state machine.
--
-- Rollback (record it in qa_bootstrap.environment_changes when run):
--   drop trigger if exists qa_refuse_faulted_webhook_delivery on public.stripe_webhook_events;
--   drop function if exists qa_harness.refuse_faulted_webhook_delivery_v1();
--   (qa_harness.webhook_delivery_faults is kept as the record of every injected fault)
do $fault$
begin
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg' and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b') then
    raise exception 'isolation guard: not the QA branch';
  end if;

  create table if not exists qa_harness.webhook_delivery_faults (
    id bigint generated always as identity primary key,
    run_id uuid not null,
    label text not null,
    match_customer text not null check (match_customer ~ '^cus_[A-Za-z0-9]+$'),
    match_types text[] not null check (cardinality(match_types) > 0),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    released_at timestamptz
  );
  alter table qa_harness.webhook_delivery_faults enable row level security;
  revoke all on qa_harness.webhook_delivery_faults from public, anon, authenticated, service_role;

  create or replace function qa_harness.refuse_faulted_webhook_delivery_v1()
  returns trigger language plpgsql security definer
  set search_path = pg_catalog, public
  as $fn$
  begin
    if exists (
      select 1 from qa_harness.webhook_delivery_faults f
      where f.active
        and new.event_type = any (f.match_types)
        and coalesce(new.payload -> 'data' -> 'object' ->> 'customer', '') = f.match_customer
    ) then
      raise exception 'qa_fault_injection: durable receipt refused for % (%)', new.event_id, new.event_type;
    end if;
    return new;
  end
  $fn$;
  revoke all on function qa_harness.refuse_faulted_webhook_delivery_v1() from public, anon, authenticated, service_role;

  drop trigger if exists qa_refuse_faulted_webhook_delivery on public.stripe_webhook_events;
  create trigger qa_refuse_faulted_webhook_delivery
    before insert on public.stripe_webhook_events
    for each row execute function qa_harness.refuse_faulted_webhook_delivery_v1();

  insert into qa_bootstrap.environment_changes (change, reason)
  values ('qa_harness.webhook_delivery_faults + qa_harness.refuse_faulted_webhook_delivery_v1() + BEFORE INSERT trigger qa_refuse_faulted_webhook_delivery on public.stripe_webhook_events (QA fault injection; inert while no fault row is active). Rollback: drop trigger qa_refuse_faulted_webhook_delivery on public.stripe_webhook_events; drop function qa_harness.refuse_faulted_webhook_delivery_v1().',
          'Campaign run 77736f00: real out-of-order Stripe deliveries (refund/dispute before invoice.paid, invoice before subscription) without modifying the webhook code under test. A refused receipt returns 500 durable_receipt_failed, Stripe keeps the event pending, and the campaign releases the fault and redelivers via POST /v1/events/{id}/retry to endpoint we_1UGdYfAi07MMapq2rQwaGFpG.');
end
$fault$;
select (select count(*) from pg_trigger where tgname = 'qa_refuse_faulted_webhook_delivery' and not tgisinternal) as trigger_present,
       (select count(*) from qa_harness.webhook_delivery_faults where active) as active_faults;
