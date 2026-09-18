#!/usr/bin/env python3
"""QA ONLY — the pending-commission projection equals the payout authority's net.

Runs on the Growth QA branch only (guarded by qa_bootstrap.environment). Every
case builds its state INSIDE a PL/pgSQL sub-block for synthetic partner
qa.conc.f91ff11f.p3 (baseline: every figure 0), reads the projection, and then
raises to roll the sub-block back — only the observation survives. Nothing a
case creates stays in the ledger.

  A  held 100 €, no correction               → held / pending 100 €
  B  held 100 €, correction −20 €             → held / pending 80 €
  C  reversed, net zero                       → 0 €
  D  paid entry (in a paid payout)            → not pending again; a later
                                                 correction on it is netted
  E  eligible 100 €, correction −20 €         → payable 80 € AND the real
                                                 gellatti_build_payout_batch_v1
                                                 writes a line of 80 € for the
                                                 same state (then rolled back)

E runs the real builder, which takes share locks on eligible entries; it is
timed between the 72 h soak's ticks and holds them for well under a second.
"""
import datetime
import json
import os
import subprocess
import sys
import time
import uuid

REF = 'ncmsonfwbgsqedgnzofg'
RUN = str(uuid.uuid4())
LOGDIR = os.path.expanduser(f'~/Developer/pinguino-affiliate-work/logs/qa-tests/netting/{RUN[:8]}')
os.makedirs(LOGDIR, exist_ok=True)
P3 = '143d115a-f74c-4ffd-86c8-7b5f802e3d1f'
GUARD = """
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg'
                 and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b') then
    raise exception 'isolation guard: not the QA branch';
  end if;"""
checks = []


def log(msg):
    line = f'{datetime.datetime.utcnow().isoformat()}Z {msg}'
    print(line, flush=True)
    open(os.path.join(LOGDIR, 'run.log'), 'a').write(line + '\n')


def check(name, expected, observed):
    ok = expected == observed
    checks.append({'name': name, 'expected': expected, 'observed': observed, 'pass': ok})
    log(f"{'PASS' if ok else 'FAIL'} {name} expected={json.dumps(expected)} observed={json.dumps(observed)}")


def query(tag, sql):
    path = os.path.join(LOGDIR, f'{tag}.sql')
    open(path, 'w').write(sql)
    res = subprocess.run(['supabase', 'db', 'query', '--linked', '--project-ref', REF, '-o', 'json', '--file', path],
                         capture_output=True, text=True, timeout=180)
    open(os.path.join(LOGDIR, f'{tag}.out'), 'w').write(res.stdout + res.stderr)
    if res.returncode != 0:
        raise SystemExit(f'{tag} failed: {(res.stdout + res.stderr)[-400:]}')
    i, j = res.stdout.find('{'), res.stdout.rfind('}')
    return json.loads(res.stdout[i:j + 1], strict=False)['rows'] if i >= 0 else []


def entry(status, cents, tag):
    return f"""insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier,
      rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values ('{P3}', 'sub_qa_netting_{RUN[:8]}_{tag}', 'home_monthly_standard', 'home', 'monthly', 'standard', 1,
      {cents}, '{status}', now() - interval '120 days', now() - interval '1 day', false) returning id into v_entry;"""


def adjustment(cents, kind, tag):
    return f"""insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, currency, kind, reason, source_event_key)
    values ('{P3}', v_entry, {cents}, 'eur', '{kind}', 'QA netting proof', 'qa_netting:{RUN[:8]}:{tag}');"""


def case(tag, body, extra_select="'{}'::jsonb"):
    """Run `body` in a sub-block, read the projection (and anything extra), then roll it back."""
    return query(tag, f"""do $c$
declare v_entry uuid; v_payout uuid; v_batch uuid; v_net jsonb; v_extra jsonb;
begin{GUARD}
  begin
    {body}
    v_net := public.gellatti_partner_commission_netting_v1('{P3}'::uuid, false);
    v_extra := {extra_select};
    raise exception 'qa_netting_rollback';
  exception when others then
    if sqlerrm <> 'qa_netting_rollback' then raise; end if;
  end;
  insert into qa_harness.observations (run_id, worker, payload)
  values ('{RUN}', '{tag}', jsonb_build_object('net', v_net, 'extra', v_extra));
end $c$;
select payload from qa_harness.observations where run_id = '{RUN}' and worker = '{tag}';""")[0]['payload']


query('run', f"""insert into qa_harness.runs (run_id, kind, label, status, params)
values ('{RUN}', 'netting_projection', 'pending commission = payout authority net (A–E)', 'RUNNING',
        jsonb_build_object('partner', '{P3}')); select 1 as ok;""")
base = query('baseline', f"select public.gellatti_partner_commission_netting_v1('{P3}'::uuid, false) as n;")[0]['n']
log(f'baseline {json.dumps(base)}')
check('baseline: the test partner has nothing pending', 0, base['pendingNetCents'])

a = case('A', entry('held', 10000, 'a'))['net']
check('A: held 100 €, no correction → held and pending 100 €', {'held': 10000, 'pending': 10000},
      {'held': a['heldNetCents'], 'pending': a['pendingNetCents']})

b = case('B', entry('held', 10000, 'b') + adjustment(-2000, 'refund_reversal', 'b'))['net']
check('B: held 100 €, correction −20 € → held and pending 80 €', {'held': 8000, 'pending': 8000},
      {'held': b['heldNetCents'], 'pending': b['pendingNetCents']})

c = case('C', entry('reversed', 10000, 'c') + adjustment(-10000, 'refund_reversal', 'c'))['net']
check('C: reversed, net zero → 0 €', {'held': 0, 'payable': 0, 'pending': 0},
      {'held': c['heldNetCents'], 'payable': c['payableNetCents'], 'pending': c['pendingNetCents']})

d_body = entry('paid', 10000, 'd') + f"""
    insert into public.payout_batches (month, currency, livemode, status, started_at)
    values ('2003-02-01', 'eur', false, 'completed', now()) returning id into v_batch;
    insert into public.partner_payouts (batch_id, partner_id, amount_cents, carry_forward_cents, currency, status,
      idempotency_key, stripe_transfer_id, paid_at)
    values (v_batch, '{P3}', 10000, 0, 'eur', 'paid', '2003-02-01:{P3}:eur:test:netting', 'tr_qa_netting_{RUN[:8]}', now())
    returning id into v_payout;
    insert into public.partner_payout_items (payout_id, commission_entry_id, amount_cents) values (v_payout, v_entry, 10000);"""
d1 = case('D1', d_body)['net']
check('D: a paid entry does not come back as pending', {'held': 0, 'payable': 0, 'inFlight': 0, 'pending': 0},
      {'held': d1['heldNetCents'], 'payable': d1['payableNetCents'], 'inFlight': d1['inFlightCents'],
       'pending': d1['pendingNetCents']})
d2 = case('D2', d_body + adjustment(-500, 'refund_reversal', 'd2'))['net']
check('D: a refund AFTER payout is netted into the next payout, as the builder does (−5 €)',
      {'payable': -500, 'pending': -500}, {'payable': d2['payableNetCents'], 'pending': d2['pendingNetCents']})

# E: wait for a quiet moment between the soak's ticks (they run at minute % 5 in {0,1,2}).
while True:
    now = datetime.datetime.utcnow()
    if now.minute % 5 == 3 and 5 <= now.second <= 40:
        break
    time.sleep(2)
e = case('E', entry('eligible', 10000, 'e') + adjustment(-2000, 'refund_reversal', 'e') + """
    perform public.gellatti_build_payout_batch_v1(date '2003-01-01', false, now(), 2500);""",
         f"""(select jsonb_build_object('lineAmount', pp.amount_cents, 'lineStatus', pp.status)
             from public.partner_payouts pp join public.payout_batches b on b.id = pp.batch_id
             where b.month = date '2003-01-01' and b.livemode = false and pp.partner_id = '{P3}')""")
log(f"E: {json.dumps(e)}")
check('E: before the build, the projection says payable 80 € (this is what the panels show)', 8000,
      case('E0', entry('eligible', 10000, 'e0') + adjustment(-2000, 'refund_reversal', 'e0'))['net']['payableNetCents'])
check('E: the real batch builder writes a pending line of exactly 80 € for the same state',
      {'lineAmount': 8000, 'lineStatus': 'pending'}, e['extra'])
check('E: after the build that line is in flight, so ready and pending stay 80 € — nothing counted twice',
      {'payable': 0, 'inFlight': 8000, 'ready': 8000, 'pending': 8000},
      {'payable': e['net']['payableNetCents'], 'inFlight': e['net']['inFlightCents'],
       'ready': e['net']['readyNetCents'], 'pending': e['net']['pendingNetCents']})

for tag, n in (('A', a), ('B', b), ('C', c), ('D1', d1), ('D2', d2), ('E', e['net'])):
    check(f'{tag}: Partner "W trakcie" + "Do wypłaty" equals the admin "Oczekująca prowizja" (server figures)',
          n['pendingNetCents'], n['heldNetCents'] + n['readyNetCents'])

check('A: a positive figure is positive_pending', 'positive_pending', a['pendingState'])
check('C: nothing waiting is zero', {'ready': 'zero', 'pending': 'zero'},
      {'ready': c['readyState'], 'pending': c['pendingState']})
check('D2: a refund after payout larger than what waits is a correction carried forward, sized by the server',
      {'readyState': 'correction_carryforward', 'readyCorrectionCents': 500,
       'pendingState': 'correction_carryforward', 'pendingCorrectionCents': 500},
      {'readyState': d2['readyState'], 'readyCorrectionCents': d2['readyCorrectionCents'],
       'pendingState': d2['pendingState'], 'pendingCorrectionCents': d2['pendingCorrectionCents']})

after = query('after', f"select public.gellatti_partner_commission_netting_v1('{P3}'::uuid, false) as n;")[0]['n']
check('every case rolled back: the test partner is at its baseline again', base, after)
leftover = query('leftover', f"""select count(*) as n from public.commission_entries
where stripe_subscription_id like 'sub_qa_netting_{RUN[:8]}_%';""")[0]['n']
check('no case left a ledger row behind', 0, leftover)

ok = all(c['pass'] for c in checks)
query('finish', f"""update qa_harness.runs set status = '{'PASSED' if ok else 'FAILED'}', finished_at = clock_timestamp(),
  result = '{json.dumps({'checks': checks}).replace("'", "''")}'::jsonb where run_id = '{RUN}'; select 1 as ok;""")
log(f"run {RUN}: {sum(c['pass'] for c in checks)}/{len(checks)} checks passed")
