import { PenguinMark } from '@/components/shared/BrandLockup';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import type { DemoSummaryView } from './conversation';
import type { DemoHintsView } from './demoHints';

const c = copy.chat;

const chip =
  'rounded border border-ivory/15 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-ivory/50 uppercase';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs tracking-label text-ivory/45 uppercase">{label}</span>
      <span className="text-sm text-ivory">{value}</span>
    </div>
  );
}

function Note({ text }: { text: string }) {
  return <p className="mt-3 text-xs leading-relaxed text-ivory/45">{text}</p>;
}

/** Redacted PI Preview — directional engine hints (no numbers, no names) +
 * PI Pro unlock. The only number is the user's own chosen batch size (Step 6A). */
export function DemoSummary({
  view,
  hints,
  onUnlock,
}: {
  view: DemoSummaryView;
  hints: DemoHintsView;
  onUnlock: () => void;
}) {
  const product = view.productProfileId ? copy.productTypes[view.productProfileId] : null;
  const serving = view.servingProfileId ? copy.servingProfiles[view.servingProfileId] : null;
  const productHints = hints.productProfileId ? c.productHints[hints.productProfileId] : [];

  return (
    <div className="w-full max-w-xl rounded-2xl border border-ivory/10 bg-white/[0.03] p-8">
      <SectionLabel tone="ivory">{c.summaryEyebrow}</SectionLabel>

      <div className="mt-4 space-y-2">
        <Row label={c.heroLabel} value={view.heroText ?? c.heroFallback} />
        {product ? <Row label={c.productLabel} value={product.label} /> : null}
        {serving ? <Row label={c.servingLabel} value={serving.label} /> : null}
        <Row label={c.batchLabel} value={`${view.batchGrams} ${c.batchUnit}`} />
      </div>

      {!view.servingConnected && serving ? <Note text={c.servingPreviewNote} /> : null}
      {view.productPendingNote ? <Note text={view.productPendingNote} /> : null}

      <div className="mt-5 border-t border-ivory/10 pt-4">
        <SectionLabel tone="ivory">{c.hintsLabel}</SectionLabel>
        {hints.balanced ? (
          <p className="mt-3 text-sm leading-relaxed text-ivory/65">{c.balanced}</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {hints.hints.map((hint) => (
              <div
                key={`${hint.area}-${hint.direction}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm text-ivory/70">
                  {c.directions[hint.direction]} · {c.areas[hint.area]}
                </span>
                <span className={chip}>{c.confidence[hint.confidence]}</span>
              </div>
            ))}
          </div>
        )}
        {productHints.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {productHints.map((line) => (
              <li key={line} className="text-xs leading-relaxed text-ivory/45">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-5 border-t border-ivory/10 pt-4">
        <SectionLabel tone="ivory">{c.processLabel}</SectionLabel>
        <ol className="mt-3 space-y-1.5">
          {c.process.map((step, index) => (
            <li key={step} className="flex gap-2 text-sm leading-relaxed text-ivory/65">
              <span aria-hidden className="font-mono text-xs text-ivory/35">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ivory/40">{c.demoNote}</p>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-ivory/10 bg-white/[0.04] px-4 py-3">
        <PenguinMark size={24} className="shrink-0 text-ivory" />
        <span className="flex-1 text-sm leading-snug text-ivory/70">{c.unlockCta}</span>
        <button type="button" className={buttonClasses('ivory', 'sm')} onClick={onUnlock}>
          {copy.gate.unlockCta}
        </button>
      </div>
    </div>
  );
}
