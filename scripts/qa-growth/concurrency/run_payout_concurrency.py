#!/usr/bin/env python3
"""QA ONLY - REAL_DB_CONCURRENCY proof for the payout execution layer.

Runs on the Growth QA branch (project ncmsonfwbgsqedgnzofg, branch
14d26da6-6ce1-404d-87b7-449f1cbd700b) and nowhere else: every writing SQL text
starts with a guard on qa_bootstrap.environment, which exists only there.

Each concurrent worker is a one-shot pg_cron job, so a separate database
session with its own transaction; the controller's own reads and sequential
steps go through `supabase db query`. Row locks are real. Every ordering claim is
judged from clock_timestamp() values taken INSIDE the database, never from the
controller's spawn times.

Phases
  A  three claim workers overlap; lines are disjoint and nobody waited
  B  three settlers race on one line: one pays, the same transfer is a no-op,
     another transfer is refused, and both late settlers waited for the first
  C  a claimer is terminated mid-transaction (restart): nothing it claimed
     survives; a committed claim is not re-claimed; settle retry is a no-op
  D  refunds race the claim: a reversal in flight makes the claim wait and fail
     the line; a reversal arriving after validation waits for the claim and
     nets in the next batch
  E  two builders of the same month: one batch, no duplicate line or item

Fixtures are committed and labelled in qa_harness.fixtures. Payout months are
synthetic (YEAR-01..YEAR-05, default 2001) so they never collide with campaign
months.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid

REF = 'ncmsonfwbgsqedgnzofg'
BRANCH = '14d26da6-6ce1-404d-87b7-449f1cbd700b'
LOGROOT = os.path.expanduser('~/Developer/pinguino-affiliate-work/logs/qa-tests/concurrency')

YEAR = int(os.environ.get('QA_CONC_YEAR', '2001'))


def month(n):
    return f'{YEAR}-{n:02d}-01'


RUN = str(uuid.uuid4())
RUN8 = RUN[:8]
RUNDIR = os.path.join(LOGROOT, RUN8)
os.makedirs(RUNDIR, exist_ok=True)

GUARD = (
    "\n  if not exists (select 1 from qa_bootstrap.environment"
    f" where project_ref = '{REF}' and branch_id = '{BRANCH}') then"
    "\n    raise exception 'isolation guard: not the QA branch';"
    "\n  end if;"
)

CHECKS = []
LOG = open(os.path.join(RUNDIR, 'controller.log'), 'a')


def log(msg):
    line = f"{datetime.datetime.utcnow().isoformat()}Z {msg}"
    print(line, flush=True)
    LOG.write(line + '\n')
    LOG.flush()


def check(name, expected, observed, ok=None):
    passed = (expected == observed) if ok is None else bool(ok)
    CHECKS.append({'check': name, 'expected': expected, 'observed': observed, 'pass': passed})
    log(f"{'PASS' if passed else 'FAIL'} {name} expected={json.dumps(expected, default=str)} observed={json.dumps(observed, default=str)}")
    return passed


def ts(value):
    """Parse a PostgreSQL timestamptz rendered in JSON on Python 3.9."""
    m = re.match(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2}:\d{2})$', value)
    if not m:
        raise ValueError(f'unparsed timestamp {value!r}')
    frac = (m.group(2) or '0').ljust(6, '0')[:6]
    return datetime.datetime.fromisoformat(f"{m.group(1)}.{frac}{m.group(3)}")


def _parse(tag, rc):
    out = open(os.path.join(RUNDIR, f'{tag}.out')).read()
    err = open(os.path.join(RUNDIR, f'{tag}.err')).read()
    rows, error = None, None
    if rc == 0:
        i, j = out.find('{'), out.rfind('}')
        rows = json.loads(out[i:j + 1])['rows'] if i >= 0 else []
    else:
        m = re.search(r'ERROR:\s+(\w+):\s+(.*?)(?:\\n|"\})', err + out)
        error = f'{m.group(1)}: {m.group(2)}' if m else (err + out).strip()[-400:]
    return {'tag': tag, 'rc': rc, 'rows': rows, 'error': error}


def spawn(tag, sql):
    path = os.path.join(RUNDIR, f'{tag}.sql')
    with open(path, 'w') as f:
        f.write(sql)
    proc = subprocess.Popen(
        ['supabase', 'db', 'query', '--linked', '--project-ref', REF, '-o', 'json', '--file', path],
        stdout=open(os.path.join(RUNDIR, f'{tag}.out'), 'w'),
        stderr=open(os.path.join(RUNDIR, f'{tag}.err'), 'w'),
    )
    log(f'spawned {tag} (os pid {proc.pid})')
    return proc


def collect(tag, proc):
    rc = proc.wait()
    result = _parse(tag, rc)
    log(f"collected {tag} rc={rc}{' error=' + result['error'] if result['error'] else ''}")
    return result


def run(tag, sql):
    return collect(tag, spawn(tag, sql))


def must(tag, sql):
    result = run(tag, sql)
    if result['rc'] != 0:
        raise SystemExit(f"{tag} failed: {result['error']}")
    return result


def marker(tag):
    return f'/* qa_conc_marker:{RUN8}:{tag} */\n'


def observe(tag, payload_sql):
    return (
        f"  insert into qa_harness.observations (run_id, worker, payload)"
        f" values ('{RUN}', '{tag}', {payload_sql});\n"
    )


# ── worker SQL ────────────────────────────────────────────────────────────────
def claim_worker(tag, batch, limit, sleep_s, pre=0):
    return marker(tag) + f"""do $w$
declare
  v_t0 timestamptz; v_t1 timestamptz; v_t2 timestamptz; v_rows jsonb;
begin{GUARD}
  perform pg_sleep({pre});
  v_t0 := clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object(
           'payoutId', c.payout_id, 'partnerId', c.partner_id, 'amountCents', c.amount_cents,
           'idempotencyKey', c.idempotency_key, 'connect', c.stripe_connect_account_id) order by c.payout_id), '[]'::jsonb)
    into v_rows
    from public.gellatti_claim_payout_lines_v1('{batch}'::uuid, {limit}, now()) c;
  v_t1 := clock_timestamp();
  perform pg_sleep({sleep_s});
  v_t2 := clock_timestamp();
{observe(tag, "jsonb_build_object('op', 'claim', 'claimed', v_rows, 'tStart', v_t0, 'tClaimDone', v_t1, 'tBeforeCommit', v_t2, 'xid', txid_current()::text, 'role', current_user)")}end $w$;
"""


def nowait_probe(tag, batch, pre=0):
    # The probe takes its locks inside a subtransaction that always rolls back,
    # so it can never make a worker skip a line.
    return marker(tag) + f"""do $p$
declare
  v_t timestamptz; v_state text; v_msg text; v_n integer;
begin{GUARD}
  perform pg_sleep({pre});
  v_t := clock_timestamp();
  begin
    select count(*) into v_n
      from (select pp.id from public.partner_payouts pp where pp.batch_id = '{batch}'::uuid for update nowait) s;
    raise exception using errcode = 'QA001', message = 'acquired ' || v_n || ' rows';
  exception
    when lock_not_available then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    when sqlstate 'QA001' then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
{observe(tag, "jsonb_build_object('op', 'nowait_probe', 'sqlstate', v_state, 'message', v_msg, 'tProbe', v_t)")}end $p$;
"""


def settle_worker(tag, payout, transfer, partner, amount, sleep_s, pre=0):
    return marker(tag) + f"""do $s$
declare
  v_t0 timestamptz; v_t1 timestamptz; v_t2 timestamptz; v_res jsonb; v_state text; v_msg text;
begin{GUARD}
  perform pg_sleep({pre});
  v_t0 := clock_timestamp();
  begin
    v_res := public.gellatti_settle_payout_line_v2('{payout}'::uuid, '{transfer}', '{partner}'::uuid, {amount}, 'eur', false, now());
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  v_t1 := clock_timestamp();
  perform pg_sleep({sleep_s});
  v_t2 := clock_timestamp();
{observe(tag, f"jsonb_build_object('op', 'settle', 'payoutId', '{payout}', 'transferId', '{transfer}', 'result', v_res, 'sqlstate', v_state, 'error', v_msg, 'tStart', v_t0, 'tDone', v_t1, 'tBeforeCommit', v_t2)")}end $s$;
"""


def reversal_worker(tag, partner, entry, source_key, sleep_s, pre=0):
    # The same two writes the webhook makes for a full refund (dispatch.ts
    # appendReversal): the adjustment row, then the eligible -> reversed flip.
    return marker(tag) + f"""do $r$
declare
  v_t0 timestamptz; v_t1 timestamptz; v_t2 timestamptz; v_t3 timestamptz; v_n integer;
begin{GUARD}
  perform pg_sleep({pre});
  v_t0 := clock_timestamp();
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values ('{partner}'::uuid, '{entry}'::uuid, -3000, 'refund_reversal', 'qa concurrency: full refund', '{source_key}');
  v_t1 := clock_timestamp();
  update public.commission_entries set status = 'reversed' where id = '{entry}'::uuid and status = 'eligible';
  get diagnostics v_n = row_count;
  v_t2 := clock_timestamp();
  perform pg_sleep({sleep_s});
  v_t3 := clock_timestamp();
{observe(tag, f"jsonb_build_object('op', 'reversal', 'entryId', '{entry}', 'rowsFlipped', v_n, 'tStart', v_t0, 'tInserted', v_t1, 'tUpdated', v_t2, 'tBeforeCommit', v_t3)")}end $r$;
"""


def build_worker(tag, month, sleep_s, pre=0):
    return marker(tag) + f"""do $b$
declare
  v_t0 timestamptz; v_t1 timestamptz; v_t2 timestamptz; v_res jsonb;
begin{GUARD}
  perform pg_sleep({pre});
  v_t0 := clock_timestamp();
  v_res := public.gellatti_build_payout_batch_v1('{month}'::date, false, now(), 2500);
  v_t1 := clock_timestamp();
  perform pg_sleep({sleep_s});
  v_t2 := clock_timestamp();
  insert into qa_harness.fixtures (run_id, kind, object_id, label)
    values ('{RUN}', 'payout_batch', v_res->>'batchId', 'batch:{month}') on conflict do nothing;
{observe(tag, "jsonb_build_object('op', 'build', 'result', v_res, 'tStart', v_t0, 'tDone', v_t1, 'tBeforeCommit', v_t2)")}end $b$;
"""


def terminate_sql(tag, target):
    pattern = f"'%qa_conc_marker:' || '{RUN8}' || ':' || '{target}' || ' */%'"
    return f"""do $k$
declare v jsonb;
begin{GUARD}
  select coalesce(jsonb_agg(jsonb_build_object('pid', a.pid, 'role', a.usename, 'state', a.state,
           'waitEvent', a.wait_event, 'terminated', pg_terminate_backend(a.pid))), '[]'::jsonb)
    into v
    from pg_stat_activity a
    where a.query like {pattern} and a.pid <> pg_backend_pid();
{observe(tag, "jsonb_build_object('op', 'terminate', 'target', '" + target + "', 'killed', v, 't', clock_timestamp())")}end $k$;
"""


def activity(tags):
    """Wait events of the named workers' sessions (read-only)."""
    sql = f"""select substring(a.query from 'qa_conc_marker:{RUN8}:([A-Za-z0-9_-]+) ') as tag,
       a.pid, a.state, a.wait_event_type, a.wait_event
from pg_stat_activity a
where a.query like '%qa_conc_marker:' || '{RUN8}' || ':%'
  and a.pid <> pg_backend_pid();"""
    result = run(f'poll-{int(time.time() * 1000)}', sql)
    return {r['tag']: r for r in (result['rows'] or []) if r.get('tag') in tags}


def wait_sleeping(tags, timeout=90):
    """Return once every named worker sits in pg_sleep (it is past its critical
    statement and still holds its transaction open)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        seen = activity(tags)
        if all(t in seen and seen[t]['wait_event'] == 'PgSleep' for t in tags):
            log(f'sleeping: {tags}')
            return True
        time.sleep(0.5)
    log(f'timeout waiting for {tags} to sleep')
    return False


def state(tag, batch_ids):
    ids = ','.join(f"'{b}'::uuid" for b in batch_ids if b) or 'null::uuid'
    sql = f"""select jsonb_build_object(
  'observations', (select jsonb_object_agg(o.worker, o.payload) from qa_harness.observations o where o.run_id = '{RUN}'),
  'lines', (select coalesce(jsonb_agg(jsonb_build_object(
      'payoutId', pp.id, 'batchId', pp.batch_id, 'partnerId', pp.partner_id, 'status', pp.status,
      'amountCents', pp.amount_cents, 'carryForwardCents', pp.carry_forward_cents,
      'transferId', pp.stripe_transfer_id, 'failureReason', pp.failure_reason, 'idempotencyKey', pp.idempotency_key,
      'activeItems', (select count(*) from public.partner_payout_items i where i.payout_id = pp.id and i.released_at is null),
      'activeItemsCents', (select coalesce(sum(i.amount_cents), 0) from public.partner_payout_items i where i.payout_id = pp.id and i.released_at is null),
      'releasedItems', (select count(*) from public.partner_payout_items i where i.payout_id = pp.id and i.released_at is not null),
      'auditSettled', (select count(*) from public.audit_log a where a.entity_type = 'partner_payouts' and a.entity_id = pp.id::text and a.action = 'payout.line_settled'),
      'auditStale', (select count(*) from public.audit_log a where a.entity_type = 'partner_payouts' and a.entity_id = pp.id::text and a.action = 'payout.line_released_stale')
    ) order by pp.created_at, pp.id), '[]'::jsonb) from public.partner_payouts pp where pp.batch_id in ({ids})),
  'batches', (select coalesce(jsonb_agg(jsonb_build_object('batchId', b.id, 'month', b.month, 'livemode', b.livemode)), '[]'::jsonb)
      from public.payout_batches b where b.month between '{YEAR}-01-01' and '{YEAR}-12-01'),
  'entries', (select coalesce(jsonb_object_agg(f.label, ce.status), '{{}}'::jsonb)
      from qa_harness.fixtures f join public.commission_entries ce on ce.id::text = f.object_id
      where f.run_id = '{RUN}' and f.kind = 'commission_entry'),
  'entriesInTwoActiveItems', (select count(*) from (select i.commission_entry_id from public.partner_payout_items i
      where i.commission_entry_id is not null and i.released_at is null group by 1 having count(*) > 1) d),
  'partners', (select coalesce(jsonb_object_agg(f.label, f.object_id), '{{}}'::jsonb) from qa_harness.fixtures f where f.run_id = '{RUN}' and f.kind = 'partner'),
  'fixtureEntries', (select coalesce(jsonb_object_agg(f.label, f.object_id), '{{}}'::jsonb) from qa_harness.fixtures f where f.run_id = '{RUN}' and f.kind = 'commission_entry')
) as s;"""
    result = must(tag, sql)
    return result['rows'][0]['s']


def entries_sql(tag, labels, suffix, earned, eligible):
    body = ''
    for label in labels:
        body += f"""
  select f.object_id::uuid into p from qa_harness.fixtures f where f.run_id = '{RUN}' and f.kind = 'partner' and f.label = '{label}';
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (p, 'sub_qaconc_{RUN8}_{label.lower()}_{suffix.lower()}', 'home_monthly_standard', 'home', 'monthly', 'standard', 1, 3000, 'eligible', '{earned}', '{eligible}', false)
    returning id into e;
  insert into qa_harness.fixtures (run_id, kind, object_id, label) values ('{RUN}', 'commission_entry', e::text, '{label}:{suffix}');"""
    return marker(tag) + f"""do $e$
declare p uuid; e uuid;
begin{GUARD}{body}
end $e$;
"""


# ── the run ───────────────────────────────────────────────────────────────────
def preflight():
    sql = marker('preflight') + f"""do $pf$
declare v_col text; u uuid; p uuid; i integer; v_other integer;
begin{GUARD}
  if (select live_payouts_released from public.payout_release_state where id) then
    raise exception 'preflight: live payouts are released on this branch';
  end if;
  select count(*) into v_other from public.commission_entries ce where ce.status in ('held', 'eligible') and not ce.livemode;
  if v_other > 0 then
    raise exception 'preflight: % open test-mode commission entries would enter the synthetic batches', v_other;
  end if;
  if exists (select 1 from public.partner_payouts where status in ('pending', 'processing')) then
    raise exception 'preflight: open payout lines exist';
  end if;
  if exists (select 1 from public.payout_batches where month between '{YEAR}-01-01' and '{YEAR}-12-01') then
    raise exception 'preflight: synthetic {YEAR} payout months already used by an earlier run';
  end if;

  insert into qa_harness.runs (run_id, kind, label, status, params) values (
    '{RUN}', 'REAL_DB_CONCURRENCY', 'payout execution: claim / settle / restart / refund race / build race', 'RUNNING',
    jsonb_build_object('project', '{REF}', 'branch', '{BRANCH}', 'months', array['{month(1)}','{month(2)}','{month(3)}','{month(4)}','{month(5)}'],
      'script', 'scripts/qa-growth/concurrency/run_payout_concurrency.py'));

  for i in 1..6 loop
    u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'qa.conc.{RUN8}.p' || i || '@example.invalid', now(),
              '{{"provider":"email","providers":["email"]}}'::jsonb, '{{"qa_fixture":"payout_concurrency"}}'::jsonb, now(), now());
    for v_col in select column_name from information_schema.columns
      where table_schema = 'auth' and table_name = 'users'
        and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current',
                            'email_change', 'phone_change', 'phone_change_token', 'reauthentication_token')
    loop
      execute format('update auth.users set %I = '''' where id = $1 and %I is null', v_col, v_col) using u;
    end loop;
    insert into public.partners (user_id, status, stripe_connect_account_id, onboarding_complete, payouts_enabled)
      values (u, 'active', 'acct_qaconc_{RUN8}_p' || i, true, true)
      returning id into p;
    insert into qa_harness.fixtures (run_id, kind, object_id, label) values
      ('{RUN}', 'auth_user', u::text, 'P' || i),
      ('{RUN}', 'partner', p::text, 'P' || i);
  end loop;
end $pf$;
"""
    must('preflight', sql)


def lines_of(s, batch):
    return [l for l in s['lines'] if l['batchId'] == batch]


def batch_of(s, m):
    for b in s['batches']:
        if b['month'] == m and b['livemode'] is False:
            return b['batchId']
    return None


# ── concurrent workers = one-shot pg_cron jobs ────────────────────────────────
# Parallel `supabase db query` calls hang in the CLI's login-role step, so the
# workers run as pg_cron jobs instead: each job is its own database session.
# All jobs of a phase are due in the same UTC minute (the next occurrence of
# that minute is a year away, and every job is unscheduled once it finished);
# offsets inside a phase are pg_sleep calls inside the workers themselves.
def cron_phase(phase, jobs, on_started=None, timeout=300):
    target = datetime.datetime.utcnow().replace(second=0, microsecond=0) + datetime.timedelta(minutes=1)
    if (target - datetime.datetime.utcnow()).total_seconds() < 25:
        target += datetime.timedelta(minutes=1)
    expr = f'{target.minute} {target.hour} {target.day} {target.month} *'
    parts = []
    for tag, sql in jobs.items():
        parts.append(f"'{tag}', cron.schedule('qa-conc-{RUN8}-{tag}', '{expr}', $qacmd${sql}$qacmd$)")
    schedule_sql = marker(f'schedule-{phase}') + f"""do $g$
begin{GUARD}
end $g$;
select jsonb_build_object({', '.join(parts)}) as jobs;
"""
    ids = must(f'schedule-{phase}', schedule_sql)['rows'][0]['jobs']
    log(f'phase {phase}: jobs {ids} due at {target.isoformat()}Z ({expr})')
    try:
        wait = (target - datetime.datetime.utcnow()).total_seconds() + 2
        if wait > 0:
            time.sleep(wait)
        if on_started:
            on_started(ids)
        deadline = time.time() + timeout
        id_list = ','.join(str(v) for v in ids.values())
        while True:
            rows = must(f'runs-{phase}-{int(time.time())}', f"""select coalesce(jsonb_object_agg(d.jobid::text, jsonb_build_object(
  'status', d.status, 'message', left(d.return_message, 300), 'start', d.start_time, 'end', d.end_time)), '{{}}'::jsonb) as runs
from cron.job_run_details d where d.jobid in ({id_list});""")['rows'][0]['runs']
            done = {tag: rows.get(str(jid)) for tag, jid in ids.items()}
            if all(r and r['status'] in ('succeeded', 'failed') for r in done.values()):
                break
            if time.time() > deadline:
                raise RuntimeError(f'phase {phase} jobs did not finish: {done}')
            time.sleep(3)
    finally:
        must(f'unschedule-{phase}', f"""select jsonb_agg(cron.unschedule(j.jobid)) as removed
from cron.job j where j.jobname like 'qa-conc-{RUN8}-%';""")
    for tag, r in done.items():
        log(f"phase {phase}: {tag} {r['status']} {r['message']}")
    return done


def phase_a():
    log('── PHASE A: three claim workers overlap')
    must('A-entries', entries_sql('A-entries', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], 'A', f'{YEAR - 1}-10-05T10:00:00+00:00', f'{YEAR - 1}-12-31T23:00:00+00:00'))
    must('A-build', build_worker('A-build', month(1), 0))
    batch = batch_of(state('A-state-0', []), month(1))
    s = state('A-state-1', [batch])
    check('A setup: six pending lines of 3000', [['pending', 3000]] * 6,
          [[l['status'], l['amountCents']] for l in lines_of(s, batch)])

    runs = cron_phase('A', {
        'A-W1': claim_worker('A-W1', batch, 2, 14),
        'A-W2': claim_worker('A-W2', batch, 2, 14),
        'A-W3': claim_worker('A-W3', batch, 2, 14),
        'A-PROBE': nowait_probe('A-PROBE', batch, pre=5),
    })
    must('A-W4', claim_worker('A-W4', batch, 10, 0))

    s = state('A-state-2', [batch])
    obs = s['observations']
    workers = ['A-W1', 'A-W2', 'A-W3']
    check('A the three claim jobs and the probe succeeded', ['succeeded'] * 4,
          [runs[t]['status'] for t in workers + ['A-PROBE']])
    claimed = {t: [c['payoutId'] for c in obs[t]['claimed']] for t in workers}
    flat = [x for v in claimed.values() for x in v]
    check('A each worker claimed two lines', [2, 2, 2], [len(claimed[t]) for t in workers])
    check('A claimed lines are disjoint (no line twice)', len(flat), len(set(flat)))
    check('A all six lines claimed', 6, len(set(flat)))
    order = sorted(workers, key=lambda t: ts(obs[t]['tStart']))
    for earlier, later in zip(order, order[1:]):
        check(f'A {later} claimed while {earlier} still held its transaction (overlap)', True,
              ts(obs[later]['tStart']) < ts(obs[earlier]['tBeforeCommit']))
        check(f'A {later} finished its claim before {earlier} committed (skipped, did not wait)', True,
              ts(obs[later]['tClaimDone']) < ts(obs[earlier]['tBeforeCommit']))
    check('A three separate transactions', 3, len(set(obs[t]['xid'] for t in workers)))
    check('A NOWAIT probe inside the overlap window', True,
          all(ts(obs[t]['tClaimDone']) < ts(obs['A-PROBE']['tProbe']) < ts(obs[t]['tBeforeCommit']) for t in workers))
    check('A NOWAIT probe finds the claimed lines locked', '55P03', obs['A-PROBE']['sqlstate'])
    check('A a fourth claim after the commits gets nothing', [], obs['A-W4']['claimed'])
    check('A lines are processing, none pending', ['processing'] * 6, [l['status'] for l in lines_of(s, batch)])
    return batch, s


def phase_b(batch, s):
    log('── PHASE B: three settlers race on one line')
    line = lines_of(s, batch)[0]
    pid, partner = line['payoutId'], line['partnerId']
    tr = f'tr_qaconc_{RUN8}_{pid[:8]}'
    runs = cron_phase('B', {
        'B-S1': settle_worker('B-S1', pid, tr, partner, 3000, 12),
        'B-S2': settle_worker('B-S2', pid, tr, partner, 3000, 0, pre=4),
        'B-S3': settle_worker('B-S3', pid, tr + '_other', partner, 3000, 0, pre=4),
    })
    st = state('B-state-1', [batch])
    obs = st['observations']
    check('B the three settle jobs committed', ['succeeded'] * 3, [runs[t]['status'] for t in ['B-S1', 'B-S2', 'B-S3']])
    check('B S1 pays the line', {'status': 'paid', 'amountCents': 3000, 'entriesPaid': 1},
          {k: (obs['B-S1']['result'] or {}).get(k) for k in ['status', 'amountCents', 'entriesPaid']})
    check('B S2 same transfer id is a no-op', True, (obs['B-S2']['result'] or {}).get('alreadySettled'))
    check('B S3 another transfer id is refused', 'payout_line_already_paid_by_another_transfer', obs['B-S3']['error'])
    check('B S2 and S3 started while S1 held the line', True,
          ts(obs['B-S2']['tStart']) < ts(obs['B-S1']['tBeforeCommit']) and ts(obs['B-S3']['tStart']) < ts(obs['B-S1']['tBeforeCommit']))
    check('B S2 waited for S1 to commit (row lock)', True, ts(obs['B-S2']['tDone']) > ts(obs['B-S1']['tBeforeCommit']))
    check('B S3 waited for S1 to commit (row lock)', True, ts(obs['B-S3']['tDone']) > ts(obs['B-S1']['tBeforeCommit']))
    raced = [l for l in lines_of(st, batch) if l['payoutId'] == pid][0]
    check('B raced line: one transfer, one settle audit, items = amount',
          {'transferId': tr, 'auditSettled': 1, 'activeItemsCents': 3000},
          {k: raced[k] for k in ['transferId', 'auditSettled', 'activeItemsCents']})

    for i, l in enumerate([l for l in lines_of(st, batch) if l['payoutId'] != pid]):
        must(f'B-close-{i}', settle_worker(f'B-close-{i}', l['payoutId'], f"tr_qaconc_{RUN8}_{l['payoutId'][:8]}", l['partnerId'], 3000, 0))
    st = state('B-state-2', [batch])
    check('B batch A closed: all six lines paid once', [['paid', 1]] * 6,
          [[l['status'], l['auditSettled']] for l in lines_of(st, batch)])
    check('B batch A entries paid', {f'P{i}:A': 'paid' for i in range(1, 7)},
          {k: v for k, v in st['entries'].items() if k.endswith(':A')})


def phase_c():
    log('── PHASE C: restart')
    must('C-entries', entries_sql('C-entries', ['P1', 'P2'], 'C', f'{YEAR - 1}-11-05T10:00:00+00:00', f'{YEAR}-01-31T23:00:00+00:00'))
    must('C-build', build_worker('C-build', month(2), 0))
    batch = batch_of(state('C-state-0', []), month(2))
    s = state('C-state-1', [batch])
    before = {l['payoutId']: l['idempotencyKey'] for l in lines_of(s, batch)}
    check('C setup: two pending lines', ['pending', 'pending'], [l['status'] for l in lines_of(s, batch)])

    killed = {}

    def kill_k1(ids):
        killed['sleeping'] = wait_sleeping(['C-K1'], timeout=100)
        must('C-KILL', terminate_sql('C-KILL', 'C-K1'))

    runs = cron_phase('C', {'C-K1': claim_worker('C-K1', batch, 10, 150)}, on_started=kill_k1)
    time.sleep(3)
    s = state('C-state-2', [batch])
    victims = (s['observations'].get('C-KILL') or {}).get('killed') or []
    check('C K1 was inside its claim transaction when terminated', True, killed.get('sleeping'))
    check('C the controller terminated exactly the K1 session', [True], [k['terminated'] for k in victims])
    check('C the K1 job failed and wrote nothing', True, runs['C-K1']['status'] == 'failed' and 'C-K1' not in s['observations'])
    check('C no K1 session is alive after the kill', {}, activity(['C-K1']))
    check('C after the crash both lines are pending again, untouched',
          [['pending', None, 1, 0, 0]] * 2,
          [[l['status'], l['transferId'], l['activeItems'], l['releasedItems'], l['auditStale']] for l in lines_of(s, batch)])
    check('C after the crash entries are still eligible', {'P1:C': 'eligible', 'P2:C': 'eligible'},
          {k: v for k, v in s['entries'].items() if k.endswith(':C')})

    must('C-K2', claim_worker('C-K2', batch, 1, 0))
    must('C-K3', claim_worker('C-K3', batch, 10, 0))
    s = state('C-state-3', [batch])
    obs = s['observations']
    x, y = obs['C-K2']['claimed'], obs['C-K3']['claimed']
    check('C K2 commits a claim of one line, then stops', 1, len(x))
    check('C a restarted claimer does not re-claim the committed line', True,
          len(y) == 1 and y[0]['payoutId'] != x[0]['payoutId'])
    check('C idempotency keys are unchanged across the restart', before,
          {l['payoutId']: l['idempotencyKey'] for l in lines_of(s, batch)})

    xl, yl = x[0], y[0]
    tr = f"tr_qaconc_{RUN8}_{hashlib.sha256(xl['idempotencyKey'].encode()).hexdigest()[:12]}"
    must('C-X1', settle_worker('C-X1', xl['payoutId'], tr, xl['partnerId'], 3000, 0))
    must('C-X2', settle_worker('C-X2', xl['payoutId'], tr, xl['partnerId'], 3000, 0))
    must('C-Y1', settle_worker('C-Y1', yl['payoutId'], f"tr_qaconc_{RUN8}_{yl['payoutId'][:8]}", yl['partnerId'], 3000, 0))
    s = state('C-state-4', [batch])
    obs = s['observations']
    check('C retrying the settle of the resumed line is a no-op', True, (obs['C-X2']['result'] or {}).get('alreadySettled'))
    check('C both lines paid exactly once', [['paid', 1, 3000]] * 2,
          [[l['status'], l['auditSettled'], l['activeItemsCents']] for l in lines_of(s, batch)])
    return batch


def phase_d():
    log('── PHASE D: refunds race the claim')
    must('D-entries', entries_sql('D-entries', ['P3', 'P4'], 'D', f'{YEAR - 1}-12-05T10:00:00+00:00', f'{YEAR}-02-28T23:00:00+00:00'))
    must('D-build', build_worker('D-build', month(3), 0))
    batch = batch_of(state('D-state-0', []), month(3))
    s = state('D-state-1', [batch])
    p3, p4 = s['partners']['P3'], s['partners']['P4']
    e3, e4 = s['fixtureEntries']['P3:D'], s['fixtureEntries']['P4:D']
    line3 = [l for l in lines_of(s, batch) if l['partnerId'] == p3][0]
    line4 = [l for l in lines_of(s, batch) if l['partnerId'] == p4][0]

    runs = cron_phase('D', {
        'D-R3': reversal_worker('D-R3', p3, e3, f'obj:re_qaconc_{RUN8}_p3', 10),
        'D-W7': claim_worker('D-W7', batch, 10, 16, pre=3),
        'D-R2': reversal_worker('D-R2', p4, e4, f'obj:re_qaconc_{RUN8}_p4', 0, pre=15),
    })
    s = state('D-state-2', [batch])
    obs = s['observations']
    l3 = [l for l in lines_of(s, batch) if l['payoutId'] == line3['payoutId']][0]
    l4 = [l for l in lines_of(s, batch) if l['payoutId'] == line4['payoutId']][0]
    check('D the three jobs committed', ['succeeded'] * 3, [runs[t]['status'] for t in ['D-R3', 'D-W7', 'D-R2']])
    check('D W7 started its claim while the P3 refund was uncommitted', True,
          ts(obs['D-R3']['tUpdated']) < ts(obs['D-W7']['tStart']) < ts(obs['D-R3']['tBeforeCommit']))
    check('D W7 waited for the P3 refund to commit before deciding', True,
          ts(obs['D-W7']['tClaimDone']) > ts(obs['D-R3']['tBeforeCommit']))
    check('D the P3 line fails stale and releases its reservation',
          {'status': 'failed', 'failureReason': 'stale_line:reserved_entry_no_longer_eligible', 'activeItems': 0, 'releasedItems': 1, 'auditStale': 1},
          {k: l3[k] for k in ['status', 'failureReason', 'activeItems', 'releasedItems', 'auditStale']})
    check('D W7 claimed only the P4 line', [line4['payoutId']], [c['payoutId'] for c in obs['D-W7']['claimed']])
    check('D the P4 refund row was written inside the claim window (no lock needed)', True,
          ts(obs['D-W7']['tClaimDone']) < ts(obs['D-R2']['tInserted']) < ts(obs['D-W7']['tBeforeCommit']))
    check('D the P4 status flip waited for the claim to commit (share lock)', True,
          ts(obs['D-R2']['tUpdated']) > ts(obs['D-W7']['tBeforeCommit']))
    check('D the P4 flip still applied after the wait', 1, obs['D-R2']['rowsFlipped'])
    check('D P4 line stays processing with its entry reversed', ['processing', 'reversed'], [l4['status'], s['entries']['P4:D']])

    must('D-S4', settle_worker('D-S4', line4['payoutId'], f"tr_qaconc_{RUN8}_{line4['payoutId'][:8]}", p4, 3000, 0))
    must('D-next', build_worker('D-next', month(4), 0))
    nxt = batch_of(state('D-state-3', []), month(4))
    s = state('D-state-4', [batch, nxt])
    obs = s['observations']
    check('D settling the P4 line pays the transfer and flips no reversed entry',
          {'status': 'paid', 'entriesPaid': 0}, {k: (obs['D-S4']['result'] or {}).get(k) for k in ['status', 'entriesPaid']})
    nlines = {l['partnerId']: l for l in lines_of(s, nxt)}
    check('D next batch: P4 carries the refund forward as a visible negative',
          {'status': 'skipped_negative_balance', 'amountCents': 0, 'carryForwardCents': -3000},
          {k: nlines.get(p4, {}).get(k) for k in ['status', 'amountCents', 'carryForwardCents']})
    check('D next batch: P3, refunded in full before payout, has no line (net 0)', False, p3 in nlines)
    return batch, nxt


def phase_e():
    log('── PHASE E: two builders of one month')
    must('E-entries', entries_sql('E-entries', ['P5', 'P6'], 'E', f'{YEAR}-01-05T10:00:00+00:00', f'{YEAR}-03-31T22:00:00+00:00'))
    runs = cron_phase('E', {
        'E-B1': build_worker('E-B1', month(5), 12),
        'E-B2': build_worker('E-B2', month(5), 0, pre=4),
    })
    batch = batch_of(state('E-state-0', []), month(5))
    s = state('E-state-1', [batch])
    obs = s['observations']
    check('E both build jobs committed', ['succeeded'] * 2, [runs[t]['status'] for t in ['E-B1', 'E-B2']])
    check('E exactly one batch for month 5 (test mode)', 1,
          len([b for b in s['batches'] if b['month'] == month(5) and b['livemode'] is False]))
    check('E B1 created it and wrote the payable lines', {'batchCreated': True, 'payableLines': 2},
          {k: obs['E-B1']['result'][k] for k in ['batchCreated', 'payableLines']})
    check('E B2 found it and wrote nothing', {'batchCreated': False, 'linesWritten': 0},
          {k: obs['E-B2']['result'][k] for k in ['batchCreated', 'linesWritten']})
    check('E B2 started while B1 was open and finished after B1 committed', True,
          ts(obs['E-B2']['tStart']) < ts(obs['E-B1']['tBeforeCommit']) < ts(obs['E-B2']['tDone']))
    p5, p6 = s['partners']['P5'], s['partners']['P6']
    got = {l['partnerId']: [l['status'], l['amountCents'], l['activeItems']] for l in lines_of(s, batch)}
    check('E P5 and P6: one pending 3000 line with one reserved item each',
          {p5: ['pending', 3000, 1], p6: ['pending', 3000, 1]}, {k: v for k, v in got.items() if k in (p5, p6)})

    must('E-claim', claim_worker('E-claim', batch, 10, 0))
    s = state('E-state-2', [batch])
    for c in s['observations']['E-claim']['claimed']:
        tag = f"E-settle-{c['payoutId'][:8]}"
        must(tag, settle_worker(tag, c['payoutId'], f"tr_qaconc_{RUN8}_{c['payoutId'][:8]}", c['partnerId'], c['amountCents'], 0))
    s = state('E-state-3', [batch])
    check('E P5 and P6 lines paid once', [['paid', 1]] * 2,
          [[l['status'], l['auditSettled']] for l in lines_of(s, batch) if l['partnerId'] in (p5, p6)])
    return batch


def finish(batches):
    s = state('final-state', batches)
    paid = [l for l in s['lines'] if l['status'] == 'paid']
    failed = [l for l in s['lines'] if l['status'] == 'failed']
    check('FINAL every paid line: transfer set, one settle audit, reserved items equal the amount', True,
          len(paid) == 11 and all(l['transferId'] and l['auditSettled'] == 1 and l['activeItemsCents'] == l['amountCents'] for l in paid))
    check('FINAL every failed line released its reservation', True,
          len(failed) == 1 and all(l['activeItems'] == 0 and l['releasedItems'] >= 1 for l in failed))
    check('FINAL no entry is held by two active payout items', 0, s['entriesInTwoActiveItems'])
    statuses = sorted(s['entries'].values())
    check('FINAL fixture entries: 10 paid, 2 reversed', {'paid': 10, 'reversed': 2},
          {k: statuses.count(k) for k in set(statuses)})
    passed = all(c['pass'] for c in CHECKS)
    summary = {'checks': len(CHECKS), 'passed': sum(c['pass'] for c in CHECKS),
               'failed': [c['check'] for c in CHECKS if not c['pass']]}
    status = 'PASSED' if passed else 'FAILED'
    payload = json.dumps({'summary': summary, 'checks': CHECKS}, default=str).replace("'", "''")
    must('finalize', marker('finalize') + f"""do $f$
begin{GUARD}
  update qa_harness.runs set status = '{status}', finished_at = clock_timestamp(), result = '{payload}'::jsonb
    where run_id = '{RUN}';
end $f$;
""")
    with open(os.path.join(RUNDIR, 'verdict.json'), 'w') as f:
        json.dump({'run': RUN, 'status': status, 'summary': summary, 'checks': CHECKS, 'finalState': s}, f, indent=1, default=str)
    with open(os.path.join(RUNDIR, 'verdict.txt'), 'w') as f:
        for c in CHECKS:
            f.write(f"{'PASS' if c['pass'] else 'FAIL'} | {c['check']} | expected={json.dumps(c['expected'], default=str)} | observed={json.dumps(c['observed'], default=str)}\n")
        f.write(f"RUN {RUN} STATUS {status} {summary['passed']}/{summary['checks']}\n")
    log(f"RUN {RUN} STATUS {status} {summary['passed']}/{summary['checks']}")
    return passed


def main():
    log(f'run {RUN} on {REF} (branch {BRANCH}); year {YEAR}; logs in {RUNDIR}')
    preflight()
    try:
        batch_a, s = phase_a()
        phase_b(batch_a, s)
        batch_c = phase_c()
        batch_d, batch_n = phase_d()
        batch_e = phase_e()
        ok = finish([batch_a, batch_c, batch_d, batch_n, batch_e])
    except BaseException as exc:  # record the abort; never leave the run RUNNING
        log(f'ABORTED: {exc!r}')
        reason = repr(exc).replace("'", "''")[:900]
        run('abort', marker('abort') + f"""do $x$
begin{GUARD}
  update qa_harness.runs set status = 'ABORTED', finished_at = clock_timestamp(),
    result = jsonb_build_object('error', '{reason}', 'checksSoFar', {len(CHECKS)}, 'checks', '{json.dumps(CHECKS, default=str).replace("'", "''")}'::jsonb)
    where run_id = '{RUN}';
end $x$;
select jsonb_agg(cron.unschedule(j.jobid)) as removed from cron.job j where j.jobname like 'qa-conc-{RUN8}-%';
""")
        raise
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
