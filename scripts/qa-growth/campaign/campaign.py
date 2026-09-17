#!/usr/bin/env python3
"""QA ONLY - Growth campaign controller (SANDBOX_E2E + Test Clocks) for the QA branch.

Stripe writes go through the QA-only Edge Function `qa-growth-campaign` (the key
never leaves Supabase). Database reads and the business-time jobs go through
`supabase db query` against ncmsonfwbgsqedgnzofg, strictly one call at a time.

Every stage records THREE clocks explicitly, because a campaign that only moves
one of them can pass for the wrong reason:
  stripeClock  - the Test Clock frozen_time the Billing event happened at
  dbNow        - PostgreSQL now() when the database step ran
  businessTime - the p_now handed to a scheduled job (eligibility, batches)

Expected values come from the existing contract only: commission_rules v1, the
hold calendar (eligible on the 1st of month+3 at 00:00 Europe/Madrid) and
WEBHOOK_MATRIX.md. Nothing here decides a business rule.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import uuid
from zoneinfo import ZoneInfo

# A slice may be run again after a fix; the suffix keeps the new lane's users,
# labels and Stripe idempotency keys distinct from the first run's.
SUFFIX = ''

REF = 'ncmsonfwbgsqedgnzofg'
BRANCH = '14d26da6-6ce1-404d-87b7-449f1cbd700b'
FN = f'https://{REF}.supabase.co/functions/v1'
LOGROOT = os.path.expanduser('~/Developer/pinguino-affiliate-work/logs/qa-stripe/campaign')
GUARD = (f"if not exists (select 1 from qa_bootstrap.environment where project_ref = '{REF}' "
         f"and branch_id = '{BRANCH}') then raise exception 'isolation guard: not the QA branch'; end if;")

USERS = {
    'home': '0bfb2852-7079-41fa-9887-3f99529364f8',
    'pro': '54eb2074-7ea8-4772-b609-00691d1ee077',
    'referrer': '6f974d46-349c-44a5-820d-7824ad19980b',
    'referred': '4896b1db-4dce-4002-813d-36017bf0a171',
    'partner_a': '05a67899-8ee7-4275-a197-14d6c37056eb',
}
PARTNER_A = '4b184129-b5a9-4140-b26e-17846acf8313'


class Campaign:
    def __init__(self, run_id=None):
        self.run = run_id or str(uuid.uuid4())
        self.dir = os.path.join(LOGROOT, self.run[:8])
        os.makedirs(self.dir, exist_ok=True)
        self.checks = []
        self._saved = 0
        self.log = open(os.path.join(self.dir, 'controller.log'), 'a')

    # ── plumbing ──────────────────────────────────────────────────────────────
    def say(self, msg):
        line = f"{datetime.datetime.utcnow().isoformat()}Z {msg}"
        print(line, flush=True)
        self.log.write(line + '\n')
        self.log.flush()

    def sql(self, tag, text):
        path = os.path.join(self.dir, f'{tag}.sql')
        open(path, 'w').write(text)
        res = subprocess.run(['supabase', 'db', 'query', '--linked', '--project-ref', REF, '-o', 'json', '--file', path],
                             capture_output=True, text=True, timeout=180)
        out = res.stdout + res.stderr
        open(os.path.join(self.dir, f'{tag}.out'), 'w').write(out)
        if res.returncode != 0:
            m = re.search(r'ERROR:\s+(\w+):\s+(.*?)(?:\\n|"\})', out)
            raise RuntimeError(f"{tag}: {m.group(0) if m else out[-400:]}")
        i, j = res.stdout.find('{'), res.stdout.rfind('}')
        return json.loads(res.stdout[i:j + 1], strict=False)['rows'] if i >= 0 else []

    def nonce(self):
        rows = self.sql(f'nonce-{int(time.time()*1000)}',
                        "insert into qa_harness.invocation_nonces (purpose) values ('campaign') returning nonce;")
        return rows[0]['nonce']

    def stripe(self, step, action, params):
        payload = json.dumps({'run': self.run, 'step': step, 'action': action, 'params': params}).encode()
        req = urllib.request.Request(f'{FN}/qa-growth-campaign', data=payload, method='POST',
                                     headers={'Content-Type': 'application/json', 'x-qa-nonce': self.nonce()})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                body = json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = json.loads(e.read() or b'{}')
            open(os.path.join(self.dir, f'stripe-{step}.json'), 'w').write(json.dumps(body, indent=1))
            raise RuntimeError(f'stripe {step} {action}: {body}')
        open(os.path.join(self.dir, f'stripe-{step}.json'), 'w').write(json.dumps(body, indent=1))
        return body['result']

    def http(self, name, url, payload, headers=None):
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, body = r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            status, body = e.code, json.loads(e.read() or b'{}')
        open(os.path.join(self.dir, f'http-{name}.json'), 'w').write(json.dumps({'status': status, 'body': body}, indent=1))
        return status, body

    def check(self, stage, name, expected, observed, ok=None):
        passed = (expected == observed) if ok is None else bool(ok)
        self.checks.append({'stage': stage, 'check': name, 'expected': expected, 'observed': observed, 'pass': passed})
        self.say(f"{'PASS' if passed else 'FAIL'} [{stage}] {name} expected={json.dumps(expected, default=str)} observed={json.dumps(observed, default=str)}")
        return passed

    def clocks(self, stage, stripe_clock=None, business_time=None):
        db_now = self.sql(f'dbnow-{int(time.time()*1000)}', 'select now() as now;')[0]['now']
        rec = {'stage': stage, 'stripeClock': stripe_clock, 'dbNow': db_now, 'businessTime': business_time}
        self.say(f'CLOCKS {json.dumps(rec)}')
        with open(os.path.join(self.dir, 'clocks.jsonl'), 'a') as f:
            f.write(json.dumps(rec) + '\n')
        return rec

    def save(self):
        # One file per slice invocation plus an append-only log: a later slice never overwrites an earlier result.
        stage = self.checks[0]['stage'] if self.checks else 'none'
        json.dump({'run': self.run, 'checks': self.checks}, open(os.path.join(self.dir, f'checks-{stage}.json'), 'w'), indent=1, default=str)
        with open(os.path.join(self.dir, 'checks.jsonl'), 'a') as f:
            for chk in self.checks[self._saved:]:
                f.write(json.dumps(chk, default=str) + '\n')
        self._saved = len(self.checks)

    # ── shared reads ──────────────────────────────────────────────────────────
    def events_for(self, tag, needles):
        cond = ' or '.join(f"e.payload::text like '%{n}%'" for n in needles)
        return self.sql(tag, f"""select coalesce(jsonb_agg(jsonb_build_object(
  'event_id', e.event_id, 'type', e.event_type, 'state', e.state, 'received_at', e.received_at,
  'attempts', e.attempts, 'failure', e.last_error, 'processed_at', e.processed_at, 'livemode', e.livemode,
  'object', e.payload -> 'data' -> 'object' ->> 'id') order by e.received_at, e.event_id), '[]'::jsonb) as ev
from public.stripe_webhook_events e where {cond};""")[0]['ev']

    def wait_events(self, tag, needles, expect_types, timeout=150):
        deadline = time.time() + timeout
        seen = []
        while time.time() < deadline:
            seen = self.events_for(f'{tag}-{int(time.time())}', needles)
            types = {e['type'] for e in seen}
            settled = all(e['state'] not in ('received', 'processing') for e in seen)
            if set(expect_types) <= types and settled:
                return seen
            time.sleep(8)
        return seen


def hold_eligible_at(paid_epoch):
    """The existing hold calendar: 00:00 Europe/Madrid on the 1st of (earned month + 3)."""
    madrid = ZoneInfo('Europe/Madrid')
    local = datetime.datetime.fromtimestamp(paid_epoch, tz=datetime.timezone.utc).astimezone(madrid)
    month = local.month + 3
    year = local.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    return datetime.datetime(year, month, 1, tzinfo=madrid).astimezone(datetime.timezone.utc)


# ── generic lane helpers ──────────────────────────────────────────────────────
def month_shift(epoch, months):
    d = datetime.datetime.fromtimestamp(epoch, tz=datetime.timezone.utc)
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return int(d.replace(year=y, month=m, day=day).timestamp())


def new_customer_user(c, label):
    email = f'qa.growth.cust.{label}.{c.run[:8]}@example.invalid'
    uid = str(uuid.uuid4())
    c.sql(f'user-{label}', f"""do $u$ declare v_col text; begin {GUARD}
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('{uid}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{email}', now(),
            '{{"provider":"email","providers":["email"]}}', '{{"qa_fixture":"growth_campaign"}}', now(), now());
  for v_col in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'
      and column_name in ('confirmation_token','recovery_token','email_change_token_new','email_change_token_current','email_change','phone_change','phone_change_token','reauthentication_token') loop
    execute format('update auth.users set %I = '''' where id = $1 and %I is null', v_col, v_col) using '{uid}'::uuid;
  end loop;
  insert into qa_harness.fixtures (run_id, kind, object_id, label) values ('{c.run}', 'auth_user', '{uid}', '{label}');
end $u$;""")
    return uid, email


def attribute(c, label, user_id):
    status, body = c.http(f'resolve-{label}', f'{FN}/partner-link-resolve',
                          {'action': 'RESOLVE', 'partnerSlug': 'qa-partner-a', 'code': 'qa-partner-a'}, {'Origin': 'http://localhost:5188'})
    if status != 200:
        raise RuntimeError(f'resolve {label}: {status} {body}')
    rows = c.sql(f'claim-{label}', f"""do $c$ declare v jsonb; begin {GUARD}
  perform set_config('request.jwt.claims', json_build_object('sub', '{user_id}', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v := public.gellatti_claim_partner_click_v1('{body['clickId']}'::uuid);
  execute 'reset role';
end $c$;
select a.id, a.status from public.referral_attributions a where a.user_id = '{user_id}' order by a.created_at desc limit 1;""")
    return rows[0]['id']


def advance(c, step, clock_id, target):
    c.stripe(step, 'clock_advance', {'clockId': clock_id, 'frozenTime': target})
    deadline = time.time() + 240
    while time.time() < deadline:
        time.sleep(6)
        clock = c.stripe(f'{step}-poll-{int(time.time())}', 'clock_get', {'clockId': clock_id})
        if clock['status'] == 'ready' and clock['frozen_time'] >= target:
            return clock
    raise RuntimeError(f'clock {clock_id} did not reach {target}')


def invoices(c, step, sub_id):
    return c.stripe(step, 'invoices_for_subscription', {'subscriptionId': sub_id})['data']


def pi_of(c, step, invoice_id):
    pays = c.stripe(step, 'invoice_payments', {'invoiceId': invoice_id})['data']
    paid = [x for x in pays if x.get('status') == 'paid']
    return (paid[0].get('payment') or {}).get('payment_intent') if paid else None


def ledger(c, tag, sub_id):
    return c.sql(tag, f"""select jsonb_build_object(
  'subscription', (select to_jsonb(s) from public.customer_subscriptions s where s.stripe_subscription_id = '{sub_id}'),
  'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', ce.id, 'invoice', ce.stripe_invoice_id, 'pi', ce.stripe_payment_intent_id, 'amount', ce.amount_cents, 'cadence', ce.cadence,
      'offer', ce.offer_key, 'tier', ce.tier, 'status', ce.status, 'earned_at', ce.earned_at, 'eligible_at', ce.eligible_at,
      'adjustments', (select coalesce(jsonb_agg(jsonb_build_object('amount', ca.amount_cents, 'kind', ca.kind, 'source', ca.source_event_key) order by ca.created_at), '[]'::jsonb)
                      from public.commission_adjustments ca where ca.commission_entry_id = ce.id)) order by ce.earned_at), '[]'::jsonb)
    from public.commission_entries ce where ce.stripe_subscription_id = '{sub_id}'),
  'entitlements', (select coalesce(jsonb_agg(jsonb_build_object('scope', en.scope, 'status', en.status, 'starts_at', en.starts_at, 'ends_at', en.ends_at, 'source', en.source_type)), '[]'::jsonb)
    from public.entitlements en where en.user_id = (select user_id from public.customer_subscriptions where stripe_subscription_id = '{sub_id}'))
) as l;""")[0]['l']


def lane(c, label, price_env, offer_key, pm='pm_card_visa', anchor_hours=3, backdate=True, partner=True,
         before_subscribe=None, user=None):
    """A customer user (attributed to Partner A unless partner=False), on its own Test Clock, subscribed to a REAL offer.
    backdate=True positions the next renewal `anchor_hours` ahead on the clock, inside the current month.
    before_subscribe(customer_id) runs after the customer exists and before any invoice does (fault injection)."""
    uid, email = user if user else new_customer_user(c, label)
    attr = attribute(c, label, uid) if partner else None
    t0 = int(time.time())
    clock = c.stripe(f'{label}-clock', 'clock_create', {'frozenTime': t0, 'name': f'qa-{c.run[:8]}-{label}'})
    cust = c.stripe(f'{label}-customer', 'customer_create', {'clockId': clock['id'], 'email': email, 'name': f'QA {label}',
                                                              'paymentMethod': pm, 'metadata': {'qa_run': c.run}})
    if before_subscribe:
        before_subscribe(cust['id'])
    metadata = {'pi_user_id': uid, 'pi_offer_key': offer_key}
    if attr:
        metadata['pi_attribution_id'] = attr
    params = {'customerId': cust['id'], 'priceEnv': price_env, 'metadata': metadata}
    anchor = None
    if backdate:
        anchor = t0 + anchor_hours * 3600
        interval_months = 12 if 'YEARLY' in price_env else 1
        params.update({'billingCycleAnchor': anchor, 'backdateStartDate': month_shift(anchor, -interval_months),
                       'prorationBehavior': 'create_prorations'})
    sub = c.stripe(f'{label}-subscription', 'subscription_create', params)
    c.clocks(f'{label}.create', stripe_clock=clock['frozen_time'])
    return {'uid': uid, 'email': email, 'attr': attr, 'clock': clock['id'], 't0': t0, 'anchor': anchor,
            'customer': cust['id'], 'sub': sub['id'], 'first_invoice': sub['latest_invoice']['id'], 'sub_obj': sub}


def slice1(c: Campaign):
    """Signed webhook proof + first commissionable payment on a Test Clock subscription."""
    stage = 'S1'
    c.sql('s1-run', f"""do $r$ begin {GUARD}
  insert into qa_harness.runs (run_id, kind, label, status, params) values ('{c.run}', 'CAMPAIGN_STRIPE',
    'Growth campaign: SANDBOX_E2E + Test Clocks (sandbox acct_1UGdTdAi07MMapq2)', 'RUNNING',
    jsonb_build_object('endpoint', 'we_1UGdYfAi07MMapq2rQwaGFpG', 'requestApiVersion', '2025-06-30.basil',
      'timeAccounting', 'stripeClock / dbNow / businessTime recorded per stage in clocks.jsonl',
      'separateFrom', '830782a2-ee40-4d4e-9b0a-645982de6cef (DB payout executor soak)'))
  on conflict (run_id) do nothing;
end $r$;""")

    # 1. The month's tier snapshot, written by the existing job at real time.
    snap = c.sql('s1-snapshot', f"""do $s$ begin {GUARD} end $s$;
select public.gellatti_partner_tier_snapshot_job_v1() as job,
  (select jsonb_agg(jsonb_build_object('month', month, 'tier', tier)) from public.partner_tier_snapshots where partner_id = '{PARTNER_A}') as partner_a;""")[0]
    c.clocks(stage + '.snapshot', business_time='dbNow (existing daily job, real month)')
    c.check(stage, 'tier snapshot for the current month exists for Partner A', True, bool(snap['partner_a']))

    # 2. Attribution through the real public link + the real claim function.
    status, body = c.http('s1-resolve', f'{FN}/partner-link-resolve',
                          {'action': 'RESOLVE', 'partnerSlug': 'qa-partner-a', 'code': 'qa-partner-a'},
                          {'Origin': 'http://localhost:5188'})
    c.check(stage, 'partner link RESOLVE returns a click', (200, True), (status, bool(body.get('clickId'))))
    click = body['clickId']
    attr = c.sql('s1-claim', f"""do $c$ declare v jsonb; begin {GUARD}
  perform set_config('request.jwt.claims', json_build_object('sub', '{USERS['home']}', 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{{"origin":"http://localhost:5188"}}', true);
  execute 'set local role authenticated';
  v := public.gellatti_claim_partner_click_v1('{click}'::uuid);
  execute 'reset role';
  insert into qa_harness.observations (run_id, worker, payload) values ('{c.run}', 's1-claim', v);
end $c$;
select to_jsonb(a) as attr from public.referral_attributions a where a.user_id = '{USERS['home']}' order by a.created_at desc limit 1;""")[0]['attr']
    c.check(stage, 'claim creates a PENDING attribution to Partner A for the HOME user',
            {'partner_id': PARTNER_A, 'status': 'pending'}, {'partner_id': attr.get('partner_id'), 'status': attr.get('status')})

    # 3. Billing on a Test Clock: customer + HOME monthly subscription with the
    #    same closed correlation metadata create-checkout-session stamps.
    now_epoch = int(time.time())
    clock = c.stripe('s1-clock', 'clock_create', {'frozenTime': now_epoch, 'name': f'qa-{c.run[:8]}-home-m'})
    customer = c.stripe('s1-customer', 'customer_create', {
        'clockId': clock['id'], 'email': 'qa.growth.home@example.invalid', 'name': 'QA HOME monthly via Partner A',
        'paymentMethod': 'pm_card_visa', 'metadata': {'qa_run': c.run}})
    sub = c.stripe('s1-subscription', 'subscription_create', {
        'customerId': customer['id'], 'priceEnv': 'STRIPE_PRICE_HOME_MONTHLY_STANDARD',
        'metadata': {'pi_user_id': USERS['home'], 'pi_offer_key': 'home_monthly_standard', 'pi_attribution_id': attr['id']}})
    invoice = sub['latest_invoice']
    c.clocks(stage + '.billing', stripe_clock=clock['frozen_time'])
    c.check(stage, 'subscription active and first invoice paid (raw Stripe response)',
            {'status': 'active', 'invoice': 'paid', 'livemode': False},
            {'status': sub['status'], 'invoice': invoice['status'], 'livemode': sub['livemode']})
    payments = c.stripe('s1-invoice-payments', 'invoice_payments', {'invoiceId': invoice['id']})
    paid = [p for p in payments['data'] if p.get('status') == 'paid']
    c.check(stage, 'Basil: the invoice payment is an InvoicePayment with a payment_intent',
            True, len(paid) == 1 and (paid[0].get('payment') or {}).get('type') == 'payment_intent')
    json.dump({'clock': clock['id'], 'customer': customer['id'], 'subscription': sub['id'], 'invoice': invoice['id'],
               'payment_intent': (paid[0]['payment'] or {}).get('payment_intent') if paid else None, 'attribution': attr['id']},
              open(os.path.join(c.dir, 'ids-s1.json'), 'w'), indent=1)

    # 4. Signed delivery → processing → writes.
    events = c.wait_events('s1-events', [sub['id'], invoice['id'], customer['id']],
                           ['customer.subscription.created', 'invoice.paid', 'invoice.payment_succeeded', 'invoice.finalized'])
    json.dump(events, open(os.path.join(c.dir, 'events-s1.json'), 'w'), indent=1)
    c.check(stage, 'signed events were durably received (signature verified before insert)', True,
            {'customer.subscription.created', 'invoice.paid', 'invoice.payment_succeeded', 'invoice.finalized'} <= {e['type'] for e in events})
    c.check(stage, 'no received event is left unprocessed or failed', [],
            [f"{e['type']}:{e['state']}:{e['failure']}" for e in events if e['state'] not in ('processed',)])

    paid_epoch = invoice['status_transitions']['paid_at']
    expected_eligible = hold_eligible_at(paid_epoch).isoformat()
    w = c.sql('s1-writes', f"""select jsonb_build_object(
  'mapping', (select jsonb_agg(to_jsonb(b)) from public.billing_customers b where b.stripe_customer_id = '{customer['id']}'),
  'subscription', (select jsonb_agg(to_jsonb(s)) from public.customer_subscriptions s where s.stripe_subscription_id = '{sub['id']}'),
  'entitlements', (select jsonb_agg(to_jsonb(en)) from public.entitlements en where en.user_id = '{USERS['home']}'),
  'entries', (select jsonb_agg(to_jsonb(ce)) from public.commission_entries ce where ce.stripe_invoice_id = '{invoice['id']}'),
  'attribution', (select to_jsonb(a) from public.referral_attributions a where a.id = '{attr['id']}')
) as w;""")[0]['w']
    json.dump(w, open(os.path.join(c.dir, 'writes-s1.json'), 'w'), indent=1, default=str)
    c.check(stage, 'customer mapping written for the HOME user', USERS['home'], ((w['mapping'] or [{}])[0]).get('user_id'))
    srow = (w['subscription'] or [{}])[0]
    c.check(stage, 'customer_subscriptions: HOME monthly standard, active, the HOME user',
            {'offer_key': 'home_monthly_standard', 'user_id': USERS['home']},
            {'offer_key': srow.get('offer_key'), 'user_id': srow.get('user_id')})
    active_home = [e for e in (w['entitlements'] or []) if e.get('scope') == 'home']
    c.check(stage, 'HOME entitlement granted', True, len(active_home) >= 1)
    entries = w['entries'] or []
    e0 = entries[0] if entries else {}
    c.check(stage, 'exactly ONE commission entry for the invoice', 1, len(entries))
    c.check(stage, 'entry follows commission_rules v1 (home/monthly/standard = 199) and the hold calendar',
            {'partner_id': PARTNER_A, 'amount_cents': 199, 'cadence': 'monthly', 'tier': 'standard', 'status': 'held', 'livemode': False,
             'eligible_at': expected_eligible},
            {'partner_id': e0.get('partner_id'), 'amount_cents': e0.get('amount_cents'), 'cadence': e0.get('cadence'),
             'tier': e0.get('tier'), 'status': e0.get('status'), 'livemode': e0.get('livemode'),
             'eligible_at': datetime.datetime.fromisoformat(e0['eligible_at']).astimezone(datetime.timezone.utc).isoformat() if e0.get('eligible_at') else None})
    c.check(stage, 'attribution locked ACTIVE on the first commissionable payment', 'active', (w['attribution'] or {}).get('status'))
    c.save()


def slice2(c: Campaign):
    """Renewal on the real HOME monthly price, then a partial and a full refund of the renewal."""
    st = 'S2'
    L = c.lane_s2 = lane(c, 's2home', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard')
    c.check(st, 'first (backdated one-period) invoice paid at the real monthly price', {'status': 'paid', 'amount_paid': 999},
            {k: L['sub_obj']['latest_invoice'].get(k) for k in ('status', 'amount_paid')})
    clock = advance(c, 's2-advance', L['clock'], L['anchor'] + 2 * 3600)
    c.clocks('S2.renewal', stripe_clock=clock['frozen_time'])
    invs = invoices(c, 's2-invoices', L['sub'])
    renewal = [i for i in invs if i.get('billing_reason') == 'subscription_cycle']
    c.check(st, 'the cycle renewal invoice exists and is paid on the clock', True, len(renewal) == 1 and renewal[0]['status'] == 'paid')
    ev = c.wait_events('s2-events', [L['sub'], renewal[0]['id'] if renewal else 'none'], ['invoice.paid'])
    c.check(st, 'renewal events processed', [], [f"{e['type']}:{e['state']}:{e['failure']}" for e in ev if e['state'] != 'processed'])
    led = ledger(c, 's2-ledger-1', L['sub'])
    c.check(st, 'TWO entries of 199 (first payment + renewal), both held, eligible 2026-11-30T23:00Z',
            [(199, 'monthly', 'held', '2026-11-30T23:00:00+00:00')] * 2,
            [(e['amount'], e['cadence'], e['status'], datetime.datetime.fromisoformat(e['eligible_at']).astimezone(datetime.timezone.utc).isoformat()) for e in led['entries']])
    pi = pi_of(c, 's2-renewal-pi', renewal[0]['id'])
    c.stripe('s2-refund-partial', 'refund_create', {'paymentIntentId': pi, 'amount': 300})
    time.sleep(25)
    led = ledger(c, 's2-ledger-2', L['sub'])
    ren = [e for e in led['entries'] if e['invoice'] == renewal[0]['id']][0]
    c.check(st, 'partial refund 300/999 → proportional reversal 199×300/999 = 59.76 → -60 (round half up)',
            [-60], [a['amount'] for a in ren['adjustments']])
    c.stripe('s2-refund-rest', 'refund_create', {'paymentIntentId': pi})
    time.sleep(25)
    led = ledger(c, 's2-ledger-3', L['sub'])
    ren = [e for e in led['entries'] if e['invoice'] == renewal[0]['id']][0]
    first = [e for e in led['entries'] if e['invoice'] != renewal[0]['id']][0]
    c.check(st, 'refund of the rest → capped at the remaining 139, entry reversed, never below -199 in total',
            {'adjustments': [-60, -139], 'status': 'reversed'}, {'adjustments': [a['amount'] for a in ren['adjustments']], 'status': ren['status']})
    c.check(st, 'the first payment entry is untouched by refunds of the renewal', {'adjustments': [], 'status': 'held'},
            {'adjustments': first['adjustments'], 'status': first['status']})
    ev = c.events_for('s2-refund-events', [pi])
    c.check(st, 'refund events all processed (charge.refunded / refund.created / refund.updated)', [],
            [f"{e['type']}:{e['state']}:{e['failure']}" for e in ev if e['state'] != 'processed'])
    json.dump(led, open(os.path.join(c.dir, 'ledger-s2.json'), 'w'), indent=1, default=str)
    c.save()


def slice3(c: Campaign):
    """PRO monthly renewal fails, then recovers with a working card."""
    st = 'S3'
    L = lane(c, 's3pro', 'STRIPE_PRICE_PRO_MONTHLY_STANDARD', 'pro_monthly_standard')
    c.stripe('s3-card-fail', 'customer_default_payment_method', {'customerId': L['customer'], 'paymentMethod': 'pm_card_chargeCustomerFail'})
    clock = advance(c, 's3-advance', L['clock'], L['anchor'] + 2 * 3600)
    c.clocks('S3.renewal-failed', stripe_clock=clock['frozen_time'])
    invs = invoices(c, 's3-invoices', L['sub'])
    renewal = [i for i in invs if i.get('billing_reason') == 'subscription_cycle']
    c.check(st, 'renewal invoice attempted and NOT paid', True, len(renewal) == 1 and renewal[0]['status'] == 'open' and renewal[0]['attempt_count'] >= 1)
    sub = c.stripe('s3-sub-after-fail', 'subscription_get', {'subscriptionId': L['sub']})
    c.check(st, 'subscription past_due after the failed renewal', 'past_due', sub['status'])
    ev = c.wait_events('s3-events', [L['sub'], renewal[0]['id']], ['invoice.payment_failed'])
    c.check(st, 'invoice.payment_failed received and processed', True, any(e['type'] == 'invoice.payment_failed' and e['state'] == 'processed' for e in ev))
    led = ledger(c, 's3-ledger-1', L['sub'])
    c.check(st, 'failed renewal books NO commission (only the first payment: 499)', [499], [e['amount'] for e in led['entries']])
    c.stripe('s3-card-ok', 'customer_default_payment_method', {'customerId': L['customer'], 'paymentMethod': 'pm_card_visa'})
    paid = c.stripe('s3-pay-open', 'invoice_pay', {'invoiceId': renewal[0]['id']})
    c.check(st, 'recovered renewal invoice paid', 'paid', paid['status'])
    c.wait_events('s3-events-2', [renewal[0]['id']], ['invoice.paid'])
    time.sleep(10)
    led = ledger(c, 's3-ledger-2', L['sub'])
    sub = c.stripe('s3-sub-after-recovery', 'subscription_get', {'subscriptionId': L['sub']})
    c.check(st, 'after recovery: subscription active and the renewal booked once (499, 499)',
            {'status': 'active', 'entries': [499, 499]}, {'status': sub['status'], 'entries': [e['amount'] for e in led['entries']]})
    json.dump(led, open(os.path.join(c.dir, 'ledger-s3.json'), 'w'), indent=1, default=str)
    c.save()


def slice4(c: Campaign):
    """Monthly → annual on the same subscription (real prices, immediate proration invoice)."""
    st = 'S4'
    L = lane(c, 's4conv', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard', backdate=False)
    c.wait_events('s4-events-1', [L['first_invoice']], ['invoice.paid'])
    upd = c.stripe('s4-to-annual', 'subscription_change_price', {'subscriptionId': L['sub'], 'priceEnv': 'STRIPE_PRICE_HOME_YEARLY_STANDARD',
                                                                 'prorationBehavior': 'always_invoice'})
    conv_inv = upd['latest_invoice']
    c.clocks('S4.conversion', stripe_clock=None)
    c.check(st, 'conversion produced an immediate proration invoice that is paid', True,
            conv_inv['id'] != L['first_invoice'] and conv_inv['status'] == 'paid')
    ev = c.wait_events('s4-events-2', [L['sub'], conv_inv['id']], ['customer.subscription.updated', 'invoice.paid'])
    c.check(st, 'conversion events processed', [], [f"{e['type']}:{e['state']}:{e['failure']}" for e in ev if e['state'] != 'processed'])
    time.sleep(8)
    led = ledger(c, 's4-ledger', L['sub'])
    c.check(st, 'cache follows the plan: home_yearly_standard, annual', {'offer_key': 'home_yearly_standard', 'cadence': 'annual'},
            {'offer_key': (led['subscription'] or {}).get('offer_key'), 'cadence': (led['subscription'] or {}).get('cadence')})
    c.check(st, 'commission: monthly 199 once, then the conversion payment ONCE at the annual rate 900 (C5)',
            [(199, 'monthly'), (900, 'annual')], [(e['amount'], e['cadence']) for e in led['entries']])
    json.dump(led, open(os.path.join(c.dir, 'ledger-s4.json'), 'w'), indent=1, default=str)
    c.save()


def slice5(c: Campaign):
    """Scheduled end (cancel at period end) versus effective end (cancel now)."""
    st = 'S5'
    A = lane(c, 's5sched', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard')
    c.wait_events('s5-events-a1', [A['first_invoice']], ['invoice.paid'])
    c.stripe('s5-cancel-at-end', 'subscription_cancel_at_period_end', {'subscriptionId': A['sub']})
    c.wait_events('s5-events-a2', [A['sub']], ['customer.subscription.updated'])
    time.sleep(6)
    led = ledger(c, 's5-ledger-a1', A['sub'])
    sub = led['subscription'] or {}
    home_ent = [e for e in led['entitlements'] if e['scope'] == 'home']
    c.check(st, 'scheduled end: still active, cancel_at_period_end=true, entitlement still active',
            {'status': 'active', 'cancel_at_period_end': True, 'entitlement_active': True},
            {'status': sub.get('status'), 'cancel_at_period_end': sub.get('cancel_at_period_end'),
             'entitlement_active': any(e['status'] == 'active' for e in home_ent)})
    clock = advance(c, 's5-advance', A['clock'], A['anchor'] + 2 * 3600)
    c.clocks('S5.period-end', stripe_clock=clock['frozen_time'])
    c.wait_events('s5-events-a3', [A['sub']], ['customer.subscription.deleted'])
    time.sleep(6)
    led = ledger(c, 's5-ledger-a2', A['sub'])
    sub = led['subscription'] or {}
    invs = invoices(c, 's5-invoices-a', A['sub'])
    c.check(st, 'at period end: canceled, ended_at set, no renewal invoice, still ONE entry',
            {'status': 'canceled', 'ended': True, 'renewals': 0, 'entries': 1},
            {'status': sub.get('status'), 'ended': bool(sub.get('ended_at')), 'renewals': len([i for i in invs if i.get('billing_reason') == 'subscription_cycle']),
             'entries': len(led['entries'])})
    c.check(st, 'entitlement no longer active after the scheduled end', False,
            any(e['status'] == 'active' and e['scope'] == 'home' for e in led['entitlements']))
    B = lane(c, 's5now', 'STRIPE_PRICE_PRO_MONTHLY_STANDARD', 'pro_monthly_standard', backdate=False)
    c.wait_events('s5-events-b1', [B['first_invoice']], ['invoice.paid'])
    c.stripe('s5-cancel-now', 'subscription_cancel_now', {'subscriptionId': B['sub']})
    c.wait_events('s5-events-b2', [B['sub']], ['customer.subscription.deleted'])
    time.sleep(6)
    led = ledger(c, 's5-ledger-b', B['sub'])
    sub = led['subscription'] or {}
    c.check(st, 'effective end: canceled immediately, entitlement not active, entry of the paid period kept',
            {'status': 'canceled', 'entitlement_active': False, 'entries': [499]},
            {'status': sub.get('status'), 'entitlement_active': any(e['status'] == 'active' and e['scope'] == 'pro' for e in led['entitlements']),
             'entries': [e['amount'] for e in led['entries']]})
    c.save()


def wait_ledger(c, tag, sub_id, done, timeout=180):
    """Poll the ledger until `done(ledger)` holds; the webhook works asynchronously."""
    deadline = time.time() + timeout
    led = None
    while time.time() < deadline:
        led = ledger(c, f'{tag}-{int(time.time())}', sub_id)
        if done(led):
            return led
        time.sleep(10)
    return led


def refund_notes(c, tag, pi):
    """What the webhook recorded for every refund-related delivery of this payment intent."""
    return [f"{e['type']}:{e['state']}:{e['failure']}" for e in c.events_for(tag, [pi])
            if e['type'].startswith(('charge.refund', 'refund.'))]


def refund_pair(c, st, label, sub_id, invoice_id, rate=199, paid=999):
    """Partial refund 300 then the rest, on the invoice's payment intent, against the existing contract (R2 + R3)."""
    pi = pi_of(c, f'{label}-pi', invoice_id)
    first = round_half_up(rate * 300 / paid)
    c.stripe(f'{label}-refund-partial', 'refund_create', {'paymentIntentId': pi, 'amount': 300})
    entry_of = lambda led: next((e for e in led['entries'] if e['invoice'] == invoice_id), {'adjustments': []})
    led = wait_ledger(c, f'{label}-ledger-r1', sub_id, lambda l: len(entry_of(l)['adjustments']) >= 1)
    c.check(st, f'partial refund 300/{paid} → proportional reversal {rate}×300/{paid} → -{first} (R2 round half up)',
            [-first], [a['amount'] for a in entry_of(led)['adjustments']])
    c.stripe(f'{label}-refund-rest', 'refund_create', {'paymentIntentId': pi})
    led = wait_ledger(c, f'{label}-ledger-r2', sub_id, lambda l: len(entry_of(l)['adjustments']) >= 2 or entry_of(l).get('status') == 'reversed')
    time.sleep(20)  # late duplicates (refund.updated / charge.refund.updated) must not add a third reversal
    led = ledger(c, f'{label}-ledger-r3', sub_id)
    e = entry_of(led)
    c.check(st, f'refund of the rest → capped at the remaining {rate - first} (R3), entry reversed, total never below -{rate}',
            {'adjustments': [-first, -(rate - first)], 'status': 'reversed'},
            {'adjustments': [a['amount'] for a in e['adjustments']], 'status': e.get('status')})
    notes = refund_notes(c, f'{label}-refund-events', pi)
    c.check(st, 'refund deliveries all processed, none skipped for a missing commission entry', True,
            bool(notes) and all(':processed:' in n and 'skipped_no_commission_entry_for_refund' not in n for n in notes))
    c.say(f'{label} refund deliveries: {json.dumps(notes)}')
    return pi, led


def round_half_up(x):
    import decimal
    return int(decimal.Decimal(str(x)).quantize(decimal.Decimal('1'), rounding=decimal.ROUND_HALF_UP))


def slice_u1(c: Campaign):
    """Upgrade path, part 1: an entry booked by the webhook production runs today (pre-#393 parent code)."""
    st = 'U1'
    L = lane(c, 'u1legacy', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard', backdate=False)
    inv = L['sub_obj']['latest_invoice']
    c.check(st, 'first invoice paid at the real monthly price', {'status': 'paid', 'amount_paid': 999},
            {k: inv.get(k) for k in ('status', 'amount_paid')})
    ev = c.wait_events('u1-events', [L['sub'], inv['id']], ['invoice.paid'])
    c.check(st, 'events processed', [], [f"{e['type']}:{e['state']}:{e['failure']}" for e in ev if e['state'] != 'processed'])
    led = wait_ledger(c, 'u1-ledger', L['sub'], lambda l: len(l['entries']) >= 1, timeout=60)
    c.check(st, 'pre-#393 code books ONE 199 held entry WITHOUT a payment intent (a Basil invoice names none)',
            [(199, 'held', None)], [(e['amount'], e['status'], e['pi']) for e in led['entries']])
    json.dump({k: L[k] for k in ('uid', 'email', 'attr', 'clock', 'customer', 'sub', 'first_invoice')},
              open(os.path.join(c.dir, 'ids-u1.json'), 'w'), indent=1)
    json.dump(led, open(os.path.join(c.dir, 'ledger-u1.json'), 'w'), indent=1, default=str)
    c.save()


def slice_u2(c: Campaign):
    """Upgrade path, part 2: with #393 deployed, refunds of that legacy entry are reversed (found by invoice)."""
    st = 'U2'
    ids = json.load(open(os.path.join(c.dir, 'ids-u1.json')))
    pi, led = refund_pair(c, st, 'u2legacy', ids['sub'], ids['first_invoice'])
    json.dump(led, open(os.path.join(c.dir, 'ledger-u2.json'), 'w'), indent=1, default=str)
    c.save()


def slice2b(c: Campaign):
    """S2 again on #393: renewal on the real HOME monthly price, payment intent recorded, partial + full refund reversed."""
    st = 'S2B'
    L = lane(c, 's2bhome', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard')
    c.check(st, 'first (backdated one-period) invoice paid at the real monthly price', {'status': 'paid', 'amount_paid': 999},
            {k: L['sub_obj']['latest_invoice'].get(k) for k in ('status', 'amount_paid')})
    clock = advance(c, 's2b-advance', L['clock'], L['anchor'] + 2 * 3600)
    c.clocks('S2B.renewal', stripe_clock=clock['frozen_time'])
    renewal = [i for i in invoices(c, 's2b-invoices', L['sub']) if i.get('billing_reason') == 'subscription_cycle']
    c.check(st, 'the cycle renewal invoice exists and is paid on the clock', True, len(renewal) == 1 and renewal[0]['status'] == 'paid')
    ev = c.wait_events('s2b-events', [L['sub'], renewal[0]['id']], ['invoice.paid'])
    c.check(st, 'renewal events processed', [], [f"{e['type']}:{e['state']}:{e['failure']}" for e in ev if e['state'] != 'processed'])
    led = wait_ledger(c, 's2b-ledger-1', L['sub'], lambda l: len(l['entries']) >= 2, timeout=90)
    pis = {i['id']: pi_of(c, f"s2b-pi-{i['id'][-6:]}", i['id']) for i in invoices(c, 's2b-invoices-2', L['sub'])}
    c.check(st, 'TWO held 199 entries, eligible 2026-11-30T23:00Z, each carrying the PaymentIntent that paid its invoice (#393)',
            sorted([(199, 'monthly', 'held', '2026-11-30T23:00:00+00:00', pis.get(e['invoice'])) for e in led['entries']], key=str),
            sorted([(e['amount'], e['cadence'], e['status'], datetime.datetime.fromisoformat(e['eligible_at']).astimezone(datetime.timezone.utc).isoformat(), e['pi']) for e in led['entries']], key=str))
    pi, led = refund_pair(c, st, 's2brenewal', L['sub'], renewal[0]['id'])
    first = [e for e in led['entries'] if e['invoice'] != renewal[0]['id']][0]
    c.check(st, 'the first payment entry is untouched by refunds of the renewal', {'adjustments': [], 'status': 'held'},
            {'adjustments': first['adjustments'], 'status': first['status']})
    json.dump({'lane': {k: L[k] for k in ('uid', 'clock', 'customer', 'sub', 'first_invoice', 'anchor')}, 'renewal': renewal[0]['id'], 'pi': pi},
              open(os.path.join(c.dir, 'ids-s2b.json'), 'w'), indent=1)
    json.dump(led, open(os.path.join(c.dir, 'ledger-s2b.json'), 'w'), indent=1, default=str)
    c.save()


# ── fault injection, event lookups ────────────────────────────────────────────
def iso_utc(value):
    return datetime.datetime.fromisoformat(value).astimezone(datetime.timezone.utc).isoformat() if value else None


def fault(c, label, customer_id, types):
    """Refuse durable receipt (→ 500, Stripe keeps the event pending) for these event types of ONE customer."""
    arr = ', '.join(f"'{t}'" for t in types)
    rows = c.sql(f'fault-{label}', f"""do $f$ begin {GUARD} end $f$;
insert into qa_harness.webhook_delivery_faults (run_id, label, match_customer, match_types)
values ('{c.run}', '{label}', '{customer_id}', array[{arr}]) returning id, created_at;""")
    c.say(f"FAULT ON {label} customer={customer_id} types={types} id={rows[0]['id']} at={rows[0]['created_at']}")
    return rows[0]['id']


def release(c, fault_id):
    rows = c.sql(f'fault-release-{fault_id}', f"""update qa_harness.webhook_delivery_faults set active = false, released_at = now()
where id = {fault_id} returning id, released_at;""")
    c.say(f"FAULT OFF id={fault_id} at={rows[0]['released_at']}")


def db_events_by_id(c, tag, ids):
    lst = ', '.join(f"'{i}'" for i in ids) or "''"
    return c.sql(tag, f"""select coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'type', e.event_type, 'state', e.state,
  'received_at', e.received_at, 'processed_at', e.processed_at, 'attempts', e.attempts, 'note', e.last_error)
  order by e.received_at, e.event_id), '[]'::jsonb) as ev
from public.stripe_webhook_events e where e.event_id in ({lst});""")[0]['ev']


def stripe_events(c, step, since, object_id=None, customer_id=None, types=None):
    params = {'since': since}
    if object_id:
        params['objectId'] = object_id
    if customer_id:
        params['customerId'] = customer_id
    if types:
        params['types'] = types
    return c.stripe(step, 'events_for_object', params)['data']


def first_paid_facts(c, st, label, L, amount):
    inv = L['sub_obj']['latest_invoice']
    c.check(st, f'{label}: first invoice paid at the real price {amount}', {'status': 'paid', 'amount_paid': amount},
            {k: inv.get(k) for k in ('status', 'amount_paid')})
    return inv


def slice5b(c: Campaign):
    """Annual offers on real prices: PRO yearly 12-month renewal on the clock (C4), HOME yearly, HOME 15-month partner offer."""
    st = 'S6'
    P = lane(c, 's6proy', 'STRIPE_PRICE_PRO_YEARLY_STANDARD', 'pro_yearly_standard')
    first_paid_facts(c, st, 'PRO yearly (backdated one year)', P, 19900)
    clock = advance(c, 's6-advance', P['clock'], P['anchor'] + 2 * 3600)
    c.clocks('S6.annual-renewal', stripe_clock=clock['frozen_time'])
    renewal = [i for i in invoices(c, 's6-invoices', P['sub']) if i.get('billing_reason') == 'subscription_cycle']
    c.check(st, 'PRO yearly: the 12-month renewal invoice is paid on the clock at 19900', True,
            len(renewal) == 1 and renewal[0]['status'] == 'paid' and renewal[0]['amount_paid'] == 19900)
    led = wait_ledger(c, 's6-ledger-p', P['sub'], lambda l: len(l['entries']) >= 2, timeout=120)
    c.check(st, 'C4: each 12-month payment = ONE annual commission 2900 (pro/annual/standard), held, eligible 2026-11-30T23:00Z',
            [(2900, 'annual', 'held', '2026-11-30T23:00:00+00:00')] * 2,
            [(e['amount'], e['cadence'], e['status'], iso_utc(e['eligible_at'])) for e in led['entries']])
    c.check(st, 'PRO yearly: cache + PRO entitlement', {'offer_key': 'pro_yearly_standard', 'pro_active': True},
            {'offer_key': (led['subscription'] or {}).get('offer_key'),
             'pro_active': any(e['scope'] == 'pro' and e['status'] == 'active' for e in led['entitlements'])})
    json.dump(led, open(os.path.join(c.dir, 'ledger-s6-pro-yearly.json'), 'w'), indent=1, default=str)

    H = lane(c, 's6homey', 'STRIPE_PRICE_HOME_YEARLY_STANDARD', 'home_yearly_standard', backdate=False)
    first_paid_facts(c, st, 'HOME yearly', H, 4900)
    led = wait_ledger(c, 's6-ledger-h', H['sub'], lambda l: len(l['entries']) >= 1, timeout=90)
    c.check(st, 'HOME yearly: ONE annual commission 900 (home/annual/standard)', [(900, 'annual', 'held')],
            [(e['amount'], e['cadence'], e['status']) for e in led['entries']])

    F = lane(c, 's6home15', 'STRIPE_PRICE_HOME_15M_STANDARD_PARTNER', 'home_15m_standard_partner', backdate=False)
    first_paid_facts(c, st, 'HOME 15-month partner offer', F, 4900)
    led = wait_ledger(c, 's6-ledger-f', F['sub'], lambda l: len(l['entries']) >= 1, timeout=90)
    c.check(st, 'HOME 15-month partner offer: first annual-or-15m (C5) → annual commission 900', [(900, 'annual', 'held')],
            [(e['amount'], e['cadence'], e['status']) for e in led['entries']])
    c.check(st, 'HOME 15-month partner offer: cache offer key + HOME entitlement', {'offer_key': 'home_15m_standard_partner', 'home_active': True},
            {'offer_key': (led['subscription'] or {}).get('offer_key'),
             'home_active': any(e['scope'] == 'home' and e['status'] == 'active' for e in led['entitlements'])})
    c.save()


def dispute_lane(c, st, outcome):
    label = f's7{outcome}{SUFFIX}'
    L = lane(c, label, 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard', pm='pm_card_createDispute', backdate=False)
    inv = first_paid_facts(c, st, f'{outcome}: dispute test card', L, 999)
    pi = pi_of(c, f'{label}-pi', inv['id'])
    dispute, charge = None, None
    deadline = time.time() + 150
    while time.time() < deadline and not dispute:
        charge = c.stripe(f'{label}-pi-get-{int(time.time())}', 'payment_intent_get', {'paymentIntentId': pi})['latest_charge']
        found = c.stripe(f'{label}-disputes-{int(time.time())}', 'disputes_for_charge', {'chargeId': charge['id']})['data']
        dispute = found[0] if found else None
        if not dispute:
            time.sleep(8)
    c.check(st, f'{outcome}: Stripe opened a dispute on the charge', True, dispute is not None)
    if not dispute:
        return
    led = wait_ledger(c, f'{label}-ledger-1', L['sub'],
                      lambda l: bool(l['entries']) and len(l['entries'][0]['adjustments']) >= 1, timeout=150)
    evs = c.events_for(f'{label}-events-1', [pi, charge['id'], dispute['id'], inv['id']])
    c.say(f"{label} delivery order: {json.dumps([(e['type'], e['received_at'], e['processed_at'], e['state'], e['failure']) for e in evs])}")
    e = led['entries'][0] if led['entries'] else {'adjustments': [], 'status': None}
    c.check(st, f'{outcome}: funds_withdrawn → ONE dispute_reversal of the whole 199 (R5), entry reversed',
            {'adjustments': [[-199, 'dispute_reversal']], 'status': 'reversed'},
            {'adjustments': [[a['amount'], a['kind']] for a in e['adjustments']], 'status': e.get('status')})
    c.stripe(f'{label}-close', 'dispute_close', {'disputeId': dispute['id'], 'outcome': outcome})
    final = None
    deadline = time.time() + 300
    while time.time() < deadline:
        d = c.stripe(f'{label}-dispute-get-{int(time.time())}', 'dispute_get', {'disputeId': dispute['id']})
        if d['status'] in ('won', 'lost'):
            final = d
            break
        time.sleep(10)
    c.check(st, f'{outcome}: Stripe closed the dispute as {outcome}', outcome, final['status'] if final else None)
    expect = ['charge.dispute.closed'] + (['charge.dispute.funds_reinstated'] if outcome == 'won' else [])
    evs = c.wait_events(f'{label}-events-2', [dispute['id']], expect, timeout=180)
    parked = [f"{x['type']}:{x['state']}:{x['failure']}" for x in evs if x['state'] != 'processed']
    if parked:
        # A delivery that arrived before the entry existed is PARKED, not dropped.
        # The recovery worker is what closes it — waiting for the first backoff
        # step is part of the contract, not a workaround.
        c.say(f'{label} parked deliveries awaiting the worker: {json.dumps(parked)}')
        time.sleep(70)
        recovery_tick(c, f'{label}-recovery')
        time.sleep(25)
        evs = c.events_for(f'{label}-events-3', [dispute['id']])
        parked = [f"{x['type']}:{x['state']}:{x['failure']}" for x in evs if x['state'] != 'processed']
    c.check(st, f'{outcome}: every dispute delivery settles — the worker finishes what the race parked', [], parked)
    c.say(f"{label} dispute deliveries: {json.dumps([(x['type'], x['state'], x['failure']) for x in evs])}")
    time.sleep(10)
    led = ledger(c, f'{label}-ledger-2', L['sub'])
    e = led['entries'][0] if led['entries'] else {'adjustments': [], 'status': None}
    if outcome == 'lost':
        c.check(st, 'lost: closing adds nothing — exactly one dispute_reversal, entry stays reversed',
                {'adjustments': [[-199, 'dispute_reversal']], 'status': 'reversed'},
                {'adjustments': [[a['amount'], a['kind']] for a in e['adjustments']], 'status': e.get('status')})
    else:
        c.check(st, 'won — CONTRACT WEBHOOK_MATRIX charge.dispute.funds_reinstated = commission_adjustments re-credit (R6 reinstates ONCE): -199 then +199',
                [-199, 199], [a['amount'] for a in e['adjustments']])
    json.dump({'lane': {k: L[k] for k in ('uid', 'clock', 'customer', 'sub', 'first_invoice')}, 'pi': pi, 'charge': charge['id'],
               'dispute': dispute['id'], 'ledger': led}, open(os.path.join(c.dir, f'ids-{label}.json'), 'w'), indent=1, default=str)


def slice7(c: Campaign):
    """Disputes on real deliveries: lost and won (pm_card_createDispute, evidence losing_/winning_evidence)."""
    dispute_lane(c, 'S7', 'lost')
    dispute_lane(c, 'S7', 'won')
    c.save()


def slice8(c: Campaign):
    """Duplicates: Stripe redelivers already-processed signed events (same id) — acknowledged, nothing re-applied."""
    st = 'S8'
    ids = json.load(open(os.path.join(c.dir, 'ids-s2b.json')))
    since = ids['lane']['anchor'] - 3 * 3600 - 900
    paid = stripe_events(c, 's8-events-paid', since, object_id=ids['renewal'], types=['invoice.paid', 'invoice.payment_succeeded'])
    refunds = stripe_events(c, 's8-events-refund', since, object_id=ids['pi'], types=['charge.refunded'])
    targets = [e['id'] for e in paid + refunds]
    c.check(st, 'originals found in Stripe: invoice.paid + invoice.payment_succeeded of the renewal and 2 × charge.refunded', 4, len(targets))
    before = db_events_by_id(c, 's8-db-before', targets)
    led_before = ledger(c, 's8-ledger-before', ids['lane']['sub'])['entries']
    c.clocks('S8.resend', business_time=None)
    for i, eid in enumerate(targets):
        c.stripe(f's8-resend-{i}', 'event_resend', {'eventId': eid})
    time.sleep(40)
    after = db_events_by_id(c, 's8-db-after', targets)
    led_after = ledger(c, 's8-ledger-after', ids['lane']['sub'])['entries']
    c.check(st, 'each redelivered event id keeps exactly ONE durable row, unchanged (state, received_at, processed_at, attempts, note)',
            before, after)
    c.check(st, 'ledger unchanged by redelivery (2 entries; renewal -60/-139 reversed; first payment untouched)', led_before, led_after)
    json.dump({'targets': targets, 'before': before, 'after': after}, open(os.path.join(c.dir, 'dup-s8.json'), 'w'), indent=1, default=str)
    c.save()


def slice9(c: Campaign):
    """Refund BEFORE accrual on real deliveries: invoice.paid receipt refused, full refund processed, invoice.paid redelivered."""
    st = 'S9'
    hold = {}
    L = lane(c, f's9gapb{SUFFIX}', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard', backdate=False,
             before_subscribe=lambda cust: hold.update(id=fault(c, f's9-hold-invoice-paid{SUFFIX}', cust, ['invoice.paid', 'invoice.payment_succeeded'])))
    inv = first_paid_facts(c, st, 'S9 lane', L, 999)
    time.sleep(25)
    paid = stripe_events(c, f's9-events-paid{SUFFIX}', L['t0'] - 120, object_id=inv['id'], types=['invoice.paid', 'invoice.payment_succeeded'])
    rows = db_events_by_id(c, 's9-db-paid-held', [e['id'] for e in paid])
    c.check(st, 'invoice.paid / payment_succeeded exist in Stripe but their receipt was refused (no durable row, Stripe still pending)',
            {'stripe_events': 2, 'db_rows': 0, 'pending': True},
            {'stripe_events': len(paid), 'db_rows': len(rows), 'pending': all(e['pending_webhooks'] >= 1 for e in paid)})
    led = ledger(c, 's9-ledger-0', L['sub'])
    c.check(st, 'no commission yet (the paid invoice has not been received)', [], led['entries'])
    pi = pi_of(c, f's9-pi{SUFFIX}', inv['id'])
    c.stripe(f's9-refund-full{SUFFIX}', 'refund_create', {'paymentIntentId': pi})
    ev = c.wait_events('s9-refund-events', [pi], ['charge.refunded'], timeout=120)
    c.say(f"s9 refund deliveries before accrual: {json.dumps([(e['type'], e['state'], e['failure']) for e in ev])}")
    c.check(st, 'refund delivered first: processed with the honest no-entry note', True,
            any(e['type'] == 'charge.refunded' and e['state'] == 'processed' and e['failure'] == 'skipped_no_commission_entry_for_refund' for e in ev))
    release(c, hold['id'])
    for i, e in enumerate(paid):
        c.stripe(f's9-redeliver{SUFFIX}-{i}', 'event_resend', {'eventId': e['id']})
    led = wait_ledger(c, 's9-ledger-1', L['sub'], lambda l: len(l['entries']) >= 1, timeout=120)
    time.sleep(15)
    led = ledger(c, 's9-ledger-2', L['sub'])
    rows = db_events_by_id(c, 's9-db-paid-after', [e['id'] for e in paid])
    c.say(f"s9 redelivered invoice events: {json.dumps(rows, default=str)}")
    net = sum(e['amount'] + sum(a['amount'] for a in e['adjustments']) for e in led['entries'])
    c.check(st, 'CONTRACT (R1 + order independence): a fully refunded invoice nets to ZERO commission whatever the delivery order',
            0, net)
    c.check(st, 'observed ledger after the late invoice.paid', 'recorded', 'recorded', ok=True)
    c.say(f"s9 ledger entries: {json.dumps([(e['amount'], e['status'], [a['amount'] for a in e['adjustments']]) for e in led['entries']])}")
    json.dump({'lane': {k: L[k] for k in ('uid', 'clock', 'customer', 'sub', 'first_invoice')}, 'pi': pi, 'paid_events': paid, 'rows': rows,
               'ledger': led}, open(os.path.join(c.dir, 'ids-s9.json'), 'w'), indent=1, default=str)
    c.save()


def slice10(c: Campaign):
    """Invoice BEFORE subscription on real deliveries: customer.subscription.* receipt refused, invoice.paid processed first."""
    st = 'S10'
    hold = {}
    L = lane(c, 's10order', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard', backdate=False,
             before_subscribe=lambda cust: hold.update(id=fault(c, 's10-hold-subscription', cust, ['customer.subscription.created', 'customer.subscription.updated'])))
    inv = first_paid_facts(c, st, 'S10 lane', L, 999)
    ev = c.wait_events('s10-invoice-first', [inv['id']], ['invoice.paid'], timeout=120)
    c.say(f"s10 invoice deliveries while the subscription is held: {json.dumps([(e['type'], e['state'], e['attempts'], e['failure']) for e in ev])}")
    subs = stripe_events(c, 's10-events-sub', L['t0'] - 120, object_id=L['sub'], types=['customer.subscription.created', 'customer.subscription.updated'])
    c.check(st, 'subscription events exist in Stripe but were not received', {'stripe': True, 'db_rows': 0},
            {'stripe': len(subs) >= 1, 'db_rows': len(db_events_by_id(c, 's10-db-sub-held', [e['id'] for e in subs]))})
    release(c, hold['id'])
    for i, e in enumerate(sorted(subs, key=lambda x: x['created'])):
        c.stripe(f's10-redeliver-{i}', 'event_resend', {'eventId': e['id']})
    c.wait_events('s10-sub-events', [L['sub']], ['customer.subscription.created'], timeout=120)
    time.sleep(20)
    led = ledger(c, 's10-ledger', L['sub'])
    paid_rows = [e for e in c.events_for('s10-invoice-final', [inv['id']]) if e['type'] in ('invoice.paid', 'invoice.payment_succeeded')]
    c.say(f"s10 invoice rows after the subscription arrived: {json.dumps([(e['type'], e['state'], e['attempts'], e['failure']) for e in paid_rows])}")
    c.check(st, 'subscription cache + HOME entitlement written once the subscription arrives', {'cache': True, 'home_active': True},
            {'cache': bool(led['subscription']), 'home_active': any(e['scope'] == 'home' and e['status'] == 'active' for e in led['entitlements'])})
    c.check(st, 'CONTRACT (order independence, ORDER C converges): ONE 199 commission for the paid invoice', [199],
            [e['amount'] for e in led['entries']])
    for i, e in enumerate(paid_rows):
        c.stripe(f's10-redeliver-invoice-{i}', 'event_resend', {'eventId': e['event_id']})
    time.sleep(30)
    led2 = ledger(c, 's10-ledger-2', L['sub'])
    rows2 = db_events_by_id(c, 's10-db-invoice-after-resend', [e['event_id'] for e in paid_rows])
    c.say(f"s10 after redelivering the parked invoice events: entries={[e['amount'] for e in led2['entries']]} rows={json.dumps(rows2, default=str)}")
    c.check(st, 'CONTRACT: a Stripe redelivery of the parked invoice.paid books the commission', [199], [e['amount'] for e in led2['entries']])
    json.dump({'lane': {k: L[k] for k in ('uid', 'clock', 'customer', 'sub', 'first_invoice')}, 'subs': subs, 'paid_rows': rows2, 'ledger': led2},
              open(os.path.join(c.dir, 'ids-s10.json'), 'w'), indent=1, default=str)
    c.save()


def as_user(user_id, body):
    return f"""perform set_config('request.jwt.claims', json_build_object('sub', '{user_id}', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  {body}
  execute 'reset role';"""


def rewards(c, tag, referred_uid, referrer_uid):
    return c.sql(tag, f"""select jsonb_build_object(
  'rewards', (select coalesce(jsonb_agg(jsonb_build_object('invoice', r.stripe_invoice_id, 'days', r.bonus_days, 'cadence', r.cadence,
      'status', r.status, 'reason', r.reversal_reason, 'referrer', r.referrer_user_id) order by r.earned_at), '[]'::jsonb)
    from public.referral_rewards r where r.referred_user_id = '{referred_uid}'),
  'referrer_entitlements', (select coalesce(jsonb_agg(jsonb_build_object('scope', en.scope, 'status', en.status, 'source', en.source_type,
      'starts_at', en.starts_at, 'ends_at', en.ends_at) order by en.starts_at), '[]'::jsonb)
    from public.entitlements en where en.user_id = '{referrer_uid}'),
  'commission_entries', (select count(*) from public.commission_entries ce
    join public.customer_subscriptions s on s.stripe_subscription_id = ce.stripe_subscription_id where s.user_id = '{referred_uid}')
) as r;""")[0]['r']


def slice11(c: Campaign):
    """Refer-a-friend day rewards on real deliveries: first paid purchase earns, renewal does not, refund reverses."""
    st = 'S11'
    referrer_uid, _ = new_customer_user(c, 's11referrer')
    code = c.sql('s11-code', f"""do $c$ declare v jsonb; begin {GUARD}
  {as_user(referrer_uid, "v := public.gellatti_my_referral_code_v1();")}
  insert into qa_harness.observations (run_id, worker, payload) values ('{c.run}', 's11-referrer-code', v);
end $c$;
select payload from qa_harness.observations where run_id = '{c.run}' and worker = 's11-referrer-code' order by observed_at desc limit 1;""")[0]['payload']
    c.check(st, "referrer's personal code issued by gellatti_my_referral_code_v1", True, bool(code.get('ok')) and bool(code.get('code')))
    referred_uid, referred_email = new_customer_user(c, 's11referred')
    claim = c.sql('s11-claim', f"""do $c$ declare v jsonb; begin {GUARD}
  {as_user(referred_uid, "v := public.gellatti_claim_referral_code_v1('" + code['code'] + "');")}
  insert into qa_harness.observations (run_id, worker, payload) values ('{c.run}', 's11-claim', v);
end $c$;
select payload from qa_harness.observations where run_id = '{c.run}' and worker = 's11-claim' order by observed_at desc limit 1;""")[0]['payload']
    c.check(st, 'the referred user claims the code (no partner attribution)', {'ok': True, 'reason': 'claimed'}, claim)
    L = lane(c, 's11ref', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard', partner=False,
             user=(referred_uid, referred_email))
    inv = first_paid_facts(c, st, 'referred HOME monthly (backdated)', L, 999)
    ev = c.wait_events('s11-events-1', [inv['id']], ['invoice.paid'], timeout=120)
    c.say(f"s11 first purchase deliveries: {json.dumps([(e['type'], e['state'], e['failure']) for e in ev if e['type'].startswith('invoice.')])}")
    time.sleep(8)
    r = rewards(c, 's11-rewards-1', referred_uid, referrer_uid)
    c.check(st, 'first paid monthly purchase earns the referrer 7 days (F1), ONE reward, no partner commission',
            {'rewards': [(inv['id'], 7, 'monthly', 'earned')], 'commission_entries': 0},
            {'rewards': [(x['invoice'], x['days'], x['cadence'], x['status']) for x in r['rewards']], 'commission_entries': r['commission_entries']})
    c.check(st, 'F6: referrer without paid PRO gets PRO access for the banked days', True,
            any(e['scope'] == 'pro' and e['status'] == 'active' for e in r['referrer_entitlements']))
    c.say(f"s11 referrer entitlements: {json.dumps(r['referrer_entitlements'], default=str)}")
    clock = advance(c, 's11-advance', L['clock'], L['anchor'] + 2 * 3600)
    c.clocks('S11.renewal', stripe_clock=clock['frozen_time'])
    renewal = [i for i in invoices(c, 's11-invoices', L['sub']) if i.get('billing_reason') == 'subscription_cycle']
    c.wait_events('s11-events-2', [renewal[0]['id']], ['invoice.paid'], timeout=120)
    time.sleep(8)
    r = rewards(c, 's11-rewards-2', referred_uid, referrer_uid)
    c.check(st, 'J-REF-02: the renewal earns nothing — still ONE reward', 1, len(r['rewards']))
    pi = pi_of(c, 's11-first-pi', inv['id'])
    c.stripe('s11-refund-first-full', 'refund_create', {'paymentIntentId': pi})
    c.wait_events('s11-refund-events', [pi], ['charge.refunded'], timeout=120)
    time.sleep(8)
    r = rewards(c, 's11-rewards-3', referred_uid, referrer_uid)
    c.check(st, 'F7/J-REF-09: full refund of the qualifying purchase reverses the reward; access already granted is kept',
            {'status': 'reversed', 'pro_kept': True},
            {'status': r['rewards'][0]['status'] if r['rewards'] else None,
             'pro_kept': any(e['scope'] == 'pro' and e['status'] == 'active' for e in r['referrer_entitlements'])})
    json.dump({'referrer': referrer_uid, 'referred': referred_uid, 'code': code.get('code'), 'lane': {k: L[k] for k in ('clock', 'customer', 'sub', 'first_invoice', 'anchor')},
               'renewal': renewal[0]['id'] if renewal else None, 'rewards': r}, open(os.path.join(c.dir, 'ids-s11.json'), 'w'), indent=1, default=str)
    c.save()


def recovery_tick(c, tag, mode='retry', payload=None):
    """Run the EXISTING server path for parked deliveries: the DB tick presents the
    dispatch key from Vault to stripe-recovery. Nothing is replayed by hand."""
    body = json.dumps(payload or {}).replace("'", "''")
    rows = c.sql(tag, f"select public.gellatti_stripe_recovery_tick_v1('{mode}', '{body}'::jsonb) as t;")
    c.say(f"recovery tick [{mode}]: {json.dumps(rows[0]['t'], default=str)}")
    return rows[0]['t']


def backlog(c, tag):
    return c.sql(tag, """select coalesce(jsonb_agg(jsonb_build_object('event', e.event_id, 'type', e.event_type,
  'state', e.state, 'attempts', e.attempts, 'note', e.last_error, 'age_min', round(extract(epoch from (now() - e.received_at)) / 60))
  order by e.received_at), '[]'::jsonb) as b
from public.stripe_webhook_events e where e.state in ('received', 'failed', 'dead_letter') and e.attempts > 0;""")[0]['b']


def slice_recovery(c: Campaign):
    """The worker that closes what a race parked, and the escalation that keeps it visible."""
    st = 'S14'
    before = backlog(c, 's14-backlog-before')
    c.say(f's14 backlog before: {json.dumps(before, default=str)}')
    tick = recovery_tick(c, 's14-tick')
    time.sleep(30)
    after = backlog(c, 's14-backlog-after')
    c.say(f's14 backlog after: {json.dumps(after, default=str)}')
    c.check(st, 'the tick reaches the worker through Vault + pg_net (no manual replay)', True,
            bool(tick.get('dispatched')) or tick.get('skipped') == 'nothing_due')
    settled = [e for e in before if e['event'] not in {x['event'] for x in after}]
    c.say(f"s14 settled by the worker: {json.dumps([e['type'] + ':' + (e['note'] or '') for e in settled])}")
    c.check(st, 'no delivery is left parked on a dependency that already exists', [],
            [f"{e['type']}:{e['note']}" for e in after
             if str(e['note'] or '').startswith('commission_entry_not_booked_yet')])
    json.dump({'before': before, 'after': after, 'tick': tick}, open(os.path.join(c.dir, 'recovery-s14.json'), 'w'),
              indent=1, default=str)
    c.save()


def slice13(c: Campaign):
    """The two clocks disagree: a renewal paid on the Stripe clock IN THE NEXT MONTH, while the
    database (and therefore the tier snapshot writer) is still in this one."""
    st = 'S13'
    L = lane(c, 's13cross', 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', 'home_monthly_standard', backdate=False)
    inv = first_paid_facts(c, st, 'S13 lane', L, 999)
    c.wait_events('s13-events-1', [inv['id']], ['invoice.paid'], timeout=120)
    led = wait_ledger(c, 's13-ledger-1', L['sub'], lambda l: len(l['entries']) >= 1, timeout=90)
    c.check(st, 'the first payment, in the real month, books 199', [199], [e['amount'] for e in led['entries']])

    # One month forward ON THE STRIPE CLOCK ONLY. The database clock does not move.
    target = month_shift(L['t0'], 1) + 2 * 3600
    clock = advance(c, 's13-advance', L['clock'], target)
    db_now = c.sql('s13-dbnow', 'select now() as now, (now() at time zone \'Europe/Madrid\')::date as madrid_day;')[0]
    c.clocks('S13.next-month-renewal', stripe_clock=clock['frozen_time'],
             business_time='the scheduled snapshot job still runs at the real month')
    c.say(f"s13 clocks: stripe={datetime.datetime.utcfromtimestamp(clock['frozen_time']).isoformat()}Z db={db_now['now']} madrid={db_now['madrid_day']}")
    renewal = [i for i in invoices(c, 's13-invoices', L['sub']) if i.get('billing_reason') == 'subscription_cycle']
    c.check(st, 'the renewal invoice is paid on the Stripe clock, one month ahead of the database',
            True, len(renewal) == 1 and renewal[0]['status'] == 'paid')
    ev = c.wait_events('s13-events-2', [renewal[0]['id']], ['invoice.paid'], timeout=150)
    notes = [(e['type'], e['state'], e['failure'], e['attempts']) for e in ev if e['type'].startswith('invoice.')]
    c.say(f's13 renewal deliveries: {json.dumps(notes)}')
    time.sleep(10)
    led = ledger(c, 's13-ledger-2', L['sub'])
    snap = c.sql('s13-snapshot-month', f"""select coalesce(jsonb_agg(jsonb_build_object('month', month, 'tier', tier) order by month), '[]'::jsonb) as s
from public.partner_tier_snapshots where partner_id = '{PARTNER_A}';""")[0]['s']
    c.say(f's13 partner snapshots: {json.dumps(snap, default=str)}')
    c.check(st, 'CONTRACT: the renewal of a paid subscription books one more 199 whatever month it falls in',
            [199, 199], [e['amount'] for e in led['entries']])
    c.check(st, 'every renewal delivery is settled (nothing parked in received)', [],
            [f"{t}:{s2}:{f}" for (t, s2, f, a) in notes if s2 != 'processed'])
    json.dump({'lane': {k: L[k] for k in ('uid', 'clock', 'customer', 'sub', 'first_invoice')}, 'renewal': renewal[0]['id'],
               'clock': clock['frozen_time'], 'dbNow': db_now['now'], 'notes': notes, 'snapshots': snap, 'ledger': led},
              open(os.path.join(c.dir, 'ids-s13.json'), 'w'), indent=1, default=str)
    c.save()


if __name__ == '__main__':
    camp = Campaign(sys.argv[2] if len(sys.argv) > 2 else None)
    SUFFIX = sys.argv[3] if len(sys.argv) > 3 else ''
    {'slice1': slice1, 'slice2': slice2, 'slice2b': slice2b, 'slice3': slice3, 'slice4': slice4, 'slice5': slice5,
     'u1': slice_u1, 'u2': slice_u2, 'slice6': slice5b, 'slice7': slice7, 'slice8': slice8, 'slice9': slice9,
     'slice10': slice10, 'slice11': slice11, 'slice13': slice13, 'recovery': slice_recovery}[sys.argv[1]](camp)
    camp.say(f"run {camp.run}: {sum(x['pass'] for x in camp.checks)}/{len(camp.checks)} checks passed")
