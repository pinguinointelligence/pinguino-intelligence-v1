import { Link } from 'react-router';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { IndicatorBar } from '@/components/shared/IndicatorBar';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { MetricValue } from '@/components/shared/MetricValue';
import { PlanGate } from '@/components/shared/PlanGate';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import type { IndicatorStatus } from '@/components/shared/status';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import { copy } from '@/copy/en';

const { studio } = copy;
const preview = studio.preview;

/** Static sample values for the design preview only — no engine logic (Masterplan §20 Phase 1). */
const SAMPLE_INDICATORS: Array<{
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  targetMin: number;
  targetMax: number;
  status: IndicatorStatus;
}> = [
  { label: preview.indicators.pod, value: 14.5, min: 6, max: 24, targetMin: 12, targetMax: 17, status: 'ideal' },
  { label: preview.indicators.npac, value: 44.2, min: 24, max: 50, targetMin: 33, targetMax: 42, status: 'risky' },
  { label: preview.indicators.solids, value: 36.8, unit: '%', min: 20, max: 50, targetMin: 31, targetMax: 45, status: 'good' },
  { label: preview.indicators.fat, value: 8.4, unit: '%', min: 0, max: 18, targetMin: 5, targetMax: 12, status: 'ideal' },
];

const SAMPLE_CONFIDENCE: Array<{ name: string; score: number }> = [
  { name: preview.confidence.samples[0], score: 100 },
  { name: preview.confidence.samples[1], score: 96 },
  { name: preview.confidence.samples[2], score: 84 },
  { name: preview.confidence.samples[3], score: 72 },
];

export function StudioPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-7">
        <Link to="/" className="flex items-center gap-3">
          <IvoryLogoMark size={24} tone="ink" />
          <span className="text-sm font-light tracking-wordmark">{copy.brand.name}</span>
        </Link>
        <Link
          to="/"
          className="text-sm text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
        >
          {studio.back}
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-12 pb-24">
        <div className="flex items-center gap-4">
          <SectionLabel>{studio.eyebrow}</SectionLabel>
          <StatusChip status="demo" />
        </div>
        <h1 className="mt-5 max-w-2xl text-4xl font-light tracking-tight text-balance">
          {studio.headline}
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-stone-600">{studio.body}</p>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {/* PI Profile Indicators — static preview */}
          <Card padding="lg">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">{preview.panelTitle}</h2>
              <StatusChip status="pro" />
            </div>
            <div className="mt-7 space-y-6">
              {SAMPLE_INDICATORS.map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-stone-600">{row.label}</span>
                    <span className="flex items-center gap-3">
                      <MetricValue value={row.value} unit={row.unit} size="sm" />
                      <StatusChip status={row.status} />
                    </span>
                  </div>
                  <IndicatorBar
                    className="mt-2.5"
                    label={row.label}
                    min={row.min}
                    max={row.max}
                    value={row.value}
                    targetMin={row.targetMin}
                    targetMax={row.targetMax}
                    status={row.status}
                  />
                </div>
              ))}
            </div>
            <p className="mt-7 text-xs leading-relaxed text-stone-400">{preview.panelNote}</p>
          </Card>

          {/* Exact corrections — gated for demo sessions (redact-at-source) */}
          <Card padding="lg" className="flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">{preview.corrections.title}</h2>
              <StatusChip status="locked" />
            </div>
            <PlanGate
              locked
              prompt={copy.gate.prompts.exactAmount}
              className="mt-7 flex-1"
              preview={
                <div className="space-y-4 p-1">
                  {preview.corrections.rows.map((row) => (
                    <div
                      key={row}
                      className="flex items-center justify-between rounded-md border border-ink/10 px-4 py-3.5"
                    >
                      <span className="text-sm text-stone-600">{row}</span>
                      <MetricValue value="···" unit="g" size="sm" />
                    </div>
                  ))}
                </div>
              }
            >
              {/* Real correction grams render here for Pro sessions once the engine exists. */}
              <div />
            </PlanGate>
          </Card>
        </div>

        {/* Next step — charcoal contrast panel */}
        <CharcoalPanel className="mt-6 flex items-center gap-6">
          <IvoryLogoMark size={36} className="shrink-0 opacity-90" />
          <div>
            <SectionLabel tone="ivory">{preview.next.label}</SectionLabel>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ivory-soft">
              {preview.next.body}
            </p>
          </div>
        </CharcoalPanel>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Ingredient confidence — static preview */}
          <Card padding="lg">
            <h2 className="text-base font-medium">{preview.confidence.title}</h2>
            <ul className="mt-6 divide-y divide-ink/5">
              {SAMPLE_CONFIDENCE.map((row) => (
                <li key={row.name} className="flex items-center justify-between py-3">
                  <span className="text-sm text-stone-600">{row.name}</span>
                  <ConfidenceBadge score={row.score} showScore />
                </li>
              ))}
            </ul>
          </Card>

          {/* Recipe library — empty state */}
          <EmptyState
            title={preview.empty.title}
            body={preview.empty.body}
            action={
              <Link to="/" className={buttonClasses('ghost', 'sm')}>
                {studio.back}
              </Link>
            }
          />
        </div>
      </main>
    </div>
  );
}
