#!/usr/bin/env python3
"""QA ONLY — the Connect account and the payout transfer, end to end in the sandbox.

Stages, each proving one thing the campaign could not before:

  account     an Express connected account with the transfers capability, created
              exactly as admin-control creates it and bound through the REAL admin
              RPC (authenticated role, the admin's own user id), never a direct
              column write.
  requirements what Stripe still wants from the account holder. Nothing here sets
              payouts_enabled by hand: it is read from the account and mirrored by
              the signed account.updated delivery.
  funding     the platform's AVAILABLE balance, because a transfer moves money the
              platform already holds.
  batch       a payout line written directly for this test, with its entry reserved
              in the same transaction, so the DB payout soak's global builder never
              sees an unreserved entry of ours. (The builder itself is exercised by
              S12 and continuously by the soak.)
  interrupt   the executor stops after Stripe accepted the transfer and BEFORE the
              ledger records it.
  recover     the next run presents the same idempotency key: Stripe returns the
              SAME transfer, the ledger binds it, and the partner is paid once.

Run:  python3 connect_payout.py <run-id> [stage ...]
"""
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from campaign import Campaign, GUARD, PARTNER_A, REF, USERS  # noqa: E402

FN = f'https://{REF}.supabase.co/functions/v1'
ADMIN_EMAIL = 'qa.growth.admin@example.invalid'
RETURN_URL = 'http://localhost:5188/partner?section=payouts&connect=returned'
REFRESH_URL = 'http://localhost:5188/partner?section=payouts&connect=refresh'


def service_call(c, name, path, payload):
    """Call an operator-only Edge Function the way the scheduler does: the service
    role key comes from the environment of the caller, never from this file."""
    key = os.environ.get('QA_SERVICE_ROLE_KEY', '')
    if not key:
        raise SystemExit('QA_SERVICE_ROLE_KEY is not set in the environment of this process')
    req = urllib.request.Request(f'{FN}/{path}', data=json.dumps(payload).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = json.loads(r.read())
            status = r.status
    except urllib.error.HTTPError as e:
        status, body = e.code, json.loads(e.read() or b'{}')
    open(os.path.join(c.dir, f'svc-{name}.json'), 'w').write(json.dumps({'status': status, 'body': body}, indent=1))
    return status, body


def state(c):
    path = os.path.join(c.dir, 'connect-state.json')
    return json.load(open(path)) if os.path.exists(path) else {}


def save_state(c, **kw):
    path = os.path.join(c.dir, 'connect-state.json')
    data = state(c)
    data.update(kw)
    json.dump(data, open(path, 'w'), indent=1, default=str)
    return data


def stage_account(c):
    st = 'C1'
    s = state(c)
    existing = c.sql('c1-partner', f"""select jsonb_build_object(
  'connect', p.stripe_connect_account_id, 'onboarding', p.onboarding_complete,
  'payouts', p.payouts_enabled, 'status', p.status) as p
from public.partners p where p.id = '{PARTNER_A}';""")[0]['p']
    account_id = existing.get('connect') or s.get('account')
    if not account_id:
        account = c.stripe('c1-account-create', 'connect_account_create', {
            'email': 'qa.growth.partner.a@example.invalid', 'partnerId': PARTNER_A, 'businessType': 'individual'})
        account_id = account['id']
        c.say(f"c1 created connect account {account_id}")
    # The REAL admin path writes the binding: permission check, audit row and all.
    bound = c.sql('c1-bind', f"""do $b$ declare v jsonb; begin {GUARD}
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = '{ADMIN_EMAIL}'), 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{{"origin":"http://localhost:5188"}}', true);
  execute 'set local role authenticated';
  v := public.gellatti_admin_register_partner_connect_v1('{PARTNER_A}'::uuid, '{account_id}');
  execute 'reset role';
  insert into qa_harness.observations (run_id, worker, payload) values ('{c.run}', 'c1-bind', coalesce(v, '{{}}'::jsonb));
exception when others then
  execute 'reset role';
  insert into qa_harness.observations (run_id, worker, payload) values ('{c.run}', 'c1-bind-error', jsonb_build_object('error', sqlerrm));
end $b$;
select jsonb_build_object('connect', p.stripe_connect_account_id,
  'audit', (select jsonb_agg(jsonb_build_object('action', a.action, 'actor', a.actor_type, 'env', a.diff ->> 'environment') order by a.created_at desc)
            from public.audit_log a where a.entity_id = '{PARTNER_A}' and a.action = 'partner.connect_provision')) as after
from public.partners p where p.id = '{PARTNER_A}';""")[0]['after']
    c.check(st, 'the admin path binds the connected account to Partner A', account_id, bound.get('connect'))
    c.say(f"c1 audit: {json.dumps(bound.get('audit'), default=str)}")
    save_state(c, account=account_id)
    c.save()
    return account_id


def stage_requirements(c, prefill=True):
    st = 'C2'
    account_id = state(c)['account']
    if prefill:
        token = c.stripe('c2-bank-token', 'token_bank_account', {})
        c.stripe('c2-prefill', 'connect_account_update', {'accountId': account_id, 'params': {
            'business_profile': {'mcc': '5814', 'product_description': 'QA partner referrals', 'url': 'https://example.invalid/qa'},
            'business_type': 'individual',
            'individual': {
                'first_name': 'QA', 'last_name': 'PartnerA', 'email': 'qa.growth.partner.a@example.invalid',
                'phone': '+34600000000', 'dob': {'day': 1, 'month': 1, 'year': 1990},
                'address': {'line1': 'Carrer de Test 1', 'city': 'Palma', 'postal_code': '07001', 'country': 'ES'},
                'id_number': '000000000',
            },
            'external_account': token['id'],
        }})
    account = c.stripe('c2-account-get', 'connect_account_get', {'accountId': account_id})
    due = (account.get('requirements') or {})
    c.say(f"c2 requirements: {json.dumps({k: due.get(k) for k in ('currently_due', 'past_due', 'disabled_reason', 'pending_verification')}, default=str)}")
    c.say(f"c2 capabilities: {json.dumps(account.get('capabilities'), default=str)} payouts_enabled={account.get('payouts_enabled')} details_submitted={account.get('details_submitted')}")
    c.check(st, 'the account requests exactly the transfers capability, and nothing to take payments with',
            {'transfers': True, 'card_payments': False},
            {'transfers': 'transfers' in (account.get('capabilities') or {}),
             'card_payments': 'card_payments' in (account.get('capabilities') or {})})
    mirrored = c.sql('c2-mirror', f"""select jsonb_build_object('onboarding', p.onboarding_complete, 'payouts', p.payouts_enabled) as m
from public.partners p where p.id = '{PARTNER_A}';""")[0]['m']
    c.say(f"c2 partner row mirror: {json.dumps(mirrored)}")
    save_state(c, payouts_enabled=account.get('payouts_enabled'), details_submitted=account.get('details_submitted'),
               currently_due=due.get('currently_due'))
    c.save()
    return account


def stage_link(c):
    st = 'C3'
    account_id = state(c)['account']
    link = c.stripe('c3-onboarding-link', 'connect_account_link',
                    {'accountId': account_id, 'returnUrl': RETURN_URL, 'refreshUrl': REFRESH_URL})
    # The URL is a one-time credential for the account holder: it is written to
    # the run folder for the operator, never into the report.
    open(os.path.join(c.dir, 'connect-onboarding-url.txt'), 'w').write(f"{link['url']}\n")
    c.check(st, 'the existing onboarding link function returns a hosted Stripe URL', True,
            str(link.get('url', '')).startswith('https://connect.stripe.com'))
    c.save()
    return link


def stage_funding(c, amount=20000):
    st = 'C4'
    before = c.stripe('c4-balance-before', 'balance_get', {})
    c.stripe('c4-funding', 'platform_funding_charge', {'amount': amount})
    time.sleep(5)
    after = c.stripe('c4-balance-after', 'balance_get', {})
    avail = lambda b: sum(x['amount'] for x in b.get('available', []) if x['currency'] == 'eur')
    c.say(f"c4 platform available EUR before={avail(before)} after={avail(after)}")
    c.check(st, 'the platform holds enough available balance for the test transfer', True, avail(after) >= 2500)
    save_state(c, available_before=avail(before), available_after=avail(after))
    c.save()


def stage_batch(c, amount=2500):
    """One payout line, with its entry reserved in the SAME transaction, so the
    soak's global builder never sees an unreserved entry of ours."""
    st = 'C5'
    row = c.sql('c5-batch', f"""do $b$
declare v_batch uuid; v_entry uuid; v_payout uuid;
begin {GUARD}
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier,
    rule_version, amount_cents, status, earned_at, eligible_at, livemode)
  values ('{PARTNER_A}', 'sub_qa_transfer_{c.run[:8]}', 'home_monthly_standard', 'home', 'monthly', 'standard', 1,
    {amount}, 'eligible', now() - interval '100 days', now() - interval '1 minute', false)
  returning id into v_entry;

  insert into public.payout_batches (month, currency, livemode, status, started_at)
  values (date_trunc('month', now())::date, 'eur', false, 'processing', now())
  on conflict (month, currency, livemode) do update set updated_at = now()
  returning id into v_batch;

  insert into public.partner_payouts (batch_id, partner_id, amount_cents, carry_forward_cents, currency, status, idempotency_key)
  values (v_batch, '{PARTNER_A}', {amount}, 0, 'eur', 'pending',
          to_char(date_trunc('month', now()), 'YYYY-MM-DD') || ':{PARTNER_A}:eur:test:qa{c.run[:8]}')
  returning id into v_payout;

  insert into public.partner_payout_items (payout_id, commission_entry_id, amount_cents)
  values (v_payout, v_entry, {amount});

  insert into qa_harness.fixtures (run_id, kind, object_id, label) values ('{c.run}', 'payout_batch', v_batch::text, 'connect-transfer');
  insert into qa_harness.observations (run_id, worker, payload)
  values ('{c.run}', 'c5-batch', jsonb_build_object('batch', v_batch, 'entry', v_entry, 'payout', v_payout, 'amount', {amount}));
end $b$;
select payload from qa_harness.observations where run_id = '{c.run}' and worker = 'c5-batch' order by observed_at desc limit 1;""")[0]['payload']
    c.check(st, 'one pending payout line, its entry reserved in the same transaction', {'amount': amount},
            {'amount': row['amount']})
    save_state(c, batch=row['batch'], entry=row['entry'], payout=row['payout'])
    c.save()
    return row


def stage_interrupt(c):
    st = 'C6'
    s = state(c)
    status, body = service_call(c, 'execute-stop', 'payout-execute',
                                {'batchId': s['batch'], 'limit': 5, 'qaStopAfterTransfer': True})
    c.say(f"c6 executor (stop after transfer): {json.dumps(body)[:600]}")
    transferred = [r for r in body.get('results', []) if r.get('outcome') == 'transferred_not_settled']
    c.check(st, 'the transfer exists at Stripe and the ledger has NOT recorded it', True,
            status == 200 and len(transferred) == 1)
    ledger = c.sql('c6-ledger', f"""select jsonb_build_object('status', pp.status, 'transfer', pp.stripe_transfer_id,
  'entry_status', (select ce.status from public.commission_entries ce where ce.id = '{s['entry']}')) as l
from public.partner_payouts pp where pp.id = '{s['payout']}';""")[0]['l']
    c.check(st, 'the line is still pending, with no transfer id and its entry still eligible',
            {'status': 'pending', 'transfer': None, 'entry_status': 'eligible'}, ledger)
    save_state(c, interrupted_transfer=(transferred[0]['transfer'] if transferred else None))
    c.save()


def stage_recover(c):
    st = 'C7'
    s = state(c)
    status, body = service_call(c, 'execute-recover', 'payout-execute', {'batchId': s['batch'], 'limit': 5})
    c.say(f"c7 executor (recovery run): {json.dumps(body)[:600]}")
    settled = [r for r in body.get('results', []) if r.get('outcome') == 'settled']
    c.check(st, 'the recovery run binds the SAME transfer instead of sending a second one',
            s.get('interrupted_transfer'), settled[0]['transfer'] if settled else None)
    transfers = c.stripe('c7-transfers', 'transfers_for_destination', {'accountId': s['account']})['data']
    c.check(st, 'Stripe holds exactly ONE transfer to that connected account', 1, len(transfers))
    ledger = c.sql('c7-ledger', f"""select jsonb_build_object('status', pp.status, 'transfer', pp.stripe_transfer_id,
  'paid_at', pp.paid_at, 'entry_status', (select ce.status from public.commission_entries ce where ce.id = '{s['entry']}'),
  'released_items', (select count(*) from public.partner_payout_items i where i.payout_id = pp.id and i.released_at is not null)) as l
from public.partner_payouts pp where pp.id = '{s['payout']}';""")[0]['l']
    c.check(st, 'the line is paid, bound to that transfer, and its entry is paid',
            {'status': 'paid', 'transfer': s.get('interrupted_transfer'), 'entry_status': 'paid'},
            {'status': ledger['status'], 'transfer': ledger['transfer'], 'entry_status': ledger['entry_status']})
    # A third run must find nothing left to pay.
    status, again = service_call(c, 'execute-again', 'payout-execute', {'batchId': s['batch'], 'limit': 5})
    c.check(st, 'a third run pays nothing: the batch has no claimable line left', {'claimed': 0, 'transferred': 0},
            {'claimed': again.get('claimed'), 'transferred': again.get('transferred')})
    payouts = c.stripe('c7-payouts', 'payouts_for_account', {'accountId': s['account']})['data']
    c.say(f"c7 payouts on the connected account: {json.dumps([{k: p.get(k) for k in ('id', 'amount', 'status', 'arrival_date', 'automatic')} for p in payouts], default=str)}")
    c.say('c7 boundary: a Transfer moves platform → connected account. The payout to the partner bank is made by '
          'Stripe on the connected account schedule and may aggregate several transfers; nothing above claims a bank arrival.')
    c.save()


STAGES = {
    'account': stage_account,
    'requirements': stage_requirements,
    'link': stage_link,
    'funding': stage_funding,
    'batch': stage_batch,
    'interrupt': stage_interrupt,
    'recover': stage_recover,
}

if __name__ == '__main__':
    camp = Campaign(sys.argv[1])
    for name in (sys.argv[2:] or ['account', 'requirements', 'link', 'funding', 'batch', 'interrupt', 'recover']):
        STAGES[name](camp)
    camp.say(f"connect/payout: {sum(x['pass'] for x in camp.checks)}/{len(camp.checks)} checks passed")
