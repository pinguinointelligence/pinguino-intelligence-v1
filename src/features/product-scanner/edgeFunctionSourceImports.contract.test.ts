/**
 * An edge function reaches into `src/` by RELATIVE PATH, and nothing else in this repository
 * looks at those paths.
 *
 * That gap has already cost us once. The ONE Canonical Scanner change (2026-09-06) deleted the
 * second scanner and the modules that existed only for it. The dead-code closure that chose what to
 * delete walked `src/**` — where `customerProductFamily.ts` genuinely had no importer — and never
 * looked at `supabase/functions/**`. But `product-scan-finalize` imports it as
 * `../../../src/features/product-scanner/customerProductFamily.ts`, so the deletion left the
 * function unbuildable. Nothing caught it: `tsc -b` does not type-check the Deno tree, vitest never
 * loads it, `vite build` never sees it, and the guards diff prose and protected paths, not imports.
 * The break would have surfaced at `supabase functions deploy` — after the merge, on a release.
 *
 * So this test is the missing gate. It is deliberately dumb and total: EVERY relative `.ts`
 * specifier in every edge function must resolve to a file that exists. It costs milliseconds and it
 * fails loudly the moment someone deletes or moves a file an edge function depends on.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FUNCTIONS_ROOT = resolve(process.cwd(), 'supabase/functions');

function everyTsFile(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : everyTsFile(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

/** `from '...'`, `import '...'` and dynamic `import('...')`, single or double quoted */
function relativeSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec !== undefined && spec.startsWith('.')) out.push(spec);
  }
  return out;
}

describe('every edge function import resolves to a real file', () => {
  const files = existsSync(FUNCTIONS_ROOT) ? everyTsFile(FUNCTIONS_ROOT) : [];

  it('finds edge functions to check at all', () => {
    // a silent zero here would make the whole contract vacuous
    expect(files.length).toBeGreaterThan(0);
  });

  it('resolves every relative specifier, including the ones that reach into src/', () => {
    const broken: string[] = [];
    for (const file of files) {
      for (const spec of relativeSpecifiers(readFileSync(file, 'utf8'))) {
        const target = resolve(dirname(file), spec);
        // Deno specifiers carry their extension; tolerate an extensionless one just in case
        const exists =
          existsSync(target) || existsSync(`${target}.ts`) || existsSync(join(target, 'index.ts'));
        if (!exists) broken.push(`${relative(process.cwd(), file)} -> ${spec}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('the specifier scanner actually sees the import that broke once', () => {
    // guards the regex itself: if this stops matching, the contract above goes quietly blind
    const finalize = join(FUNCTIONS_ROOT, 'product-scan-finalize/index.ts');
    expect(existsSync(finalize)).toBe(true);
    const specs = relativeSpecifiers(readFileSync(finalize, 'utf8'));
    expect(specs).toContain('../../../src/features/product-scanner/customerProductFamily.ts');
  });
});
