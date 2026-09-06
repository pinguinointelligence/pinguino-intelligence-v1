#!/usr/bin/env node
/**
 * A HOME phase cannot close with its ledger left behind.
 *
 * WHY THIS EXISTS. `reports/GELLATTI_HOME_MASTER_CHECKLIST.md` stopped being updated on
 * 2026-08-31 while phases kept merging. Progress was then reported from conversation
 * instead of from the record, and two different wrong numbers — 97% and 36% — reached the
 * owner on the same day. Neither was a lie; both are what you get when the record and the
 * repository drift apart. This guard makes that drift fail the build instead of the
 * report. Recorded as defect B3.
 *
 * WHAT IT REFUSES. A change to HOME's functional surface that does not also move a
 * REQUIREMENT ROW. Not the file's mtime, not its whitespace, not a bumped date — a row.
 * Both revisions are parsed into `id -> (status, evidence)` and compared, so a cosmetic
 * edit is indistinguishable from no edit at all. That is the point: the obvious way to
 * defeat a "did you touch the file" check is to touch the file.
 *
 * WHAT IT WILL NOT DO. It never writes a status, never infers one, and never treats the
 * existence of code as evidence of a test. Deciding what a row is worth stays a human
 * judgement; the guard only insists that the judgement is written down.
 *
 * ESCAPE HATCH, deliberately narrow and visible:
 *
 *     HOME-Ledger-Exempt: <why this change cannot move any requirement row>
 *
 * USAGE
 *   node scripts/guardHomeLedger.mjs [--base <ref>] [--report-only]
 */
import { execFileSync } from 'node:child_process';

const LEDGER = 'reports/GELLATTI_HOME_MASTER_CHECKLIST.md';
const EXEMPT_TRAILER = 'HOME-Ledger-Exempt:';

/**
 * HOME's functional surface. Deliberately NOT the whole repo: a PRO-only or Shop-only
 * change has no HOME requirement to move, and a guard that cried wolf on those would be
 * routed around within a week.
 */
const HOME_FUNCTIONAL = [
  /^src\/features\/home-creator\/(?!.*\.test\.)/,
  /^src\/pages\/home\/(?!.*\.test\.)/,
];

/** Documentation and reports are not HOME's functional surface. */
const NEVER_FUNCTIONAL = [/^reports\//, /^docs\//, /\.md$/];

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function resolveBase() {
  const flag = process.argv.indexOf('--base');
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1];
  return process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/staging';
}

/* `|` inside a cell is legally escaped as `\|`. Splitting naively on `|` shifts every
   field after it and reports four healthy rows as malformed — which is exactly what
   happened during the reconciliation that led to this guard. */
const SPLIT_CELLS = /(?<!\\)\|/;
const ROW = /^\| H-/;

const ALLOWED_STATUS = new Set([
  'SERVED VERIFIED',
  'TESTED',
  'IMPLEMENTED',
  'IN PROGRESS',
  'TODO',
  'BLOCKED',
  'WAITING',
  'UNKNOWN',
  'NOT APPLICABLE',
]);

export function parseLedger(text) {
  const rows = new Map();
  const problems = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (!ROW.test(line)) continue;
    const fields = line.split(SPLIT_CELLS).map((c) => c.trim()).slice(1, -1);
    const id = fields[0];
    const lineNo = index + 1;
    if (fields.length !== 17) {
      problems.push(`${LEDGER}:${lineNo} — ${id} has ${fields.length} columns, expected 17`);
      continue;
    }
    const status = fields[14];
    if (!ALLOWED_STATUS.has(status)) {
      problems.push(
        `${LEDGER}:${lineNo} — ${id} has status "${status}", which is not one of ${[...ALLOWED_STATUS].join(', ')}`,
      );
    }
    if (rows.has(id)) problems.push(`${LEDGER}:${lineNo} — duplicate requirement id ${id}`);
    // Evidence is part of a row's claim: moving a status without saying why is the drift
    // this guard exists to catch.
    rows.set(id, { status, evidence: fields[15] });
  }
  return { rows, problems };
}

const show = (ref, path) => {
  try {
    return git('show', `${ref}:${path}`);
  } catch {
    return null;
  }
};

function main() {
  const base = resolveBase();
  const reportOnly = process.argv.includes('--report-only');

  const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const homeTouched = changed.filter(
    (f) => !NEVER_FUNCTIONAL.some((re) => re.test(f)) && HOME_FUNCTIONAL.some((re) => re.test(f)),
  );

  const after = show('HEAD', LEDGER);
  if (after === null) {
    console.error(`${LEDGER} is missing from HEAD. The HOME ledger may not be deleted.`);
    process.exit(1);
  }

  // Structure is checked on EVERY run, not only when HOME changed: a malformed ledger
  // makes every later reading of it wrong, whoever broke it.
  const { rows: rowsAfter, problems } = parseLedger(after);
  if (problems.length > 0) {
    console.error('HOME LEDGER IS MALFORMED\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\n  ${rowsAfter.size} requirement rows parsed.`);
    if (!reportOnly) process.exit(1);
  }

  if (homeTouched.length === 0) {
    console.log(
      `HOME ledger guard: no HOME functional change in ${base}...HEAD — ${rowsAfter.size} rows, structure OK.`,
    );
    return;
  }

  const exemption = git('log', '--format=%B', `${base}..HEAD`)
    .split('\n')
    .find((l) => l.trim().startsWith(EXEMPT_TRAILER));
  if (exemption) {
    const reason = exemption.slice(exemption.indexOf(EXEMPT_TRAILER) + EXEMPT_TRAILER.length).trim();
    if (reason.length < 12) {
      console.error(`${EXEMPT_TRAILER} needs a real reason, not "${reason}".`);
      process.exit(1);
    }
    console.log(`HOME ledger guard: exempted — ${reason}`);
    return;
  }

  const before = show(base, LEDGER);
  const rowsBefore = before === null ? new Map() : parseLedger(before).rows;

  // A SUBSTANTIVE change is a row whose status or evidence moved, or a new row.
  // Whitespace, reflow, a bumped date and an added prose paragraph all leave this empty.
  const moved = [];
  for (const [id, now] of rowsAfter) {
    const was = rowsBefore.get(id);
    if (!was) moved.push(`${id}: new row (${now.status})`);
    else if (was.status !== now.status || was.evidence !== now.evidence) {
      moved.push(`${id}: ${was.status} -> ${now.status}`);
    }
  }

  if (moved.length === 0) {
    console.error('HOME FUNCTIONAL CHANGE WITHOUT A LEDGER UPDATE\n');
    console.error('These files change what HOME does:\n');
    for (const f of homeTouched) console.error(`  ${f}`);
    console.error(`\nBut no requirement row moved in ${LEDGER}.`);
    console.error('A whitespace, date or prose edit does not count — the guard compares');
    console.error('parsed rows, so only a status or evidence change registers.\n');
    console.error('Either record what this change did to the affected requirement, or say');
    console.error('in a commit message why it cannot touch one:\n');
    console.error(`  ${EXEMPT_TRAILER} <why this change moves no requirement row>\n`);
    if (!reportOnly) process.exit(1);
    return;
  }

  console.log(
    `HOME ledger guard: ${homeTouched.length} HOME file(s) changed, ${moved.length} requirement row(s) moved.`,
  );
  for (const m of moved.slice(0, 12)) console.log(`  ${m}`);
}

main();
