import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(import.meta.dirname, file), 'utf8');

describe('Recipe profile visual density contract', () => {
  it('raises both five-detent rows without shrinking their mobile targets', () => {
    const axes = read('ProfileDirectionAxes.tsx');

    expect(axes).toContain(
      'className="rounded-[16px] border border-ink/8 bg-white px-3 py-2 shadow-pro-e0"',
    );
    expect(axes).toContain('className="mt-1 grid');
    expect(axes).toContain('grid-cols-5');
    expect(axes).toContain(
      'min-[520px]:grid-cols-[minmax(68px,1fr)_repeat(5,36px)_minmax(68px,1fr)]',
    );
    expect(axes).toContain(
      "'rounded-[18px] border border-ink/10 bg-white px-3 py-2.5 shadow-pro-e1'",
    );
    expect(axes).toContain('className="mb-2 text-sm font-semibold text-ink"');
    expect(axes).toContain('size-9');
  });

  it('keeps Batch and Strategy in one equal-height desktop row with aligned helpers', () => {
    const settings = read('WorkbenchSettingsLine.tsx');
    const theme = read('../../styles/theme-pro-light.css');

    expect(settings).toContain(
      "const compactFinalSettingsCell =\n  'relative grid min-w-0 grid-rows-[52px_auto] gap-1 p-1.5 lg:grid-rows-[40px_auto] 2xl:grid-rows-[43px_auto]'",
    );
    expect(settings.match(/compact\s*\?\s*compactFinalSettingsCell/g)).toHaveLength(2);
    expect(settings.match(/className=\{settingsHelperClass\}/g)).toHaveLength(2);
    expect(settings).toContain('profile-settings-grid grid grid-cols-2 items-stretch gap-2');
    expect(settings).toContain('className="mb-2 flex min-h-6 items-center"');

    expect(theme).toMatch(
      /@container right-pane \(max-width: 540px\)[\s\S]*?\.profile-settings-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/,
    );
  });
});
