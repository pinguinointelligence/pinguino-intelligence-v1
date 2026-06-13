import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { Card } from '@/components/ui/Card';
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
          <UpgradePrompt
            className="mt-4 max-w-none"
            message={copy.gate.prompts.exactAmount}
            onAction={onUpgrade}
          />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {view.proposals.map((proposal) => {
            const title = proposalTitle(proposal.kind);
            return (
              <div key={proposal.id} className="rounded-md border border-ink/10 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {title ?? proposal.actions.map((action) => `${action.verb} ${action.name}`).join(' · ')}
                  </span>
                  <span className={chip}>
                    {c.confidenceLabel}: {proposal.confidenceLabel}
                  </span>
                </div>

                {proposal.actions.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {proposal.actions.map((action, index) => (
                      <div key={index} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-stone-600">
                          {action.verb} {action.name}
                        </span>
                        <MetricValue value={action.grams} unit="g" size="sm" />
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
                            {c.before} {prediction.before === null ? '—' : prediction.before.toFixed(1)}
                            {prediction.unit}
                          </span>
                          <span aria-hidden>→</span>
                          <span className="text-ink">
                            {c.after} {prediction.after === null ? '—' : prediction.after.toFixed(1)}
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
