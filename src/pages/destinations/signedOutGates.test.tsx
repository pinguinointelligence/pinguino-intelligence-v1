/**
 * A gate is a designed state, not a dead end.
 *
 * Three signed-out / entitlement gates were bare sentences floating between two
 * hairlines on a white page — and two of them told the reader to choose a plan
 * without offering any way to choose one. They now use the same approved
 * `WorkflowNotice` gate surface the Label gate uses, and every one of them ends
 * in an action.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const page = () => readFileSync(join(SRC, 'pages', 'destinations', 'GlobalDestinationPages.tsx'), 'utf8');

describe('signed-out and entitlement gates are designed states', () => {
  it('puts every gate on the approved notice surface', () => {
    const source = page();
    for (const testId of ['products-plan-gate', 'production-plan-gate', 'account-sign-in-gate']) {
      expect(source).toContain(testId);
    }
    // The approved gate: full-card lead emphasis with the action BELOW the copy.
    expect(source.match(/emphasis="lead"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(source.match(/stackAction/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('never leaves a gate without a way forward', () => {
    const source = page();
    // Each gate names where the reader goes next.
    expect(source).toContain('Zobacz plany');
    expect(source).toContain('Zaloguj się');
  });

  it('drops the bare hairline sentence the gates used to be', () => {
    const source = page();
    expect(source).not.toContain('border-y border-ink/10 py-8 text-sm text-stone-600');
    expect(source).not.toContain(
      '<p className="text-sm text-stone-600">Zaloguj się, aby zarządzać kontem.</p>',
    );
  });
});

describe('public pages use the shared card and rail language', () => {
  const recipes = () =>
    readFileSync(join(SRC, 'pages', 'destinations', 'RecipesHubPage.tsx'), 'utf8');

  it('makes the Gellatti collection tiles real cards', () => {
    // They were a single `border-t` with no radius and no fill, which read as
    // two bare columns with a chevron floating at the far edge.
    const source = recipes();
    expect(source).toContain('rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]');
    expect(source).not.toContain('min-h-40 w-full border-t border-ink/12');
  });

  it('runs the how-it-works rail on the approved tokens', () => {
    const source = page();
    expect(source).toContain('border-y border-[var(--g-line)] sm:grid-cols-5');
    expect(source).not.toContain('grid border-y border-ink/10 sm:grid-cols-5');
  });
});
