#!/usr/bin/env node
/**
 * OWNER-LOCKED CONTRACT GUARD.
 *
 * A normal implementation task must not be able to edit an owner-locked
 * contract and then declare success. This is the direct countermeasure to the
 * failure mode the regression provenance audit found twice:
 *
 *   f5d57bdf — removed the Crown/Main row control AND rewrote the guard test in
 *              the same commit to assert the control's absence.
 *   7edd90ea — changed Direction acceptance semantics AND rewrote the Protein
 *              Multi-Main test from a positive Apply to an expected refusal.
 *
 * Both suites stayed green. The capability was gone.
 *
 * RULES
 *   - Modifying, deleting or renaming any file under the locked root FAILS.
 *   - ADDING a new contract passes (it strengthens protection) and is logged.
 *   - The only override is an explicit owner approval trailer in a commit
 *     message within the audited range:
 *
 *         Owner-Locked-Change-Approved: GEL-P0-004, GEL-P0-007
 *
 *     This guard never invents that approval. It only reads it.
 *
 * USAGE
 *   node scripts/guardOwnerLockedContracts.mjs [--base <ref>]
 */
import { execFileSync } from 'node:child_process';

const LOCKED_ROOT = 'src/contracts/owner-locked/';
const APPROVAL_TRAILER = 'Owner-Locked-Change-Approved:';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Resolves the ref this change should be judged against. */
function resolveBase() {
  const flagIndex = process.argv.indexOf('--base');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) return process.argv[flagIndex + 1];
  if (process.env.OWNER_LOCKED_BASE) return process.env.OWNER_LOCKED_BASE;
  // GitHub pull request: compare against the target branch.
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return 'origin/staging';
}

const base = resolveBase();

let mergeBase;
try {
  mergeBase = git('merge-base', base, 'HEAD');
} catch {
  console.error(
    `owner-locked guard: cannot resolve base ref "${base}".\n` +
      'Fetch it first (git fetch origin staging) or pass --base <ref>.',
  );
  process.exit(2);
}

if (mergeBase === git('rev-parse', 'HEAD')) {
  console.log(`owner-locked guard: no commits beyond ${base}. Nothing to check.`);
  process.exit(0);
}

// Status letters: A added, M modified, D deleted, R renamed.
const changes = git('diff', '--name-status', '-M', `${mergeBase}...HEAD`)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status: status[0], paths };
  })
  .filter(({ paths }) => paths.some((path) => path.startsWith(LOCKED_ROOT)));

const added = changes.filter(({ status }) => status === 'A');
const violations = changes.filter(({ status }) => status !== 'A');

for (const { paths } of added) {
  console.log(`owner-locked guard: new contract added — ${paths.join(' -> ')}`);
}

if (violations.length === 0) {
  console.log('owner-locked guard: OK — no accepted contract was modified.');
  process.exit(0);
}

// An approval must be stated explicitly by the owner, in the history.
const messages = git('log', '--format=%B', `${mergeBase}..HEAD`);
const approvedIds = messages
  .split('\n')
  .filter((line) => line.trim().startsWith(APPROVAL_TRAILER))
  .flatMap((line) =>
    line
      .slice(line.indexOf(APPROVAL_TRAILER) + APPROVAL_TRAILER.length)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );

if (approvedIds.length > 0) {
  console.log(
    'owner-locked guard: OWNER-APPROVED contract change.\n' +
      `  approved contracts: ${approvedIds.join(', ')}\n` +
      `  changed files:\n${violations.map(({ status, paths }) => `    ${status} ${paths.join(' -> ')}`).join('\n')}\n` +
      '  Update docs/OWNER_LOCKED_CONTRACTS.md in the same change.',
  );
  process.exit(0);
}

console.error(
  [
    '',
    'OWNER-LOCKED CONTRACT CHANGE BLOCKED',
    '',
    'These accepted contracts were modified or removed:',
    ...violations.map(({ status, paths }) => `  ${status}  ${paths.join(' -> ')}`),
    '',
    'If an owner-locked contract fails, the implementation is wrong BY DEFAULT.',
    'Do not rewrite the contract to fit the implementation.',
    '',
    'If the behaviour genuinely must change, collect EVERY required contract',
    'change into ONE grouped approval request (locked contract, current accepted',
    'behaviour, requested new behaviour, reason, consequence, risk, alternatives,',
    'exact affected files) and wait for explicit owner approval. Do not ask',
    'one-by-one when several changes are already known.',
    '',
    'Once approved, the owner records it as a commit trailer:',
    `  ${APPROVAL_TRAILER} GEL-P0-XXX[, GEL-P0-YYY]`,
    '',
  ].join('\n'),
);
process.exit(1);
