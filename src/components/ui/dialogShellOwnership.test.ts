/**
 * DIALOGSHELL OWNERSHIP CONTRACT — owner cleanup 2026-09-04.
 *
 * `src/lib/cn.ts` is a plain class joiner, NOT `tailwind-merge`. So a caller
 * that puts a property `DialogShell` already sets into `panelClassName` ships a
 * SECOND declaration of it, and the CSS cascade — not the caller — decides
 * which paints. That is not a theory: it produced three rounds of a dead
 * attention outline, and an audit then found the same pattern sitting in
 * `ProRecalcPanel`, where `border-black/10`, `shadow-pro-md` and
 * `rounded-[18px]` were ALL measured dead on served staging while the shell's
 * own values painted.
 *
 * A className assertion cannot catch this — the losing class is genuinely
 * present, which is exactly why the old tests stayed green. So this contract
 * reads the SOURCE of every caller and fails when one of them restates a
 * property the shell owns. It is deliberately a repository-wide scan rather
 * than a per-component test: the defect is a relationship between two files.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'src');
const SHELL = 'src/components/ui/DialogShell.tsx';

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full);
  }
  return out;
};

/** Every non-test source file that renders a `<DialogShell …>`. */
const callers = walk(ROOT)
  .map((file) => ({ file: relative(process.cwd(), file), source: readFileSync(file, 'utf8') }))
  .filter(({ file, source }) => file !== SHELL && /<DialogShell[\s>]/.test(source));

/**
 * The `panelClassName={…}` / `panelClassName="…"` payload of each caller.
 *
 * The braced form is read by BALANCING braces rather than by a lazy regex: a
 * `cn(...)` payload spans many lines and an early stop silently truncates the
 * classes, which reports both false positives and false negatives.
 */
const panelClassPayloads = (source: string): string[] => {
  const out: string[] = [];
  const marker = 'panelClassName=';
  let at = source.indexOf(marker);
  while (at !== -1) {
    const rest = source.slice(at + marker.length);
    if (rest.startsWith('"')) {
      out.push(rest.slice(1, rest.indexOf('"', 1)));
    } else if (rest.startsWith('{')) {
      let depth = 0;
      let end = 0;
      for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === '{') depth += 1;
        else if (rest[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      out.push(rest.slice(1, end));
    }
    at = source.indexOf(marker, at + marker.length);
  }
  return out;
};

/**
 * Properties the shell declares for itself. A caller naming any of these is
 * fighting the shell, whether it happens to win or lose today.
 */
const OWNED = [
  {
    name: 'border colour',
    pattern:
      /(?:^|[\s'"`:])!?border-(?!x-0|y-0|t-0|b-0|l-0|r-0)(?:\[|[a-z]+\/|ink|black|white|transparent)/,
  },
  { name: 'box-shadow', pattern: /(?:^|[\s'"`:])!?shadow-(?!none\b)/ },
  { name: 'ring', pattern: /(?:^|[\s'"`:])!?ring-/ },
  { name: 'background', pattern: /(?:^|[\s'"`:])!?bg-(?!transparent\b)/ },
  { name: 'corner radius', pattern: /(?:^|[\s'"`:])!?(?:sm:)?rounded-/ },
  { name: 'width', pattern: /(?:^|[\s'"`:])!?(?:sm:)?(?:w-|max-w-)/ },
] as const;

describe('DialogShell ownership', () => {
  it('finds the callers it is meant to police', () => {
    // A refactor that renames the component must not silently empty this scan.
    expect(callers.length).toBeGreaterThanOrEqual(10);
    expect(callers.map((c) => c.file)).toContain('src/features/pro-core/ProRecalcPanel.tsx');
    expect(callers.map((c) => c.file)).toContain('src/components/ui/GellattiNotice.tsx');
  });

  it('no caller restates a property the shell owns', () => {
    const offences: string[] = [];
    for (const { file, source } of callers) {
      for (const payload of panelClassPayloads(source)) {
        // Comments inside a cn(...) payload are prose, not classes.
        const classes = payload.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        for (const { name, pattern } of OWNED) {
          if (pattern.test(classes)) {
            offences.push(`${file} — ${name}: ${classes.trim().slice(0, 90)}`);
          }
        }
      }
    }
    expect(
      offences,
      `panelClassName must not declare a property DialogShell already sets — ` +
        `pass a documented prop (tone / size / placement) instead:\n${offences.join('\n')}`,
    ).toEqual([]);
  });

  it('width comes from the canonical size family, never an inline value', () => {
    // Five different widths across thirteen dialogs is what the audit found.
    // Anything outside the family has to be argued for, not typed inline.
    const inlineWidths: string[] = [];
    for (const { file, source } of callers) {
      for (const payload of panelClassPayloads(source)) {
        const classes = payload.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const found = classes.match(/!?(?:sm:)?(?:max-)?w-\[[^\]]+\]|!?(?:sm:)?max-w-[a-z]+/g);
        if (found) inlineWidths.push(`${file}: ${found.join(' ')}`);
      }
    }
    expect(inlineWidths, `use size="compact" | "default" | "wide"`).toEqual([]);
  });

  it('the shell declares each owned property exactly once per branch', () => {
    const shell = readFileSync(resolve(process.cwd(), SHELL), 'utf8');
    // The tone branches are the only place a border colour or shadow is chosen,
    // and each branch names each property once. If a future edit adds a second
    // `shadow-` to the base string, the attention value stops being decidable.
    const toneBranch = shell.slice(shell.indexOf("tone === 'attention'"));
    const attention = toneBranch.slice(0, toneBranch.indexOf(':'));
    const fallback = toneBranch.slice(toneBranch.indexOf(':'), toneBranch.indexOf('placement ==='));
    for (const [name, branch] of [
      ['attention', attention],
      ['default', fallback],
    ] as const) {
      expect((branch.match(/shadow-\[|shadow-pro/g) ?? []).length, `${name} shadow`).toBe(1);
      expect((branch.match(/border-\[|border-ink/g) ?? []).length, `${name} border`).toBe(1);
    }
  });
});
