import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { barPosition, idealCoreRange } from '@/lib/math';
import { SurfaceToneContext } from '@/components/ui/surface';
import { ConfidenceBadge } from './ConfidenceBadge';
import { confidenceLevel } from './confidence';
import { EmptyState } from './EmptyState';
import { IndicatorBar } from './IndicatorBar';
import { MetricValue } from './MetricValue';
import { PlanGate } from './PlanGate';
import { StatusChip } from './StatusChip';
import { STATUS_LABELS, type IndicatorStatus } from './status';

describe('PlanGate — redact-at-source contract (Masterplan §10)', () => {
  const secret = 'SECRET-34.7-GRAMS';

  it('never renders children while locked', () => {
    const html = renderToStaticMarkup(
      <PlanGate locked prompt={copy.gate.prompts.exactGrams} preview={<span>redacted</span>}>
        <span>{secret}</span>
      </PlanGate>,
    );
    expect(html).not.toContain(secret);
    expect(html).toContain(copy.gate.prompts.exactGrams);
    expect(html).toContain('redacted');
  });

  it('renders children when unlocked, without any prompt', () => {
    const html = renderToStaticMarkup(
      <PlanGate locked={false} prompt={copy.gate.prompts.exactGrams}>
        <span>{secret}</span>
      </PlanGate>,
    );
    expect(html).toContain(secret);
    expect(html).not.toContain(copy.gate.prompts.exactGrams);
  });

  it('shows a standalone upgrade prompt when locked without a preview', () => {
    const html = renderToStaticMarkup(
      <PlanGate locked prompt={copy.gate.prompts.labelExport}>
        <span>{secret}</span>
      </PlanGate>,
    );
    expect(html).not.toContain(secret);
    expect(html).toContain(copy.gate.prompts.labelExport);
  });
});

describe('StatusChip', () => {
  it('renders the correct label for every status', () => {
    for (const status of Object.keys(STATUS_LABELS) as IndicatorStatus[]) {
      const html = renderToStaticMarkup(<StatusChip status={status} />);
      expect(html).toContain(STATUS_LABELS[status]);
    }
  });
});

describe('ConfidenceBadge', () => {
  it('maps scores to levels per Masterplan §16', () => {
    expect(confidenceLevel(100)).toBe('verified');
    expect(confidenceLevel(97)).toBe('very-high');
    expect(confidenceLevel(95)).toBe('very-high');
    expect(confidenceLevel(92)).toBe('high');
    expect(confidenceLevel(85)).toBe('estimated');
    expect(confidenceLevel(80)).toBe('estimated');
    expect(confidenceLevel(72)).toBe('needs-verification');
  });

  it('renders the level label and optional score', () => {
    const html = renderToStaticMarkup(<ConfidenceBadge score={100} showScore />);
    expect(html).toContain(copy.confidence.verified);
    expect(html).toContain('100%');
  });
});

describe('IndicatorBar', () => {
  it('clamps positions to the 0–100 range', () => {
    expect(barPosition(0, 100, -20)).toBe(0);
    expect(barPosition(0, 100, 150)).toBe(100);
    expect(barPosition(0, 100, 50)).toBe(50);
    expect(barPosition(10, 10, 10)).toBe(0); // degenerate range
  });

  it('exposes meter semantics', () => {
    const html = renderToStaticMarkup(
      <IndicatorBar min={6} max={24} value={14.5} targetMin={12} targetMax={17} label="POD" />,
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="14.5"');
  });
});

describe('MetricValue', () => {
  it('formats numbers to display precision with mono tabular styling', () => {
    const html = renderToStaticMarkup(<MetricValue value={34.68} unit="g" />);
    expect(html).toContain('34.7');
    expect(html).toContain('tabular-nums');
  });
});

describe('EmptyState', () => {
  it('renders title and body', () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing here" body="Quiet." />);
    expect(html).toContain('Nothing here');
    expect(html).toContain('Quiet.');
  });
});

describe('idealCoreRange — display-only ideal core (Slice 2C)', () => {
  it('returns the central half of the target band', () => {
    expect(idealCoreRange(12, 20)).toEqual({ coreMin: 14, coreMax: 18 });
  });

  it('is symmetric around the band centre', () => {
    const { coreMin, coreMax } = idealCoreRange(6, 24);
    expect((coreMin + coreMax) / 2).toBe(15);
  });

  it('respects a custom fraction (still narrower, still centred)', () => {
    expect(idealCoreRange(0, 10, 0.4)).toEqual({ coreMin: 3, coreMax: 7 });
  });
});

describe('IndicatorBar — premium ideal-core window (Slice 2C)', () => {
  const renderShell = () =>
    renderToStaticMarkup(
      <SurfaceToneContext.Provider value="shell">
        <IndicatorBar min={6} max={24} value={14.5} targetMin={12} targetMax={17} status="ideal" label="POD" />
      </SurfaceToneContext.Provider>,
    );
  const renderPaper = () =>
    renderToStaticMarkup(
      <SurfaceToneContext.Provider value="paper">
        <IndicatorBar min={6} max={24} value={14.5} targetMin={12} targetMax={17} status="ideal" label="POD" />
      </SurfaceToneContext.Provider>,
    );

  it('preserves meter semantics with the ideal core present', () => {
    const html = renderShell();
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemin="6"');
    expect(html).toContain('aria-valuemax="24"');
    expect(html).toContain('aria-valuenow="14.5"');
  });

  it('still renders the true target band', () => {
    expect(renderShell()).toContain('bg-status-ideal/30');
  });

  it('renders the glowing ivory ideal core on the dark shell', () => {
    const html = renderShell();
    expect(html).toContain('ring-ivory/35');
    expect(html).toMatch(/shadow-\[/); // soft glow
  });

  it('keeps the paper variant clean — no ivory ring or glow', () => {
    const html = renderPaper();
    expect(html).not.toContain('ring-ivory/35');
    expect(html).not.toMatch(/shadow-\[/);
  });
});
