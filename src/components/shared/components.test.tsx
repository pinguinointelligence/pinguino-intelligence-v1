import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { barPosition } from '@/lib/math';
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
