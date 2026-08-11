import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DirectNumberControl } from './DirectNumberControl';
import {
  acceleratedStepMultiplier,
  boundedNumberValue,
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
});
