import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { CorrectionResult } from '@/engine';
import { buildCorrectionView } from './correctionView';

const c = copy.studio.corrections;

const chip =
  'rounded border border-ink/15 bg-paper px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-stone-500 uppercase';

function proposalTitle(kind: 'correction' | 'tradeoff' | 'impossible'): string | null {
  if (kind === 'tradeoff') return c.tradeoffTitle;
  if (kind === 'impossible') return c.impossibleTitle;
  return null;
}

export function CorrectionPanel({
  corrections,
  onUpgrade,
}: {
  corrections: CorrectionResult;
  onUpgrade?: () => void;
}) {
  const view = buildCorrectionView(corrections);

  if (view.proposals.length === 0) {
    return (
      <Card padding="lg">
        <SectionLabel>{c.title}</SectionLabel>
        <p className="mt-4 text-sm leading-relaxed text-stone-500">{c.none}</p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <SectionLabel>{c.title}</SectionLabel>

      {view.mode === 'demo' ? (
        <div className="mt-5 space-y-3">
          <p className="text-xs leading-relaxed text-stone-400">{c.demoPreviewNote}</p>
          {view.proposals.map((proposal) => (
            <div key={proposal.id} className="rounded-md border border-ink/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{proposal.directionText}</span>
                <span className={chip}>{proposal.confidenceLabel}</span>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                {c.demoArea}: {proposal.areaLabels.join(' · ')}
              </p>
            </div>
          ))}

          {/* Slim, premium Pro affordance — not a blocky lock. */}
          <div className="mt-4 flex items-center gap-3 rounded-md border border-ink/10 bg-ivory/40 px-4 py-3">
            <IvoryLogoMark size={22} tone="ink" className="shrink-0" />
            <p className="flex-1 text-sm leading-snug text-stone-600">
              {copy.gate.prompts.exactAmount}
            </p>
            <button type="button" className={buttonClasses('primary', 'sm')} onClick={onUpgrade}>
              {copy.gate.unlockCta}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {view.proposals.map((proposal) => {
            const title = proposalTitle(proposal.kind);
            const isTradeoff = proposal.kind !== 'correction';
            return (
              <div
                key={proposal.id}
                className={cn(
                  'rounded-md border px-4 py-3.5',
                  isTradeoff ? 'border-status-risky/30 bg-status-risky/[0.04]' : 'border-ink/10',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {title ??
                      proposal.actions.map((action) => `${action.verb} ${action.name}`).join(' · ')}
                  </span>
                  <span className={chip}>
                    {c.confidenceLabel}: {proposal.confidenceLabel}
                  </span>
                </div>

                {proposal.actions.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {proposal.actions.map((action, index) => (
                      <div key={index} className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-stone-600">
                          {action.verb} {action.name}
                        </span>
                        <MetricValue value={action.grams} unit="g" />
                      </div>
                    ))}
                  </div>
                ) : null}

                {proposal.predicted.length > 0 ? (
                  <div className="mt-3 space-y-1 border-t border-ink/5 pt-3">
                    {proposal.predicted.map((prediction) => (
                      <div
                        key={prediction.label}
                        className="flex items-center justify-between gap-3 text-xs text-stone-500"
                      >
                        <span>{prediction.label}</span>
                        <span className="flex items-center gap-2 font-mono tabular-nums">
                          <span>
                            {c.before}{' '}
                            {prediction.before === null ? '—' : prediction.before.toFixed(1)}
                            {prediction.unit}
                          </span>
                          <span aria-hidden className="text-stone-400">
                            →
                          </span>
                          <span className="text-ink">
                            {c.after}{' '}
                            {prediction.after === null ? '—' : prediction.after.toFixed(1)}
                            {prediction.unit}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {proposal.blockingMessage ? (
                  <p className="mt-3 text-xs leading-relaxed text-stone-500">
                    {proposal.blockingMessage}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
