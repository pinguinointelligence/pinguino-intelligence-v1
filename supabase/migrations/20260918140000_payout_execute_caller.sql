-- ============================================================================
-- The caller for the payout executor
-- ============================================================================
-- STATUS: READY / WAITING FOR OWNER DB APPROVAL — NOT APPLIED.
--
-- `payout-execute` is operator-only: it compares the presented bearer against
-- the service role key it holds. This is the shape that presents that key
-- without any human ever reading it — the same Vault + pg_net caller
-- `gellatti-email-dispatch` and `gellatti-stripe-recovery` already use.
--
-- IT IS NOT SCHEDULED. A batch build can run nightly; moving money is an owner
-- decision, and live transfers are additionally gated by
-- `gellatti_assert_payout_allowed_v1` (payout_release_state). So this migration
-- installs the caller and leaves the trigger in the operator's hand.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.gellatti_payout_execute_tick_v1(
  p_batch_id uuid,
  p_limit integer default 10,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_base_url text;
  v_dispatch_key text;
  v_batch public.payout_batches%rowtype;
  v_claimable integer;
  v_request_id bigint;
begin
  select * into v_batch from public.payout_batches where id = p_batch_id;
  if not found then
    raise exception 'payout_batch_not_found';
  end if;
  -- Live money needs the owner's release, exactly as every other payout step.
  perform public.gellatti_assert_payout_allowed_v1(v_batch.livemode);

  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'gellatti_edge_functions_base_url';
  select decrypted_secret into v_dispatch_key
    from vault.decrypted_secrets where name = 'gellatti_edge_dispatch_key';
  if v_base_url is null or v_dispatch_key is null then
    return jsonb_build_object('skipped', 'not_configured');
  end if;

  select count(*) into v_claimable
    from public.partner_payouts pp
   where pp.batch_id = p_batch_id
     and pp.status = 'pending'
     and pp.stripe_transfer_id is null
     and pp.amount_cents > 0;
  if v_claimable = 0 then
    return jsonb_build_object('skipped', 'nothing_claimable', 'batchId', p_batch_id);
  end if;

  select net.http_post(
    url => rtrim(v_base_url, '/') || '/payout-execute',
    body => jsonb_build_object('batchId', p_batch_id, 'limit', greatest(coalesce(p_limit, 10), 1))
            || coalesce(p_options, '{}'::jsonb),
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_dispatch_key
    ),
    timeout_milliseconds => 60000
  ) into v_request_id;

  return jsonb_build_object('dispatched', true, 'batchId', p_batch_id, 'claimable', v_claimable, 'requestId', v_request_id);
end
$$;

revoke all on function public.gellatti_payout_execute_tick_v1(uuid, integer, jsonb) from public, anon, authenticated;
