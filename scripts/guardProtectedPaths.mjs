#!/usr/bin/env node
/**
 * PROTECTED FUNCTIONAL PATH DIFF GATE.
 *
 * Classifies what a change ACTUALLY did to a protected file, and refuses to
 * take the commit's word for it. The regression provenance audit found that the
 * three P0 regressions of 2026-08-24..29 arrived in commits named:
 *
 *   "unify main badges"           -> deleted the Crown/Main row control
 *   "restore live draft visibility" -> changed Direction acceptance semantics
 *   "enforce canonical batch coherence" -> broke the Professional 1000 g default
 *
 * None was labelled design or copy. A gate keyed on commit NAMES would have
 * caught none of them, so this gate is keyed on PATHS and on the diff itself.
 *
 * METHOD
 *   For each protected file, take the removed lines and the added lines, strip
 *   comments, string literals, JSX text and all whitespace from each side, and
 *   compare the two skeletons.
 *     - identical skeletons  -> PRESENTATION (copy / className / formatting)
 *     - different skeletons  -> SEMANTIC (conditions, callbacks, thresholds,
 *                               mutations, data transforms, authority)
 *
 *   The heuristic deliberately errs toward SEMANTIC: a false positive costs one
 *   human read, a false negative costs a production regression.
 *
 * OUTCOME
 *   Semantic drift on a protected path is reported and FAILS unless the change
 *   acknowledges it with a commit trailer naming the area:
 *
 *       Protected-Change: src/stores/recipeStore.ts — Professional batch default
 *
 *   The trailer does not make the change safe; it makes it VISIBLE and forces
 *   the author to state, in the history, that they knew what they touched.
 *
 * USAGE
 *   node scripts/guardProtectedPaths.mjs [--base <ref>] [--report-only]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MANIFEST = 'scripts/protectedPaths.json';
const ACK_TRAILER = 'Protected-Change:';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function resolveBase() {
  const flagIndex = process.argv.indexOf('--base');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) return process.argv[flagIndex + 1];
  if (process.env.PROTECTED_PATHS_BASE) return process.env.PROTECTED_PATHS_BASE;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return 'origin/staging';
}

const reportOnly = process.argv.includes('--report-only');
const { paths: protectedEntries } = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const isProtected = (file) =>
  protectedEntries.some((entry) =>
    entry.path.endsWith('/') ? file.startsWith(entry.path) : file === entry.path,
  );
const areaOf = (file) =>
  protectedEntries.find((entry) =>
    entry.path.endsWith('/') ? file.startsWith(entry.path) : file === entry.path,
  )?.area ?? 'protected';

/**
 * Reduces a side of the diff to its executable skeleton: no comments, no string
 * contents, no JSX text, no whitespace. What remains is structure and
 * identifiers — the things that change behaviour.
 */
function skeleton(lines) {
  return (
    lines
      .join('\n')
      // Block and line comments.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      // String CONTENTS (keep the quotes so structure holds).
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // Template literals: the literal text is copy, but a `${...}`
      // interpolation is CODE and must survive, or a changed expression inside
      // a translated sentence would read as presentation.
      .replace(/`(?:[^`\\]|\\.)*`/g, (literal) => {
        const interpolations = literal.match(/\$\{[^}]*\}/g) ?? [];
        return `\`${interpolations.join('')}\``;
      })
      // JSX text between tags on one line, when it carries no expression.
      .replace(/>[^<>{}]+</g, '><')
      // Multi-line JSX prose: a continuation line of a translated sentence has
      // no JS structure at all. Requiring five or more whitespace-separated
      // tokens keeps real statements (`return value`, `if (a) return b`) out of
      // this branch — they are short or carry braces/angles/equals.
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed || /[{}<>=]/.test(trimmed)) return true;
        return !(trimmed.split(/\s+/).length >= 5 && /\p{L}/u.test(trimmed));
      })
      .join('\n')
      .replace(/\s+/g, '')
  );
}

const base = resolveBase();
let mergeBase;
try {
  mergeBase = git('merge-base', base, 'HEAD').trim();
} catch {
  console.error(`protected-path guard: cannot resolve base ref "${base}". Pass --base <ref>.`);
  process.exit(2);
}

const changedFiles = git('diff', '--name-only', `${mergeBase}...HEAD`)
  .split('\n')
  .filter(Boolean)
  .filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file))
  .filter(isProtected);

if (changedFiles.length === 0) {
  console.log('protected-path guard: OK — no protected functional path was touched.');
  process.exit(0);
}

const semantic = [];
const presentation = [];

for (const file of changedFiles) {
  const patch = git('diff', '-U0', `${mergeBase}...HEAD`, '--', file).split('\n');
  const removed = patch.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1));
  const added = patch.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));

  if (skeleton(removed) === skeleton(added)) {
    presentation.push({ file, removed: removed.length, added: added.length });
  } else {
    semantic.push({ file, removed: removed.length, added: added.length });
  }
}

for (const { file, removed, added } of presentation) {
  console.log(`  PRESENTATION  ${file}  (-${removed}/+${added}) — copy/format only, no semantic change`);
}
for (const { file, removed, added } of semantic) {
  console.log(`  SEMANTIC      ${file}  (-${removed}/+${added}) — ${areaOf(file)}`);
}

if (semantic.length === 0) {
  console.log(
    `protected-path guard: OK — ${presentation.length} protected file(s) changed, all presentation-only.`,
  );
  process.exit(0);
}

const messages = git('log', '--format=%B', `${mergeBase}..HEAD`);
const acknowledged = messages.split('\n').some((line) => line.trim().startsWith(ACK_TRAILER));

if (acknowledged) {
  console.log(
    `protected-path guard: ${semantic.length} semantic change(s) on protected paths, ACKNOWLEDGED via ${ACK_TRAILER}`,
  );
  process.exit(0);
}

if (reportOnly) {
  console.log('protected-path guard: report-only mode — not failing.');
  process.exit(0);
}

console.error(
  [
    '',
    'SEMANTIC CHANGE ON A PROTECTED FUNCTIONAL PATH',
    '',
    'These files changed in ways that are not copy, className or formatting:',
    ...semantic.map(({ file }) => `  ${file}  — ${areaOf(file)}`),
    '',
    'A design, language, cleanup or refactor task is expected to produce ZERO',
    'semantic drift here. If the change is intentional, run the owner-locked',
    'contracts, name what you touched, and record it in the commit message:',
    '',
    `  ${ACK_TRAILER} <file> — <what functionally changed and why>`,
    '',
  ].join('\n'),
);
process.exit(1);
