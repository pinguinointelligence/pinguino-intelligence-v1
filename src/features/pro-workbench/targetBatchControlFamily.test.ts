import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) =>
  readFileSync(resolve(import.meta.dirname, '..', ...parts), 'utf8');

/**
 * OWNER 2026-09-12 — DESKTOP / WEB DESIGN CORRECTION, §2 and §7.
 *
 * The batch control is a member of the DASHBOARD control family: one
 * horizontal segmented housing, [ −10 g | value | +10 g ], with the same
 * housing hairline, separators, pill corner, press behaviour and orange focus
 * accent as the ingredient steppers (`DirectNumberControl`). It replaces B5's
 * dashed card with two loose round chips, on desktop and mobile alike.
 *
 * The literals are compared with DirectNumberControl's OWN source, so the two
 * cannot drift into two interpretations of one element.
 */
describe('the batch control is a dashboard control', () => {
  const settings = read('pro-workbench', 'WorkbenchSettingsLine.tsx');
  const dashboard = read('ingredient-builder', 'DirectNumberControl.tsx');
  const literal = (name: string) =>
    settings.match(new RegExp(`const ${name} =\\s*'([^']+)'`))?.[1] ?? '';
  const housing = literal('BATCH_CONTROL_HOUSING');
  const step = literal('BATCH_CONTROL_STEP');
  const value = literal('BATCH_CONTROL_VALUE');

  it('shares the dashboard housing, separators and orange focus accent', () => {
    for (const token of [
      'border border-ink/12',
      'bg-white',
      'focus-within:border-[#f58a07]',
      'focus-within:shadow-[0_0_0_3px_rgb(245_138_7_/_0.15)]',
    ]) {
      expect(dashboard, token).toContain(token);
      expect(housing, token).toContain(token);
    }
    // The compact PRO dashboard stepper is a full pill, and so is the batch.
    expect(dashboard).toContain("compact ? 'rounded-full' : 'rounded-2xl'");
    expect(housing).toContain('rounded-full');
    // The value segment is cut by the same ink/18 separators.
    expect(dashboard).toContain('border-x border-ink/18');
    expect(value).toContain('border-x border-ink/18');
    // The side segments press, hover, focus and disable exactly like − / +.
    for (const token of [
      'gellatti-touch-control',
      'hover:bg-stone-100',
      'focus-visible:outline-[#f58a07]',
      'disabled:text-stone-400',
    ]) {
      expect(dashboard, token).toContain(token);
      expect(step, token).toContain(token);
    }
  });

  it('is one horizontal segmented control whose side segments carry the unit', () => {
    expect(housing).toContain('grid-cols-[auto_minmax(0,1fr)_auto]');
    expect(settings).toContain('−{TARGET_BATCH_STEP_GRAMS} g');
    expect(settings).toContain('+{TARGET_BATCH_STEP_GRAMS} g');
    // The dashed card and the two separate round chips are gone.
    expect(settings).not.toContain('border-dashed border-[var(--g-line-strong)]');
    expect(settings).not.toMatch(
      /h-9 rounded-full border border-\[var\(--g-line\)\] bg-white px-2\.5/,
    );
  });

  it('keeps the centre a typed value committed through the same handler', () => {
    const control = settings.slice(settings.indexOf('className={BATCH_CONTROL_HOUSING}'));
    const centre = control.slice(0, control.indexOf('data-testid="workbench-batch-increment"'));
    expect(centre).toContain('<DeferredNumberInput');
    expect(centre).toContain('data-testid="workbench-batch"');
    expect(centre).toContain('onCommit={onChange}');
    expect(centre).toContain(
      'onClick={() => onChange(Math.max(1, grams - TARGET_BATCH_STEP_GRAMS))}',
    );
  });

  it('keeps a 44 px touch target and takes the 32 px dashboard density on the desktop', () => {
    expect(housing).toContain('h-11');
    // The desktop density follows the desktop ↔ narrow handoff, not Tailwind's
    // `lg` (1024 px): a touch tablet below the handoff keeps the 44 px target.
    expect(housing).toContain('min-[68.5rem]:h-8');
    expect(housing).not.toContain('lg:h-8');
  });
});
