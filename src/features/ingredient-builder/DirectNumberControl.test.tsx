import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DirectNumberControl } from './DirectNumberControl';
import {
  acceleratedStepMultiplier,
  boundedNumberValue,
  committedNumberValue,
  heldValueAfterTicks,
  scrubbedValue,
} from './directNumberControlModel';

describe('DirectNumberControl', () => {
  it('uses controlled acceleration instead of one uncontrolled hold step', () => {
    expect([0, 4, 5, 11, 12, 30].map(acceleratedStepMultiplier)).toEqual([1, 1, 5, 5, 10, 10]);
    expect(heldValueAfterTicks(100, 1, 1, 5)).toBe(105);
    expect(heldValueAfterTicks(100, 1, 1, 6)).toBe(110);
    expect(heldValueAfterTicks(100, -1, 0.1, 13)).toBeCloseTo(95, 10);
  });

  it('maps horizontal scrub distance to stable controlled detents', () => {
    expect(scrubbedValue(141, 0, 1)).toBe(141);
    expect(scrubbedValue(141, 35, 1)).toBe(143);
    expect(scrubbedValue(141, 36, 1)).toBe(144);
    expect(scrubbedValue(13.6, -25, 0.1)).toBeCloseTo(13.4, 10);
  });

  it('clamps typed, nudged and scrubbed values to the active canonical bounds', () => {
    expect(boundedNumberValue(11, 12, 14)).toBe(12);
    expect(boundedNumberValue(13, 12, 14)).toBe(13);
    expect(boundedNumberValue(15, 12, 14)).toBe(14);
  });

  it('can round the presentation without truncating Production physical precision', () => {
    const exact = 357.75342952471976 + 1;
    expect(
      committedNumberValue({
        value: exact,
        min: 0,
        max: Number.POSITIVE_INFINITY,
        decimals: 3,
        preservePrecision: true,
      }),
    ).toBe(exact);
    expect(
      committedNumberValue({
        value: exact,
        min: 0,
        max: Number.POSITIVE_INFINITY,
        decimals: 3,
        preservePrecision: false,
      }),
    ).toBe(358.753);

    const source = readFileSync(new URL('./DirectNumberControl.tsx', import.meta.url), 'utf8');
    expect(source).toContain('if (!draftDirty.current)');
    expect(source.indexOf('if (!draftDirty.current)')).toBeLessThan(
      source.indexOf('const parsed = Number(draft)'),
    );
  });

  it('renders minus, editable spinbutton, plus, keyboard metadata and no native number input', () => {
    const html = renderToStaticMarkup(
      <DirectNumberControl
        value={66.5}
        step={0.1}
        decimals={1}
        suffix="%"
        ariaLabel="Milk — udział"
        onChange={() => {}}
        testId="direct-percent"
      />,
    );
    expect(html).toContain('Milk — udział — zmniejsz');
    expect(html).toContain('Milk — udział — zwiększ');
    expect(html).toContain('role="spinbutton"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('type="number"');
    expect(html).toContain('data-scrubbable="horizontal"');
    expect(html).toContain('touch-pan-y');
    expect(html).toContain('select-none');
  });

  it('keeps decimal detents stable instead of exposing floating-point tails', () => {
    const html = renderToStaticMarkup(
      <DirectNumberControl
        value={13.6}
        step={0.1}
        decimals={1}
        suffix="%"
        ariaLabel="Cream — udział"
        onChange={() => {}}
        testId="percent"
      />,
    );
    expect(html).toContain('aria-valuenow="13.6"');
    expect(html).not.toContain('13.600000000000001');
  });

  it('pins recipe capacities and integrates the active lock as one quiet fourth segment', () => {
    const html = renderToStaticMarkup(
      <DirectNumberControl
        value={100}
        step={0.1}
        decimals={1}
        suffix="%"
        ariaLabel="Udział"
        onChange={() => {}}
        testId="compact-percent"
        widthPreset="percent"
        disabled
        lockSegment={{
          pressed: true,
          ariaLabel: 'Odblokuj udział',
          title: 'Udział zablokowany',
          suffix: '%',
          onToggle: () => {},
          testId: 'compact-percent-lock',
        }}
      />,
    );
    expect(html).toContain('data-control-capacity="100.0%"');
    expect(html).toContain('data-control-locked="true"');
    expect(html).toContain('grid-cols-[44px_72px_44px_44px]');
    expect(html).toContain('bg-stone-100');
    expect(html).toContain('data-testid="compact-percent-lock"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('>%</button>');
  });

  it('reserves exactly five whole-gram digits without expanding the topping control', () => {
    const html = renderToStaticMarkup(
      <DirectNumberControl
        value={10000}
        step={1}
        decimals={0}
        suffix="g"
        ariaLabel="Gramatura"
        onChange={() => {}}
        testId="compact-grams"
        widthPreset="grams"
      />,
    );
    expect(html).toContain('data-control-capacity="10000g"');
    expect(html).toContain('w-[176px]');
    expect(html).toContain('grid-cols-[44px_88px_44px]');
    expect(html).toContain('value="10000"');
  });

  it('reserves explicit inner breathing room so values and suffixes cannot touch the rim', () => {
    const html = renderToStaticMarkup(
      <DirectNumberControl
        value={100}
        step={0.1}
        decimals={1}
        suffix="%"
        ariaLabel="Udział"
        onChange={() => {}}
        testId="padded-percent"
        widthPreset="percent"
        density="compact"
      />,
    );
    expect(html).toContain('data-value-padding="roomy"');
    expect(html).toContain('px-1.5');
    expect(html).toContain('leading-none');
    expect(html).toContain('w-[114px] grid-cols-[28px_58px_28px]');
    expect(html).toContain('h-8');
  });

  it('can keep touch targets comfortable while matching compact Recipe geometry on table widths', () => {
    const html = renderToStaticMarkup(
      <DirectNumberControl
        value={670}
        step={1}
        decimals={0}
        suffix="g"
        ariaLabel="Milk — faktyczna gramatura"
        onChange={() => {}}
        testId="responsive-production-grams"
        widthPreset="fluid"
        density="responsive"
      />,
    );

    expect(html).toContain('data-control-density="responsive"');
    expect(html).toContain('grid-cols-[44px_minmax(80px,1fr)_44px]');
    expect(html).toContain('lg:grid-cols-[28px_minmax(66px,1fr)_28px]');
    expect(html).toContain('size-11 lg:h-8 lg:w-7');
    expect(html).toContain('text-xl lg:text-base');
    expect(html).toContain('text-sm lg:text-[13px]');
  });
});
