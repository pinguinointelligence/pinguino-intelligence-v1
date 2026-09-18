#!/usr/bin/env python3
"""QA ONLY — REAL_DB_CONCURRENCY for the stale payout line reclaim (P0 20260918150000).

Runs on the Growth QA branch only: every writing SQL text starts with a guard on
qa_bootstrap.environment, which exists nowhere else.

Each worker is its own `supabase db query` process, so its own database session
and transaction. Workers meet at a wall-clock barrier computed by the controller
and every ordering claim is judged from clock_timestamp() taken INSIDE the
database.

  R  two workers reclaim the same abandoned line at the same instant: exactly one
     reopens it, the other skips the locked row without waiting, one audit row;
     a line already bound to a transfer and a paid line are never touched.
  C  two workers claim the reopened line at the same instant: exactly one gets it.

The Stripe side of the same fix — crash after transfers.create, recovery binding
THE SAME transfer, exactly one transfer at Stripe — is proven separately by
connect_payout.py stages interrupt/recover against the real sandbox.
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
LOGDIR = os.path.expanduser(f'~/Developer/pinguino-affiliate-work/logs/qa-tests/reclaim/{RUN[:8]}')
os.makedirs(LOGDIR, exist_ok=True)
MONTH = sys.argv[1] if len(sys.argv) > 1 else '2002-02-01'
P1, P2, P3 = ('830c1cb2-293d-40bf-b5ba-f58a5e3ed18e', 'df2f5276-6208-4836-b2f3-67bbf254f6ef',
              '143d115a-f74c-4ffd-86c8-7b5f802e3d1f')

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
    log(f"{'PASS' if ok else 'FAIL'} {name} expected={json.dumps(expected, default=str)} observed={json.dumps(observed, default=str)}")


def spawn(tag, sql):
    path = os.path.join(LOGDIR, f'{tag}.sql')
    open(path, 'w').write(sql)
    return subprocess.Popen(['supabase', 'db', 'query', '--linked', '--project-ref', REF, '-o', 'json', '--file', path],
                            stdout=open(os.path.join(LOGDIR, f'{tag}.out'), 'w'),
                            stderr=open(os.path.join(LOGDIR, f'{tag}.err'), 'w'))


def rows(tag, proc):
    rc = proc.wait(timeout=240)
    out = open(os.path.join(LOGDIR, f'{tag}.out')).read()
    if rc != 0:
        raise SystemExit(f'{tag} failed: {open(os.path.join(LOGDIR, f"{tag}.err")).read()[-400:]}')
    i, j = out.find('{'), out.rfind('}')
    return json.loads(out[i:j + 1], strict=False)['rows'] if i >= 0 else []


def query(tag, sql):
    return rows(tag, spawn(tag, sql))


def observe(tag, payload):
    return f"  insert into qa_harness.observations (run_id, worker, payload) values ('{RUN}', '{tag}', {payload});\n"


def barrier(at):
    return f"  perform pg_sleep(greatest(extract(epoch from (timestamptz '{at}' - clock_timestamp())), 0));\n"


# ── fixture ─────────────────────────────────────────────────────────────────
setup = query('setup', f"""do $s$
declare v_batch uuid; e_a uuid; e_b uuid; e_c uuid; l_a uuid; l_b uuid; l_c uuid;
begin{GUARD}
  insert into qa_harness.runs (run_id, kind, label, status, params)
  values ('{RUN}', 'reclaim_concurrency', 'P0 20260918150000 parallel reclaim + claim', 'RUNNING',
          jsonb_build_object('month', '{MONTH}'));
  insert into public.payout_batches (month, currency, livemode, status, started_at)
  values ('{MONTH}', 'eur', false, 'processing', now() - interval '2 hours') returning id into v_batch;
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier,
    rule_version, amount_cents, status, earned_at, eligible_at, livemode)
  values ('{P1}', 'sub_qa_reclaim_{RUN[:8]}_a', 'home_monthly_standard', 'home', 'monthly', 'standard', 1, 1500,
          'eligible', now() - interval '120 days', now() - interval '1 day', false) returning id into e_a;
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier,
    rule_version, amount_cents, status, earned_at, eligible_at, livemode)
  values ('{P2}', 'sub_qa_reclaim_{RUN[:8]}_b', 'home_monthly_standard', 'home', 'monthly', 'standard', 1, 1600,
          'eligible', now() - interval '120 days', now() - interval '1 day', false) returning id into e_b;
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier,
    rule_version, amount_cents, status, earned_at, eligible_at, livemode)
  values ('{P3}', 'sub_qa_reclaim_{RUN[:8]}_c', 'home_monthly_standard', 'home', 'monthly', 'standard', 1, 1700,
          'paid', now() - interval '120 days', now() - interval '1 day', false) returning id into e_c;
  -- A: abandoned mid-flight, the case the migration exists for
  insert into public.partner_payouts (batch_id, partner_id, amount_cents, carry_forward_cents, currency, status, idempotency_key, updated_at)
  values (v_batch, '{P1}', 1500, 0, 'eur', 'processing', '{MONTH}:{P1}:eur:test:reclaimA', now() - interval '1 hour')
  returning id into l_a;
  -- B: processing but ALREADY bound to a transfer — must never be reopened
  insert into public.partner_payouts (batch_id, partner_id, amount_cents, carry_forward_cents, currency, status, idempotency_key, stripe_transfer_id, updated_at)
  values (v_batch, '{P2}', 1600, 0, 'eur', 'processing', '{MONTH}:{P2}:eur:test:reclaimB', 'tr_qa_bound_{RUN[:8]}', now() - interval '1 hour')
  returning id into l_b;
  -- C: paid — must never be reopened
  insert into public.partner_payouts (batch_id, partner_id, amount_cents, carry_forward_cents, currency, status, idempotency_key, stripe_transfer_id, paid_at, updated_at)
  values (v_batch, '{P3}', 1700, 0, 'eur', 'paid', '{MONTH}:{P3}:eur:test:reclaimC', 'tr_qa_paid_{RUN[:8]}', now() - interval '1 hour', now() - interval '1 hour')
  returning id into l_c;
  insert into public.partner_payout_items (payout_id, commission_entry_id, amount_cents) values (l_a, e_a, 1500), (l_b, e_b, 1600);
  insert into public.partner_payout_items (payout_id, commission_entry_id, amount_cents, released_at, release_reason)
  values (l_c, e_c, 1700, now() - interval '1 hour', 'paid');
  insert into qa_harness.fixtures (run_id, kind, object_id, label) values
    ('{RUN}', 'payout_batch', v_batch::text, 'reclaim-concurrency'), ('{RUN}', 'partner_payout', l_a::text, 'A abandoned'),
    ('{RUN}', 'partner_payout', l_b::text, 'B bound'), ('{RUN}', 'partner_payout', l_c::text, 'C paid');
{observe('setup', "jsonb_build_object('batch', v_batch, 'A', l_a, 'B', l_b, 'C', l_c)")}end $s$;
select payload from qa_harness.observations where run_id = '{RUN}' and worker = 'setup';""")[0]['payload']
BATCH, A, B, C = setup['batch'], setup['A'], setup['B'], setup['C']
log(f'run {RUN} batch {BATCH} A={A} B={B} C={C}')


def reclaim_worker(tag, at, hold):
    return f"""do $w$
declare v_t0 timestamptz; v_t1 timestamptz; v_n integer;
begin{GUARD}
{barrier(at)}  v_t0 := clock_timestamp();
  v_n := public.gellatti_reclaim_stale_payout_lines_v1('{BATCH}'::uuid, interval '1 minute', 10);
  v_t1 := clock_timestamp();
  perform pg_sleep({hold});
{observe(tag, "jsonb_build_object('reclaimed', v_n, 'tStart', v_t0, 'tDone', v_t1, 'tCommit', clock_timestamp(), 'pid', pg_backend_pid())")}end $w$;
select 1 as ok;"""


def claim_worker(tag, at, hold):
    return f"""do $w$
declare v_t0 timestamptz; v_t1 timestamptz; v_rows jsonb;
begin{GUARD}
{barrier(at)}  v_t0 := clock_timestamp();
  select coalesce(jsonb_agg(c.payout_id order by c.payout_id), '[]'::jsonb) into v_rows
    from public.gellatti_claim_payout_lines_v1('{BATCH}'::uuid, 10, now()) c;
  v_t1 := clock_timestamp();
  perform pg_sleep({hold});
{observe(tag, "jsonb_build_object('claimed', v_rows, 'tStart', v_t0, 'tDone', v_t1, 'tCommit', clock_timestamp(), 'pid', pg_backend_pid())")}end $w$;
select 1 as ok;"""


def race(label, make):
    # The CLI's temporary login role races when two processes log in at the same
    # instant ("password authentication failed for user cli_login_postgres"), so
    # the PROCESSES start a few seconds apart. The in-database barrier still
    # releases both transactions at the same instant, which is what is measured.
    at = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=30)).isoformat()
    procs = {f'{label}1': spawn(f'{label}1', make(f'{label}1', at, 6))}
    time.sleep(8)
    procs[f'{label}2'] = spawn(f'{label}2', make(f'{label}2', at, 6))
    for tag, proc in procs.items():
        rows(tag, proc)
    got = query(f'{label}-read', f"""select worker, payload from qa_harness.observations
where run_id = '{RUN}' and worker in ('{label}1', '{label}2') order by worker;""")
    return {g['worker']: g['payload'] for g in got}


def ts(value):
    # Python 3.9's fromisoformat wants 3 or 6 fractional digits; Postgres prints
    # as few as it needs.
    head, _, tz = value.replace('Z', '+00:00').partition('+')
    if '.' in head:
        base, frac = head.split('.')
        head = f"{base}.{(frac + '000000')[:6]}"
    return datetime.datetime.fromisoformat(f'{head}+{tz}' if tz else head)


def overlap(a, b):
    return ts(a['tStart']) < ts(b['tCommit']) and ts(b['tStart']) < ts(a['tCommit'])


# ── R: two reclaimers at the same instant ─────────────────────────────────────
r = race('R', reclaim_worker)
log(f'R: {json.dumps(r, default=str)}')
check('R: the two reclaimers really ran at the same time (their transactions overlap)', True,
      overlap(r['R1'], r['R2']))
check('R: exactly one line reopened across both workers', 1, r['R1']['reclaimed'] + r['R2']['reclaimed'])
check('R: the loser skipped the locked row instead of waiting for it (< 1 s)', True,
      min((ts(r[w]['tDone']) - ts(r[w]['tStart'])).total_seconds() for w in ('R1', 'R2')) < 1.0)
state = query('R-state', f"""select jsonb_object_agg(pp.id, jsonb_build_object('status', pp.status, 'transfer', pp.stripe_transfer_id,
  'key', pp.idempotency_key)) as s from public.partner_payouts pp where pp.batch_id = '{BATCH}';""")[0]['s']
check('R: the abandoned line is pending again, same idempotency key, still no transfer id',
      {'status': 'pending', 'transfer': None, 'key': f'{MONTH}:{P1}:eur:test:reclaimA'}, state[A])
check('R: the line already bound to a transfer is untouched', 'processing', state[B]['status'])
check('R: the paid line is untouched', 'paid', state[C]['status'])
audit = query('R-audit', f"""select count(*) as n, coalesce(jsonb_agg(a.diff -> 'after' -> 'amountImpactCents'), '[]'::jsonb) as impact
from public.audit_log a where a.action = 'payout.line_reclaimed_stale' and a.entity_id in ('{A}', '{B}', '{C}');""")[0]
check('R: one audit row, for the reopened line, moving no money', {'n': 1, 'impact': [0]},
      {'n': audit['n'], 'impact': audit['impact']})

# ── C: two claimers of the reopened line at the same instant ─────────────────
cl = race('C', claim_worker)
log(f'C: {json.dumps(cl, default=str)}')
check('C: the two claimers really ran at the same time', True, overlap(cl['C1'], cl['C2']))
claimed = [x for w in ('C1', 'C2') for x in cl[w]['claimed']]
check('C: the reopened line is claimed exactly once', [A], claimed)

query('finish', f"""update qa_harness.runs set status = '{'PASSED' if all(c['pass'] for c in checks) else 'FAILED'}',
  result = '{json.dumps({'checks': checks}, default=str).replace("'", "''")}'::jsonb, finished_at = clock_timestamp()
where run_id = '{RUN}'; select 1 as ok;""")
log(f"run {RUN}: {sum(c['pass'] for c in checks)}/{len(checks)} checks passed")
